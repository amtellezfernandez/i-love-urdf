/**
 * Parses axis information from URDF joints
 */

import { parseXml } from "../xmlDom";

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
  const parserError = xmlDoc.querySelector("parsererror");
  if (parserError) {
    const errorText = parserError.textContent || "Unknown XML parsing error";
    console.error("URDF parsing error:", errorText);
    return {};
  }

  const robot = xmlDoc.querySelector("robot");
  if (!robot) {
    console.error("No <robot> element found in URDF");
    return {};
  }

  const joints = xmlDoc.querySelectorAll("joint");
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
  const xmlDoc = parseXml(urdfContent);
  return parseJointAxesFromDocument(xmlDoc);
}
