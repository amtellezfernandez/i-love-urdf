"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractMeshRefs = exports.readRequiredUrdfInput = exports.emitJson = void 0;
const meshPaths_1 = require("../mesh/meshPaths");
const xmlDom_1 = require("../xmlDom");
const emitJson = (value) => {
    console.log(JSON.stringify(value, null, 2));
};
exports.emitJson = emitJson;
const readRequiredUrdfInput = (args, helpers) => {
    const urdfPath = helpers.getOptionalStringArg(args, "urdf");
    if (!urdfPath) {
        helpers.fail("Missing required argument --urdf");
    }
    return {
        urdfPath,
        urdfContent: helpers.readText(urdfPath),
    };
};
exports.readRequiredUrdfInput = readRequiredUrdfInput;
const extractMeshRefs = (urdfContent) => {
    const doc = (0, xmlDom_1.parseXml)(urdfContent);
    const meshElements = Array.from(doc.querySelectorAll("mesh"));
    return meshElements
        .map((meshElement) => meshElement.getAttribute("filename") || "")
        .filter((ref) => ref.length > 0)
        .map((ref) => (0, meshPaths_1.parseMeshReference)(ref));
};
exports.extractMeshRefs = extractMeshRefs;
