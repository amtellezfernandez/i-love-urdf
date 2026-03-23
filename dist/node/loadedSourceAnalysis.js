"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildLoadedSourceOrientationCard = exports.guessLoadedSourceOrientation = exports.checkLoadedSourcePhysicsHealth = void 0;
const fs = require("node:fs/promises");
const path = require("node:path");
const analyzeUrdf_1 = require("../analysis/analyzeUrdf");
const guessOrientation_1 = require("../analysis/guessOrientation");
const robotOrientationCard_1 = require("../analysis/robotOrientationCard");
const healthCheckUrdf_1 = require("../analysis/healthCheckUrdf");
const meshBoundsNode_1 = require("../mesh/meshBoundsNode");
const meshPaths_1 = require("../mesh/meshPaths");
const localRepositoryInspection_1 = require("../repository/localRepositoryInspection");
const repositoryMeshResolution_1 = require("../repository/repositoryMeshResolution");
const xmlDom_1 = require("../xmlDom");
const nodeDomRuntime_1 = require("./nodeDomRuntime");
const IDENTITY_ROTATION = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
];
const IDENTITY_TRANSFORM = {
    rotation: IDENTITY_ROTATION,
    translation: [0, 0, 0],
};
const ensureNodeDomGlobals = () => {
    (0, nodeDomRuntime_1.installNodeDomGlobals)();
};
const parseTriplet = (raw, fallback = [0, 0, 0]) => {
    if (!raw)
        return fallback;
    const values = raw
        .trim()
        .split(/\s+/)
        .slice(0, 3)
        .map((value) => Number(value));
    return [
        Number.isFinite(values[0]) ? values[0] : fallback[0],
        Number.isFinite(values[1]) ? values[1] : fallback[1],
        Number.isFinite(values[2]) ? values[2] : fallback[2],
    ];
};
const addVec3 = (left, right) => [
    left[0] + right[0],
    left[1] + right[1],
    left[2] + right[2],
];
const multiplyMat3 = (left, right) => {
    const result = [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
    ];
    for (let i = 0; i < 3; i += 1) {
        for (let j = 0; j < 3; j += 1) {
            result[i][j] =
                left[i][0] * right[0][j] +
                    left[i][1] * right[1][j] +
                    left[i][2] * right[2][j];
        }
    }
    return result;
};
const multiplyMat3Vec3 = (matrix, vector) => [
    matrix[0][0] * vector[0] + matrix[0][1] * vector[1] + matrix[0][2] * vector[2],
    matrix[1][0] * vector[0] + matrix[1][1] * vector[1] + matrix[1][2] * vector[2],
    matrix[2][0] * vector[0] + matrix[2][1] * vector[1] + matrix[2][2] * vector[2],
];
const rpyToMatrix = (rpy) => {
    const [r, p, y] = rpy;
    const cr = Math.cos(r);
    const sr = Math.sin(r);
    const cp = Math.cos(p);
    const sp = Math.sin(p);
    const cy = Math.cos(y);
    const sy = Math.sin(y);
    return [
        [cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr],
        [sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr],
        [-sp, cp * sr, cp * cr],
    ];
};
const composeTransforms = (parent, child) => ({
    rotation: multiplyMat3(parent.rotation, child.rotation),
    translation: addVec3(multiplyMat3Vec3(parent.rotation, child.translation), parent.translation),
});
const transformPoint = (transform, point) => addVec3(multiplyMat3Vec3(transform.rotation, point), transform.translation);
const resolveLoadedSourceUrdfPath = (source) => {
    if (!source.rootPath || !source.entryPath)
        return null;
    if (path.isAbsolute(source.entryPath)) {
        const relative = path.relative(source.rootPath, source.entryPath);
        if (!relative || relative.startsWith("..")) {
            return (0, repositoryMeshResolution_1.normalizeRepositoryPath)(path.basename(source.entryPath));
        }
        return (0, repositoryMeshResolution_1.normalizeRepositoryPath)(relative);
    }
    return (0, repositoryMeshResolution_1.normalizeRepositoryPath)(source.entryPath);
};
const collectJointPoses = (xmlDoc) => Array.from(xmlDoc.querySelectorAll("joint")).flatMap((joint) => {
    const parentLink = joint.querySelector("parent")?.getAttribute("link");
    const childLink = joint.querySelector("child")?.getAttribute("link");
    if (!parentLink || !childLink) {
        return [];
    }
    const origin = joint.querySelector("origin");
    return [
        {
            parentLink,
            childLink,
            originXyz: parseTriplet(origin?.getAttribute("xyz")),
            originRpy: parseTriplet(origin?.getAttribute("rpy")),
        },
    ];
});
const computeLinkWorldTransforms = (xmlDoc, joints) => {
    const linkNames = Array.from(xmlDoc.querySelectorAll("link"))
        .map((link) => link.getAttribute("name"))
        .filter((value) => Boolean(value));
    const childLinks = new Set(joints.map((joint) => joint.childLink));
    const rootLinks = linkNames.filter((linkName) => !childLinks.has(linkName));
    const transforms = new Map();
    rootLinks.forEach((linkName) => {
        transforms.set(linkName, IDENTITY_TRANSFORM);
    });
    let progress = true;
    let passes = 0;
    while (progress && passes < joints.length + 2) {
        progress = false;
        passes += 1;
        joints.forEach((joint) => {
            if (transforms.has(joint.childLink)) {
                return;
            }
            const parentTransform = transforms.get(joint.parentLink);
            if (!parentTransform) {
                return;
            }
            const childTransform = composeTransforms(parentTransform, {
                rotation: rpyToMatrix(joint.originRpy),
                translation: joint.originXyz,
            });
            transforms.set(joint.childLink, childTransform);
            progress = true;
        });
    }
    return transforms;
};
const toFindingSummary = (findings) => ({
    errors: findings.filter((finding) => finding.level === "error").length,
    warnings: findings.filter((finding) => finding.level === "warning").length,
    infos: findings.filter((finding) => finding.level === "info").length,
});
const fileExists = async (absolutePath) => {
    try {
        const stats = await fs.stat(absolutePath);
        return stats.isFile();
    }
    catch {
        return false;
    }
};
const resolveLocalMeshReferences = async (source, analysis) => {
    const emptyAudit = {
        usedFilesystemChecks: false,
        rootPath: source.rootPath ?? null,
        urdfPath: resolveLoadedSourceUrdfPath(source),
        totalMeshReferences: analysis.meshReferences.length,
        resolvedMeshReferences: [],
        unresolvedMeshReferences: [],
        sampledMeshFiles: [],
        skippedUnsupportedMeshes: [],
        skippedUnreadableMeshes: [],
    };
    if ((source.source !== "local-file" && source.source !== "local-repo") ||
        !source.rootPath) {
        return {
            audit: emptyAudit,
            resolvedAbsolutePathByReference: new Map(),
        };
    }
    const urdfPath = resolveLoadedSourceUrdfPath(source);
    if (!urdfPath) {
        return {
            audit: emptyAudit,
            resolvedAbsolutePathByReference: new Map(),
        };
    }
    const files = await (0, localRepositoryInspection_1.collectLocalRepositoryFiles)(source.rootPath);
    const resolvedAbsolutePathByReference = new Map();
    const resolvedRefs = new Set();
    const unresolvedRefs = new Set();
    for (const meshRef of analysis.meshReferences) {
        if (!meshRef)
            continue;
        if (meshRef.startsWith("http://") ||
            meshRef.startsWith("https://") ||
            meshRef.startsWith("data:")) {
            continue;
        }
        const refInfo = (0, meshPaths_1.parseMeshReference)(meshRef);
        if (refInfo.isAbsoluteFile) {
            const absolutePath = refInfo.path;
            if (await fileExists(absolutePath)) {
                resolvedRefs.add(meshRef);
                resolvedAbsolutePathByReference.set(meshRef, absolutePath);
            }
            else {
                unresolvedRefs.add(meshRef);
            }
            continue;
        }
        const match = (0, repositoryMeshResolution_1.resolveRepositoryFileReference)(urdfPath, meshRef, files);
        if (match) {
            const localMatch = match;
            resolvedRefs.add(meshRef);
            resolvedAbsolutePathByReference.set(meshRef, localMatch.absolutePath);
        }
        else {
            unresolvedRefs.add(meshRef);
        }
    }
    return {
        audit: {
            ...emptyAudit,
            usedFilesystemChecks: true,
            resolvedMeshReferences: Array.from(resolvedRefs).sort(),
            unresolvedMeshReferences: Array.from(unresolvedRefs).sort(),
        },
        resolvedAbsolutePathByReference,
    };
};
const buildScaledMeshCorners = (bounds, scale) => {
    const xs = [bounds.min[0] * scale[0], bounds.max[0] * scale[0]];
    const ys = [bounds.min[1] * scale[1], bounds.max[1] * scale[1]];
    const zs = [bounds.min[2] * scale[2], bounds.max[2] * scale[2]];
    const corners = [];
    xs.forEach((x) => {
        ys.forEach((y) => {
            zs.forEach((z) => {
                corners.push([x, y, z]);
            });
        });
    });
    return corners;
};
const buildLocalMeshSamplePoints = async (source, analysis, resolvedAbsolutePathByReference) => {
    if ((source.source !== "local-file" && source.source !== "local-repo") ||
        !source.rootPath) {
        return {
            points: [],
            sampledMeshFiles: [],
            skippedUnsupportedMeshes: [],
            skippedUnreadableMeshes: [],
        };
    }
    ensureNodeDomGlobals();
    const xmlDoc = (0, xmlDom_1.parseXml)(source.urdf);
    const linkTransforms = computeLinkWorldTransforms(xmlDoc, collectJointPoses(xmlDoc));
    const boundsCache = new Map();
    const points = [];
    const sampledMeshFiles = new Set();
    const skippedUnsupportedMeshes = new Set();
    const skippedUnreadableMeshes = new Set();
    for (const [linkName, linkData] of Object.entries(analysis.linkDataByName)) {
        const linkTransform = linkTransforms.get(linkName) ?? IDENTITY_TRANSFORM;
        const geometries = [...linkData.visuals, ...linkData.collisions];
        for (const entry of geometries) {
            if (entry.geometry.type !== "mesh") {
                continue;
            }
            const meshRef = entry.geometry.params.filename || "";
            const absolutePath = resolvedAbsolutePathByReference.get(meshRef);
            if (!absolutePath) {
                continue;
            }
            let bounds = boundsCache.get(absolutePath);
            if (!bounds) {
                try {
                    bounds = (0, meshBoundsNode_1.readMeshBounds)(absolutePath);
                    boundsCache.set(absolutePath, bounds);
                }
                catch (error) {
                    if (/unsupported mesh format/i.test(error?.message || "")) {
                        skippedUnsupportedMeshes.add(meshRef);
                    }
                    else {
                        skippedUnreadableMeshes.add(meshRef);
                    }
                    continue;
                }
            }
            sampledMeshFiles.add(meshRef);
            const scale = parseTriplet(entry.geometry.params.scale, [1, 1, 1]);
            const localTransform = {
                rotation: rpyToMatrix(entry.origin.rpy),
                translation: entry.origin.xyz,
            };
            const worldTransform = composeTransforms(linkTransform, localTransform);
            buildScaledMeshCorners(bounds, scale).forEach((corner) => {
                points.push(transformPoint(worldTransform, corner));
            });
        }
    }
    return {
        points,
        sampledMeshFiles: Array.from(sampledMeshFiles).sort(),
        skippedUnsupportedMeshes: Array.from(skippedUnsupportedMeshes).sort(),
        skippedUnreadableMeshes: Array.from(skippedUnreadableMeshes).sort(),
    };
};
const resolveMeshAuditForSource = async (source) => {
    ensureNodeDomGlobals();
    const analysis = (0, analyzeUrdf_1.analyzeUrdf)(source.urdf);
    const { audit, resolvedAbsolutePathByReference } = await resolveLocalMeshReferences(source, analysis);
    const meshSamples = await buildLocalMeshSamplePoints(source, analysis, resolvedAbsolutePathByReference);
    return {
        analysis,
        audit: {
            ...audit,
            sampledMeshFiles: meshSamples.sampledMeshFiles,
            skippedUnsupportedMeshes: meshSamples.skippedUnsupportedMeshes,
            skippedUnreadableMeshes: meshSamples.skippedUnreadableMeshes,
        },
        additionalSamplePoints: meshSamples.points,
    };
};
const checkLoadedSourcePhysicsHealth = async (source) => {
    ensureNodeDomGlobals();
    const { audit } = await resolveMeshAuditForSource(source);
    const base = (0, healthCheckUrdf_1.healthCheckUrdf)(source.urdf);
    const findings = [...base.findings];
    audit.unresolvedMeshReferences.forEach((meshRef) => {
        findings.push({
            level: "error",
            code: "missing-mesh-file",
            context: meshRef,
            message: `Mesh reference "${meshRef}" could not be resolved on disk from the loaded source root.`,
            suggestion: "Repair mesh references or load the robot from the correct repository root before downstream conversion.",
        });
    });
    audit.skippedUnreadableMeshes.forEach((meshRef) => {
        findings.push({
            level: "warning",
            code: "unreadable-mesh-file",
            context: meshRef,
            message: `Mesh reference "${meshRef}" resolved on disk but its bounds could not be sampled.`,
            suggestion: "Convert the mesh to a supported local format or keep orientation inference on analytic geometry only.",
        });
    });
    audit.skippedUnsupportedMeshes.forEach((meshRef) => {
        findings.push({
            level: "info",
            code: "unsupported-mesh-bounds-format",
            context: meshRef,
            message: `Mesh reference "${meshRef}" uses a local format that is not yet sampled for bounds inference.`,
            suggestion: "Use STL, OBJ, or DAE if you want mesh-aware orientation inference from local assets.",
        });
    });
    const summary = toFindingSummary(findings);
    return {
        ...base,
        ok: summary.errors === 0,
        findings,
        summary,
        meshAudit: audit,
    };
};
exports.checkLoadedSourcePhysicsHealth = checkLoadedSourcePhysicsHealth;
const guessLoadedSourceOrientation = async (source, options = {}) => {
    const { audit, additionalSamplePoints } = await resolveMeshAuditForSource(source);
    return {
        ...(0, guessOrientation_1.guessUrdfOrientation)(source.urdf, {
            ...options,
            additionalSamplePoints: [
                ...(options.additionalSamplePoints ?? []),
                ...additionalSamplePoints,
            ],
        }),
        meshAudit: audit,
    };
};
exports.guessLoadedSourceOrientation = guessLoadedSourceOrientation;
const buildLoadedSourceOrientationCard = async (source, options = {}) => {
    const guess = await (0, exports.guessLoadedSourceOrientation)(source, options);
    return {
        ...(0, robotOrientationCard_1.buildRobotOrientationCard)(guess),
        meshAudit: guess.meshAudit,
    };
};
exports.buildLoadedSourceOrientationCard = buildLoadedSourceOrientationCard;
