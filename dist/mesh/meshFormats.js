"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMeshSupportStatus = exports.meshExtensionsAcceptList = exports.describeSupportedMeshExtensions = exports.meshExtensionsDisplay = exports.isSupportedMeshResource = exports.isSupportedMeshExtension = exports.extractExtensionWithoutDot = exports.extractExtension = exports.SUPPORTED_MESH_RESOURCE_EXTENSIONS = exports.SUPPORTED_MESH_EXTENSIONS = void 0;
const meshFormatsConfig = require("./meshFormats.constants.json");
const extensionSupport_1 = require("../formats/extensionSupport");
const defaults = meshFormatsConfig;
const meshSupport = (0, extensionSupport_1.createExtensionSupport)({
    primaryExtensions: defaults.supportedMeshExtensions,
    additionalExtensions: defaults.additionalMeshResourceExtensions,
});
exports.SUPPORTED_MESH_EXTENSIONS = meshSupport.primaryExtensions;
exports.SUPPORTED_MESH_RESOURCE_EXTENSIONS = meshSupport.supportedExtensions;
exports.extractExtension = meshSupport.extractExtension;
const extractExtensionWithoutDot = (value) => {
    const ext = (0, exports.extractExtension)(value);
    return ext ? ext.slice(1) : null;
};
exports.extractExtensionWithoutDot = extractExtensionWithoutDot;
exports.isSupportedMeshExtension = meshSupport.isPrimarySupported;
exports.isSupportedMeshResource = meshSupport.isSupported;
exports.meshExtensionsDisplay = meshSupport.describePrimary;
exports.describeSupportedMeshExtensions = meshSupport.describePrimary;
exports.meshExtensionsAcceptList = meshSupport.primaryAcceptList;
const getMeshSupportStatus = (value) => {
    const ext = (0, exports.extractExtension)(value);
    if (!ext) {
        return {
            ok: false,
            reason: `Missing mesh file extension. Supported formats: ${(0, exports.describeSupportedMeshExtensions)()}.`,
        };
    }
    if (!(0, exports.isSupportedMeshExtension)(ext)) {
        return {
            ok: false,
            extension: ext,
            reason: `Unsupported mesh format "${ext}". Supported formats: ${(0, exports.describeSupportedMeshExtensions)()}.`,
        };
    }
    return { ok: true, extension: ext };
};
exports.getMeshSupportStatus = getMeshSupportStatus;
