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
  findPackageXmlForPackageName,
  repositoryContainsPackage,
  resolveRepositoryXacroTargetPath,
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
import { installNodeDomGlobals } from "../node/nodeDomRuntime";

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

export type XacroRuntimePackageVersions = Record<string, string>;

export type XacroRuntimeAvailability = {
  available: boolean;
  runtime?: XacroRuntimeName;
  error?: string;
  pythonExecutable: string;
  packageVersions: XacroRuntimePackageVersions;
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
  packageVersions?: XacroRuntimePackageVersions;
};

type PythonHelperFailurePayload = {
  ok: false;
  error?: string;
};

type PythonHelperPayload = PythonHelperSuccessPayload | PythonHelperFailurePayload;

const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });
const LATIN1_DECODER = new TextDecoder("latin1");
const MAX_GITHUB_DEPENDENCY_ITERATIONS = 3;
const MAX_GITHUB_RUNTIME_RECOVERY_ITERATIONS = 8;
const XACRO_HELPER_TIMEOUT_MS = 120_000;
const XACRO_SETUP_TIMEOUT_MS = 300_000;
const XACRO_HELPER_MAX_OUTPUT_BYTES = 32 * 1024 * 1024;
const XACRO_PROCESS_MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
const XACRO_MISSING_PACKAGE_PATTERN = /Package '([^']+)' not found in uploaded files\./g;
const MANAGED_XACRO_RUNTIME_SUBPATH = path.join(".i-love-urdf", "xacro-runtime");
export const MANAGED_XACRO_RUNTIME_PACKAGES = Object.freeze(["xacro==2.1.1", "PyYAML==6.0.3"] as const);
const PACKAGE_ROOT_PATH = path.resolve(__dirname, "..", "..");
const SYSTEM_PYTHON_FALLBACKS = process.platform === "win32" ? ["python", "py", "python3"] : ["python3", "python", "py"];

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

const uniqueDefinedValues = (values: Array<string | undefined>): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
};

const decodeSupportText = (bytes: Uint8Array): string => {
  try {
    return UTF8_DECODER.decode(bytes);
  } catch {
    return LATIN1_DECODER.decode(bytes);
  }
};

const ensureNodeDomGlobals = () => {
  installNodeDomGlobals();
};

const isSkippableMissingGitHubSupportFileError = (error: unknown): boolean =>
  error instanceof Error &&
  (/GitHub file not found:/i.test(error.message) ||
    /Public mirror request failed while reading .*: 404\b/i.test(error.message));

const extractMissingGitHubSupportPathFromError = (error: unknown): string | null => {
  if (!(error instanceof Error)) return null;
  const directMatch = error.message.match(/GitHub file not found:\s+(.+)$/i);
  if (directMatch?.[1]) {
    return normalizeRepositoryPath(directMatch[1].trim());
  }
  const mirrorMatch = error.message.match(
    /Public mirror request failed while reading\s+(.+?):\s+404\b/i
  );
  if (mirrorMatch?.[1]) {
    return normalizeRepositoryPath(mirrorMatch[1].trim());
  }
  return null;
};

const extractMissingPackageNamesFromXacroError = (error: unknown): string[] => {
  if (!(error instanceof Error) || !error.message) return [];
  const names = new Set<string>();
  XACRO_MISSING_PACKAGE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = XACRO_MISSING_PACKAGE_PATTERN.exec(error.message)) !== null) {
    const packageName = match[1]?.trim();
    if (packageName) names.add(packageName);
  }
  return Array.from(names);
};

const getPythonExecutable = (options?: XacroRuntimeOptions): string =>
  options?.pythonExecutable?.trim() ||
  process.env.I_LOVE_URDF_XACRO_PYTHON ||
  getManagedRuntimePythonPath() ||
  SYSTEM_PYTHON_FALLBACKS[0];

const getBootstrapPythonExecutables = (options?: SetupXacroRuntimeOptions): string[] =>
  uniqueDefinedValues([
    options?.bootstrapPythonExecutable?.trim(),
    options?.pythonExecutable?.trim(),
    process.env.I_LOVE_URDF_XACRO_BOOTSTRAP_PYTHON,
    process.env.I_LOVE_URDF_XACRO_PYTHON,
    ...SYSTEM_PYTHON_FALLBACKS,
  ]);

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

const buildManagedXacroRuntimeInstallArgs = (): string[] => [
  "-I",
  "-m",
  "pip",
  "install",
  "--isolated",
  "--disable-pip-version-check",
  "--no-cache-dir",
  "--no-input",
  "--require-virtualenv",
  "--upgrade",
  "--upgrade-strategy",
  "only-if-needed",
  ...MANAGED_XACRO_RUNTIME_PACKAGES,
];

const captureSpawnedProcess = async (
  executable: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    stdinText?: string;
    timeoutMs: number;
    maxOutputBytes: number;
  }
): Promise<{ stdout: string; stderr: string; code: number | null }> =>
  new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let combinedOutputBytes = 0;
    let settled = false;

    const finishReject = (message: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      reject(new Error(message));
    };

    const finishResolve = (value: { stdout: string; stderr: string; code: number | null }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      resolve(value);
    };

    const terminateChild = (message: string) => {
      try {
        child.kill("SIGKILL");
      } catch {
        // Ignore termination races and report the original guard failure.
      }
      finishReject(message);
    };

    const appendChunk = (target: "stdout" | "stderr", chunk: string) => {
      const nextBytes = Buffer.byteLength(chunk, "utf8");
      combinedOutputBytes += nextBytes;
      if (combinedOutputBytes > options.maxOutputBytes) {
        terminateChild(
          `${executable} ${args.join(" ")} exceeded the output limit of ${options.maxOutputBytes} bytes.`
        );
        return;
      }

      if (target === "stdout") {
        stdout += chunk;
      } else {
        stderr += chunk;
      }
    };

    const timeoutId = setTimeout(() => {
      terminateChild(
        `${executable} ${args.join(" ")} timed out after ${options.timeoutMs} ms.`
      );
    }, options.timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      appendChunk("stdout", chunk);
    });
    child.stderr.on("data", (chunk) => {
      appendChunk("stderr", chunk);
    });
    child.on("error", (error) => {
      finishReject(`Failed to launch ${executable}: ${error.message}`);
    });
    child.on("close", (code) => {
      if (settled) {
        return;
      }
      finishResolve({ stdout, stderr, code });
    });

    child.stdin.end(options.stdinText ?? "");
  });

const runProcess = async (
  executable: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}
): Promise<{ stdout: string; stderr: string }> =>
  captureSpawnedProcess(executable, args, {
    cwd: options.cwd,
    env: options.env,
    timeoutMs: XACRO_SETUP_TIMEOUT_MS,
    maxOutputBytes: XACRO_PROCESS_MAX_OUTPUT_BYTES,
  }).then(({ stdout, stderr, code }) => {
    if (code === 0) {
      return { stdout, stderr };
    }
    throw new Error(
      stderr.trim() ||
        stdout.trim() ||
        `${executable} ${args.join(" ")} failed${code !== null ? ` with exit ${code}` : ""}.`
    );
  });

const runProcessWithFallbacks = async (
  executables: readonly string[],
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}
): Promise<{ stdout: string; stderr: string; executable: string }> => {
  let lastError: Error | null = null;

  for (const executable of executables) {
    try {
      const result = await runProcess(executable, args, options);
      return { ...result, executable };
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error;
      }

      lastError = error;
      if (!error.message.startsWith(`Failed to launch ${executable}:`)) {
        throw error;
      }
    }
  }

  throw lastError ?? new Error(`Failed to launch any Python bootstrap command: ${executables.join(", ")}`);
};

const isMissingXacroRuntimeError = (message: string): boolean =>
  /no (python |vendored )?xacro runtime available/i.test(message) ||
  /install xacro or provide i_love_urdf_xacrodoc_wheel/i.test(message);

const getMissingXacroArgumentName = (message: string): string | null => {
  const match = message.match(/Undefined substitution argument\s+([A-Za-z0-9_:-]+)/i);
  return match?.[1] ?? null;
};

const withXacroRuntimeGuidance = (message: string): string => {
  const guidance: string[] = [];

  if (isMissingXacroRuntimeError(message)) {
    guidance.push(
      "Set up a local XACRO runtime in this project directory, then retry:",
      "  ilu setup-xacro-runtime",
      "  ilu probe-xacro-runtime",
      "",
      "If you are running from a repo checkout instead of an installed CLI, use:",
      "  corepack pnpm ilu setup-xacro-runtime",
      "  corepack pnpm ilu probe-xacro-runtime"
    );
  }

  const missingArgumentName = getMissingXacroArgumentName(message);
  if (missingArgumentName) {
    if (guidance.length > 0) {
      guidance.push("");
    }
    guidance.push(
      `Provide the missing XACRO argument with --args, for example:`,
      `  --args ${missingArgumentName}=<value>`,
      "",
      "You can pass multiple values as --args name=value,other=value."
    );
  }

  if (guidance.length === 0) {
    return message;
  }

  return [message, "", ...guidance].join("\n");
};

const runPythonHelper = async (
  payload: Record<string, unknown>,
  options?: XacroRuntimeOptions
): Promise<PythonHelperSuccessPayload> =>
  (async () => {
    const pythonExecutable = getPythonExecutable(options);
    const helperScriptPath = getHelperScriptPath(options);
    const { stdout, stderr, code } = await captureSpawnedProcess(
      pythonExecutable,
      [helperScriptPath],
      {
        env: buildRuntimeEnv(options),
        stdinText: JSON.stringify(payload),
        timeoutMs: XACRO_HELPER_TIMEOUT_MS,
        maxOutputBytes: XACRO_HELPER_MAX_OUTPUT_BYTES,
      }
    );

    let parsed: PythonHelperPayload | null = null;
    try {
      parsed = stdout.trim()
        ? (JSON.parse(stdout) as PythonHelperPayload)
        : null;
    } catch {
      parsed = null;
    }

    if (parsed && parsed.ok === false) {
      throw new Error(withXacroRuntimeGuidance(parsed.error || stderr.trim() || "Xacro runtime failed."));
    }

    if (!parsed) {
      throw new Error(
        stderr.trim() ||
          `Xacro runtime returned no structured response${code !== 0 ? ` (exit ${code})` : ""}.`
      );
    }

    return parsed as PythonHelperSuccessPayload;
  })();

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
      packageVersions: response.packageVersions ?? {},
    };
  } catch (error) {
    return {
      available: false,
      error: error instanceof Error ? error.message : "Failed to probe Xacro runtime.",
      pythonExecutable: getPythonExecutable(options),
      packageVersions: {},
    };
  }
};

export const setupXacroRuntime = async (
  options: SetupXacroRuntimeOptions = {}
): Promise<SetupXacroRuntimeResult> => {
  const bootstrapPythonExecutables = getBootstrapPythonExecutables(options);
  const venvPath = getManagedVenvPath(options);

  await fs.mkdir(path.dirname(venvPath), { recursive: true });
  const bootstrapResult = await runProcessWithFallbacks(bootstrapPythonExecutables, ["-m", "venv", venvPath], {
    env: buildRuntimeEnv(options),
  });
  const bootstrapPythonExecutable = bootstrapResult.executable;

  const managedPythonExecutable = getExistingVenvPythonPath(venvPath);
  if (!managedPythonExecutable) {
    throw new Error(`Created virtualenv but could not find its Python executable: ${venvPath}`);
  }

  await runProcess(managedPythonExecutable, ["-m", "ensurepip", "--upgrade"], {
    env: buildRuntimeEnv(options),
  });
  await runProcess(managedPythonExecutable, buildManagedXacroRuntimeInstallArgs(), {
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
  const requestedTargetPath = normalizeRepositoryPath(targetPath);
  if (!requestedTargetPath) {
    throw new Error("Missing target xacro path.");
  }
  const normalizedTargetPath = resolveRepositoryXacroTargetPath(files, requestedTargetPath);

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
  ensureNodeDomGlobals();
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

const hasExplicitLocalGitHubPackage = (
  files: GitHubRepositoryFile[],
  packageName: string,
  repositoryName?: string
): boolean => {
  if (findPackageXmlForPackageName(files, packageName)) {
    return true;
  }

  return Boolean(
    repositoryName &&
      files.some(
        (file) => file.type === "file" && normalizeRepositoryPath(file.path).toLowerCase() === "package.xml"
      ) &&
      repositoryContainsPackage(files, packageName, repositoryName)
  );
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
  ref?: string;
  accessToken?: string;
  packageNames: string[];
  existingFiles: GitHubRepositoryFile[];
  skipExistingCheck?: boolean;
  repositoryCache?: Map<string, GitHubRepositoryFile[] | null>;
}): Promise<GitHubRepositoryFile[]> => {
  const { owner, ref, accessToken, packageNames, existingFiles, skipExistingCheck } = params;
  const packageRoots = buildPackageRootsFromRepositoryFiles(existingFiles);
  const missingPackages = skipExistingCheck
    ? packageNames
    : packageNames.filter((name) => !(packageRoots[name]?.length));
  if (missingPackages.length === 0) return [];

  const repositoryCache = params.repositoryCache ?? new Map<string, GitHubRepositoryFile[] | null>();
  const dependencyFiles: GitHubRepositoryFile[] = [];

  for (const packageName of missingPackages) {
    let resolvedRepo: string | null = null;
    let resolvedFiles: GitHubRepositoryFile[] | null = null;

    for (const repoCandidate of buildDependencyRepositoryNameCandidates(packageName)) {
      const cacheKey = `${owner}/${repoCandidate}`;
      if (!repositoryCache.has(cacheKey)) {
        try {
          const fetched = await fetchGitHubRepositoryFiles(
            { owner, repo: repoCandidate, ref },
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
  return expandFetchedGitHubRepositoryXacro(reference, ref, files, options);
};

export const expandFetchedGitHubRepositoryXacro = async (
  reference: GitHubRepositoryReference,
  ref: string,
  files: GitHubRepositoryFile[],
  options: ExpandGitHubXacroOptions = {}
): Promise<GitHubXacroExpansionResult> => {
  const requestedTargetPath = normalizeRepositoryPath(options.targetPath ?? reference.path ?? "");
  if (!requestedTargetPath) {
    throw new Error("GitHub Xacro expansion requires --xacro unless the GitHub reference already points to a xacro file.");
  }

  let resolvedFiles = files;
  const byteCache = new Map<string, Uint8Array>();
  const dependencyRepositoryCache = new Map<string, GitHubRepositoryFile[] | null>();
  const skippedSupportPaths = new Set<string>();
  const attemptedRuntimeDependencyPackages = new Set<string>();

  const readFileBytes = async (file: GitHubRepositoryFile): Promise<Uint8Array> => {
    const cacheKey = buildGitHubReadKey(file, reference.owner, reference.repo);
    const cached = byteCache.get(cacheKey);
    if (cached) return cached;

    const bytes = await fetchGitHubFileBytes(
      file.sourceOwner || reference.owner,
      file.sourceRepo || reference.repo,
      file.sourcePath || file.path,
      file.sha,
      options.accessToken,
      ref,
      file.download_url
    );
    byteCache.set(cacheKey, bytes);
    return bytes;
  };

  const resolveStaticSupportDependencies = async () => {
    for (let iteration = 0; iteration < MAX_GITHUB_RUNTIME_RECOVERY_ITERATIONS; iteration += 1) {
      const resolvedTargetPath = resolveRepositoryXacroTargetPath(resolvedFiles, requestedTargetPath);
      const supportFiles = collectXacroSupportFilesFromRepository(resolvedFiles, resolvedTargetPath).filter(
        (file): file is GitHubRepositoryFile =>
          file.type === "file" && !skippedSupportPaths.has(file.path)
      );
      const packageNames = new Set<string>();
      const supportTexts = await Promise.all(
        supportFiles.map(async (file) => {
          try {
            return {
              file,
              text: decodeSupportText(await readFileBytes(file)),
            };
          } catch (error) {
            if (
              file.path !== resolvedTargetPath &&
              isSkippableMissingGitHubSupportFileError(error)
            ) {
              skippedSupportPaths.add(file.path);
              return null;
            }
            throw error;
          }
        })
      );

      supportTexts.forEach((entry) => {
        if (!entry) return;
        collectPackageNamesFromText(entry.text).forEach((name) => packageNames.add(name));
      });

      const dependencyFiles = await fetchMissingGitHubDependencyFiles({
        owner: reference.owner,
        ref,
        accessToken: options.accessToken,
        packageNames: Array.from(packageNames),
        existingFiles: resolvedFiles,
        repositoryCache: dependencyRepositoryCache,
      });

      if (dependencyFiles.length === 0) {
        break;
      }

      resolvedFiles = mergeGitHubRepositoryFiles(resolvedFiles, dependencyFiles);
    }
  };

  await resolveStaticSupportDependencies();

  let result: XacroExpandResult | null = null;
  let lastExpansionError: unknown = null;

  for (let iteration = 0; iteration < MAX_GITHUB_DEPENDENCY_ITERATIONS; iteration += 1) {
    let payload: XacroExpandRequestPayload;
    try {
      payload = await buildXacroExpandPayloadFromRepository(
        skippedSupportPaths.size === 0
          ? resolvedFiles
          : resolvedFiles.filter((file) => !skippedSupportPaths.has(file.path)),
        requestedTargetPath,
        readFileBytes,
        {
          args: options.args,
          useInorder: options.useInorder,
        }
      );
    } catch (error) {
      const missingPath = extractMissingGitHubSupportPathFromError(error);
      const skippedPath =
        missingPath
          ? resolvedFiles.find(
              (file) =>
                normalizeRepositoryPath(file.path) === missingPath ||
                normalizeRepositoryPath(file.sourcePath || "") === missingPath
            )?.path || missingPath
          : null;
      if (skippedPath && !skippedSupportPaths.has(skippedPath)) {
        skippedSupportPaths.add(skippedPath);
        continue;
      }
      throw error;
    }

    try {
      result = await expandXacroRequestPayload(payload, options);
      lastExpansionError = null;
      break;
    } catch (error) {
      lastExpansionError = error;
      const missingPackages = extractMissingPackageNamesFromXacroError(error).filter(
        (packageName) => !attemptedRuntimeDependencyPackages.has(packageName)
      );
      if (missingPackages.length === 0) {
        throw error;
      }

      missingPackages.forEach((packageName) => attemptedRuntimeDependencyPackages.add(packageName));
      const localPackages = missingPackages.filter((packageName) =>
        hasExplicitLocalGitHubPackage(resolvedFiles, packageName, reference.repo)
      );
      const remotePackages = missingPackages.filter(
        (packageName) => !localPackages.includes(packageName)
      );

      if (localPackages.length > 0) {
        await resolveStaticSupportDependencies();
        if (remotePackages.length === 0) {
          continue;
        }
      }

      const dependencyFiles = await fetchMissingGitHubDependencyFiles({
        owner: reference.owner,
        ref,
        accessToken: options.accessToken,
        packageNames: remotePackages,
        existingFiles: resolvedFiles,
        skipExistingCheck: true,
        repositoryCache: dependencyRepositoryCache,
      });
      if (dependencyFiles.length === 0) {
        throw error;
      }
      resolvedFiles = mergeGitHubRepositoryFiles(resolvedFiles, dependencyFiles);
      await resolveStaticSupportDependencies();
    }
  }

  if (!result) {
    throw (lastExpansionError instanceof Error
      ? lastExpansionError
      : new Error("GitHub Xacro expansion failed."));
  }

  const resolvedTargetPath = resolveRepositoryXacroTargetPath(resolvedFiles, requestedTargetPath);
  ensureNodeDomGlobals();
  const stabilized = stabilizeExpandedXacroUrdf(result.urdf, resolvedTargetPath, resolvedFiles);

  return {
    source: "github",
    owner: reference.owner,
    repo: reference.repo,
    ref,
    path: normalizeRepositoryPath(reference.path || "") || null,
    targetPath: resolvedTargetPath,
    repositoryUrl: `https://github.com/${reference.owner}/${reference.repo}`,
    ...result,
    urdf: stabilized.urdf,
  };
};
