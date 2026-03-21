/**
 * Parses axis information from URDF joints.
 */

import { getDirectChildrenByTag, parseURDF, validateURDFDocument } from "./urdfParser";

export interface JointAxisInfo {
  xyz: [number, number, number];
}

export interface JointAxisMap {
  [jointName: string]: JointAxisInfo;
}

/**
 * Parse axis information from an already-parsed URDF document
 */
export function parseJointAxesFromDocument(xmlDoc: Document): JointAxisMap {
  const validation = validateURDFDocument(xmlDoc);
  if (!validation.robot) {
    console.error(validation.error);
    return {};
  }

  const joints = getDirectChildrenByTag(validation.robot, "joint");
  const axes: JointAxisMap = {};

  joints.forEach((jointElement) => {
    const jointName = jointElement.getAttribute("name");
    if (!jointName) return;

    const axisElement = jointElement.querySelector("axis");
    if (axisElement) {
      const xyzAttr = axisElement.getAttribute("xyz");
      if (xyzAttr) {
        const parts = xyzAttr.trim().split(/\s+/).map(parseFloat);
        axes[jointName] = {
          xyz: [
            parts[0] || 0,
            parts[1] || 0,
            parts[2] || 0,
          ] as [number, number, number],
        };
      }
    }
  });

  return axes;
}

/**
 * Parse axis information from URDF content
 */
export function parseJointAxesFromURDF(urdfContent: string): JointAxisMap {
  const parsed = parseURDF(urdfContent);
  if (!parsed.isValid) {
    return {};
  }
  return parseJointAxesFromDocument(parsed.document);
}
