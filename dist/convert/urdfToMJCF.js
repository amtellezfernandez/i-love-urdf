"use strict";
/**
 * URDF to MJCF converter.
 *
 * Converts URDF robot descriptions to MJCF.
 * Based on the structure used by urdf2mjcf (https://github.com/kscalelabs/urdf2mjcf)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertURDFToMJCF = convertURDFToMJCF;
const urdfParser_1 = require("../parsing/urdfParser");
function createMjcfDiagnostic(code, linkName, message) {
    return { code, severity: "warning", linkName, message };
}
const MJCF_VISUAL_GEOM_GROUP = "1";
const MJCF_HIDDEN_COLLISION_GEOM_GROUP = "3";
const MIN_MJCF_MASS = 1e-9;
const MIN_MJCF_DIAGONAL_INERTIA = 1e-12;
const MJCF_INERTIA_SCALE_FLOOR_RATIO = 1e-6;
function xmlAttr(value) {
    return value
        .replace(/&(?!amp;|quot;|lt;|gt;|apos;|#\d+;|#x[\da-fA-F]+;)/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}
/**
 * Parses origin element to extract position and rotation
 */
function parseOrigin(element) {
    if (!element) {
        return { xyz: [0, 0, 0], rpy: [0, 0, 0] };
    }
    const xyzStr = element.getAttribute("xyz") || "0 0 0";
    const rpyStr = element.getAttribute("rpy") || "0 0 0";
    const xyz = xyzStr.split(/\s+/).map((v) => parseFloat(v) || 0);
    const rpy = rpyStr.split(/\s+/).map((v) => parseFloat(v) || 0);
    return { xyz, rpy };
}
function parseRgbaString(value) {
    if (!value)
        return null;
    const components = value
        .split(/\s+/)
        .map((entry) => parseFloat(entry))
        .filter((entry) => Number.isFinite(entry));
    if (components.length === 3) {
        return [components[0], components[1], components[2], 1];
    }
    if (components.length === 4) {
        return components;
    }
    return null;
}
function forceOpaqueRgba(rgba) {
    if (!rgba || rgba.length < 3)
        return rgba;
    return [rgba[0], rgba[1], rgba[2], 1];
}
function parseMaterialRgba(parentElement, xmlDoc) {
    const material = parentElement.querySelector("material");
    if (!material)
        return undefined;
    const inlineColor = parseRgbaString(material.querySelector("color")?.getAttribute("rgba") || null);
    if (inlineColor) {
        return forceOpaqueRgba(inlineColor) ?? undefined;
    }
    const materialName = material.getAttribute("name");
    if (!materialName)
        return undefined;
    const robot = xmlDoc.querySelector("robot");
    const materialDef = robot
        ? (0, urdfParser_1.getDirectChildrenByTag)(robot, "material").find((candidate) => candidate.getAttribute("name") === materialName) ?? null
        : null;
    const referencedColor = parseRgbaString(materialDef?.querySelector("color")?.getAttribute("rgba") || null);
    return forceOpaqueRgba(referencedColor) ?? undefined;
}
/**
 * Converts RPY (roll-pitch-yaw) to quaternion for MJCF.
 */
function rpyToQuat(rpy) {
    const [roll, pitch, yaw] = rpy;
    const cr = Math.cos(roll / 2);
    const sr = Math.sin(roll / 2);
    const cp = Math.cos(pitch / 2);
    const sp = Math.sin(pitch / 2);
    const cy = Math.cos(yaw / 2);
    const sy = Math.sin(yaw / 2);
    const w = cr * cp * cy + sr * sp * sy;
    const x = sr * cp * cy - cr * sp * sy;
    const y = cr * sp * cy + sr * cp * sy;
    const z = cr * cp * sy - sr * sp * cy;
    return [w, x, y, z];
}
function rpyToRotationMatrix(rpy) {
    const [roll, pitch, yaw] = rpy;
    const cr = Math.cos(roll);
    const sr = Math.sin(roll);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    return [
        [cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr],
        [sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr],
        [-sp, cp * sr, cp * cr],
    ];
}
function multiplyMatrix3(a, b) {
    const out = Array.from({ length: 3 }, () => [0, 0, 0]);
    for (let row = 0; row < 3; row += 1) {
        for (let col = 0; col < 3; col += 1) {
            let value = 0;
            for (let inner = 0; inner < 3; inner += 1) {
                value += a[row][inner] * b[inner][col];
            }
            out[row][col] = value;
        }
    }
    return out;
}
function transposeMatrix3(matrix) {
    return [
        [matrix[0][0], matrix[1][0], matrix[2][0]],
        [matrix[0][1], matrix[1][1], matrix[2][1]],
        [matrix[0][2], matrix[1][2], matrix[2][2]],
    ];
}
function rotateInertiaToLinkFrame(inertia, rpy) {
    const local = [
        [inertia.ixx, inertia.ixy, inertia.ixz],
        [inertia.ixy, inertia.iyy, inertia.iyz],
        [inertia.ixz, inertia.iyz, inertia.izz],
    ];
    const rotation = rpyToRotationMatrix(rpy);
    const rotated = multiplyMatrix3(multiplyMatrix3(rotation, local), transposeMatrix3(rotation));
    return {
        ixx: rotated[0][0],
        iyy: rotated[1][1],
        izz: rotated[2][2],
        ixy: rotated[0][1],
        ixz: rotated[0][2],
        iyz: rotated[1][2],
    };
}
function hasPositiveDefiniteInertia(inertia) {
    const { ixx, iyy, izz, ixy, ixz, iyz } = inertia;
    if (!Number.isFinite(ixx) ||
        !Number.isFinite(iyy) ||
        !Number.isFinite(izz) ||
        !Number.isFinite(ixy) ||
        !Number.isFinite(ixz) ||
        !Number.isFinite(iyz)) {
        return false;
    }
    if (ixx <= MIN_MJCF_DIAGONAL_INERTIA) {
        return false;
    }
    const determinant2x2 = ixx * iyy - ixy * ixy;
    if (determinant2x2 <= MIN_MJCF_DIAGONAL_INERTIA) {
        return false;
    }
    const determinant3x3 = ixx * (iyy * izz - iyz * iyz) -
        ixy * (ixy * izz - ixz * iyz) +
        ixz * (ixy * iyz - ixz * iyy);
    return determinant3x3 > MIN_MJCF_DIAGONAL_INERTIA;
}
function regularizeDiagonalInertia(inertia) {
    const baseScale = Math.max(Math.abs(inertia.ixx), Math.abs(inertia.iyy), Math.abs(inertia.izz), Math.abs(inertia.ixy), Math.abs(inertia.ixz), Math.abs(inertia.iyz)) || 1;
    const floor = Math.max(MIN_MJCF_DIAGONAL_INERTIA, baseScale * MJCF_INERTIA_SCALE_FLOOR_RATIO);
    return [
        Math.max(Math.abs(inertia.ixx), floor),
        Math.max(Math.abs(inertia.iyy), floor),
        Math.max(Math.abs(inertia.izz), floor),
    ];
}
function formatDiagonalInertia(indent, mass, pos, diaginertia) {
    return (`${indent}<inertial pos="${xmlAttr(pos)}" mass="${mass.toFixed(12)}" ` +
        `diaginertia="${diaginertia[0].toFixed(12)} ` +
        `${diaginertia[1].toFixed(12)} ${diaginertia[2].toFixed(12)}"/>`);
}
function inertialToMJCF(indent, inertial, context) {
    const warnings = [];
    const diagnostics = [];
    const normalizedMass = Number.isFinite(inertial.mass) ? inertial.mass : 0;
    const ipos = inertial.origin.xyz.join(" ");
    const rotated = rotateInertiaToLinkFrame(inertial.inertia, inertial.origin.rpy);
    const hasValidMass = normalizedMass > MIN_MJCF_MASS;
    const hasValidInertia = hasPositiveDefiniteInertia(rotated);
    if (hasValidMass && hasValidInertia) {
        return {
            xml: `${indent}<inertial pos="${xmlAttr(ipos)}" ` +
                `mass="${normalizedMass.toFixed(6)}" ` +
                `fullinertia="${rotated.ixx.toFixed(6)} ${rotated.iyy.toFixed(6)} ${rotated.izz.toFixed(6)} ` +
                `${rotated.ixy.toFixed(6)} ${rotated.ixz.toFixed(6)} ${rotated.iyz.toFixed(6)}"/>`,
            warnings,
            diagnostics,
        };
    }
    if (context.omitInvalidFrameInertial) {
        const message = `Omitted invalid inertial for frame-only link "${context.linkName}" during MJCF export.`;
        warnings.push(message);
        diagnostics.push(createMjcfDiagnostic("mjcf.inertial.omitted_frame", context.linkName, message));
        return { xml: null, warnings, diagnostics };
    }
    const message = `Regularized invalid inertial for link "${context.linkName}" during MJCF export.`;
    warnings.push(message);
    diagnostics.push(createMjcfDiagnostic("mjcf.inertial.regularized", context.linkName, message));
    return {
        xml: formatDiagonalInertia(indent, Math.max(normalizedMass, MIN_MJCF_MASS), ipos, regularizeDiagonalInertia(rotated)),
        warnings,
        diagnostics,
    };
}
function shouldOmitInvalidFrameInertial(link, incomingJointType) {
    const hasGeometry = link.visuals.length > 0 || link.collisions.length > 0;
    return !hasGeometry && !incomingJointType;
}
/**
 * Parses a link element from URDF
 */
function parseLink(linkElement, xmlDoc) {
    const name = linkElement.getAttribute("name") || "unnamed_link";
    const linkData = {
        name,
        visuals: [],
        collisions: [],
    };
    // Parse inertial
    const inertialEl = linkElement.querySelector("inertial");
    if (inertialEl) {
        const massEl = inertialEl.querySelector("mass");
        const inertiaEl = inertialEl.querySelector("inertia");
        const originEl = inertialEl.querySelector("origin");
        if (massEl && inertiaEl) {
            linkData.inertial = {
                mass: parseFloat(massEl.getAttribute("value") || "1"),
                origin: parseOrigin(originEl),
                inertia: {
                    ixx: parseFloat(inertiaEl.getAttribute("ixx") || "0.001"),
                    ixy: parseFloat(inertiaEl.getAttribute("ixy") || "0"),
                    ixz: parseFloat(inertiaEl.getAttribute("ixz") || "0"),
                    iyy: parseFloat(inertiaEl.getAttribute("iyy") || "0.001"),
                    iyz: parseFloat(inertiaEl.getAttribute("iyz") || "0"),
                    izz: parseFloat(inertiaEl.getAttribute("izz") || "0.001"),
                },
            };
        }
    }
    // Parse visuals
    const visualEls = linkElement.querySelectorAll("visual");
    for (const visual of visualEls) {
        const geom = parseGeometry(visual, xmlDoc);
        if (geom)
            linkData.visuals.push(geom);
    }
    // Parse collisions
    const collisionEls = linkElement.querySelectorAll("collision");
    for (const collision of collisionEls) {
        const geom = parseGeometry(collision, xmlDoc);
        if (geom)
            linkData.collisions.push(geom);
    }
    return linkData;
}
/**
 * Parses geometry from visual or collision element
 */
function parseGeometry(parentElement, xmlDoc) {
    const geometryEl = parentElement.querySelector("geometry");
    if (!geometryEl)
        return null;
    const originEl = parentElement.querySelector("origin");
    const origin = parseOrigin(originEl);
    const rgba = parentElement.tagName === "visual" ? parseMaterialRgba(parentElement, xmlDoc) : undefined;
    // Check for different geometry types
    const box = geometryEl.querySelector("box");
    if (box) {
        const sizeStr = box.getAttribute("size") || "1 1 1";
        const size = sizeStr.split(/\s+/).map((v) => parseFloat(v) || 1);
        return { type: "box", origin, size, rgba };
    }
    const cylinder = geometryEl.querySelector("cylinder");
    if (cylinder) {
        const radius = parseFloat(cylinder.getAttribute("radius") || "1");
        const length = parseFloat(cylinder.getAttribute("length") || "1");
        return { type: "cylinder", origin, radius, length, rgba };
    }
    const sphere = geometryEl.querySelector("sphere");
    if (sphere) {
        const radius = parseFloat(sphere.getAttribute("radius") || "1");
        return { type: "sphere", origin, radius, rgba };
    }
    const mesh = geometryEl.querySelector("mesh");
    if (mesh) {
        const filename = mesh.getAttribute("filename") || "";
        const scaleStr = mesh.getAttribute("scale") || "1 1 1";
        const scale = scaleStr.split(/\s+/).map((v) => parseFloat(v) || 1);
        return { type: "mesh", origin, filename, scale, rgba };
    }
    return null;
}
/**
 * Parses a joint element from URDF
 */
function parseJoint(jointElement) {
    const name = jointElement.getAttribute("name") || "unnamed_joint";
    const type = jointElement.getAttribute("type") || "fixed";
    const parentEl = jointElement.querySelector("parent");
    const childEl = jointElement.querySelector("child");
    const originEl = jointElement.querySelector("origin");
    const axisEl = jointElement.querySelector("axis");
    const limitEl = jointElement.querySelector("limit");
    const parent = parentEl?.getAttribute("link") || "";
    const child = childEl?.getAttribute("link") || "";
    const origin = parseOrigin(originEl);
    const axisStr = axisEl?.getAttribute("xyz") || "1 0 0";
    const axis = axisStr.split(/\s+/).map((v) => parseFloat(v) || 0);
    const jointData = {
        name,
        type,
        parent,
        child,
        origin,
        axis,
    };
    if (limitEl) {
        jointData.limit = {
            lower: parseFloat(limitEl.getAttribute("lower") || "-3.14159"),
            upper: parseFloat(limitEl.getAttribute("upper") || "3.14159"),
            effort: parseFloat(limitEl.getAttribute("effort") || "100"),
            velocity: parseFloat(limitEl.getAttribute("velocity") || "1"),
        };
    }
    return jointData;
}
/**
 * Maps a URDF joint type to an MJCF joint type.
 */
function mapJointType(urdfType) {
    switch (urdfType) {
        case "revolute":
        case "continuous":
            return "hinge";
        case "prismatic":
            return "slide";
        case "fixed":
            return ""; // Fixed joints do not need a joint element in MJCF output.
        case "floating":
            return "free";
        case "planar":
            return "slide"; // Approximation
        default:
            return "hinge";
    }
}
/**
 * Converts URDF geometry to an MJCF geom string.
 */
function geometryToMJCF(geom, indent, groupType) {
    const quat = rpyToQuat(geom.origin.rpy || [0, 0, 0]);
    const pos = geom.origin.xyz.join(" ");
    const quatStr = quat.map((v) => v.toFixed(6)).join(" ");
    let geomStr = `${indent}<geom `;
    if (groupType === "visual") {
        geomStr += `group="${MJCF_VISUAL_GEOM_GROUP}" `;
    }
    else {
        geomStr += `group="${MJCF_HIDDEN_COLLISION_GEOM_GROUP}" `;
    }
    geomStr += `pos="${xmlAttr(pos)}" quat="${xmlAttr(quatStr)}" `;
    if (groupType === "visual" && Array.isArray(geom.rgba) && geom.rgba.length === 4) {
        geomStr += `rgba="${xmlAttr(geom.rgba.map((value) => value.toFixed(6)).join(" "))}" `;
    }
    switch (geom.type) {
        case "box": {
            // MJCF uses half-sizes.
            const halfSize = geom.size.map((s) => (s / 2).toFixed(6)).join(" ");
            geomStr += `type="box" size="${halfSize}"`;
            break;
        }
        case "cylinder": {
            // MJCF cylinder: radius, half-length.
            const cylSize = `${geom.radius.toFixed(6)} ${(geom.length / 2).toFixed(6)}`;
            geomStr += `type="cylinder" size="${cylSize}"`;
            break;
        }
        case "sphere":
            geomStr += `type="sphere" size="${geom.radius.toFixed(6)}"`;
            break;
        case "mesh": {
            const meshName = meshNameFromFilename(geom.filename);
            geomStr += `type="mesh" mesh="${xmlAttr(meshName)}"`;
            break;
        }
        default:
            geomStr += 'type="box" size="0.01 0.01 0.01"';
    }
    geomStr += "/>";
    return geomStr;
}
function meshNameFromFilename(filename) {
    const normalized = filename
        .replace(/\\/g, "/")
        .replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, "")
        .replace(/\.[^.\/]+$/, "")
        .replace(/[^a-zA-Z0-9_]+/g, "_")
        .replace(/^_+|_+$/g, "");
    return normalized || "mesh";
}
function meshFileFromFilename(filename) {
    return filename.split("/").pop() || filename;
}
function collectMeshAsset(meshAssets, geom, linkName, result) {
    if (geom.type !== "mesh" || !geom.filename)
        return;
    const meshName = meshNameFromFilename(geom.filename);
    const meshFile = meshFileFromFilename(geom.filename);
    const existing = meshAssets.get(meshName);
    if (!existing) {
        meshAssets.set(meshName, {
            name: meshName,
            file: meshFile,
            sourceFilename: geom.filename,
        });
        return;
    }
    if (existing.sourceFilename === geom.filename) {
        return;
    }
    const message = `MJCF export reused mesh asset name "${meshName}" for multiple URDF mesh references; ` +
        `keeping "${existing.sourceFilename}" and ignoring "${geom.filename}".`;
    result.warnings.push(message);
    result.diagnostics.push(createMjcfDiagnostic("mjcf.mesh.name_collision", linkName, message));
}
/**
 * Builds the kinematic tree structure
 */
function buildKinematicTree(links, joints) {
    const children = new Map();
    const hasParent = new Set();
    // Initialize children map
    for (const link of links.keys()) {
        children.set(link, []);
    }
    // Build parent-child relationships
    for (const joint of joints) {
        if (!children.has(joint.parent)) {
            children.set(joint.parent, []);
        }
        children.get(joint.parent).push(joint);
        hasParent.add(joint.child);
    }
    // Find root (link with no parent)
    let root = "";
    for (const link of links.keys()) {
        if (!hasParent.has(link)) {
            root = link;
            break;
        }
    }
    return { root, children };
}
/**
 * Recursively generates body for a joint's child
 */
function generateBodyRecursive(joint, links, childrenMap, indent, warnings, diagnostics) {
    const childLink = links.get(joint.child);
    if (!childLink) {
        return { xml: "", stats: { bodies: 0, joints: 0, geoms: 0 } };
    }
    const stats = { bodies: 1, joints: 0, geoms: 0 };
    const jpos = joint.origin.xyz.join(" ");
    const jquat = rpyToQuat(joint.origin.rpy)
        .map((v) => v.toFixed(6))
        .join(" ");
    let xml = `${indent}<body name="${xmlAttr(joint.child)}" pos="${xmlAttr(jpos)}" quat="${xmlAttr(jquat)}">\n`;
    // Add joint
    const mjType = mapJointType(joint.type);
    if (mjType) {
        xml += `${indent}  <joint name="${xmlAttr(joint.name)}" type="${xmlAttr(mjType)}" `;
        xml += `axis="${xmlAttr(joint.axis.join(" "))}" `;
        if (joint.limit && (joint.type === "revolute" || joint.type === "prismatic")) {
            xml += `range="${xmlAttr(`${joint.limit.lower.toFixed(6)} ${joint.limit.upper.toFixed(6)}`)}" `;
        }
        xml += "/>\n";
        stats.joints++;
    }
    // Add inertial
    if (childLink.inertial) {
        const emittedInertial = inertialToMJCF(`${indent}  `, childLink.inertial, {
            linkName: childLink.name,
            omitInvalidFrameInertial: shouldOmitInvalidFrameInertial(childLink, mjType || null),
        });
        warnings.push(...emittedInertial.warnings);
        diagnostics.push(...emittedInertial.diagnostics);
        if (emittedInertial.xml) {
            xml += `${emittedInertial.xml}\n`;
        }
    }
    // Add geometries
    for (const visual of childLink.visuals) {
        xml += geometryToMJCF(visual, indent + "  ", "visual") + "\n";
        stats.geoms++;
    }
    for (const collision of childLink.collisions) {
        xml += geometryToMJCF(collision, indent + "  ", "collision") + "\n";
        stats.geoms++;
    }
    // Process children recursively
    const subChildJoints = childrenMap.get(joint.child) || [];
    for (const subJoint of subChildJoints) {
        const subResult = generateBodyRecursive(subJoint, links, childrenMap, indent + "  ", warnings, diagnostics);
        xml += subResult.xml;
        stats.bodies += subResult.stats.bodies;
        stats.joints += subResult.stats.joints;
        stats.geoms += subResult.stats.geoms;
    }
    xml += `${indent}</body>\n`;
    return { xml, stats };
}
/**
 * Converts URDF to MJCF format
 */
function convertURDFToMJCF(urdfContent, options = {}) {
    const parsed = (0, urdfParser_1.parseURDF)(urdfContent);
    const result = {
        mjcfContent: "",
        warnings: [],
        diagnostics: [],
        stats: {
            bodiesCreated: 0,
            jointsConverted: 0,
            geometriesConverted: 0,
        },
    };
    if (!parsed.isValid) {
        result.warnings.push("Invalid URDF content");
        return result;
    }
    const validation = (0, urdfParser_1.validateURDFDocument)(parsed.document);
    if (!validation.robot) {
        result.warnings.push("No robot element found");
        return result;
    }
    const robot = validation.robot;
    const robotName = robot.getAttribute("name") || "robot";
    // Parse all links
    const links = new Map();
    const linkElements = (0, urdfParser_1.getDirectChildrenByTag)(robot, "link");
    for (const linkEl of linkElements) {
        const linkData = parseLink(linkEl, parsed.document);
        links.set(linkData.name, linkData);
    }
    // Parse all joints
    const joints = [];
    const jointElements = (0, urdfParser_1.getDirectChildrenByTag)(robot, "joint");
    for (const jointEl of jointElements) {
        joints.push(parseJoint(jointEl));
    }
    // Build kinematic tree
    const { root, children } = buildKinematicTree(links, joints);
    if (!root) {
        result.warnings.push("Could not find root link");
        return result;
    }
    // Collect mesh assets
    const meshAssets = new Map();
    for (const link of links.values()) {
        for (const visual of link.visuals) {
            collectMeshAsset(meshAssets, visual, link.name, result);
        }
        for (const collision of link.collisions) {
            collectMeshAsset(meshAssets, collision, link.name, result);
        }
    }
    // Generate MJCF
    let mjcf = `<?xml version="1.0"?>
<mujoco model="${xmlAttr(robotName)}">
  <compiler angle="radian" meshdir="meshes"/>
`;
    if (options.includeSimulationDefaults === true) {
        mjcf += `
  <option gravity="0 0 -9.81" timestep="0.001"/>

  <default>
    <joint damping="0.1"/>
    <geom contype="1" conaffinity="1" condim="3" friction="1 0.5 0.5"/>
  </default>
`;
    }
    mjcf += "\n";
    // Add assets section if there are meshes
    if (meshAssets.size > 0) {
        mjcf += `  <asset>\n`;
        for (const asset of meshAssets.values()) {
            mjcf += `      <mesh name="${xmlAttr(asset.name)}" file="${xmlAttr(asset.file)}"/>\n`;
        }
        mjcf += `  </asset>\n\n`;
    }
    // Generate worldbody
    mjcf += `  <worldbody>\n`;
    // Generate root body and all children
    const rootLink = links.get(root);
    if (rootLink) {
        mjcf += `    <body name="${xmlAttr(rootLink.name)}" pos="0 0 0">\n`;
        // Add inertial for root
        if (rootLink.inertial) {
            const emittedInertial = inertialToMJCF("      ", rootLink.inertial, {
                linkName: rootLink.name,
                omitInvalidFrameInertial: shouldOmitInvalidFrameInertial(rootLink, null),
            });
            result.warnings.push(...emittedInertial.warnings);
            result.diagnostics.push(...emittedInertial.diagnostics);
            if (emittedInertial.xml) {
                mjcf += `${emittedInertial.xml}\n`;
            }
        }
        // Add geometries for root
        for (const visual of rootLink.visuals) {
            mjcf += geometryToMJCF(visual, "      ", "visual") + "\n";
            result.stats.geometriesConverted++;
        }
        for (const collision of rootLink.collisions) {
            mjcf += geometryToMJCF(collision, "      ", "collision") + "\n";
            result.stats.geometriesConverted++;
        }
        result.stats.bodiesCreated++;
        // Process children of root
        const rootChildren = children.get(root) || [];
        for (const joint of rootChildren) {
            const bodyResult = generateBodyRecursive(joint, links, children, "      ", result.warnings, result.diagnostics);
            mjcf += bodyResult.xml;
            result.stats.bodiesCreated += bodyResult.stats.bodies;
            result.stats.jointsConverted += bodyResult.stats.joints;
            result.stats.geometriesConverted += bodyResult.stats.geoms;
        }
        mjcf += `    </body>\n`;
    }
    mjcf += `  </worldbody>\n\n`;
    if (options.includeActuators === true) {
        mjcf += `  <actuator>\n`;
        for (const joint of joints) {
            if (joint.type !== "fixed") {
                mjcf += `    <motor name="${xmlAttr(`${joint.name}_motor`)}" joint="${xmlAttr(joint.name)}" gear="1"/>\n`;
            }
        }
        mjcf += `  </actuator>\n`;
    }
    mjcf += `</mujoco>\n`;
    result.mjcfContent = mjcf;
    return result;
}
