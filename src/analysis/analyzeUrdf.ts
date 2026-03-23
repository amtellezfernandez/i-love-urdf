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
import {
  getDirectChildrenByTag,
  parseURDF,
  validateURDFDocument,
} from "../parsing/urdfParser";

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

type CollisionSummary = {
  entries: CollisionEntry[];
  byLink: Record<string, CollisionEntry[]>;
};

const parseVector3 = (
  raw: string | null,
  fallback: [number, number, number] = [0, 0, 0]
): [number, number, number] => {
  if (!raw) return fallback;
  const parts = raw.trim().split(/\s+/).map(Number);
  return [
    Number.isFinite(parts[0]) ? parts[0] : fallback[0],
    Number.isFinite(parts[1]) ? parts[1] : fallback[1],
    Number.isFinite(parts[2]) ? parts[2] : fallback[2],
  ];
};

const extractMeshReferencesFromLinkData = (
  linkDataByName: Record<string, LinkData>
): string[] => {
  const meshReferences = new Set<string>();
  Object.values(linkDataByName).forEach((linkData) => {
    [...linkData.visuals, ...linkData.collisions].forEach((entry) => {
      if (entry.geometry.type !== "mesh") {
        return;
      }
      const filename = entry.geometry.params.filename?.trim();
      if (filename) {
        meshReferences.add(filename);
      }
    });
  });
  return Array.from(meshReferences);
};

export const extractMeshReferencesFromDocument = (xmlDoc: Document): string[] => {
  const linkNames = parseLinkNamesFromDocument(xmlDoc);
  const linkDataByName = parseLinkDataByNameFromDocument(xmlDoc, linkNames);
  return extractMeshReferencesFromLinkData(linkDataByName);
};

const extractInertialsFromLinkData = (
  linkDataByName: Record<string, LinkData>
): InertialEntry[] =>
  Object.entries(linkDataByName).flatMap(([linkName, linkData]) => {
    if (!linkData.inertial) {
      return [];
    }
    const { mass, origin } = linkData.inertial;
    if (!Number.isFinite(mass) || mass <= 0) {
      return [];
    }
    return [{ linkName, mass, origin: origin.xyz }];
  });

export const extractInertialsFromDocument = (xmlDoc: Document): InertialEntry[] => {
  const linkNames = parseLinkNamesFromDocument(xmlDoc);
  const linkDataByName = parseLinkDataByNameFromDocument(xmlDoc, linkNames);
  return extractInertialsFromLinkData(linkDataByName);
};

const summarizeCollisionsFromLinkData = (
  linkDataByName: Record<string, LinkData>
): CollisionSummary => {
  const entries: CollisionEntry[] = [];
  const byLink: Record<string, CollisionEntry[]> = {};

  Object.entries(linkDataByName).forEach(([linkName, linkData]) => {
    linkData.collisions.forEach((collision, index) => {
      const origin: CollisionOrigin = {
        xyz: collision.origin.xyz,
        rpy: collision.origin.rpy,
      };

      let geometry: CollisionGeometry | null = null;

      if (collision.geometry.type === "box") {
        geometry = {
          type: "box",
          size: parseVector3(collision.geometry.params.size ?? null),
        };
      } else if (collision.geometry.type === "sphere") {
        const radius = Number(collision.geometry.params.radius);
        geometry = { type: "sphere", radius: Number.isFinite(radius) ? radius : 1 };
      } else if (collision.geometry.type === "cylinder") {
        const radius = Number(collision.geometry.params.radius);
        const length = Number(collision.geometry.params.length);
        geometry = {
          type: "cylinder",
          radius: Number.isFinite(radius) ? radius : 1,
          length: Number.isFinite(length) ? length : 1,
        };
      } else if (collision.geometry.type === "mesh") {
        const filename = collision.geometry.params.filename;
        if (!filename) {
          return;
        }
        geometry = {
          type: "mesh",
          filename,
          scale: parseVector3(collision.geometry.params.scale ?? null, [1, 1, 1]),
        };
      }

      if (!geometry) {
        return;
      }

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

const parseCollisionGeometriesFromDocument = (xmlDoc: Document): CollisionSummary => {
  const linkNames = parseLinkNamesFromDocument(xmlDoc);
  const linkDataByName = parseLinkDataByNameFromDocument(xmlDoc, linkNames);
  return summarizeCollisionsFromLinkData(linkDataByName);
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
  const validation = validateURDFDocument(xmlDoc);
  const robot = validation.robot;
  const robotName = robot?.getAttribute("name") ?? null;

  if (!robot) {
    return {
      isValid: false,
      error: validation.error || "Invalid URDF",
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

  const linkNames = parseLinkNamesFromDocument(xmlDoc);
  const linkNameSet = new Set(linkNames);
  const linkDataByName = parseLinkDataByNameFromDocument(xmlDoc, linkNames);
  const meshReferences = extractMeshReferencesFromLinkData(linkDataByName);
  const absoluteFileMeshRefs = meshReferences.filter((ref) => parseMeshReference(ref).isAbsoluteFile);

  const jointByChildLink: Record<string, JointParentInfo> = {};
  const childLinksSet = new Set<string>();
  getDirectChildrenByTag(robot, "joint").forEach((joint) => {
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
  const collisions = summarizeCollisionsFromLinkData(linkDataByName);

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
    inertials: extractInertialsFromLinkData(linkDataByName),
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
