"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fixLocalMeshPaths = exports.inspectLocalMeshReferences = exports.discoverLocalPackageContext = void 0;
const fs = require("node:fs");
const path = require("node:path");
const meshPaths_1 = require("../mesh/meshPaths");
const urdfParser_1 = require("../parsing/urdfParser");
const repositoryMeshResolution_1 = require("../repository/repositoryMeshResolution");
const xmlDom_1 = require("../xmlDom");
const WINDOWS_ABS_PATH = /^[A-Za-z]:[\\/]/;
const isExternalReference = (value) => value.startsWith("http://") || value.startsWith("https://") || value.startsWith("data:");
const isAbsoluteFilesystemPath = (value) => value.startsWith("/") || WINDOWS_ABS_PATH.test(value);
const fileExists = (candidatePath) => {
    if (!candidatePath)
        return false;
    try {
        return fs.statSync(candidatePath).isFile();
    }
    catch {
        return false;
    }
};
const resolveFilesystemCandidate = (baseDir, meshPath) => {
    const normalized = (0, meshPaths_1.normalizeMeshPathForMatch)(meshPath);
    if (!normalized)
        return null;
    const segments = normalized.split("/").filter(Boolean);
    return path.resolve(baseDir, ...segments);
};
const maybePackageXmlPath = (dirPath) => {
    const candidate = path.join(dirPath, "package.xml");
    return fileExists(candidate) ? candidate : null;
};
const discoverLocalPackageContext = (urdfPath, explicitPackageName) => {
    let currentDir = path.dirname(path.resolve(urdfPath));
    while (true) {
        const packageXmlPath = maybePackageXmlPath(currentDir);
        if (packageXmlPath) {
            const packageXml = fs.readFileSync(packageXmlPath, "utf8");
            return {
                packageName: explicitPackageName ?? (0, repositoryMeshResolution_1.extractPackageNameFromPackageXml)(packageXml),
                packageRoot: currentDir,
                packageXmlPath,
            };
        }
        const parentDir = path.dirname(currentDir);
        if (parentDir === currentDir) {
            break;
        }
        currentDir = parentDir;
    }
    return {
        packageName: explicitPackageName ?? null,
        packageRoot: null,
        packageXmlPath: null,
    };
};
exports.discoverLocalPackageContext = discoverLocalPackageContext;
const findLinkContext = (element) => {
    let current = element;
    let elementType = "unknown";
    while (current) {
        const tagName = current.tagName?.toLowerCase();
        if (tagName === "visual" || tagName === "collision") {
            elementType = tagName;
        }
        if (tagName === "link") {
            return {
                linkName: current.getAttribute("name") ?? undefined,
                element: elementType,
            };
        }
        current = current.parentElement;
    }
    return { element: elementType };
};
const isWithinDirectory = (rootDir, candidatePath) => {
    const relativePath = path.relative(rootDir, candidatePath);
    return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
};
const buildPackageReference = (packageName, meshPath) => {
    const normalized = (0, meshPaths_1.normalizeMeshPathForMatch)(meshPath);
    return normalized ? `package://${packageName}/${normalized}` : `package://${packageName}`;
};
const buildPackageReferenceFromResolvedPath = (candidatePath, packageContext) => {
    if (!packageContext.packageName || !packageContext.packageRoot) {
        return null;
    }
    if (!isWithinDirectory(packageContext.packageRoot, candidatePath)) {
        return null;
    }
    const relativePath = path.relative(packageContext.packageRoot, candidatePath).split(path.sep).join("/");
    return buildPackageReference(packageContext.packageName, relativePath);
};
const normalizeFileReference = (candidatePath) => `file://${candidatePath.replace(/\\/g, "/")}`;
const startsWithMeshFolder = (meshPath) => {
    const lower = meshPath.toLowerCase();
    return (lower.startsWith("meshes/") ||
        lower.startsWith("meshes\\") ||
        lower.startsWith("assets/") ||
        lower.startsWith("assets\\"));
};
const buildLocalResolutionCandidates = (urdfPath, meshRef, packageContext) => {
    const candidates = [];
    const addCandidate = (candidatePath) => {
        if (!candidatePath)
            return;
        if (!candidates.includes(candidatePath)) {
            candidates.push(candidatePath);
        }
    };
    const urdfDir = path.dirname(path.resolve(urdfPath));
    const parentDir = path.dirname(urdfDir);
    const refInfo = (0, meshPaths_1.parseMeshReference)(meshRef);
    const rawPath = refInfo.path || refInfo.raw;
    if (refInfo.scheme === "package") {
        const samePackage = packageContext.packageName &&
            refInfo.packageName &&
            refInfo.packageName.toLowerCase() === packageContext.packageName.toLowerCase();
        if (samePackage && packageContext.packageRoot) {
            addCandidate(resolveFilesystemCandidate(packageContext.packageRoot, rawPath));
        }
        return candidates;
    }
    if (refInfo.scheme === "file") {
        if (isAbsoluteFilesystemPath(rawPath)) {
            addCandidate(path.resolve(rawPath));
        }
        else {
            addCandidate(resolveFilesystemCandidate(urdfDir, rawPath));
        }
        return candidates;
    }
    if (isAbsoluteFilesystemPath(meshRef)) {
        addCandidate(path.resolve(meshRef));
        return candidates;
    }
    const normalizedPath = (0, meshPaths_1.normalizeMeshPathForMatch)(rawPath);
    addCandidate(resolveFilesystemCandidate(urdfDir, rawPath));
    if (normalizedPath) {
        if (startsWithMeshFolder(normalizedPath)) {
            addCandidate(resolveFilesystemCandidate(parentDir, normalizedPath));
            if (packageContext.packageRoot) {
                addCandidate(resolveFilesystemCandidate(packageContext.packageRoot, normalizedPath));
            }
        }
        if (!normalizedPath.includes("/")) {
            for (const folderName of ["meshes", "assets"]) {
                addCandidate(resolveFilesystemCandidate(urdfDir, `${folderName}/${normalizedPath}`));
                addCandidate(resolveFilesystemCandidate(parentDir, `${folderName}/${normalizedPath}`));
                if (packageContext.packageRoot) {
                    addCandidate(resolveFilesystemCandidate(packageContext.packageRoot, `${folderName}/${normalizedPath}`));
                }
            }
        }
    }
    return candidates;
};
const resolveLocalMeshPath = (urdfPath, meshRef, packageContext) => buildLocalResolutionCandidates(urdfPath, meshRef, packageContext).find((candidatePath) => fileExists(candidatePath)) ??
    null;
const getDetectedMeshFolder = (normalizedReference, resolvedPath, packageContext) => {
    const rawPath = normalizedReference ?? "";
    let candidate = rawPath;
    if (candidate.startsWith("package://")) {
        const match = candidate.match(/^package:\/\/[^/]+\/?(.*)$/);
        candidate = match?.[1] ?? "";
    }
    else if (candidate.startsWith("file://")) {
        candidate = candidate.slice("file://".length);
    }
    let normalized = (0, meshPaths_1.normalizeMeshPathForMatch)(candidate);
    if (!normalized && resolvedPath && packageContext.packageRoot && isWithinDirectory(packageContext.packageRoot, resolvedPath)) {
        normalized = path.relative(packageContext.packageRoot, resolvedPath).split(path.sep).join("/");
    }
    if (!normalized) {
        return null;
    }
    const parts = normalized.split("/").filter(Boolean);
    while (parts[0] === "..") {
        parts.shift();
    }
    const firstPart = parts[0]?.toLowerCase() ?? "";
    return firstPart === "meshes" || firstPart === "assets" ? firstPart : null;
};
const inspectLocalMeshReference = (filename, urdfPath, packageContext, context) => {
    const refInfo = (0, meshPaths_1.parseMeshReference)(filename);
    if (isExternalReference(filename)) {
        return {
            ...refInfo,
            ...context,
            status: "external",
            resolvedPath: null,
            normalizedReference: filename,
            needsNormalization: false,
        };
    }
    const rawPath = refInfo.path || refInfo.raw;
    const normalizedPath = (0, meshPaths_1.normalizeMeshPathForMatch)(rawPath);
    const resolvedPath = resolveLocalMeshPath(urdfPath, filename, packageContext);
    const packageReferenceFromResolvedPath = resolvedPath
        ? buildPackageReferenceFromResolvedPath(resolvedPath, packageContext)
        : null;
    let normalizedReference = filename;
    if (packageReferenceFromResolvedPath) {
        normalizedReference = packageReferenceFromResolvedPath;
    }
    else if (refInfo.scheme === "package" && refInfo.packageName) {
        const normalizedPackageName = packageContext.packageName &&
            refInfo.packageName.toLowerCase() === packageContext.packageName.toLowerCase()
            ? packageContext.packageName
            : refInfo.packageName;
        normalizedReference = buildPackageReference(normalizedPackageName, normalizedPath ?? "");
    }
    else if (refInfo.scheme === "file") {
        normalizedReference = resolvedPath ? normalizeFileReference(resolvedPath) : normalizeFileReference(rawPath);
    }
    else if (isAbsoluteFilesystemPath(filename)) {
        normalizedReference = resolvedPath ? normalizeFileReference(resolvedPath) : normalizeFileReference(filename);
    }
    else if (normalizedPath) {
        normalizedReference = normalizedPath;
    }
    return {
        ...refInfo,
        ...context,
        status: resolvedPath ? "resolvable" : "unresolved",
        resolvedPath,
        normalizedReference,
        needsNormalization: normalizedReference !== filename,
    };
};
const inspectLocalMeshReferences = (urdfPath, urdfContent, options = {}) => {
    const doc = (0, xmlDom_1.parseXml)(urdfContent);
    const packageContext = (0, exports.discoverLocalPackageContext)(urdfPath, options.packageName);
    const detectedMeshFolders = new Set();
    const refs = Array.from(doc.querySelectorAll("mesh"))
        .map((meshElement) => {
        const filename = meshElement.getAttribute("filename")?.trim();
        if (!filename) {
            return null;
        }
        const context = findLinkContext(meshElement);
        const inspection = inspectLocalMeshReference(filename, urdfPath, packageContext, context);
        const detectedMeshFolder = getDetectedMeshFolder(inspection.normalizedReference, inspection.resolvedPath, packageContext);
        if (detectedMeshFolder) {
            detectedMeshFolders.add(detectedMeshFolder);
        }
        return inspection;
    })
        .filter((inspection) => Boolean(inspection));
    return {
        count: refs.length,
        packageName: packageContext.packageName,
        packageRoot: packageContext.packageRoot,
        packageXmlPath: packageContext.packageXmlPath,
        detectedMeshFolders: Array.from(detectedMeshFolders),
        summary: {
            resolvable: refs.filter((ref) => ref.status === "resolvable").length,
            unresolved: refs.filter((ref) => ref.status === "unresolved").length,
            external: refs.filter((ref) => ref.status === "external").length,
            normalizable: refs.filter((ref) => ref.needsNormalization).length,
        },
        refs,
    };
};
exports.inspectLocalMeshReferences = inspectLocalMeshReferences;
const fixLocalMeshPaths = (urdfPath, urdfContent, options = {}) => {
    const parsed = (0, urdfParser_1.parseURDF)(urdfContent);
    const packageContext = (0, exports.discoverLocalPackageContext)(urdfPath, options.packageName);
    const result = {
        urdfContent,
        corrections: [],
        unresolved: [],
        packageName: packageContext.packageName ?? "",
    };
    if (!parsed.isValid) {
        return result;
    }
    const meshElements = Array.from(parsed.document.querySelectorAll("mesh"));
    meshElements.forEach((meshElement) => {
        const filename = meshElement.getAttribute("filename")?.trim();
        if (!filename) {
            return;
        }
        const context = findLinkContext(meshElement);
        const inspection = inspectLocalMeshReference(filename, urdfPath, packageContext, context);
        if (inspection.status === "unresolved") {
            result.unresolved.push(filename);
        }
        if (!inspection.needsNormalization || !inspection.normalizedReference) {
            return;
        }
        let reason = "Normalized mesh path";
        if (inspection.normalizedReference.startsWith("package://") && !filename.startsWith("package://")) {
            reason = "Converted resolvable mesh path to package:// format";
        }
        else if (filename.startsWith("package://")) {
            reason = "Normalized package:// URI path";
        }
        else if (filename.startsWith("file://") || isAbsoluteFilesystemPath(filename)) {
            reason = "Normalized file-based mesh path";
        }
        else if (filename.includes("\\")) {
            reason = "Fixed Windows-style backslashes";
        }
        else if (filename.includes("/../") || filename.includes("/./")) {
            reason = "Normalized path segments (removed .. and .)";
        }
        meshElement.setAttribute("filename", inspection.normalizedReference);
        result.corrections.push({
            element: context.element,
            linkName: context.linkName ?? "unknown",
            original: filename,
            corrected: inspection.normalizedReference,
            reason,
        });
    });
    if (result.corrections.length > 0) {
        result.urdfContent = (0, urdfParser_1.serializeURDF)(parsed.document);
    }
    return result;
};
exports.fixLocalMeshPaths = fixLocalMeshPaths;
