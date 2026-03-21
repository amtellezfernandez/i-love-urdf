"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseLinkNamesFromDocument = parseLinkNamesFromDocument;
exports.parseLinkNames = parseLinkNames;
/**
 * Parses link names from URDF content.
 */
const urdfParser_1 = require("./urdfParser");
function parseLinkNamesFromDocument(xmlDoc) {
    try {
        const validation = (0, urdfParser_1.validateURDFDocument)(xmlDoc);
        if (!validation.robot) {
            return [];
        }
        const links = (0, urdfParser_1.getDirectChildrenByTag)(validation.robot, "link");
        const linkNames = [];
        links.forEach((link) => {
            const name = link.getAttribute("name");
            if (name) {
                linkNames.push(name);
            }
        });
        return linkNames;
    }
    catch {
        return [];
    }
}
function parseLinkNames(urdfContent) {
    const parsed = (0, urdfParser_1.parseURDF)(urdfContent);
    if (!parsed.isValid) {
        return [];
    }
    return parseLinkNamesFromDocument(parsed.document);
}
