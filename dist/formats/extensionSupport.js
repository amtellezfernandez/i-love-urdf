"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createExtensionSupport = void 0;
const normalizeExtension = (value) => {
    if (!value)
        return "";
    const trimmed = value.trim().toLowerCase();
    if (!trimmed)
        return "";
    return trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
};
const normalizeExtensionList = (values) => {
    const normalized = (values ?? []).map(normalizeExtension).filter((ext) => ext.length > 0);
    return Object.freeze(Array.from(new Set(normalized)));
};
const stripQueryAndHash = (value) => {
    if (!value)
        return "";
    const [pathPart] = value.split("?");
    const [cleaned] = (pathPart ?? value).split("#");
    return cleaned ?? value;
};
const createExtensionSupport = (params) => {
    const primaryExtensions = normalizeExtensionList(params.primaryExtensions);
    const supportedExtensions = normalizeExtensionList([
        ...primaryExtensions,
        ...(params.additionalExtensions ?? []),
    ]);
    const primarySet = new Set(primaryExtensions);
    const supportedSet = new Set(supportedExtensions);
    const extractExtension = (value) => {
        const cleaned = stripQueryAndHash(value).trim();
        if (!cleaned)
            return null;
        const match = cleaned.toLowerCase().match(/\.([a-z0-9]+)$/);
        if (!match)
            return null;
        const ext = normalizeExtension(match[1]);
        return ext || null;
    };
    const isPrimarySupported = (value) => {
        const ext = extractExtension(value);
        if (!ext)
            return false;
        return primarySet.has(ext);
    };
    const isSupported = (value) => {
        const ext = extractExtension(value);
        if (!ext)
            return false;
        return supportedSet.has(ext);
    };
    const describePrimary = () => primaryExtensions.join(", ");
    const primaryAcceptList = () => primaryExtensions.join(",");
    return {
        primaryExtensions,
        supportedExtensions,
        extractExtension,
        isPrimarySupported,
        isSupported,
        describePrimary,
        primaryAcceptList,
    };
};
exports.createExtensionSupport = createExtensionSupport;
