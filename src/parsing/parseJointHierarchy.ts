/**
 * Parses URDF to get hierarchical joint structure
 */

import { parseXml } from "../xmlDom";

export interface JointHierarchyNode {
  jointName: string;
  childLink: string;
  parentLink: string;
  type: string;
  children: JointHierarchyNode[];
  depth: number; // Hierarchy depth level
  order: number; // Original order in URDF
  parentJoint?: string; // Name of parent joint
}

interface JointHierarchy {
  rootJoints: JointHierarchyNode[];
  allJoints: Map<string, JointHierarchyNode>;
  orderedJoints: JointHierarchyNode[]; // All joints in URDF order
}

export function parseJointHierarchyFromDocument(xmlDoc: Document): JointHierarchy {
  const parserError = xmlDoc.querySelector("parsererror");
  if (parserError) {
    const errorText = parserError.textContent || "Unknown XML parsing error";
    console.error("URDF parsing error:", errorText);
    return { rootJoints: [], allJoints: new Map(), orderedJoints: [] };
  }

  const robot = xmlDoc.querySelector("robot");
  if (!robot) {
    console.error("No <robot> element found in URDF");
    return { rootJoints: [], allJoints: new Map(), orderedJoints: [] };
  }

  const allJoints = new Map<string, JointHierarchyNode>();
  const linkToJoint = new Map<string, string>(); // child link -> joint name
  const jointToParentJoint = new Map<string, string>(); // joint name -> parent joint name
  const orderedJoints: JointHierarchyNode[] = [];

  // First pass: collect all joints in URDF order
  const jointElements = xmlDoc.querySelectorAll("joint");
  let orderIndex = 0;
  jointElements.forEach((joint) => {
    const name = joint.getAttribute("name");
    const type = joint.getAttribute("type") || "unknown";
    const parent = joint.querySelector("parent")?.getAttribute("link");
    const child = joint.querySelector("child")?.getAttribute("link");

    if (name && parent && child) {
      const jointNode: JointHierarchyNode = {
        jointName: name,
        childLink: child,
        parentLink: parent,
        type,
        children: [],
        depth: 0,
        order: orderIndex++,
      };
      allJoints.set(name, jointNode);
      orderedJoints.push(jointNode);
      linkToJoint.set(child, name);
    }
  });

  // Find root links (links that are not children of any joint)
  const allLinks = new Set<string>();
  xmlDoc.querySelectorAll("link").forEach((link) => {
    const name = link.getAttribute("name");
    if (name) allLinks.add(name);
  });

  const childLinks = new Set(linkToJoint.keys());
  const rootLinks = new Set(Array.from(allLinks).filter((link) => !childLinks.has(link)));

  // Build parent joint relationships
  allJoints.forEach((joint) => {
    const parentLink = joint.parentLink;
    allJoints.forEach((otherJoint) => {
      if (otherJoint.childLink === parentLink) {
        jointToParentJoint.set(joint.jointName, otherJoint.jointName);
      }
    });
  });

  // Calculate depth for each joint
  const calculateDepth = (jointName: string, visited: Set<string> = new Set()): number => {
    if (visited.has(jointName)) {
      const joint = allJoints.get(jointName);
      return joint?.depth ?? 0;
    }
    visited.add(jointName);

    const joint = allJoints.get(jointName);
    if (!joint) return 0;

    const parentJoint = jointToParentJoint.get(jointName);
    if (parentJoint) {
      const parentDepth = calculateDepth(parentJoint, visited);
      joint.depth = parentDepth + 1;
      joint.parentJoint = parentJoint;
      return parentDepth + 1;
    }
    joint.depth = 0;
    return 0;
  };

  allJoints.forEach((_joint, jointName) => {
    calculateDepth(jointName);
  });

  // Build hierarchy and root joints
  const rootJoints: JointHierarchyNode[] = [];
  const processedLinks = new Set<string>();
  rootLinks.forEach((rootLink) => {
    const rootJointName = linkToJoint.get(rootLink);
    if (!rootJointName) return;
    const rootJoint = allJoints.get(rootJointName);
    if (!rootJoint || processedLinks.has(rootLink)) return;
    rootJoints.push(rootJoint);
    processedLinks.add(rootLink);
  });

  // Sort joints by depth and original order
  orderedJoints.sort((a, b) => {
    if (a.depth !== b.depth) return a.depth - b.depth;
    return a.order - b.order;
  });

  return {
    rootJoints,
    allJoints,
    orderedJoints,
  };
}

export function parseJointHierarchy(urdfContent: string): JointHierarchy {
  const xmlDoc = parseXml(urdfContent);
  return parseJointHierarchyFromDocument(xmlDoc);
}
