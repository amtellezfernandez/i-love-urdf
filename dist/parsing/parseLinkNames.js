"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseLinkNamesFromDocument = parseLinkNamesFromDocument;
exports.parseLinkNames = parseLinkNames;
/**
 * Parse link names from URDF content
 */
const xmlDom_1 = require("../xmlDom");
function parseLinkNamesFromDocument(xmlDoc) {
    try {
        const links = xmlDoc.querySelectorAll("link");
        const linkNames = [];
        links.forEach((link) => {
            const name = link.getAttribute("name");
            if (name) {
                linkNames.push(name);
            }
        });
        return linkNames;
    }
    catch (error) {
        console.error("Error parsing link names from URDF:", error);
        return [];
    }
}
function parseLinkNames(urdfContent) {
    const xmlDoc = (0, xmlDom_1.parseXml)(urdfContent);
    return parseLinkNamesFromDocument(xmlDoc);
}
