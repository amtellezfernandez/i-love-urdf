"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildIluAssemblyStudioUrl = exports.coerceIluAssemblySessionSnapshot = exports.ILU_ASSEMBLY_SESSION_SCHEMA_VERSION = exports.ILU_ASSEMBLY_SESSION_SCHEMA = void 0;
exports.ILU_ASSEMBLY_SESSION_SCHEMA = "ilu-assembly-session";
exports.ILU_ASSEMBLY_SESSION_SCHEMA_VERSION = 1;
const isRecord = (value) => typeof value === "object" && value !== null;
const coerceAssemblySource = (raw) => {
    if (!isRecord(raw) || raw.type !== "local") {
        return null;
    }
    if (typeof raw.rootPath !== "string" || typeof raw.folderLabel !== "string") {
        return null;
    }
    return {
        type: "local",
        rootPath: raw.rootPath,
        folderLabel: raw.folderLabel,
    };
};
const coerceAssemblyRobot = (raw) => {
    if (!isRecord(raw)) {
        return null;
    }
    const source = coerceAssemblySource(raw.source);
    if (!source ||
        typeof raw.id !== "string" ||
        typeof raw.name !== "string" ||
        typeof raw.sourcePrefix !== "string" ||
        typeof raw.selectedPath !== "string") {
        return null;
    }
    return {
        id: raw.id,
        name: raw.name,
        sourcePrefix: raw.sourcePrefix,
        selectedPath: raw.selectedPath,
        source,
    };
};
const coerceSourceByPath = (raw) => {
    if (!isRecord(raw)) {
        return {};
    }
    const entries = Object.entries(raw)
        .filter(([, value]) => isRecord(value) && value.type === "local")
        .map(([key, value]) => [
        key,
        {
            type: "local",
            folder: isRecord(value) && typeof value.folder === "string" ? value.folder : undefined,
        },
    ]);
    return Object.fromEntries(entries);
};
const coerceIluAssemblySessionSnapshot = (raw) => {
    if (!isRecord(raw)) {
        return null;
    }
    if (raw.schema !== exports.ILU_ASSEMBLY_SESSION_SCHEMA ||
        raw.schemaVersion !== exports.ILU_ASSEMBLY_SESSION_SCHEMA_VERSION ||
        typeof raw.sessionId !== "string" ||
        typeof raw.createdAt !== "string" ||
        typeof raw.updatedAt !== "string" ||
        typeof raw.label !== "string" ||
        typeof raw.workspaceRoot !== "string" ||
        !Array.isArray(raw.selectedPaths) ||
        !isRecord(raw.namesByPath) ||
        !Array.isArray(raw.robots)) {
        return null;
    }
    const robots = raw.robots
        .map((robot) => coerceAssemblyRobot(robot))
        .filter((robot) => robot !== null);
    if (robots.length !== raw.robots.length) {
        return null;
    }
    return {
        schema: exports.ILU_ASSEMBLY_SESSION_SCHEMA,
        schemaVersion: exports.ILU_ASSEMBLY_SESSION_SCHEMA_VERSION,
        sessionId: raw.sessionId,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
        label: raw.label,
        workspaceRoot: raw.workspaceRoot,
        selectedPaths: raw.selectedPaths.filter((value) => typeof value === "string"),
        namesByPath: Object.fromEntries(Object.entries(raw.namesByPath).filter((entry) => typeof entry[1] === "string")),
        sourceByPath: coerceSourceByPath(raw.sourceByPath),
        robots,
    };
};
exports.coerceIluAssemblySessionSnapshot = coerceIluAssemblySessionSnapshot;
const buildIluAssemblyStudioUrl = (studioBaseUrl, assemblySessionId) => {
    const studioUrl = new URL(studioBaseUrl);
    studioUrl.searchParams.set("ilu_assembly", assemblySessionId);
    return studioUrl.toString();
};
exports.buildIluAssemblyStudioUrl = buildIluAssemblyStudioUrl;
