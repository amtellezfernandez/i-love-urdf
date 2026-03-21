"use strict";
/**
 * Robust URDF XML Parser Utility
 *
 * All URDF parsing should go through this utility so Node and browser
 * environments behave consistently.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDirectChildrenByTag = void 0;
exports.validateURDFDocument = validateURDFDocument;
exports.parseURDF = parseURDF;
exports.serializeURDF = serializeURDF;
const xmlDom_1 = require("../xmlDom");
const getDirectChildrenByTag = (parent, tagName) => Array.from(parent.children).filter((child) => child.tagName === tagName);
exports.getDirectChildrenByTag = getDirectChildrenByTag;
function validateURDFDocument(document) {
    const parserError = document.querySelector("parsererror");
    if (parserError) {
        return {
            robot: null,
            error: parserError.textContent || "Unknown XML parsing error",
        };
    }
    const robots = document.querySelectorAll("robot");
    if (robots.length === 0) {
        return {
            robot: null,
            error: "No <robot> element found in URDF",
        };
    }
    if (robots.length > 1) {
        return {
            robot: null,
            error: `Multiple <robot> elements found (${robots.length}). URDF must contain exactly one <robot>.`,
        };
    }
    return {
        robot: robots[0],
    };
}
/**
 * Parses URDF XML content using DOMParser
 * @param urdfContent URDF XML content as string
 * @returns Parsed document with validation status
 */
function parseURDF(urdfContent) {
    try {
        const xmlDoc = (0, xmlDom_1.parseXml)(urdfContent);
        const validation = validateURDFDocument(xmlDoc);
        if (!validation.robot) {
            console.error(validation.error);
            return {
                document: xmlDoc,
                isValid: false,
                error: validation.error,
            };
        }
        return {
            document: xmlDoc,
            isValid: true,
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.error("Error parsing URDF:", errorMessage);
        // Return a minimal document structure even on error
        const xmlDoc = (0, xmlDom_1.createEmptyRobotDocument)();
        return {
            document: xmlDoc,
            isValid: false,
            error: errorMessage,
        };
    }
}
/**
 * Serializes a parsed URDF document back to XML string
 * @param document Parsed XML document
 * @returns XML string representation
 */
function serializeURDF(document) {
    return (0, xmlDom_1.serializeXml)(document);
}
/**
 * Helper function to safely parse URDF and execute a callback with the parsed document
 * @param urdfContent URDF XML content as string
 * @param callback Function to execute with parsed document
 * @param fallback Fallback value if parsing fails
 * @returns Result of callback or fallback
 */
