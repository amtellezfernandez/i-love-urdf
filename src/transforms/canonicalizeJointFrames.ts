import { parseURDF, serializeURDF } from "../parsing/urdfParser";
import {
  applyLeftRotationToElementOrigin,
  applyRightRotationToElementOrigin,
  buildRotationBetweenVectors,
  formatXyz,
  multiplyMatrixVector,
  normalizeVector,
  transpose,
  type Vec3,
} from "../utils/rotationMath";
import type { UrdfTransformResult } from "./urdfTransforms";

export interface CanonicalizeJointFrameOptions {
  targetAxis?: "x" | "y" | "z";
  joints?: Iterable<string>;
}

export interface CanonicalizeJointFrameSkip {
  jointName: string;
  reason: string;
}

export interface CanonicalizeJointFrameResult extends UrdfTransformResult {
  changedJoints: string[];
  skippedJoints: CanonicalizeJointFrameSkip[];
}

export const alignJointToLocalZ = (
  urdfContent: string,
  jointName: string
): CanonicalizeJointFrameResult =>
  canonicalizeJointFrames(urdfContent, {
    targetAxis: "z",
    joints: [jointName],
  });

const DEFAULT_AXIS: Vec3 = [1, 0, 0];
const ELIGIBLE_JOINT_TYPES = new Set(["revolute", "continuous", "prismatic"]);

const axisLabelToVector = (axis: "x" | "y" | "z"): Vec3 => {
  switch (axis) {
    case "x":
      return [1, 0, 0];
    case "y":
      return [0, 1, 0];
    case "z":
    default:
      return [0, 0, 1];
  }
};

const parseAxisVector = (raw: string | null): Vec3 | null => {
  if (!raw) return DEFAULT_AXIS;
  const values = raw.trim().split(/\s+/).map((value) => Number(value));
  if (values.length !== 3 || values.some((value) => !Number.isFinite(value))) {
    return null;
  }
  return [values[0], values[1], values[2]];
};

const jointTypeUsesAxis = (jointType: string): boolean =>
  !(jointType === "fixed" || jointType === "floating" || jointType === "planar");

const ensureAxisElement = (document: Document, joint: Element): Element => {
  let axisElement = joint.querySelector("axis");
  if (!axisElement) {
    axisElement = document.createElement("axis");
    joint.appendChild(axisElement);
  }
  return axisElement;
};

const setAxisElement = (document: Document, joint: Element, vector: Vec3) => {
  const axisElement = ensureAxisElement(document, joint);
  axisElement.setAttribute("xyz", formatXyz(normalizeVector(vector)));
};

const topologicalJointOrder = (robot: Element): Element[] => {
  const joints = Array.from(robot.querySelectorAll(":scope > joint"));
  const links = Array.from(robot.querySelectorAll(":scope > link"));
  const childLinkNames = new Set<string>();
  const jointsByParentLink = new Map<string, Element[]>();

  joints.forEach((joint) => {
    const parentLink = joint.querySelector("parent")?.getAttribute("link") || "";
    const childLink = joint.querySelector("child")?.getAttribute("link") || "";
    if (childLink) {
      childLinkNames.add(childLink);
    }
    if (parentLink) {
      const current = jointsByParentLink.get(parentLink) ?? [];
      current.push(joint);
      jointsByParentLink.set(parentLink, current);
    }
  });

  const rootLinkNames = links
    .map((link) => link.getAttribute("name") || "")
    .filter((name) => name.length > 0 && !childLinkNames.has(name));

  const ordered: Element[] = [];
  const visited = new Set<Element>();

  const visitLink = (linkName: string) => {
    for (const joint of jointsByParentLink.get(linkName) ?? []) {
      if (visited.has(joint)) continue;
      visited.add(joint);
      ordered.push(joint);
      const childLink = joint.querySelector("child")?.getAttribute("link") || "";
      if (childLink) {
        visitLink(childLink);
      }
    }
  };

  rootLinkNames.forEach(visitLink);
  joints.forEach((joint) => {
    if (!visited.has(joint)) {
      ordered.push(joint);
    }
  });

  return ordered;
};

export function canonicalizeJointFrames(
  urdfContent: string,
  options: CanonicalizeJointFrameOptions = {}
): CanonicalizeJointFrameResult {
  if (!urdfContent.trim()) {
    return {
      success: false,
      content: urdfContent,
      error: "No URDF content available",
      changedJoints: [],
      skippedJoints: [],
    };
  }

  const parsed = parseURDF(urdfContent);
  if (!parsed.isValid) {
    return {
      success: false,
      content: urdfContent,
      error: parsed.error,
      changedJoints: [],
      skippedJoints: [],
    };
  }

  const robot = parsed.document.querySelector("robot");
  if (!robot) {
    return {
      success: false,
      content: urdfContent,
      error: "No <robot> element found",
      changedJoints: [],
      skippedJoints: [],
    };
  }

  const targetAxis = options.targetAxis ?? "z";
  const targetVector = axisLabelToVector(targetAxis);
  const selectedJointNames = options.joints ? new Set(Array.from(options.joints)) : null;
  const linkMap = new Map<string, Element>();
  Array.from(robot.querySelectorAll(":scope > link")).forEach((link) => {
    const name = link.getAttribute("name");
    if (name) {
      linkMap.set(name, link);
    }
  });

  const outgoingJointsByParent = new Map<string, Element[]>();
  Array.from(robot.querySelectorAll(":scope > joint")).forEach((joint) => {
    const parentLink = joint.querySelector("parent")?.getAttribute("link");
    if (!parentLink) return;
    const current = outgoingJointsByParent.get(parentLink) ?? [];
    current.push(joint);
    outgoingJointsByParent.set(parentLink, current);
  });

  const changedJoints: string[] = [];
  const skippedJoints: CanonicalizeJointFrameSkip[] = [];
  const orderedJoints = topologicalJointOrder(robot);
  for (const joint of orderedJoints) {
    const jointName = joint.getAttribute("name") || "unnamed";
    if (selectedJointNames && !selectedJointNames.has(jointName)) {
      continue;
    }

    const jointType = joint.getAttribute("type") || "unknown";
    if (!ELIGIBLE_JOINT_TYPES.has(jointType)) {
      skippedJoints.push({
        jointName,
        reason: `Joint type "${jointType}" is not canonicalized.`,
      });
      continue;
    }

    const currentAxis = parseAxisVector(joint.querySelector("axis")?.getAttribute("xyz") || null);
    if (!currentAxis) {
      skippedJoints.push({
        jointName,
        reason: "Axis format is invalid.",
      });
      continue;
    }

    const normalizedAxis = normalizeVector(currentAxis);
    if (Math.abs(normalizedAxis[0]) < 1e-10 && Math.abs(normalizedAxis[1]) < 1e-10 && Math.abs(normalizedAxis[2]) < 1e-10) {
      skippedJoints.push({
        jointName,
        reason: "Axis is zero or near-zero.",
      });
      continue;
    }

    const compensation = buildRotationBetweenVectors(targetVector, normalizedAxis);
    const compensationInverse = transpose(compensation);

    applyRightRotationToElementOrigin(joint, compensation);
    setAxisElement(parsed.document, joint, targetVector);

    const childLinkName = joint.querySelector("child")?.getAttribute("link") || "";
    const childLink = childLinkName ? linkMap.get(childLinkName) ?? null : null;
    if (!childLink) {
      changedJoints.push(jointName);
      continue;
    }

    Array.from(childLink.children).forEach((childElement) => {
      if (
        childElement.tagName === "visual" ||
        childElement.tagName === "collision" ||
        childElement.tagName === "inertial"
      ) {
        applyLeftRotationToElementOrigin(childElement, compensationInverse);
      }
    });

    for (const outgoingJoint of outgoingJointsByParent.get(childLinkName) ?? []) {
      applyLeftRotationToElementOrigin(outgoingJoint, compensationInverse);
      const outgoingType = outgoingJoint.getAttribute("type") || "unknown";
      if (!jointTypeUsesAxis(outgoingType)) {
        continue;
      }
      const outgoingAxis = parseAxisVector(outgoingJoint.querySelector("axis")?.getAttribute("xyz") || null);
      const rotatedAxis = normalizeVector(
        multiplyMatrixVector(compensationInverse, outgoingAxis ?? DEFAULT_AXIS)
      );
      setAxisElement(parsed.document, outgoingJoint, rotatedAxis);
    }

    changedJoints.push(jointName);
  }

  if (selectedJointNames) {
    selectedJointNames.forEach((jointName) => {
      if (!changedJoints.includes(jointName) && !skippedJoints.some((item) => item.jointName === jointName)) {
        skippedJoints.push({
          jointName,
          reason: "Joint not found.",
        });
      }
    });
  }

  return {
    success: true,
    content: serializeURDF(parsed.document),
    changedJoints,
    skippedJoints,
  };
}
