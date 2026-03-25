"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fixMissingMeshReferencesInRepository = void 0;
const urdfParser_1 = require("../parsing/urdfParser");
const meshFormats_1 = require("../mesh/meshFormats");
const meshPaths_1 = require("../mesh/meshPaths");
const repositoryMeshResolution_1 = require("./repositoryMeshResolution");
const isExternalReference = (value) => value.startsWith("http://") || value.startsWith("https://") || value.startsWith("data:");
const getMeshDirOverride = (doc) => {
    const compiler = doc.querySelector("robot > compiler");
    const meshDir = compiler?.getAttribute("meshdir")?.trim();
    if (!meshDir)
        return "";
    return (0, meshPaths_1.normalizeMeshPathForMatch)(meshDir);
};
const findLinkContext = (element) => {
    let current = element;
    let elementType = "unknown";
    while (current) {
        const tag = current.tagName?.toLowerCase();
        if (tag === "visual" || tag === "collision") {
            elementType = tag;
        }
        if (tag === "link") {
            return {
                linkName: current.getAttribute("name") ?? undefined,
                element: elementType,
            };
        }
        current = current.parentElement;
    }
    return { element: elementType };
};
const makeRelativePath = (fromDir, toPath) => {
    const from = (0, repositoryMeshResolution_1.normalizeRepositoryPath)(fromDir);
    const to = (0, repositoryMeshResolution_1.normalizeRepositoryPath)(toPath);
    if (!from)
        return to;
    const fromParts = from.split("/").filter(Boolean);
    const toParts = to.split("/").filter(Boolean);
    let common = 0;
    while (common < fromParts.length && common < toParts.length) {
        if (fromParts[common] !== toParts[common])
            break;
        common += 1;
    }
    const ups = fromParts.length - common;
    const down = toParts.slice(common).join("/");
    const prefix = ups > 0 ? Array.from({ length: ups }, () => "..").join("/") : "";
    if (!prefix)
        return down;
    if (!down)
        return prefix;
    return `${prefix}/${down}`;
};
const findPackageReferenceForPath = (resolvedPath, packageRoots, preferredPackage) => {
    const normalized = (0, repositoryMeshResolution_1.normalizeRepositoryPath)(resolvedPath);
    if (!normalized)
        return null;
    let best = null;
    const consider = (pkg, root) => {
        const normalizedRoot = (0, repositoryMeshResolution_1.normalizeRepositoryPath)(root);
        const matchesRoot = normalizedRoot === ""
            ? normalized.length > 0
            : normalized === normalizedRoot || normalized.startsWith(`${normalizedRoot}/`);
        if (matchesRoot) {
            if (!best || normalizedRoot.length > best.root.length) {
                best = { pkg, root: normalizedRoot };
            }
        }
    };
    if (preferredPackage && packageRoots[preferredPackage]) {
        packageRoots[preferredPackage].forEach((root) => consider(preferredPackage, root));
        if (best) {
            const rel = normalized.slice(best.root.length).replace(/^\/+/, "");
            return rel ? `package://${best.pkg}/${rel}` : `package://${best.pkg}`;
        }
    }
    Object.entries(packageRoots).forEach(([pkg, roots]) => {
        roots.forEach((root) => consider(pkg, root));
    });
    if (!best)
        return null;
    const relative = normalized.slice(best.root.length).replace(/^\/+/, "");
    return relative ? `package://${best.pkg}/${relative}` : `package://${best.pkg}`;
};
const buildExtensionCandidates = (value) => {
    const normalized = (0, meshPaths_1.normalizeMeshPathForMatch)(value);
    if (!normalized)
        return [];
    const parts = normalized.split("/").filter(Boolean);
    if (parts.length === 0)
        return [];
    const filename = parts.pop() ?? normalized;
    const match = filename.match(/^(.*?)(\.[^.]+)?$/);
    const base = match?.[1] ?? filename;
    const dir = parts.join("/");
    return meshFormats_1.SUPPORTED_MESH_EXTENSIONS.map((ext) => (dir ? `${dir}/${base}${ext}` : `${base}${ext}`));
};
const findUniqueFileByBasename = (files, value) => {
    const basename = (0, meshPaths_1.normalizeMeshPathForMatch)(value).split("/").filter(Boolean).pop()?.toLowerCase();
    if (!basename)
        return null;
    const matches = files.filter((file) => {
        if (file.type !== "file")
            return false;
        const fileBasename = (0, repositoryMeshResolution_1.normalizeRepositoryPath)(file.path).split("/").filter(Boolean).pop()?.toLowerCase();
        return fileBasename === basename;
    });
    return matches.length === 1 ? matches[0] : null;
};
const buildPreferredMeshReference = (resolvedPath, urdfDir, packageRoots, preferredPackage) => {
    const packageRef = findPackageReferenceForPath(resolvedPath, packageRoots, preferredPackage);
    if (packageRef) {
        return packageRef;
    }
    return urdfDir ? makeRelativePath(urdfDir, resolvedPath) : resolvedPath;
};
const fixMissingMeshReferencesInRepository = (urdfContent, urdfPath, files, options = {}) => {
    if (!urdfContent.trim()) {
        return {
            success: false,
            content: urdfContent,
            corrections: [],
            unresolved: [],
            error: "Empty URDF",
        };
    }
    const parsed = (0, urdfParser_1.parseURDF)(urdfContent);
    if (!parsed.isValid) {
        return {
            success: false,
            content: urdfContent,
            corrections: [],
            unresolved: [],
            error: parsed.error ?? "Invalid URDF",
        };
    }
    const packageRoots = options.packageRoots ??
        (0, repositoryMeshResolution_1.buildPackageRootsFromRepositoryFiles)(files, {
            packageNameByPath: options.packageNameByPath,
        });
    const doc = parsed.document;
    const meshDirOverride = getMeshDirOverride(doc);
    const urdfDir = (0, repositoryMeshResolution_1.repositoryDirname)(urdfPath);
    const corrections = [];
    const unresolved = [];
    const meshElements = Array.from(doc.querySelectorAll("mesh"));
    meshElements.forEach((mesh) => {
        const filename = mesh.getAttribute("filename")?.trim();
        if (!filename)
            return;
        if (isExternalReference(filename))
            return;
        const existing = (0, repositoryMeshResolution_1.resolveRepositoryFileReference)(urdfPath, filename, files, {
            packageRoots,
            meshDirOverride,
        });
        const refInfo = (0, meshPaths_1.parseMeshReference)(filename);
        const preferredPackage = refInfo.scheme === "package" ? refInfo.packageName : undefined;
        if (existing) {
            if (!options.normalizeResolvableReferences) {
                return;
            }
            const resolvedExistingPath = (0, repositoryMeshResolution_1.normalizeRepositoryPath)(existing.path);
            if (!resolvedExistingPath) {
                return;
            }
            const corrected = buildPreferredMeshReference(resolvedExistingPath, urdfDir, packageRoots, preferredPackage);
            if (!corrected || corrected === filename) {
                return;
            }
            mesh.setAttribute("filename", corrected);
            const context = findLinkContext(mesh);
            corrections.push({
                original: filename,
                corrected,
                linkName: context.linkName,
                element: context.element,
                reason: corrected.startsWith("package://")
                    ? "Normalized to package:// reference"
                    : "Normalized resolvable mesh reference",
            });
            return;
        }
        const rawPath = refInfo.path || refInfo.raw;
        const normalizedPath = (0, meshPaths_1.normalizeMeshPathForMatch)(rawPath);
        const candidates = [];
        const addCandidate = (candidate) => {
            if (!candidate)
                return;
            if (!candidates.includes(candidate))
                candidates.push(candidate);
        };
        if (refInfo.scheme === "package" && refInfo.packageName) {
            addCandidate(`package://${refInfo.packageName}/${normalizedPath || rawPath}`);
        }
        if (meshDirOverride && normalizedPath && !normalizedPath.includes("/")) {
            addCandidate(`${meshDirOverride}/${normalizedPath}`);
            if (urdfDir) {
                addCandidate(`../${meshDirOverride}/${normalizedPath}`);
            }
        }
        addCandidate(normalizedPath || rawPath);
        if (normalizedPath) {
            if (urdfDir && (normalizedPath.startsWith("meshes/") || normalizedPath.startsWith("assets/"))) {
                addCandidate(`../${normalizedPath}`);
            }
            if (!normalizedPath.includes("/")) {
                addCandidate(`meshes/${normalizedPath}`);
                addCandidate(`assets/${normalizedPath}`);
                if (urdfDir) {
                    addCandidate(`../meshes/${normalizedPath}`);
                    addCandidate(`../assets/${normalizedPath}`);
                }
            }
            buildExtensionCandidates(normalizedPath).forEach(addCandidate);
        }
        let resolvedFile = candidates
            .map((candidate) => (0, repositoryMeshResolution_1.resolveRepositoryFileReference)(urdfPath, candidate, files, {
            packageRoots,
            meshDirOverride,
        }))
            .find((file) => Boolean(file));
        if (!resolvedFile) {
            resolvedFile = findUniqueFileByBasename(files, normalizedPath || rawPath);
        }
        if (!resolvedFile) {
            unresolved.push(filename);
            return;
        }
        const resolvedPath = (0, repositoryMeshResolution_1.normalizeRepositoryPath)(resolvedFile.path);
        if (!resolvedPath) {
            unresolved.push(filename);
            return;
        }
        const corrected = buildPreferredMeshReference(resolvedPath, urdfDir, packageRoots, preferredPackage);
        const reason = corrected?.startsWith("package://") ? "Resolved to package root" : "Resolved to relative path";
        if (!corrected || corrected === filename) {
            return;
        }
        mesh.setAttribute("filename", corrected);
        const context = findLinkContext(mesh);
        corrections.push({
            original: filename,
            corrected,
            linkName: context.linkName,
            element: context.element,
            reason,
        });
    });
    if (corrections.length === 0) {
        return {
            success: true,
            content: urdfContent,
            corrections: [],
            unresolved,
        };
    }
    return {
        success: true,
        content: (0, urdfParser_1.serializeURDF)(doc),
        corrections,
        unresolved,
    };
};
exports.fixMissingMeshReferencesInRepository = fixMissingMeshReferencesInRepository;
