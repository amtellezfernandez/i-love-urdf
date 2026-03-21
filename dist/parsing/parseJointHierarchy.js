"use strict";
/**
 * Parses URDF to get hierarchical joint structure.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseJointHierarchyFromDocument = parseJointHierarchyFromDocument;
exports.parseJointHierarchy = parseJointHierarchy;
const urdfParser_1 = require("./urdfParser");
function parseJointHierarchyFromDocument(xmlDoc) {
    const validation = (0, urdfParser_1.validateURDFDocument)(xmlDoc);
    if (!validation.robot) {
        console.error(validation.error);
        return { rootJoints: [], allJoints: new Map(), orderedJoints: [] };
    }
    const allJoints = new Map();
    const linkToJoint = new Map(); // child link -> joint name
    const jointToParentJoint = new Map(); // joint name -> parent joint name
    const orderedJoints = [];
    // First pass: collect all joints in URDF order.
    const jointElements = (0, urdfParser_1.getDirectChildrenByTag)(validation.robot, "joint");
    let orderIndex = 0;
    jointElements.forEach((joint) => {
        const name = joint.getAttribute("name");
        const type = joint.getAttribute("type") || "unknown";
        const parent = joint.querySelector("parent")?.getAttribute("link");
        const child = joint.querySelector("child")?.getAttribute("link");
        if (name && parent && child) {
            const jointNode = {
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
    // Find root links (links that are not children of any joint).
    const allLinks = new Set();
    (0, urdfParser_1.getDirectChildrenByTag)(validation.robot, "link").forEach((link) => {
        const name = link.getAttribute("name");
        if (name)
            allLinks.add(name);
    });
    const childLinks = new Set(linkToJoint.keys());
    const rootLinks = new Set(Array.from(allLinks).filter((link) => !childLinks.has(link)));
    // Build parent/child joint relationships.
    allJoints.forEach((joint) => {
        const parentJointName = linkToJoint.get(joint.parentLink);
        if (!parentJointName) {
            return;
        }
        const parentJoint = allJoints.get(parentJointName);
        if (!parentJoint) {
            return;
        }
        jointToParentJoint.set(joint.jointName, parentJointName);
        parentJoint.children.push(joint);
    });
    // Calculate depth for each joint.
    const calculateDepth = (jointName, visited = new Set()) => {
        if (visited.has(jointName)) {
            const joint = allJoints.get(jointName);
            return joint?.depth ?? 0;
        }
        visited.add(jointName);
        const joint = allJoints.get(jointName);
        if (!joint)
            return 0;
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
    // Build hierarchy and root joints.
    const rootJoints = orderedJoints.filter((joint) => rootLinks.has(joint.parentLink));
    // Sort joints by depth and original URDF order.
    orderedJoints.sort((a, b) => {
        if (a.depth !== b.depth)
            return a.depth - b.depth;
        return a.order - b.order;
    });
    return {
        rootJoints,
        allJoints,
        orderedJoints,
    };
}
function parseJointHierarchy(urdfContent) {
    const parsed = (0, urdfParser_1.parseURDF)(urdfContent);
    if (!parsed.isValid) {
        return { rootJoints: [], allJoints: new Map(), orderedJoints: [] };
    }
    return parseJointHierarchyFromDocument(parsed.document);
}
