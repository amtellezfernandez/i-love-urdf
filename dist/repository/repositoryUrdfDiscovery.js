"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSupportedMeshExtensions = exports.collectTargetPathHints = exports.scoreXacroWrapperCandidate = exports.collectPackageResourceFilesForMatchedFiles = exports.collectPackageResourceFilesForReferencedPackages = exports.findPackageXmlForPackageName = exports.repositoryContainsPackage = exports.buildDependencyRepositoryNameCandidates = exports.collectMeshReferencedPackageNamesFromUrdf = exports.collectPackageNamesFromText = exports.hasRenderableUrdfGeometry = exports.detectUnsupportedMeshFormats = exports.extractMeshReferencesFromUrdf = exports.extractXacroArgumentDefinitions = exports.findRepositoryUrdfCandidates = exports.resolveRepositoryXacroTargetPath = void 0;
const analyzeUrdf_1 = require("../analysis/analyzeUrdf");
const meshFormats_1 = require("../mesh/meshFormats");
const meshPaths_1 = require("../mesh/meshPaths");
const repositoryMeshResolution_1 = require("./repositoryMeshResolution");
const xacroContract_1 = require("../xacro/xacroContract");
const XML_COMMENT_REGEX = /<!--[\s\S]*?-->/g;
const XACRO_ARG_TAG_REGEX = /<(?:[A-Za-z_][\w.-]*:)?arg\b([^<>]*)\/?>/gi;
const XML_ATTRIBUTE_REGEX = /([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const hasPathSegment = (repositoryPath, expectedSegment) => repositoryPath
    .split("/")
    .filter(Boolean)
    .some((segment) => segment.toLowerCase() === expectedSegment.toLowerCase());
const isIgnorableRepositoryMetadataFile = (file) => {
    const loweredName = file.name.toLowerCase();
    if (loweredName.startsWith("._"))
        return true;
    if (loweredName === ".ds_store")
        return true;
    if (hasPathSegment(file.path, "__macosx"))
        return true;
    return false;
};
const isSupportXacroFile = (fileName) => {
    const lowered = fileName.toLowerCase();
    if (!(0, xacroContract_1.isXacroPath)(lowered) || (0, xacroContract_1.isUrdfXacroPath)(lowered))
        return false;
    const stem = lowered.replace(/\.xacro$/i, "");
    return (stem === "material" ||
        stem === "materials" ||
        stem === "gazebo" ||
        stem === "trans" ||
        stem === "transmission" ||
        stem === "transmissions" ||
        stem === "macro" ||
        stem === "macros" ||
        stem === "include" ||
        stem === "includes" ||
        stem === "common");
};
const findMeshFolder = (files, dirPath) => files.find((file) => file.type === "dir" &&
    (file.path.toLowerCase() === `${dirPath}/meshes`.toLowerCase() ||
        file.path.toLowerCase() === `${dirPath}/assets`.toLowerCase()) &&
    (file.name.toLowerCase() === "meshes" || file.name.toLowerCase() === "assets"));
const findMeshesFolderForUrdf = (files, urdfDir) => {
    const sameDir = findMeshFolder(files, urdfDir);
    if (sameDir)
        return sameDir.path;
    if (urdfDir) {
        const pathParts = urdfDir.split("/").filter(Boolean);
        if (pathParts.length > 0) {
            const parentDir = pathParts.slice(0, -1).join("/");
            const sibling = findMeshFolder(files, parentDir);
            if (sibling)
                return sibling.path;
        }
    }
    const pathParts = urdfDir.split("/").filter(Boolean);
    for (let i = pathParts.length - 1; i >= Math.max(0, pathParts.length - 4); i -= 1) {
        const checkPath = pathParts.slice(0, i + 1).join("/");
        const parent = findMeshFolder(files, checkPath);
        if (parent)
            return parent.path;
    }
    return undefined;
};
const scoreRepositoryUrdfCandidate = (candidate) => {
    const pathLower = candidate.path.toLowerCase();
    const nameLower = candidate.name.toLowerCase();
    let score = 0;
    if (candidate.hasMeshesFolder)
        score += 50;
    if (pathLower.includes("/urdf/"))
        score += 20;
    if (pathLower.includes("/robots/"))
        score += 10;
    if (pathLower.includes("/description/"))
        score += 10;
    if (nameLower.includes("robot"))
        score += 10;
    if (nameLower.includes("description"))
        score += 8;
    if (nameLower.includes("model"))
        score += 6;
    if (nameLower.startsWith("_"))
        score -= 40;
    if (nameLower.includes("macro"))
        score -= 30;
    if (nameLower.includes("gazebo"))
        score -= 25;
    if (nameLower.includes("material"))
        score -= 20;
    if (nameLower.includes("transmission"))
        score -= 20;
    if (nameLower.includes("sensor"))
        score -= 15;
    if (nameLower.includes("test"))
        score -= 15;
    if (nameLower.includes("common"))
        score -= 10;
    if (nameLower.includes("include"))
        score -= 10;
    if (candidate.isXacro)
        score -= 2;
    return score;
};
const findRepositoryFileByPath = (files, targetPath) => {
    const normalizedTarget = (0, meshPaths_1.normalizeMeshPathForMatch)(targetPath);
    if (!normalizedTarget)
        return null;
    return (files.find((file) => file.type === "file" && (0, meshPaths_1.normalizeMeshPathForMatch)(file.path) === normalizedTarget) ?? null);
};
const buildRepositoryXacroTargetPathCandidates = (targetPath) => {
    const normalizedTarget = (0, repositoryMeshResolution_1.normalizeRepositoryPath)(targetPath);
    if (!normalizedTarget)
        return [];
    const candidates = new Set([normalizedTarget]);
    const fileName = normalizedTarget.split("/").pop() || normalizedTarget;
    if (!(0, xacroContract_1.isXacroPath)(fileName)) {
        return Array.from(candidates);
    }
    const directory = (0, repositoryMeshResolution_1.repositoryDirname)(normalizedTarget);
    const prefix = directory ? `${directory}/` : "";
    const stem = fileName.replace(/(\.urdf)?\.xacro$/i, "");
    if ((0, xacroContract_1.isUrdfXacroPath)(fileName)) {
        candidates.add(`${prefix}${stem}.xacro`);
    }
    else {
        candidates.add(`${prefix}${stem}.urdf.xacro`);
    }
    return Array.from(candidates);
};
const resolveRepositoryXacroTargetPath = (files, targetPath) => {
    const exactMatch = findRepositoryFileByPath(files, targetPath);
    if (exactMatch)
        return exactMatch.path;
    for (const candidatePath of buildRepositoryXacroTargetPathCandidates(targetPath)) {
        const candidate = findRepositoryFileByPath(files, candidatePath);
        if (candidate) {
            return candidate.path;
        }
    }
    return targetPath;
};
exports.resolveRepositoryXacroTargetPath = resolveRepositoryXacroTargetPath;
const findRepositoryUrdfCandidates = (files) => {
    const candidateFiles = files.filter((file) => {
        if (file.type !== "file")
            return false;
        if (isIgnorableRepositoryMetadataFile(file))
            return false;
        const lowered = file.name.toLowerCase();
        if (isSupportXacroFile(lowered))
            return false;
        return lowered.endsWith(".urdf") || (0, xacroContract_1.isXacroPath)(lowered);
    });
    const candidates = candidateFiles.map((urdfFile) => {
        const urdfDir = (0, repositoryMeshResolution_1.repositoryDirname)(urdfFile.path);
        const meshesFolderPath = findMeshesFolderForUrdf(files, urdfDir);
        return {
            path: urdfFile.path,
            name: urdfFile.name,
            hasMeshesFolder: Boolean(meshesFolderPath),
            meshesFolderPath,
            isXacro: (0, xacroContract_1.isXacroPath)(urdfFile.name),
        };
    });
    return candidates.sort((left, right) => {
        const scoreDiff = scoreRepositoryUrdfCandidate(right) - scoreRepositoryUrdfCandidate(left);
        if (scoreDiff !== 0)
            return scoreDiff;
        return left.path.localeCompare(right.path);
    });
};
exports.findRepositoryUrdfCandidates = findRepositoryUrdfCandidates;
const parseXmlAttributes = (rawAttributes) => {
    const attributes = new Map();
    let match;
    XML_ATTRIBUTE_REGEX.lastIndex = 0;
    while ((match = XML_ATTRIBUTE_REGEX.exec(rawAttributes))) {
        attributes.set(match[1], match[2] ?? match[3] ?? "");
    }
    return attributes;
};
const extractXacroArgumentDefinitions = (xacroContent) => {
    if (!xacroContent.trim())
        return [];
    const stripped = xacroContent.replace(XML_COMMENT_REGEX, "");
    const definitions = [];
    const seenNames = new Set();
    let match;
    XACRO_ARG_TAG_REGEX.lastIndex = 0;
    while ((match = XACRO_ARG_TAG_REGEX.exec(stripped))) {
        const attributes = parseXmlAttributes(match[1] ?? "");
        const name = (attributes.get("name") ?? "").trim();
        if (!name || seenNames.has(name))
            continue;
        const hasDefault = attributes.has("default") || attributes.has("value");
        const defaultValue = attributes.has("default")
            ? (attributes.get("default") ?? "")
            : attributes.has("value")
                ? (attributes.get("value") ?? "")
                : null;
        seenNames.add(name);
        definitions.push({
            name,
            hasDefault,
            defaultValue,
            isRequired: !hasDefault,
        });
    }
    return definitions;
};
exports.extractXacroArgumentDefinitions = extractXacroArgumentDefinitions;
const extractMeshReferencesFromUrdf = (urdfContent) => {
    const analysis = (0, analyzeUrdf_1.analyzeUrdf)(urdfContent);
    if (!analysis.isValid)
        return [];
    return analysis.meshReferences;
};
exports.extractMeshReferencesFromUrdf = extractMeshReferencesFromUrdf;
const detectUnsupportedMeshFormats = (urdfContent) => {
    const meshReferences = (0, exports.extractMeshReferencesFromUrdf)(urdfContent);
    const unsupportedFormats = new Set();
    for (const meshRef of meshReferences) {
        const refInfo = (0, meshPaths_1.parseMeshReference)(meshRef);
        const normalized = (0, meshPaths_1.normalizeMeshPathForMatch)(refInfo.path || refInfo.raw);
        const extWithDot = (0, meshFormats_1.extractExtension)(normalized);
        if (extWithDot && !(0, meshFormats_1.isSupportedMeshExtension)(extWithDot)) {
            unsupportedFormats.add(extWithDot);
        }
    }
    return {
        hasUnsupported: unsupportedFormats.size > 0,
        formats: Array.from(unsupportedFormats).sort(),
    };
};
exports.detectUnsupportedMeshFormats = detectUnsupportedMeshFormats;
const hasRenderableUrdfGeometry = (urdfText) => {
    const analysis = (0, analyzeUrdf_1.analyzeUrdf)(urdfText);
    if (!analysis.isValid)
        return false;
    if ((analysis.meshReferences?.length ?? 0) > 0)
        return true;
    return Object.values(analysis.linkDataByName ?? {}).some((linkData) => {
        const hasVisualPrimitive = (linkData.visuals ?? []).some((visual) => visual.geometry.type !== null && visual.geometry.type !== "mesh");
        if (hasVisualPrimitive)
            return true;
        return (linkData.collisions ?? []).some((collision) => collision.geometry.type !== null && collision.geometry.type !== "mesh");
    });
};
exports.hasRenderableUrdfGeometry = hasRenderableUrdfGeometry;
const PACKAGE_FIND_REGEX = /\$\(\s*find\s+([^) \t\r\n]+)\s*\)/g;
const PACKAGE_URI_REGEX = /package:\/\/([^/)\s"'<>]+)/g;
const collectPackageNamesFromText = (text) => {
    if (!text)
        return [];
    const names = new Set();
    let match;
    PACKAGE_FIND_REGEX.lastIndex = 0;
    while ((match = PACKAGE_FIND_REGEX.exec(text)) !== null) {
        const packageName = match[1]?.trim();
        if (packageName)
            names.add(packageName);
    }
    PACKAGE_URI_REGEX.lastIndex = 0;
    while ((match = PACKAGE_URI_REGEX.exec(text)) !== null) {
        const packageName = match[1]?.trim();
        if (packageName)
            names.add(packageName);
    }
    return Array.from(names);
};
exports.collectPackageNamesFromText = collectPackageNamesFromText;
const collectMeshReferencedPackageNamesFromUrdf = (urdfText) => {
    const names = new Set();
    const refs = (0, exports.extractMeshReferencesFromUrdf)(urdfText);
    refs.forEach((ref) => {
        const info = (0, meshPaths_1.parseMeshReference)(ref);
        if (info.scheme === "package" && info.packageName) {
            names.add(info.packageName);
        }
        PACKAGE_FIND_REGEX.lastIndex = 0;
        let match;
        while ((match = PACKAGE_FIND_REGEX.exec(ref)) !== null) {
            const packageName = match[1]?.trim();
            if (packageName)
                names.add(packageName);
        }
    });
    return Array.from(names);
};
exports.collectMeshReferencedPackageNamesFromUrdf = collectMeshReferencedPackageNamesFromUrdf;
const normalizePackageLikeName = (name) => name.toLowerCase().replace(/[-_]/g, "");
const buildDependencyRepositoryNameCandidates = (packageName) => {
    const trimmed = packageName.trim();
    if (!trimmed)
        return [];
    const candidates = new Set();
    const addCandidate = (value) => {
        const normalized = value.trim();
        if (normalized)
            candidates.add(normalized);
    };
    addCandidate(trimmed);
    addCandidate(trimmed.replace(/_/g, "-"));
    if (trimmed.endsWith("_description")) {
        const base = trimmed.replace(/_description$/, "");
        addCandidate(base);
        addCandidate(`${base}_ros`);
        addCandidate(`${base}-ros`);
        addCandidate(`${base}_robot`);
        addCandidate(`${base}-robot`);
    }
    if (trimmed.endsWith("_ros")) {
        const base = trimmed.replace(/_ros$/, "");
        addCandidate(base);
        addCandidate(`${base}_description`);
    }
    return Array.from(candidates);
};
exports.buildDependencyRepositoryNameCandidates = buildDependencyRepositoryNameCandidates;
const repositoryContainsPackage = (files, packageName, repositoryName) => {
    const packageLower = packageName.toLowerCase();
    const packageXmlInFolder = files.some((file) => {
        if (file.type !== "file")
            return false;
        const lowerPath = file.path.toLowerCase();
        return (lowerPath === `${packageLower}/package.xml` ||
            lowerPath.endsWith(`/${packageLower}/package.xml`));
    });
    if (packageXmlInFolder)
        return true;
    const hasRootPackageXml = files.some((file) => file.type === "file" && file.path.toLowerCase() === "package.xml");
    if (!hasRootPackageXml)
        return false;
    const normalizedRepo = normalizePackageLikeName(repositoryName);
    const normalizedPackage = normalizePackageLikeName(packageName);
    if (normalizedRepo === normalizedPackage)
        return true;
    const withoutDescription = packageName.replace(/_description$/, "");
    if (withoutDescription !== packageName) {
        return normalizedRepo === normalizePackageLikeName(withoutDescription);
    }
    return false;
};
exports.repositoryContainsPackage = repositoryContainsPackage;
const findPackageXmlForPackageName = (files, packageName) => {
    const needle = `/${packageName.toLowerCase()}/package.xml`;
    for (const file of files) {
        if (file.type !== "file")
            continue;
        if (file.path.toLowerCase().endsWith(needle)) {
            return file;
        }
    }
    return null;
};
exports.findPackageXmlForPackageName = findPackageXmlForPackageName;
const collectPackageResourceFilesForReferencedPackages = (files, packageNames, packageRoots = (0, repositoryMeshResolution_1.buildPackageRootsFromRepositoryFiles)(files)) => {
    return packageNames.flatMap((packageName) => {
        const roots = packageRoots[packageName] ?? [];
        if (roots.length === 0)
            return [];
        const normalizedRoots = roots
            .map((root) => (0, meshPaths_1.normalizeMeshPathForMatch)(root))
            .filter((root) => Boolean(root));
        return files.filter((file) => {
            if (file.type !== "file" || !(0, meshFormats_1.isSupportedMeshResource)(file.path))
                return false;
            const normalizedPath = (0, meshPaths_1.normalizeMeshPathForMatch)(file.path);
            if (!normalizedPath)
                return false;
            return normalizedRoots.some((root) => normalizedPath === root || normalizedPath.startsWith(`${root}/`));
        });
    });
};
exports.collectPackageResourceFilesForReferencedPackages = collectPackageResourceFilesForReferencedPackages;
const collectPackageResourceFilesForMatchedFiles = (files, matchedFiles, packageRoots = (0, repositoryMeshResolution_1.buildPackageRootsFromRepositoryFiles)(files)) => {
    const matchedPackageRoots = new Set();
    matchedFiles.forEach((file) => {
        if (file.type !== "file")
            return;
        const normalizedPath = (0, meshPaths_1.normalizeMeshPathForMatch)(file.path);
        if (!normalizedPath)
            return;
        Object.values(packageRoots).forEach((roots) => {
            roots.forEach((root) => {
                const normalizedRoot = (0, meshPaths_1.normalizeMeshPathForMatch)(root);
                if (!normalizedRoot)
                    return;
                if (normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`)) {
                    matchedPackageRoots.add(normalizedRoot);
                }
            });
        });
    });
    if (matchedPackageRoots.size === 0)
        return [];
    return files.filter((file) => {
        if (file.type !== "file" || !(0, meshFormats_1.isSupportedMeshResource)(file.path))
            return false;
        const normalizedPath = (0, meshPaths_1.normalizeMeshPathForMatch)(file.path);
        if (!normalizedPath)
            return false;
        for (const root of matchedPackageRoots) {
            if (normalizedPath === root || normalizedPath.startsWith(`${root}/`)) {
                return true;
            }
        }
        return false;
    });
};
exports.collectPackageResourceFilesForMatchedFiles = collectPackageResourceFilesForMatchedFiles;
const scoreXacroWrapperCandidate = (path) => {
    const lower = path.toLowerCase();
    let score = 0;
    if ((0, xacroContract_1.isUrdfXacroPath)(lower))
        score += 40;
    if (lower.includes("/robots/"))
        score += 20;
    if (lower.includes("/robot/"))
        score += 10;
    if (lower.includes("/common/"))
        score -= 40;
    if (lower.includes("macro"))
        score -= 25;
    if (lower.startsWith("_") || lower.includes("/_"))
        score -= 20;
    return score;
};
exports.scoreXacroWrapperCandidate = scoreXacroWrapperCandidate;
const collectTargetPathHints = (targetPath) => {
    const normalized = (0, meshPaths_1.normalizeMeshPathForMatch)(targetPath);
    if (!normalized)
        return [];
    const parts = normalized.split("/").filter(Boolean);
    const hints = new Set();
    const fileName = parts[parts.length - 1];
    if (fileName)
        hints.add(fileName.toLowerCase());
    for (let depth = 2; depth <= 4; depth += 1) {
        if (parts.length < depth)
            break;
        hints.add(parts.slice(parts.length - depth).join("/").toLowerCase());
    }
    return Array.from(hints);
};
exports.collectTargetPathHints = collectTargetPathHints;
const getSupportedMeshExtensions = () => meshFormats_1.SUPPORTED_MESH_EXTENSIONS;
exports.getSupportedMeshExtensions = getSupportedMeshExtensions;
