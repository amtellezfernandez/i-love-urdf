"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.expandFetchedGitHubRepositoryXacro = exports.expandGitHubRepositoryXacro = exports.expandLocalXacroToUrdf = exports.buildXacroExpandPayloadFromRepository = exports.expandXacroRequestPayload = exports.setupXacroRuntime = exports.probeXacroRuntime = void 0;
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");
const process = require("node:process");
const node_child_process_1 = require("node:child_process");
const githubRepositoryInspection_1 = require("../repository/githubRepositoryInspection");
const localRepositoryInspection_1 = require("../repository/localRepositoryInspection");
const repositoryUrdfDiscovery_1 = require("../repository/repositoryUrdfDiscovery");
const repositoryMeshResolution_1 = require("../repository/repositoryMeshResolution");
const xacroContract_1 = require("./xacroContract");
const stabilizeExpandedXacroUrdf_1 = require("./stabilizeExpandedXacroUrdf");
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });
const LATIN1_DECODER = new TextDecoder("latin1");
const MAX_GITHUB_DEPENDENCY_ITERATIONS = 3;
const MANAGED_XACRO_RUNTIME_SUBPATH = path.join(".i-love-urdf", "xacro-runtime");
const PACKAGE_ROOT_PATH = path.resolve(__dirname, "..", "..");
const getVenvPythonCandidatePaths = (venvPath) => [
    path.join(venvPath, "bin", "python"),
    path.join(venvPath, "Scripts", "python.exe"),
];
const getExistingVenvPythonPath = (venvPath) => getVenvPythonCandidatePaths(venvPath).find((candidatePath) => fsSync.existsSync(candidatePath));
const getManagedRuntimeSearchRoots = () => {
    const seen = new Set();
    const roots = [];
    const pushRoot = (candidate) => {
        if (!candidate)
            return;
        const resolved = path.resolve(candidate);
        if (seen.has(resolved))
            return;
        seen.add(resolved);
        roots.push(resolved);
    };
    let cursor = path.resolve(process.cwd());
    while (true) {
        pushRoot(cursor);
        const parent = path.dirname(cursor);
        if (parent === cursor)
            break;
        cursor = parent;
    }
    pushRoot(PACKAGE_ROOT_PATH);
    return roots;
};
const getManagedRuntimePythonPath = () => {
    const envHome = process.env.I_LOVE_URDF_XACRO_HOME?.trim();
    if (envHome) {
        const envPython = getExistingVenvPythonPath(path.resolve(envHome));
        if (envPython)
            return envPython;
    }
    for (const rootPath of getManagedRuntimeSearchRoots()) {
        const candidate = getExistingVenvPythonPath(path.join(rootPath, MANAGED_XACRO_RUNTIME_SUBPATH));
        if (candidate)
            return candidate;
    }
    return undefined;
};
const decodeSupportText = (bytes) => {
    try {
        return UTF8_DECODER.decode(bytes);
    }
    catch {
        return LATIN1_DECODER.decode(bytes);
    }
};
const getPythonExecutable = (options) => options?.pythonExecutable?.trim() ||
    process.env.I_LOVE_URDF_XACRO_PYTHON ||
    getManagedRuntimePythonPath() ||
    "python3";
const getBootstrapPythonExecutable = (options) => options?.bootstrapPythonExecutable?.trim() ||
    options?.pythonExecutable?.trim() ||
    process.env.I_LOVE_URDF_XACRO_BOOTSTRAP_PYTHON ||
    process.env.I_LOVE_URDF_XACRO_PYTHON ||
    "python3";
const getHelperScriptPath = (options) => options?.helperScriptPath
    ? path.resolve(options.helperScriptPath)
    : path.resolve(__dirname, "xacro_expand_runtime.py");
const buildRuntimeEnv = (options) => {
    const env = { ...process.env };
    const wheelPath = options?.wheelPath?.trim() || process.env.I_LOVE_URDF_XACRODOC_WHEEL;
    if (wheelPath) {
        env.I_LOVE_URDF_XACRODOC_WHEEL = path.resolve(wheelPath);
    }
    return env;
};
const getManagedVenvPath = (options) => path.resolve(options?.venvPath?.trim() || path.join(process.cwd(), MANAGED_XACRO_RUNTIME_SUBPATH));
const runProcess = async (executable, args, options = {}) => new Promise((resolve, reject) => {
    const child = (0, node_child_process_1.spawn)(executable, args, {
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
        reject(new Error(stderr.trim() ||
            stdout.trim() ||
            `${executable} ${args.join(" ")} failed${code !== null ? ` with exit ${code}` : ""}.`));
    });
});
const isMissingXacroRuntimeError = (message) => /no (python |vendored )?xacro runtime available/i.test(message) ||
    /install xacro or provide i_love_urdf_xacrodoc_wheel/i.test(message);
const getMissingXacroArgumentName = (message) => {
    const match = message.match(/Undefined substitution argument\s+([A-Za-z0-9_:-]+)/i);
    return match?.[1] ?? null;
};
const withXacroRuntimeGuidance = (message) => {
    const guidance = [];
    if (isMissingXacroRuntimeError(message)) {
        guidance.push("Set up a local XACRO runtime in this project directory, then retry:", "  ilu setup-xacro-runtime", "  ilu probe-xacro-runtime", "", "If you are running from a repo checkout instead of an installed CLI, use:", "  corepack pnpm ilu setup-xacro-runtime", "  corepack pnpm ilu probe-xacro-runtime");
    }
    const missingArgumentName = getMissingXacroArgumentName(message);
    if (missingArgumentName) {
        if (guidance.length > 0) {
            guidance.push("");
        }
        guidance.push(`Provide the missing XACRO argument with --args, for example:`, `  --args ${missingArgumentName}=<value>`, "", "You can pass multiple values as --args name=value,other=value.");
    }
    if (guidance.length === 0) {
        return message;
    }
    return [message, "", ...guidance].join("\n");
};
const runPythonHelper = async (payload, options) => new Promise((resolve, reject) => {
    const pythonExecutable = getPythonExecutable(options);
    const helperScriptPath = getHelperScriptPath(options);
    const child = (0, node_child_process_1.spawn)(pythonExecutable, [helperScriptPath], {
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
        let parsed = null;
        try {
            parsed = stdout.trim()
                ? JSON.parse(stdout)
                : null;
        }
        catch {
            parsed = null;
        }
        if (parsed && parsed.ok === false) {
            reject(new Error(withXacroRuntimeGuidance(parsed.error || stderr.trim() || "Xacro runtime failed.")));
            return;
        }
        if (!parsed) {
            reject(new Error(stderr.trim() ||
                `Xacro runtime returned no structured response${code !== 0 ? ` (exit ${code})` : ""}.`));
            return;
        }
        resolve(parsed);
    });
    child.stdin.end(JSON.stringify(payload));
});
const probeXacroRuntime = async (options = {}) => {
    try {
        const response = await runPythonHelper({ probe: true }, options);
        return {
            available: Boolean(response.available),
            runtime: response.runtime,
            error: response.available ? undefined : response.error || "No Xacro runtime available.",
            pythonExecutable: getPythonExecutable(options),
        };
    }
    catch (error) {
        return {
            available: false,
            error: error instanceof Error ? error.message : "Failed to probe Xacro runtime.",
            pythonExecutable: getPythonExecutable(options),
        };
    }
};
exports.probeXacroRuntime = probeXacroRuntime;
const setupXacroRuntime = async (options = {}) => {
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
    const probeResult = await (0, exports.probeXacroRuntime)({
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
exports.setupXacroRuntime = setupXacroRuntime;
const expandXacroRequestPayload = async (payload, options = {}) => {
    const response = await runPythonHelper(payload, options);
    if (!response.ok || !response.urdf || !response.runtime) {
        throw new Error("Xacro runtime returned an invalid response.");
    }
    return {
        urdf: response.urdf,
        stderr: response.stderr ?? null,
        runtime: response.runtime,
    };
};
exports.expandXacroRequestPayload = expandXacroRequestPayload;
const buildXacroExpandPayloadFromRepository = async (files, targetPath, readFileBytes, options = {}) => {
    const requestedTargetPath = (0, repositoryMeshResolution_1.normalizeRepositoryPath)(targetPath);
    if (!requestedTargetPath) {
        throw new Error("Missing target xacro path.");
    }
    const normalizedTargetPath = (0, repositoryUrdfDiscovery_1.resolveRepositoryXacroTargetPath)(files, requestedTargetPath);
    const targetFile = files.find((file) => file.type === "file" && (0, repositoryMeshResolution_1.normalizeRepositoryPath)(file.path) === normalizedTargetPath);
    if (!targetFile) {
        throw new Error(`Target xacro file not found in repository tree: ${normalizedTargetPath}`);
    }
    const supportFiles = (0, repositoryMeshResolution_1.collectXacroSupportFilesFromRepository)(files, normalizedTargetPath).filter((file) => file.type === "file");
    const payloadFiles = await Promise.all(supportFiles.map(async (file) => (0, xacroContract_1.createXacroFilePayloadFromBytes)(file.path, await readFileBytes(file))));
    return (0, xacroContract_1.buildXacroExpandRequestPayload)({
        targetPath: normalizedTargetPath,
        files: payloadFiles,
        args: options.args,
        useInorder: options.useInorder ?? true,
    });
};
exports.buildXacroExpandPayloadFromRepository = buildXacroExpandPayloadFromRepository;
const expandLocalXacroToUrdf = async (options) => {
    const absoluteXacroPath = path.resolve(options.xacroPath);
    const xacroStats = await fs.stat(absoluteXacroPath);
    if (!xacroStats.isFile()) {
        throw new Error(`Local Xacro target is not a file: ${absoluteXacroPath}`);
    }
    const rootPath = path.resolve(options.rootPath ?? path.dirname(absoluteXacroPath));
    const relativeXacroPath = (0, repositoryMeshResolution_1.normalizeRepositoryPath)(path.relative(rootPath, absoluteXacroPath));
    if (!relativeXacroPath || relativeXacroPath.startsWith("..")) {
        throw new Error("Local Xacro target must stay inside the selected root path.");
    }
    const files = await (0, localRepositoryInspection_1.collectLocalRepositoryFiles)(rootPath);
    const payload = await (0, exports.buildXacroExpandPayloadFromRepository)(files, relativeXacroPath, async (file) => fs.readFile(file.absolutePath), {
        args: options.args,
        useInorder: options.useInorder,
    });
    const result = await (0, exports.expandXacroRequestPayload)(payload, options);
    const stabilized = (0, stabilizeExpandedXacroUrdf_1.stabilizeExpandedXacroUrdf)(result.urdf, relativeXacroPath, files);
    return {
        source: "local",
        rootPath,
        xacroPath: relativeXacroPath,
        inspectedPath: absoluteXacroPath,
        ...result,
        urdf: stabilized.urdf,
    };
};
exports.expandLocalXacroToUrdf = expandLocalXacroToUrdf;
const mergeGitHubRepositoryFiles = (primary, secondary) => {
    const merged = new Map();
    primary.forEach((file) => merged.set(file.path, file));
    secondary.forEach((file) => {
        if (!merged.has(file.path)) {
            merged.set(file.path, file);
        }
    });
    return Array.from(merged.values());
};
const prefixDependencyFiles = (files, packageName, owner, repo) => {
    const prefix = `__deps/${packageName}`;
    return files.map((file) => ({
        ...file,
        path: (0, repositoryMeshResolution_1.normalizeRepositoryPath)(`${prefix}/${file.path}`),
        sourceOwner: owner,
        sourceRepo: repo,
        sourcePath: file.path,
    }));
};
const buildGitHubReadKey = (file, fallbackOwner, fallbackRepo) => [
    file.sourceOwner || fallbackOwner,
    file.sourceRepo || fallbackRepo,
    file.sourcePath || file.path,
    file.sha || "",
].join("::");
const fetchMissingGitHubDependencyFiles = async (params) => {
    const { owner, accessToken, packageNames, existingFiles } = params;
    const packageRoots = (0, repositoryMeshResolution_1.buildPackageRootsFromRepositoryFiles)(existingFiles);
    const missingPackages = packageNames.filter((name) => !(packageRoots[name]?.length));
    if (missingPackages.length === 0)
        return [];
    const repositoryCache = new Map();
    const dependencyFiles = [];
    for (const packageName of missingPackages) {
        let resolvedRepo = null;
        let resolvedFiles = null;
        for (const repoCandidate of (0, repositoryUrdfDiscovery_1.buildDependencyRepositoryNameCandidates)(packageName)) {
            const cacheKey = `${owner}/${repoCandidate}`;
            if (!repositoryCache.has(cacheKey)) {
                try {
                    const fetched = await (0, githubRepositoryInspection_1.fetchGitHubRepositoryFiles)({ owner, repo: repoCandidate }, accessToken);
                    repositoryCache.set(cacheKey, fetched.files);
                }
                catch {
                    repositoryCache.set(cacheKey, null);
                }
            }
            const repoFiles = repositoryCache.get(cacheKey);
            if (!repoFiles || repoFiles.length === 0)
                continue;
            if (!(0, repositoryUrdfDiscovery_1.repositoryContainsPackage)(repoFiles, packageName, repoCandidate))
                continue;
            resolvedRepo = repoCandidate;
            resolvedFiles = repoFiles;
            break;
        }
        if (!resolvedRepo || !resolvedFiles)
            continue;
        dependencyFiles.push(...prefixDependencyFiles(resolvedFiles, packageName, owner, resolvedRepo));
    }
    return dependencyFiles;
};
const expandGitHubRepositoryXacro = async (reference, options = {}) => {
    const normalizedTargetPath = (0, repositoryMeshResolution_1.normalizeRepositoryPath)(options.targetPath ?? reference.path ?? "");
    if (!normalizedTargetPath) {
        throw new Error("GitHub Xacro expansion requires --xacro unless the GitHub reference already points to a xacro file.");
    }
    const { ref, files } = await (0, githubRepositoryInspection_1.fetchGitHubRepositoryFiles)(reference, options.accessToken);
    return (0, exports.expandFetchedGitHubRepositoryXacro)(reference, ref, files, options);
};
exports.expandGitHubRepositoryXacro = expandGitHubRepositoryXacro;
const expandFetchedGitHubRepositoryXacro = async (reference, ref, files, options = {}) => {
    const requestedTargetPath = (0, repositoryMeshResolution_1.normalizeRepositoryPath)(options.targetPath ?? reference.path ?? "");
    if (!requestedTargetPath) {
        throw new Error("GitHub Xacro expansion requires --xacro unless the GitHub reference already points to a xacro file.");
    }
    let resolvedFiles = files;
    const byteCache = new Map();
    const readFileBytes = async (file) => {
        const cacheKey = buildGitHubReadKey(file, reference.owner, reference.repo);
        const cached = byteCache.get(cacheKey);
        if (cached)
            return cached;
        const bytes = await (0, githubRepositoryInspection_1.fetchGitHubFileBytes)(file.sourceOwner || reference.owner, file.sourceRepo || reference.repo, file.sourcePath || file.path, file.sha, options.accessToken);
        byteCache.set(cacheKey, bytes);
        return bytes;
    };
    for (let iteration = 0; iteration < MAX_GITHUB_DEPENDENCY_ITERATIONS; iteration += 1) {
        const resolvedTargetPath = (0, repositoryUrdfDiscovery_1.resolveRepositoryXacroTargetPath)(resolvedFiles, requestedTargetPath);
        const supportFiles = (0, repositoryMeshResolution_1.collectXacroSupportFilesFromRepository)(resolvedFiles, resolvedTargetPath).filter((file) => file.type === "file");
        const packageNames = new Set();
        for (const file of supportFiles) {
            const text = decodeSupportText(await readFileBytes(file));
            (0, repositoryUrdfDiscovery_1.collectPackageNamesFromText)(text).forEach((name) => packageNames.add(name));
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
    const payload = await (0, exports.buildXacroExpandPayloadFromRepository)(resolvedFiles, requestedTargetPath, readFileBytes, {
        args: options.args,
        useInorder: options.useInorder,
    });
    const result = await (0, exports.expandXacroRequestPayload)(payload, options);
    const resolvedTargetPath = (0, repositoryUrdfDiscovery_1.resolveRepositoryXacroTargetPath)(resolvedFiles, requestedTargetPath);
    const stabilized = (0, stabilizeExpandedXacroUrdf_1.stabilizeExpandedXacroUrdf)(result.urdf, resolvedTargetPath, resolvedFiles);
    return {
        source: "github",
        owner: reference.owner,
        repo: reference.repo,
        ref,
        path: (0, repositoryMeshResolution_1.normalizeRepositoryPath)(reference.path || "") || null,
        targetPath: resolvedTargetPath,
        repositoryUrl: `https://github.com/${reference.owner}/${reference.repo}`,
        ...result,
        urdf: stabilized.urdf,
    };
};
exports.expandFetchedGitHubRepositoryXacro = expandFetchedGitHubRepositoryXacro;
