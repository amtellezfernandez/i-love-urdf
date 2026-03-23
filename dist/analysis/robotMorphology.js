"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeRobotMorphology = exports.buildRobotStructureLabels = exports.getJointTypeDegreesOfFreedom = exports.isControllableJointType = void 0;
const CONTROLLABLE_JOINT_TYPES = new Set([
    "revolute",
    "continuous",
    "prismatic",
    "planar",
    "floating",
]);
const JOINT_TYPE_DOF = {
    revolute: 1,
    continuous: 1,
    prismatic: 1,
    planar: 2,
    floating: 6,
};
const BODY_LINK_PATTERN = /(base|body|torso|chassis|trunk|pelvis)/i;
const ARM_SIGNAL_PATTERN = /(arm|shoulder|elbow|wrist|gripper|hand|tool|flange|ee)/i;
const LEG_SIGNAL_PATTERN = /(leg|hip|knee|ankle|thigh|calf|foot|paw)/i;
const WHEEL_SIGNAL_PATTERN = /(wheel|caster|drive|tire)/i;
const SIDE_LEFT_PATTERN = /(?:^|[_\-\s])(left|l)(?:$|[_\-\s])/i;
const SIDE_RIGHT_PATTERN = /(?:^|[_\-\s])(right|r)(?:$|[_\-\s])/i;
const SIDE_FRONT_PATTERN = /(?:^|[_\-\s])(front|f)(?:$|[_\-\s])/i;
const SIDE_REAR_PATTERN = /(?:^|[_\-\s])(rear|back|rr)(?:$|[_\-\s])/i;
const MAX_BODY_DEPTH_FROM_ROOT = 1;
const WHEEL_CONTINUOUS_RATIO_THRESHOLD = 0.6;
const WHEEL_DEPTH_THRESHOLD = 1;
const WHEEL_BRANCH_MAX_JOINTS = 2;
const createEmptyStructureLabels = () => ({
    linkByName: {},
    jointByName: {},
});
const sideSortOrder = {
    left: 0,
    right: 1,
    front: 2,
    rear: 3,
    center: 4,
};
const isControllableJointType = (jointType) => CONTROLLABLE_JOINT_TYPES.has(String(jointType || "").toLowerCase());
exports.isControllableJointType = isControllableJointType;
const getJointTypeDegreesOfFreedom = (jointType) => JOINT_TYPE_DOF[String(jointType || "").toLowerCase()] ?? 0;
exports.getJointTypeDegreesOfFreedom = getJointTypeDegreesOfFreedom;
const getSideScore = (names, pattern) => names.reduce((score, value) => score + (pattern.test(value) ? 1 : 0), 0);
const getSideHint = (names) => {
    const leftScore = getSideScore(names, SIDE_LEFT_PATTERN);
    const rightScore = getSideScore(names, SIDE_RIGHT_PATTERN);
    const frontScore = getSideScore(names, SIDE_FRONT_PATTERN);
    const rearScore = getSideScore(names, SIDE_REAR_PATTERN);
    const maxScore = Math.max(leftScore, rightScore, frontScore, rearScore);
    if (maxScore <= 0)
        return "center";
    if (leftScore === maxScore)
        return "left";
    if (rightScore === maxScore)
        return "right";
    if (frontScore === maxScore)
        return "front";
    return "rear";
};
const computeLinkDepthFromRoots = (roots, parentToJoints) => {
    const depthByLink = new Map();
    const queue = roots.map((link) => ({
        link,
        depth: 0,
    }));
    while (queue.length > 0) {
        const next = queue.shift();
        if (!next)
            break;
        const existingDepth = depthByLink.get(next.link);
        if (existingDepth !== undefined && existingDepth <= next.depth) {
            continue;
        }
        depthByLink.set(next.link, next.depth);
        const children = parentToJoints.get(next.link) ?? [];
        children.forEach((joint) => {
            queue.push({ link: joint.childLink, depth: next.depth + 1 });
        });
    }
    return depthByLink;
};
const collectBranchRootJoints = (bodyLinks, parentToJoints) => {
    const branchRoots = new Map();
    bodyLinks.forEach((startLink) => {
        const stack = [startLink];
        const visitedLinks = new Set();
        while (stack.length > 0) {
            const currentLink = stack.pop();
            if (!currentLink || visitedLinks.has(currentLink))
                continue;
            visitedLinks.add(currentLink);
            const joints = parentToJoints.get(currentLink) ?? [];
            joints.forEach((joint) => {
                if ((0, exports.isControllableJointType)(joint.type)) {
                    branchRoots.set(joint.jointName, joint);
                    return;
                }
                stack.push(joint.childLink);
            });
        }
    });
    return Array.from(branchRoots.values());
};
const classifyBranch = (rootJoint, parentToJoints) => {
    const linkNames = new Set();
    const jointNames = new Set();
    const queue = [rootJoint];
    const visitedJoints = new Set();
    let maxDepth = 0;
    let totalJoints = 0;
    let continuousJoints = 0;
    let armSignals = 0;
    let legSignals = 0;
    let wheelSignals = 0;
    while (queue.length > 0) {
        const joint = queue.shift();
        if (!joint || visitedJoints.has(joint.jointName))
            continue;
        visitedJoints.add(joint.jointName);
        jointNames.add(joint.jointName);
        linkNames.add(joint.childLink);
        totalJoints += 1;
        maxDepth = Math.max(maxDepth, joint.depth - rootJoint.depth + 1);
        if (joint.type.toLowerCase() === "continuous") {
            continuousJoints += 1;
        }
        if (ARM_SIGNAL_PATTERN.test(joint.jointName) || ARM_SIGNAL_PATTERN.test(joint.childLink)) {
            armSignals += 1;
        }
        if (LEG_SIGNAL_PATTERN.test(joint.jointName) || LEG_SIGNAL_PATTERN.test(joint.childLink)) {
            legSignals += 1;
        }
        if (WHEEL_SIGNAL_PATTERN.test(joint.jointName) || WHEEL_SIGNAL_PATTERN.test(joint.childLink)) {
            wheelSignals += 1;
        }
        const children = parentToJoints.get(joint.childLink) ?? [];
        children.forEach((childJoint) => queue.push(childJoint));
    }
    const continuousRatio = totalJoints > 0 ? continuousJoints / totalJoints : 0;
    const wheelByTopologyFallback = continuousRatio >= WHEEL_CONTINUOUS_RATIO_THRESHOLD &&
        maxDepth <= WHEEL_DEPTH_THRESHOLD &&
        totalJoints <= WHEEL_BRANCH_MAX_JOINTS &&
        armSignals === 0 &&
        legSignals === 0;
    const kind = wheelSignals > 0 || wheelByTopologyFallback
        ? "wheel"
        : legSignals > armSignals
            ? "leg"
            : "arm";
    return {
        rootJoint,
        linkNames,
        jointNames,
        kind,
        side: getSideHint([...jointNames, ...linkNames]),
    };
};
const sortBranches = (lhs, rhs) => {
    if (lhs.kind !== rhs.kind)
        return lhs.kind.localeCompare(rhs.kind);
    if (lhs.side !== rhs.side)
        return sideSortOrder[lhs.side] - sideSortOrder[rhs.side];
    return lhs.rootJoint.order - rhs.rootJoint.order;
};
const computeRobotStructure = (analysis) => {
    const labels = createEmptyStructureLabels();
    if (!analysis?.isValid) {
        return { labels, armCount: 0, legCount: 0, wheelCount: 0 };
    }
    const orderedJoints = analysis.jointHierarchy.orderedJoints ?? [];
    if (orderedJoints.length === 0) {
        const firstRoot = analysis.rootLinks[0];
        if (firstRoot) {
            labels.linkByName[firstRoot] = "base";
        }
        return { labels, armCount: 0, legCount: 0, wheelCount: 0 };
    }
    const parentToJoints = new Map();
    orderedJoints.forEach((joint) => {
        const byParent = parentToJoints.get(joint.parentLink);
        if (byParent) {
            byParent.push(joint);
        }
        else {
            parentToJoints.set(joint.parentLink, [joint]);
        }
    });
    const roots = analysis.rootLinks.length > 0 ? analysis.rootLinks : [analysis.linkNames[0] ?? ""];
    const validRoots = roots.map((name) => name.trim()).filter(Boolean);
    const depthByLink = computeLinkDepthFromRoots(validRoots, parentToJoints);
    const bodyLinks = new Set(validRoots);
    analysis.linkNames.forEach((linkName) => {
        const depth = depthByLink.get(linkName);
        if (depth !== undefined &&
            depth <= MAX_BODY_DEPTH_FROM_ROOT &&
            BODY_LINK_PATTERN.test(linkName)) {
            bodyLinks.add(linkName);
        }
    });
    validRoots.forEach((linkName, index) => {
        labels.linkByName[linkName] = index === 0 ? "base" : `body${index}`;
    });
    Array.from(bodyLinks)
        .filter((name) => !labels.linkByName[name])
        .sort((lhs, rhs) => lhs.localeCompare(rhs))
        .forEach((linkName, index) => {
        labels.linkByName[linkName] = `body${index + 1}`;
    });
    let branchRoots = collectBranchRootJoints(bodyLinks, parentToJoints);
    if (branchRoots.length === 0) {
        branchRoots = orderedJoints.filter((joint) => (0, exports.isControllableJointType)(joint.type));
    }
    const branches = branchRoots.map((rootJoint) => classifyBranch(rootJoint, parentToJoints));
    const kindCounts = {
        arm: 0,
        leg: 0,
        wheel: 0,
    };
    branches.sort(sortBranches).forEach((branch) => {
        kindCounts[branch.kind] += 1;
        const label = `${branch.kind}${kindCounts[branch.kind]}`;
        branch.linkNames.forEach((linkName) => {
            if (!labels.linkByName[linkName]) {
                labels.linkByName[linkName] = label;
            }
        });
        branch.jointNames.forEach((jointName) => {
            if (!labels.jointByName[jointName]) {
                labels.jointByName[jointName] = label;
            }
        });
    });
    return {
        labels,
        armCount: kindCounts.arm,
        legCount: kindCounts.leg,
        wheelCount: kindCounts.wheel,
    };
};
const buildMorphologyFamilies = ({ armCount, legCount, wheelCount, }) => {
    const families = [];
    const isQuadrupedLike = legCount >= 4;
    const isHumanoidLike = legCount >= 2 && armCount >= 1 && !isQuadrupedLike;
    const isWheeledLike = wheelCount > 0;
    const isMobileManipulatorLike = wheelCount > 0 && armCount > 0;
    const isManipulatorLike = armCount > 0 && legCount === 0 && wheelCount === 0;
    const isLeggedLike = legCount > 0 && !isQuadrupedLike && !isHumanoidLike;
    const isObjectLike = armCount === 0 && legCount === 0 && wheelCount === 0;
    if (isHumanoidLike)
        families.push("humanoid-like");
    if (isQuadrupedLike)
        families.push("quadruped-like");
    if (isMobileManipulatorLike)
        families.push("mobile-manipulator");
    if (isWheeledLike)
        families.push("wheeled");
    if (isManipulatorLike)
        families.push("manipulator");
    if (isLeggedLike)
        families.push("legged");
    if (isObjectLike)
        families.push("object-like");
    if (families.length === 0)
        families.push("other");
    return {
        primaryFamily: families[0] ?? "other",
        families,
        isHumanoidLike,
        isQuadrupedLike,
        isWheeledLike,
        isMobileManipulatorLike,
    };
};
const buildRobotStructureLabels = (analysis) => {
    return computeRobotStructure(analysis).labels;
};
exports.buildRobotStructureLabels = buildRobotStructureLabels;
const analyzeRobotMorphology = (analysis) => {
    const structure = computeRobotStructure(analysis);
    const orderedJoints = analysis?.jointHierarchy.orderedJoints ?? [];
    const controllableJointCount = orderedJoints.filter((joint) => (0, exports.isControllableJointType)(joint.type)).length;
    const dofCount = orderedJoints.reduce((total, joint) => total + (0, exports.getJointTypeDegreesOfFreedom)(joint.type), 0);
    const families = buildMorphologyFamilies({
        armCount: structure.armCount,
        legCount: structure.legCount,
        wheelCount: structure.wheelCount,
    });
    return {
        structureLabels: structure.labels,
        linkCount: analysis?.linkNames.length ?? 0,
        jointCount: orderedJoints.length,
        controllableJointCount,
        dofCount,
        armCount: structure.armCount,
        legCount: structure.legCount,
        wheelCount: structure.wheelCount,
        primaryFamily: families.primaryFamily,
        families: families.families,
        isHumanoidLike: families.isHumanoidLike,
        isQuadrupedLike: families.isQuadrupedLike,
        isWheeledLike: families.isWheeledLike,
        isMobileManipulatorLike: families.isMobileManipulatorLike,
    };
};
exports.analyzeRobotMorphology = analyzeRobotMorphology;
