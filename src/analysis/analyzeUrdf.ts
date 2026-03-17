import { parseMeshReference } from "../mesh/meshPaths";
import {
  parseJointAxesFromDocument,
  type JointAxisMap,
} from "../parsing/parseJointAxis";
import {
  parseJointHierarchyFromDocument,
  type JointHierarchyNode,
} from "../parsing/parseJointHierarchy";
import {
  parseJointLimitsFromDocument,
  type JointLimits,
} from "../parsing/parseJointLimits";
import { parseLinkNamesFromDocument } from "../parsing/parseLinkNames";
import {
  parseLinkDataFromDocument,
  type LinkData,
} from "../parsing/parseLinkData";
import { parseSensorsFromDocument, type ParsedSensor } from "../parsing/parseSensors";
import { parseURDF } from "../parsing/urdfParser";

export type InertialEntry = {
  linkName: string;
  mass: number;
  origin: [number, number, number];
};

export type JointParentInfo = {
  parentLink: string;
  origin: [number, number, number];
  type: string;
  limitLower?: number;
  limitUpper?: number;
};

export type CollisionOrigin = {
  xyz: [number, number, number];
  rpy: [number, number, number];
};

export type CollisionGeometry =
  | { type: "box"; size: [number, number, number] }
  | { type: "sphere"; radius: number }
  | { type: "cylinder"; radius: number; length: number }
  | {
      type: "mesh";
      filename: string;
      scale: [number, number, number];
    };

export type CollisionEntry = {
  linkName: string;
  index: number;
  origin: CollisionOrigin;
  geometry: CollisionGeometry;
};

export type UrdfAnalysis = {
  isValid: boolean;
  error?: string;
  robotName: string | null;
  linkNames: string[];
  rootLinks: string[];
  childLinks: string[];
  jointByChildLink: Record<string, JointParentInfo>;
  jointLimits: JointLimits;
  jointAxes: JointAxisMap;
  jointHierarchy: {
    rootJoints: JointHierarchyNode[];
    allJoints: Map<string, JointHierarchyNode>;
    orderedJoints: JointHierarchyNode[];
  };
  sensors: ParsedSensor[];
  meshReferences: string[];
  absoluteFileMeshRefs: string[];
  inertials: InertialEntry[];
  collisionEntries: CollisionEntry[];
  collisionsByLink: Record<string, CollisionEntry[]>;
  linkDataByName: Record<string, LinkData>;
};

const parseVector3 = (raw: string | null): [number, number, number] => {
  if (!raw) return [0, 0, 0];
  const parts = raw.trim().split(/\s+/).map(Number);
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
};

export const extractMeshReferencesFromDocument = (xmlDoc: Document): string[] => {
  const meshReferences = new Set<string>();
  xmlDoc.querySelectorAll("mesh").forEach((mesh) => {
    const filename = mesh.getAttribute("filename");
    if (!filename) return;
    const normalized = filename.trim();
    if (normalized) {
      meshReferences.add(normalized);
    }
  });
  return Array.from(meshReferences);
};

export const extractInertialsFromDocument = (xmlDoc: Document): InertialEntry[] => {
  const entries: InertialEntry[] = [];
  xmlDoc.querySelectorAll("link").forEach((linkEl) => {
    const linkName = linkEl.getAttribute("name");
    if (!linkName) return;
    const inertialEl = linkEl.querySelector("inertial");
    if (!inertialEl) return;
    const massValue = inertialEl.querySelector("mass")?.getAttribute("value");
    const mass = massValue ? Number(massValue) : 0;
    if (!Number.isFinite(mass) || mass <= 0) return;
    const originEl = inertialEl.querySelector("origin");
    const origin = parseVector3(originEl?.getAttribute("xyz") ?? null);
    entries.push({ linkName, mass, origin });
  });
  return entries;
};

const parseCollisionGeometriesFromDocument = (
  xmlDoc: Document
): { entries: CollisionEntry[]; byLink: Record<string, CollisionEntry[]> } => {
  const entries: CollisionEntry[] = [];
  const byLink: Record<string, CollisionEntry[]> = {};

  xmlDoc.querySelectorAll("link").forEach((linkEl) => {
    const linkName = linkEl.getAttribute("name");
    if (!linkName) return;

    const collisions = Array.from(linkEl.querySelectorAll("collision"));
    collisions.forEach((collisionEl, index) => {
      const originEl = collisionEl.querySelector("origin");
      const origin: CollisionOrigin = {
        xyz: parseVector3(originEl?.getAttribute("xyz") ?? null),
        rpy: parseVector3(originEl?.getAttribute("rpy") ?? null),
      };

      const geometryEl = collisionEl.querySelector("geometry");
      if (!geometryEl) return;

      const boxEl = geometryEl.querySelector("box");
      const sphereEl = geometryEl.querySelector("sphere");
      const cylinderEl = geometryEl.querySelector("cylinder");
      const meshEl = geometryEl.querySelector("mesh");

      let geometry: CollisionGeometry | null = null;

      if (boxEl) {
        const size = parseVector3(boxEl.getAttribute("size"));
        geometry = { type: "box", size };
      } else if (sphereEl) {
        const radius = Number(sphereEl.getAttribute("radius"));
        geometry = { type: "sphere", radius: Number.isFinite(radius) ? radius : 1 };
      } else if (cylinderEl) {
        const radius = Number(cylinderEl.getAttribute("radius"));
        const length = Number(cylinderEl.getAttribute("length"));
        geometry = {
          type: "cylinder",
          radius: Number.isFinite(radius) ? radius : 1,
          length: Number.isFinite(length) ? length : 1,
        };
      } else if (meshEl) {
        const filename = meshEl.getAttribute("filename");
        if (!filename) return;
        const scale = parseVector3(meshEl.getAttribute("scale"));
        geometry = { type: "mesh", filename, scale };
      }

      if (!geometry) return;

      const entry: CollisionEntry = {
        linkName,
        index,
        origin,
        geometry,
      };
      entries.push(entry);
      byLink[linkName] = byLink[linkName] ? [...byLink[linkName], entry] : [entry];
    });
  });

  return { entries, byLink };
};

const parseLinkDataByNameFromDocument = (
  xmlDoc: Document,
  linkNames: string[]
): Record<string, LinkData> => {
  const byName: Record<string, LinkData> = {};
  linkNames.forEach((linkName) => {
    const data = parseLinkDataFromDocument(xmlDoc, linkName);
    if (data) {
      byName[linkName] = data;
    }
  });
  return byName;
};

export const analyzeUrdfDocument = (xmlDoc: Document): UrdfAnalysis => {
  const parserError = xmlDoc.querySelector("parsererror");
  const robot = xmlDoc.querySelector("robot");
  const robotName = robot?.getAttribute("name") ?? null;

  if (parserError || !robot) {
    return {
      isValid: false,
      error: parserError?.textContent || "Invalid URDF",
      robotName,
      linkNames: [],
      rootLinks: [],
      childLinks: [],
      jointByChildLink: {},
      jointLimits: {},
      jointAxes: {},
      jointHierarchy: { rootJoints: [], allJoints: new Map(), orderedJoints: [] },
      sensors: [],
      meshReferences: [],
      absoluteFileMeshRefs: [],
      inertials: [],
      collisionEntries: [],
      collisionsByLink: {},
      linkDataByName: {},
    };
  }

  const meshReferences = extractMeshReferencesFromDocument(xmlDoc);
  const absoluteFileMeshRefs = meshReferences.filter((ref) => parseMeshReference(ref).isAbsoluteFile);
  const linkNames = parseLinkNamesFromDocument(xmlDoc);
  const linkNameSet = new Set(linkNames);

  const jointByChildLink: Record<string, JointParentInfo> = {};
  const childLinksSet = new Set<string>();
  robot.querySelectorAll("joint").forEach((joint) => {
    const child = joint.querySelector("child")?.getAttribute("link");
    const parent = joint.querySelector("parent")?.getAttribute("link");
    if (!child || !parent) return;
    childLinksSet.add(child);

    const originEl = joint.querySelector("origin");
    const origin = parseVector3(originEl?.getAttribute("xyz") ?? null);

    const limitEl = joint.querySelector("limit");
    const lowerRaw = limitEl?.getAttribute("lower");
    const upperRaw = limitEl?.getAttribute("upper");
    const lower = lowerRaw !== null ? Number(lowerRaw) : undefined;
    const upper = upperRaw !== null ? Number(upperRaw) : undefined;

    jointByChildLink[child] = {
      parentLink: parent,
      origin,
      type: joint.getAttribute("type") || "fixed",
      limitLower: Number.isFinite(lower) ? lower : undefined,
      limitUpper: Number.isFinite(upper) ? upper : undefined,
    };
  });

  const childLinks = Array.from(childLinksSet);
  const rootLinks = linkNames.filter((name) => !childLinksSet.has(name) && linkNameSet.has(name));
  const collisions = parseCollisionGeometriesFromDocument(xmlDoc);
  const linkDataByName = parseLinkDataByNameFromDocument(xmlDoc, linkNames);

  return {
    isValid: true,
    robotName,
    linkNames,
    rootLinks,
    childLinks,
    jointByChildLink,
    jointLimits: parseJointLimitsFromDocument(xmlDoc),
    jointAxes: parseJointAxesFromDocument(xmlDoc),
    jointHierarchy: parseJointHierarchyFromDocument(xmlDoc),
    sensors: parseSensorsFromDocument(xmlDoc),
    meshReferences,
    absoluteFileMeshRefs,
    inertials: extractInertialsFromDocument(xmlDoc),
    collisionEntries: collisions.entries,
    collisionsByLink: collisions.byLink,
    linkDataByName,
  };
};

export const analyzeUrdf = (urdfContent: string): UrdfAnalysis => {
  const parsed = parseURDF(urdfContent);
  const analysis = analyzeUrdfDocument(parsed.document);
  if (!parsed.isValid) {
    return { ...analysis, isValid: false, error: parsed.error ?? analysis.error };
  }
  return analysis;
};
