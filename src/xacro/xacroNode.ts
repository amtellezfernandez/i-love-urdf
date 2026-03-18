import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";
import * as path from "node:path";
import * as process from "node:process";
import { spawn } from "node:child_process";
import {
  fetchGitHubFileBytes,
  fetchGitHubRepositoryFiles,
  type GitHubRepositoryFile,
  type GitHubRepositoryReference,
} from "../repository/githubRepositoryInspection";
import {
  collectLocalRepositoryFiles,
  type LocalRepositoryFile,
} from "../repository/localRepositoryInspection";
import {
  buildDependencyRepositoryNameCandidates,
  collectPackageNamesFromText,
  repositoryContainsPackage,
} from "../repository/repositoryUrdfDiscovery";
import {
  buildPackageRootsFromRepositoryFiles,
  collectXacroSupportFilesFromRepository,
  normalizeRepositoryPath,
  type RepositoryFileEntry,
} from "../repository/repositoryMeshResolution";
import {
  buildXacroExpandRequestPayload,
  createXacroFilePayloadFromBytes,
  type XacroExpandRequestPayload,
} from "./xacroContract";
import { stabilizeExpandedXacroUrdf } from "./stabilizeExpandedXacroUrdf";

export type XacroRuntimeName = "python-xacro" | "vendored-xacrodoc";

export type XacroRuntimeOptions = {
  pythonExecutable?: string;
  wheelPath?: string;
  helperScriptPath?: string;
};

export type SetupXacroRuntimeOptions = XacroRuntimeOptions & {
  venvPath?: string;
  bootstrapPythonExecutable?: string;
};

export type XacroRuntimeAvailability = {
  available: boolean;
  runtime?: XacroRuntimeName;
  error?: string;
  pythonExecutable: string;
};

export type SetupXacroRuntimeResult = XacroRuntimeAvailability & {
  venvPath: string;
  bootstrapPythonExecutable: string;
};

export type XacroExpandResult = {
  urdf: string;
  stderr?: string | null;
  runtime: XacroRuntimeName;
};

export type ExpandLocalXacroOptions = XacroRuntimeOptions & {
  xacroPath: string;
  rootPath?: string;
  args?: Record<string, string>;
  useInorder?: boolean;
};

export type LocalXacroExpansionResult = XacroExpandResult & {
  source: "local";
  rootPath: string;
  xacroPath: string;
  inspectedPath: string;
};

export type ExpandGitHubXacroOptions = XacroRuntimeOptions & {
  targetPath?: string;
  accessToken?: string;
  args?: Record<string, string>;
  useInorder?: boolean;
};

export type GitHubXacroExpansionResult = XacroExpandResult & {
  source: "github";
  owner: string;
  repo: string;
  ref: string;
  path: string | null;
  targetPath: string;
  repositoryUrl: string;
};

type PythonHelperSuccessPayload = {
  ok: true;
  urdf?: string;
  stderr?: string | null;
  runtime?: XacroRuntimeName;
  available?: boolean;
  error?: string;
};

type PythonHelperFailurePayload = {
  ok: false;
  error?: string;
};

type PythonHelperPayload = PythonHelperSuccessPayload | PythonHelperFailurePayload;

const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });
const LATIN1_DECODER = new TextDecoder("latin1");
const MAX_GITHUB_DEPENDENCY_ITERATIONS = 3;
const MANAGED_XACRO_RUNTIME_SUBPATH = path.join(".i-love-urdf", "xacro-runtime");
const PACKAGE_ROOT_PATH = path.resolve(__dirname, "..", "..");

const getVenvPythonCandidatePaths = (venvPath: string): string[] => [
  path.join(venvPath, "bin", "python"),
  path.join(venvPath, "Scripts", "python.exe"),
];

const getExistingVenvPythonPath = (venvPath: string): string | undefined =>
  getVenvPythonCandidatePaths(venvPath).find((candidatePath) => fsSync.existsSync(candidatePath));

const getManagedRuntimeSearchRoots = (): string[] => {
  const seen = new Set<string>();
  const roots: string[] = [];

  const pushRoot = (candidate: string | undefined) => {
    if (!candidate) return;
    const resolved = path.resolve(candidate);
    if (seen.has(resolved)) return;
    seen.add(resolved);
    roots.push(resolved);
  };

  let cursor = path.resolve(process.cwd());
  while (true) {
    pushRoot(cursor);
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }

  pushRoot(PACKAGE_ROOT_PATH);
  return roots;
};

const getManagedRuntimePythonPath = (): string | undefined => {
  const envHome = process.env.I_LOVE_URDF_XACRO_HOME?.trim();
  if (envHome) {
    const envPython = getExistingVenvPythonPath(path.resolve(envHome));
    if (envPython) return envPython;
  }

  for (const rootPath of getManagedRuntimeSearchRoots()) {
    const candidate = getExistingVenvPythonPath(path.join(rootPath, MANAGED_XACRO_RUNTIME_SUBPATH));
    if (candidate) return candidate;
  }

  return undefined;
};

const decodeSupportText = (bytes: Uint8Array): string => {
  try {
    return UTF8_DECODER.decode(bytes);
  } catch {
    return LATIN1_DECODER.decode(bytes);
  }
};

const getPythonExecutable = (options?: XacroRuntimeOptions): string =>
  options?.pythonExecutable?.trim() ||
  process.env.I_LOVE_URDF_XACRO_PYTHON ||
  getManagedRuntimePythonPath() ||
  "python3";

const getBootstrapPythonExecutable = (options?: SetupXacroRuntimeOptions): string =>
  options?.bootstrapPythonExecutable?.trim() ||
  options?.pythonExecutable?.trim() ||
  process.env.I_LOVE_URDF_XACRO_BOOTSTRAP_PYTHON ||
  process.env.I_LOVE_URDF_XACRO_PYTHON ||
  "python3";

const getHelperScriptPath = (options?: XacroRuntimeOptions): string =>
  options?.helperScriptPath
    ? path.resolve(options.helperScriptPath)
    : path.resolve(__dirname, "xacro_expand_runtime.py");

const buildRuntimeEnv = (options?: XacroRuntimeOptions): NodeJS.ProcessEnv => {
  const env = { ...process.env };
  const wheelPath = options?.wheelPath?.trim() || process.env.I_LOVE_URDF_XACRODOC_WHEEL;
  if (wheelPath) {
    env.I_LOVE_URDF_XACRODOC_WHEEL = path.resolve(wheelPath);
  }
  return env;
};

const getManagedVenvPath = (options?: SetupXacroRuntimeOptions): string =>
  path.resolve(options?.venvPath?.trim() || path.join(process.cwd(), MANAGED_XACRO_RUNTIME_SUBPATH));

const runProcess = async (
  executable: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}
): Promise<{ stdout: string; stderr: string }> =>
  new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      reject(new Error(`Failed to launch ${executable}: ${error.message}`));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(
        new Error(
          stderr.trim() ||
            stdout.trim() ||
            `${executable} ${args.join(" ")} failed${code !== null ? ` with exit ${code}` : ""}.`
        )
      );
    });
  });

const runPythonHelper = async (
  payload: Record<string, unknown>,
  options?: XacroRuntimeOptions
): Promise<PythonHelperSuccessPayload> =>
  new Promise((resolve, reject) => {
    const pythonExecutable = getPythonExecutable(options);
    const helperScriptPath = getHelperScriptPath(options);
    const child = spawn(pythonExecutable, [helperScriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
      env: buildRuntimeEnv(options),
    });

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      reject(new Error(`Failed to launch Xacro runtime via ${pythonExecutable}: ${error.message}`));
    });
    child.on("close", (code) => {
      let parsed: PythonHelperPayload | null = null;
      try {
        parsed = stdout.trim()
          ? (JSON.parse(stdout) as PythonHelperPayload)
          : null;
      } catch {
        parsed = null;
      }

      if (parsed && parsed.ok === false) {
        reject(new Error(parsed.error || stderr.trim() || "Xacro runtime failed."));
        return;
      }

      if (!parsed) {
        reject(
          new Error(
            stderr.trim() ||
              `Xacro runtime returned no structured response${code !== 0 ? ` (exit ${code})` : ""}.`
          )
        );
        return;
      }

      resolve(parsed as PythonHelperSuccessPayload);
    });

    child.stdin.end(JSON.stringify(payload));
  });

export const probeXacroRuntime = async (
  options: XacroRuntimeOptions = {}
): Promise<XacroRuntimeAvailability> => {
  try {
    const response = await runPythonHelper({ probe: true }, options);
    return {
      available: Boolean(response.available),
      runtime: response.runtime,
      error: response.available ? undefined : response.error || "No Xacro runtime available.",
      pythonExecutable: getPythonExecutable(options),
    };
  } catch (error) {
    return {
      available: false,
      error: error instanceof Error ? error.message : "Failed to probe Xacro runtime.",
      pythonExecutable: getPythonExecutable(options),
    };
  }
};

export const setupXacroRuntime = async (
  options: SetupXacroRuntimeOptions = {}
): Promise<SetupXacroRuntimeResult> => {
  const bootstrapPythonExecutable = getBootstrapPythonExecutable(options);
  const venvPath = getManagedVenvPath(options);

  await fs.mkdir(path.dirname(venvPath), { recursive: true });
  await runProcess(bootstrapPythonExecutable, ["-m", "venv", venvPath], {
    env: buildRuntimeEnv(options),
  });

  const managedPythonExecutable = getExistingVenvPythonPath(venvPath);
  if (!managedPythonExecutable) {
    throw new Error(`Created virtualenv but could not find its Python executable: ${venvPath}`);
  }

  await runProcess(managedPythonExecutable, ["-m", "ensurepip", "--upgrade"], {
    env: buildRuntimeEnv(options),
  });
  await runProcess(managedPythonExecutable, ["-m", "pip", "install", "--upgrade", "xacro"], {
    env: buildRuntimeEnv(options),
  });

  const probeResult = await probeXacroRuntime({
    ...options,
    pythonExecutable: managedPythonExecutable,
  });
  if (!probeResult.available) {
    throw new Error(probeResult.error || "Managed Xacro runtime setup did not produce a usable runtime.");
  }

  return {
    ...probeResult,
    venvPath,
    bootstrapPythonExecutable,
  };
};

export const expandXacroRequestPayload = async (
  payload: XacroExpandRequestPayload,
  options: XacroRuntimeOptions = {}
): Promise<XacroExpandResult> => {
  const response = await runPythonHelper(payload as unknown as Record<string, unknown>, options);
  if (!response.ok || !response.urdf || !response.runtime) {
    throw new Error("Xacro runtime returned an invalid response.");
  }
  return {
    urdf: response.urdf,
    stderr: response.stderr ?? null,
    runtime: response.runtime,
  };
};

export const buildXacroExpandPayloadFromRepository = async <T extends RepositoryFileEntry>(
  files: T[],
  targetPath: string,
  readFileBytes: (file: T) => Promise<Uint8Array>,
  options: {
    args?: Record<string, string>;
    useInorder?: boolean;
  } = {}
): Promise<XacroExpandRequestPayload> => {
  const normalizedTargetPath = normalizeRepositoryPath(targetPath);
  if (!normalizedTargetPath) {
    throw new Error("Missing target xacro path.");
  }

  const targetFile = files.find(
    (file) => file.type === "file" && normalizeRepositoryPath(file.path) === normalizedTargetPath
  );
  if (!targetFile) {
    throw new Error(`Target xacro file not found in repository tree: ${normalizedTargetPath}`);
  }

  const supportFiles = collectXacroSupportFilesFromRepository(files, normalizedTargetPath).filter(
    (file): file is T => file.type === "file"
  );
  const payloadFiles = await Promise.all(
    supportFiles.map(async (file) =>
      createXacroFilePayloadFromBytes(file.path, await readFileBytes(file))
    )
  );

  return buildXacroExpandRequestPayload({
    targetPath: normalizedTargetPath,
    files: payloadFiles,
    args: options.args,
    useInorder: options.useInorder ?? true,
  });
};

export const expandLocalXacroToUrdf = async (
  options: ExpandLocalXacroOptions
): Promise<LocalXacroExpansionResult> => {
  const absoluteXacroPath = path.resolve(options.xacroPath);
  const xacroStats = await fs.stat(absoluteXacroPath);
  if (!xacroStats.isFile()) {
    throw new Error(`Local Xacro target is not a file: ${absoluteXacroPath}`);
  }

  const rootPath = path.resolve(options.rootPath ?? path.dirname(absoluteXacroPath));
  const relativeXacroPath = normalizeRepositoryPath(path.relative(rootPath, absoluteXacroPath));
  if (!relativeXacroPath || relativeXacroPath.startsWith("..")) {
    throw new Error("Local Xacro target must stay inside the selected root path.");
  }

  const files = await collectLocalRepositoryFiles(rootPath);
  const payload = await buildXacroExpandPayloadFromRepository(
    files,
    relativeXacroPath,
    async (file: LocalRepositoryFile) => fs.readFile(file.absolutePath),
    {
      args: options.args,
      useInorder: options.useInorder,
    }
  );
  const result = await expandXacroRequestPayload(payload, options);
  const stabilized = stabilizeExpandedXacroUrdf(result.urdf, relativeXacroPath, files);

  return {
    source: "local",
    rootPath,
    xacroPath: relativeXacroPath,
    inspectedPath: absoluteXacroPath,
    ...result,
    urdf: stabilized.urdf,
  };
};

const mergeGitHubRepositoryFiles = (
  primary: GitHubRepositoryFile[],
  secondary: GitHubRepositoryFile[]
): GitHubRepositoryFile[] => {
  const merged = new Map<string, GitHubRepositoryFile>();
  primary.forEach((file) => merged.set(file.path, file));
  secondary.forEach((file) => {
    if (!merged.has(file.path)) {
      merged.set(file.path, file);
    }
  });
  return Array.from(merged.values());
};

const prefixDependencyFiles = (
  files: GitHubRepositoryFile[],
  packageName: string,
  owner: string,
  repo: string
): GitHubRepositoryFile[] => {
  const prefix = `__deps/${packageName}`;
  return files.map((file) => ({
    ...file,
    path: normalizeRepositoryPath(`${prefix}/${file.path}`),
    sourceOwner: owner,
    sourceRepo: repo,
    sourcePath: file.path,
  }));
};

const buildGitHubReadKey = (file: GitHubRepositoryFile, fallbackOwner: string, fallbackRepo: string): string =>
  [
    file.sourceOwner || fallbackOwner,
    file.sourceRepo || fallbackRepo,
    file.sourcePath || file.path,
    file.sha || "",
  ].join("::");

const fetchMissingGitHubDependencyFiles = async (params: {
  owner: string;
  accessToken?: string;
  packageNames: string[];
  existingFiles: GitHubRepositoryFile[];
}): Promise<GitHubRepositoryFile[]> => {
  const { owner, accessToken, packageNames, existingFiles } = params;
  const packageRoots = buildPackageRootsFromRepositoryFiles(existingFiles);
  const missingPackages = packageNames.filter((name) => !(packageRoots[name]?.length));
  if (missingPackages.length === 0) return [];

  const repositoryCache = new Map<string, GitHubRepositoryFile[] | null>();
  const dependencyFiles: GitHubRepositoryFile[] = [];

  for (const packageName of missingPackages) {
    let resolvedRepo: string | null = null;
    let resolvedFiles: GitHubRepositoryFile[] | null = null;

    for (const repoCandidate of buildDependencyRepositoryNameCandidates(packageName)) {
      const cacheKey = `${owner}/${repoCandidate}`;
      if (!repositoryCache.has(cacheKey)) {
        try {
          const fetched = await fetchGitHubRepositoryFiles(
            { owner, repo: repoCandidate },
            accessToken
          );
          repositoryCache.set(cacheKey, fetched.files);
        } catch {
          repositoryCache.set(cacheKey, null);
        }
      }

      const repoFiles = repositoryCache.get(cacheKey);
      if (!repoFiles || repoFiles.length === 0) continue;
      if (!repositoryContainsPackage(repoFiles, packageName, repoCandidate)) continue;

      resolvedRepo = repoCandidate;
      resolvedFiles = repoFiles;
      break;
    }

    if (!resolvedRepo || !resolvedFiles) continue;
    dependencyFiles.push(...prefixDependencyFiles(resolvedFiles, packageName, owner, resolvedRepo));
  }

  return dependencyFiles;
};

export const expandGitHubRepositoryXacro = async (
  reference: GitHubRepositoryReference,
  options: ExpandGitHubXacroOptions = {}
): Promise<GitHubXacroExpansionResult> => {
  const normalizedTargetPath = normalizeRepositoryPath(options.targetPath ?? reference.path ?? "");
  if (!normalizedTargetPath) {
    throw new Error("GitHub Xacro expansion requires --xacro unless the GitHub reference already points to a xacro file.");
  }

  const { ref, files } = await fetchGitHubRepositoryFiles(reference, options.accessToken);
  let resolvedFiles = files;
  const byteCache = new Map<string, Uint8Array>();

  const readFileBytes = async (file: GitHubRepositoryFile): Promise<Uint8Array> => {
    const cacheKey = buildGitHubReadKey(file, reference.owner, reference.repo);
    const cached = byteCache.get(cacheKey);
    if (cached) return cached;

    const bytes = await fetchGitHubFileBytes(
      file.sourceOwner || reference.owner,
      file.sourceRepo || reference.repo,
      file.sourcePath || file.path,
      file.sha,
      options.accessToken
    );
    byteCache.set(cacheKey, bytes);
    return bytes;
  };

  for (let iteration = 0; iteration < MAX_GITHUB_DEPENDENCY_ITERATIONS; iteration += 1) {
    const supportFiles = collectXacroSupportFilesFromRepository(resolvedFiles, normalizedTargetPath).filter(
      (file): file is GitHubRepositoryFile => file.type === "file"
    );
    const packageNames = new Set<string>();

    for (const file of supportFiles) {
      const text = decodeSupportText(await readFileBytes(file));
      collectPackageNamesFromText(text).forEach((name) => packageNames.add(name));
    }

    const dependencyFiles = await fetchMissingGitHubDependencyFiles({
      owner: reference.owner,
      accessToken: options.accessToken,
      packageNames: Array.from(packageNames),
      existingFiles: resolvedFiles,
    });

    if (dependencyFiles.length === 0) {
      break;
    }

    resolvedFiles = mergeGitHubRepositoryFiles(resolvedFiles, dependencyFiles);
  }

  const payload = await buildXacroExpandPayloadFromRepository(
    resolvedFiles,
    normalizedTargetPath,
    readFileBytes,
    {
      args: options.args,
      useInorder: options.useInorder,
    }
  );
  const result = await expandXacroRequestPayload(payload, options);
  const stabilized = stabilizeExpandedXacroUrdf(result.urdf, normalizedTargetPath, resolvedFiles);

  return {
    source: "github",
    owner: reference.owner,
    repo: reference.repo,
    ref,
    path: normalizeRepositoryPath(reference.path || "") || null,
    targetPath: normalizedTargetPath,
    repositoryUrl: `https://github.com/${reference.owner}/${reference.repo}`,
    ...result,
    urdf: stabilized.urdf,
  };
};
