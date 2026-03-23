"use strict";
/**
 * URDF Joint Limits Parser
 *
 * Parses joint types and limits from URDF XML.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseJointLimitsFromDocument = parseJointLimitsFromDocument;
exports.parseJointLimitsFromURDF = parseJointLimitsFromURDF;
exports.getJointLimits = getJointLimits;
const urdfParser_1 = require("./urdfParser");
const parseOptionalFloat = (value) => {
    if (value === null)
        return null;
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
};
const normalizeOrderedLimits = (lower, upper) => {
    if (lower === null || upper === null) {
        return { lower, upper };
    }
    if (lower <= upper) {
        return { lower, upper };
    }
    return { lower: upper, upper: lower };
};
/**
 * Parses joint types and limits from URDF XML content
 * @param urdfContent URDF XML content as string
 * @returns Map of joint names to their limit information
 */
function parseJointLimitsFromDocument(xmlDoc) {
    const limits = {};
    const validation = (0, urdfParser_1.validateURDFDocument)(xmlDoc);
    if (!validation.robot) {
        return limits;
    }
    const joints = (0, urdfParser_1.getDirectChildrenByTag)(validation.robot, "joint");
    joints.forEach((joint) => {
        const jointName = joint.getAttribute("name");
        if (!jointName)
            return;
        // Skip joints without type attribute (hardware interface definitions)
        const jointType = joint.getAttribute("type");
        if (!jointType)
            return;
        // Initialize with defaults based on joint type
        let lower = null;
        let upper = null;
        let velocity = null;
        const limitTag = joint.querySelector("limit");
        if (limitTag) {
            const parsedVelocity = parseOptionalFloat(limitTag.getAttribute("velocity"));
            if (parsedVelocity !== null) {
                velocity = parsedVelocity;
            }
        }
        // Fixed joints can't move
        if (jointType === "fixed") {
            limits[jointName] = {
                type: jointType,
                lower: 0,
                upper: 0,
                velocity: velocity ?? 0,
            };
            return;
        }
        // Continuous joints have unlimited range (no limits)
        if (jointType === "continuous") {
            if (limitTag) {
                const parsed = normalizeOrderedLimits(parseOptionalFloat(limitTag.getAttribute("lower")), parseOptionalFloat(limitTag.getAttribute("upper")));
                lower = parsed.lower;
                upper = parsed.upper;
            }
            limits[jointName] = {
                type: jointType,
                lower,
                upper,
                velocity,
            };
            return;
        }
        // For revolute and prismatic joints, check for <limit> tag
        if (jointType === "revolute" || jointType === "prismatic") {
            if (limitTag) {
                const parsed = normalizeOrderedLimits(parseOptionalFloat(limitTag.getAttribute("lower")), parseOptionalFloat(limitTag.getAttribute("upper")));
                lower = parsed.lower;
                upper = parsed.upper;
            }
            else {
                // No limit tag - for revolute, assume continuous (unlimited)
                // For prismatic, this is unusual but we'll treat as unlimited
                if (jointType === "revolute") {
                    lower = null;
                    upper = null;
                }
                else {
                    // Prismatic without limits - unusual but possible
                    lower = null;
                    upper = null;
                }
            }
        }
        else {
            // Other joint types (planar, floating) - treat as unlimited for now
            lower = null;
            upper = null;
        }
        limits[jointName] = {
            type: jointType,
            lower,
            upper,
            velocity,
        };
    });
    return limits;
}
/**
 * Parses joint types and limits from URDF XML content
 * @param urdfContent URDF XML content as string
 * @returns Map of joint names to their limit information
 */
function parseJointLimitsFromURDF(urdfContent) {
    const parsed = (0, urdfParser_1.parseURDF)(urdfContent);
    if (!parsed.isValid) {
        return {};
    }
    return parseJointLimitsFromDocument(parsed.document);
}
/**
 * Gets joint limits for a specific joint, with fallback values
 * @param limitsMap Parsed joint limits map
 * @param jointName Name of the joint
 * @returns Object with lower and upper limits, or defaults for unlimited joints
 */
function getJointLimits(limitsMap, jointName) {
    const jointInfo = limitsMap[jointName];
    if (!jointInfo) {
        // Joint not found - assume continuous (unlimited)
        return {
            lower: -Infinity,
            upper: Infinity,
        };
    }
    // Fixed joints
    if (jointInfo.type === "fixed") {
        return {
            lower: 0,
            upper: 0,
        };
    }
    return {
        lower: jointInfo.lower === null ? -Infinity : jointInfo.lower,
        upper: jointInfo.upper === null ? Infinity : jointInfo.upper,
    };
}
