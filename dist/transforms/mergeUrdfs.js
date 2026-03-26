"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildAssemblyUrdf = exports.mergeAssemblySpec = exports.mergeUrdfs = void 0;
const urdfParser_1 = require("../parsing/urdfParser");
const assemblySpec_1 = require("./assemblySpec");
const sanitizeToken = (value, fallback) => {
    const normalized = value
        .trim()
        .replace(/[^A-Za-z0-9_]+/g, "_")
        .replace(/^_+|_+$/g, "");
    if (!normalized) {
        return fallback;
    }
    if (/^[0-9]/.test(normalized)) {
        return `m_${normalized}`;
    }
    return normalized;
};
const getRobotElement = (document) => document.querySelector("robot");
const getRobotChildElementsByTag = (robot, tagName) => Array.from(robot.children).filter((element) => element.tagName.toLowerCase() === tagName.toLowerCase());
const renameMaterialReferences = (node, materialMap) => {
    node.querySelectorAll("material[name]").forEach((material) => {
        const materialName = material.getAttribute("name");
        if (!materialName) {
            return;
        }
        const mappedName = materialMap.get(materialName);
        if (mappedName) {
            material.setAttribute("name", mappedName);
        }
    });
};
const mergeUrdfs = (models, options = {}) => {
    const spec = (0, assemblySpec_1.createAssemblySpec)(models.map((model) => ({
        id: model.id,
        name: model.name,
        urdfContent: model.urdfContent,
    })), {
        robotName: options.robotName,
        spacing: options.spacing,
    });
    spec.robots = spec.robots.map((robot, index) => {
        const model = models[index];
        if (!model) {
            return robot;
        }
        return {
            ...robot,
            mount: {
                xyz: model.origin?.xyz || [model.originX ?? robot.mount?.xyz[0] ?? index * 1.5, 0, 0],
                rpy: model.origin?.rpy || robot.mount?.rpy || [0, 0, 0],
            },
        };
    });
    return (0, exports.mergeAssemblySpec)(spec);
};
exports.mergeUrdfs = mergeUrdfs;
const mergeAssemblySpec = (spec) => {
    const validation = (0, assemblySpec_1.validateAssemblySpec)(spec);
    if (!validation.isValid) {
        return {
            success: false,
            content: "",
            robotName: spec.robotName,
            merged: [],
            error: validation.errors.join(" "),
        };
    }
    const outputParsed = (0, urdfParser_1.parseURDF)(`<robot name="${spec.robotName}"></robot>`);
    if (!outputParsed.isValid) {
        return {
            success: false,
            content: "",
            robotName: spec.robotName,
            merged: [],
            error: outputParsed.error || "Failed to create merged URDF document.",
        };
    }
    const outputRobot = getRobotElement(outputParsed.document);
    if (!outputRobot) {
        return {
            success: false,
            content: "",
            robotName: spec.robotName,
            merged: [],
            error: "Failed to create merged URDF document.",
        };
    }
    const robotName = sanitizeToken(spec.robotName || "assembled_robot", "assembled_robot");
    outputRobot.setAttribute("name", robotName);
    const assemblyRootLink = outputParsed.document.createElement("link");
    assemblyRootLink.setAttribute("name", "assembly_root");
    outputRobot.appendChild(assemblyRootLink);
    const merged = [];
    for (const [index, model] of spec.robots.entries()) {
        const parsed = (0, urdfParser_1.parseURDF)(model.urdfContent);
        if (!parsed.isValid) {
            return {
                success: false,
                content: "",
                robotName,
                merged,
                error: `Failed to parse URDF for "${model.name}": ${parsed.error || "Unknown parse error"}`,
            };
        }
        const sourceRobot = getRobotElement(parsed.document);
        if (!sourceRobot) {
            return {
                success: false,
                content: "",
                robotName,
                merged,
                error: `Missing <robot> tag in "${model.name}".`,
            };
        }
        const prefix = sanitizeToken(model.id || model.name, `model_${index + 1}`);
        const sourceLinks = getRobotChildElementsByTag(sourceRobot, "link");
        const sourceJoints = getRobotChildElementsByTag(sourceRobot, "joint");
        const sourceMaterials = getRobotChildElementsByTag(sourceRobot, "material");
        if (sourceLinks.length === 0) {
            return {
                success: false,
                content: "",
                robotName,
                merged,
                error: `No links found in "${model.name}".`,
            };
        }
        const linkMap = new Map();
        sourceLinks.forEach((link) => {
            const sourceName = link.getAttribute("name");
            if (sourceName) {
                linkMap.set(sourceName, `${prefix}__${sourceName}`);
            }
        });
        const jointMap = new Map();
        sourceJoints.forEach((joint) => {
            const sourceName = joint.getAttribute("name");
            if (sourceName) {
                jointMap.set(sourceName, `${prefix}__${sourceName}`);
            }
        });
        const materialMap = new Map();
        sourceMaterials.forEach((material) => {
            const sourceName = material.getAttribute("name");
            if (sourceName) {
                materialMap.set(sourceName, `${prefix}__${sourceName}`);
            }
        });
        sourceMaterials.forEach((material) => {
            const clone = material.cloneNode(true);
            const sourceName = material.getAttribute("name");
            const mappedName = sourceName ? materialMap.get(sourceName) : null;
            if (mappedName) {
                clone.setAttribute("name", mappedName);
            }
            outputRobot.appendChild(clone);
        });
        sourceLinks.forEach((link) => {
            const clone = link.cloneNode(true);
            const sourceName = link.getAttribute("name");
            const mappedName = sourceName ? linkMap.get(sourceName) : null;
            if (mappedName) {
                clone.setAttribute("name", mappedName);
            }
            renameMaterialReferences(clone, materialMap);
            outputRobot.appendChild(clone);
        });
        sourceJoints.forEach((joint) => {
            const clone = joint.cloneNode(true);
            const sourceName = joint.getAttribute("name");
            const mappedJointName = sourceName ? jointMap.get(sourceName) : null;
            if (mappedJointName) {
                clone.setAttribute("name", mappedJointName);
            }
            const parentElement = clone.querySelector("parent");
            const parentLink = parentElement?.getAttribute("link");
            const mappedParent = parentLink ? linkMap.get(parentLink) : null;
            if (parentElement && mappedParent) {
                parentElement.setAttribute("link", mappedParent);
            }
            const childElement = clone.querySelector("child");
            const childLink = childElement?.getAttribute("link");
            const mappedChild = childLink ? linkMap.get(childLink) : null;
            if (childElement && mappedChild) {
                childElement.setAttribute("link", mappedChild);
            }
            const mimicElement = clone.querySelector("mimic");
            const mimicJoint = mimicElement?.getAttribute("joint");
            const mappedMimicJoint = mimicJoint ? jointMap.get(mimicJoint) : null;
            if (mimicElement && mappedMimicJoint) {
                mimicElement.setAttribute("joint", mappedMimicJoint);
            }
            outputRobot.appendChild(clone);
        });
        const childLinkNames = new Set();
        sourceJoints.forEach((joint) => {
            const childLink = joint.querySelector("child")?.getAttribute("link");
            if (childLink) {
                childLinkNames.add(childLink);
            }
        });
        const sourceBaseLinkName = sourceLinks
            .map((link) => link.getAttribute("name"))
            .find((linkName) => Boolean(linkName && !childLinkNames.has(linkName))) ||
            sourceLinks[0].getAttribute("name");
        if (!sourceBaseLinkName) {
            return {
                success: false,
                content: "",
                robotName,
                merged,
                error: `Failed to determine base link for "${model.name}".`,
            };
        }
        const baseLinkName = linkMap.get(sourceBaseLinkName);
        if (!baseLinkName) {
            return {
                success: false,
                content: "",
                robotName,
                merged,
                error: `Failed to map base link for "${model.name}".`,
            };
        }
        const mountJointName = `${prefix}__mount`;
        const mountJoint = outputParsed.document.createElement("joint");
        mountJoint.setAttribute("name", mountJointName);
        mountJoint.setAttribute("type", "fixed");
        const parent = outputParsed.document.createElement("parent");
        parent.setAttribute("link", "assembly_root");
        mountJoint.appendChild(parent);
        const child = outputParsed.document.createElement("child");
        child.setAttribute("link", baseLinkName);
        mountJoint.appendChild(child);
        const origin = outputParsed.document.createElement("origin");
        const mountXyz = model.mount?.xyz || [index * 1.5, 0, 0];
        const mountRpy = model.mount?.rpy || [0, 0, 0];
        origin.setAttribute("xyz", `${mountXyz[0]} ${mountXyz[1]} ${mountXyz[2]}`);
        origin.setAttribute("rpy", `${mountRpy[0]} ${mountRpy[1]} ${mountRpy[2]}`);
        mountJoint.appendChild(origin);
        outputRobot.appendChild(mountJoint);
        merged.push({
            id: model.id,
            name: model.name,
            prefix,
            baseLinkName,
            mountJointName,
        });
    }
    return {
        success: true,
        content: (0, urdfParser_1.serializeURDF)(outputParsed.document),
        robotName,
        merged,
    };
};
exports.mergeAssemblySpec = mergeAssemblySpec;
const buildAssemblyUrdf = (modelsOrSpec, options = {}) => {
    const result = Array.isArray(modelsOrSpec)
        ? (0, exports.mergeUrdfs)(modelsOrSpec, options)
        : (0, exports.mergeAssemblySpec)(modelsOrSpec);
    if (!result.success) {
        throw new Error(result.error || "Failed to build assembly URDF.");
    }
    return result.content;
};
exports.buildAssemblyUrdf = buildAssemblyUrdf;
