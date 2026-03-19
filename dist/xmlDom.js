"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.serializeXml = exports.createEmptyRobotDocument = exports.parseXml = exports.ensureXmlDom = void 0;
const ensureXmlDom = () => {
    if (typeof globalThis.DOMParser === "undefined" || typeof globalThis.XMLSerializer === "undefined") {
        throw new Error("DOMParser/XMLSerializer not available. Install DOM globals before calling i-love-urdf.");
    }
};
exports.ensureXmlDom = ensureXmlDom;
const parseXml = (xml) => {
    (0, exports.ensureXmlDom)();
    const parser = new DOMParser();
    return parser.parseFromString(xml, "text/xml");
};
exports.parseXml = parseXml;
const createEmptyRobotDocument = () => (0, exports.parseXml)("<robot></robot>");
exports.createEmptyRobotDocument = createEmptyRobotDocument;
const serializeXml = (document) => {
    (0, exports.ensureXmlDom)();
    const serializer = new XMLSerializer();
    return serializer.serializeToString(document);
};
exports.serializeXml = serializeXml;
