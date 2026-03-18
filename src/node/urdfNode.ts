import { createHash } from "node:crypto";
import { JSDOM } from "jsdom";

export type KinematicFingerprint = {
  strict: string;
  loose: string;
};

export type ComputeKinematicFingerprintOptions = {
  quantizationDecimals?: number;
};

const DEFAULT_KINEMATIC_FINGERPRINT_DECIMALS = 6;
const DOM = new JSDOM("<!doctype html><html><body></body></html>");
const VISUAL_COLLISION_REGEXPS = [
  /<visual\b[^>]*>.*?<\/visual>/gis,
  /<collision\b[^>]*>.*?<\/collision>/gis,
  /<mesh\b[^>]*\/>/gis,
  /<mesh\b[^>]*>.*?<\/mesh>/gis,
];

const parseXmlDocument = (xml: string): Document =>
  new DOM.window.DOMParser().parseFromString(xml, "application/xml");

const serializeXmlDocument = (document: Document): string =>
  new DOM.window.XMLSerializer().serializeToString(document);

const tagNameOf = (element: Element | null): string =>
  String(element?.tagName || "")
    .split(":")
    .pop()
    ?.toLowerCase() || "";

const hasParserError = (document: Document): boolean =>
  document.querySelector("parsererror") !== null;

const parseXYZ = (
  raw: string | null | undefined,
  fallback: [number, number, number]
): [number, number, number] => {
  if (!raw) return fallback;
  const parts = raw.trim().split(/\s+/);
  if (parts.length !== fallback.length) return fallback;

  const values: number[] = [];
  for (const value of parts) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    values.push(parsed);
  }

  return [values[0], values[1], values[2]];
};

const quantize = (value: number, digits: number): number => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};

const sha256Hex = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");

const toCanonicalJson = (payload: unknown): string => {
  if (Array.isArray(payload)) {
    return `[${payload.map((item) => toCanonicalJson(item)).join(",")}]`;
  }
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${toCanonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(payload);
};

const regexStripVisualCollision = (urdfXml: string): string =>
  VISUAL_COLLISION_REGEXPS.reduce((current, pattern) => current.replace(pattern, ""), urdfXml);

export const stripUrdfForKinematics = (urdfXml: string): string => {
  try {
    const document = parseXmlDocument(urdfXml);
    if (hasParserError(document)) {
      return regexStripVisualCollision(urdfXml);
    }

    Array.from(document.querySelectorAll("*")).forEach((parent) => {
      Array.from(parent.children).forEach((child) => {
        const tagName = tagNameOf(child);
        if (tagName === "visual" || tagName === "collision") {
          parent.removeChild(child);
        }
      });
    });

    const serialized = serializeXmlDocument(document);
    if (serialized.includes("<mesh")) {
      return regexStripVisualCollision(serialized);
    }
    return serialized;
  } catch {
    return regexStripVisualCollision(urdfXml);
  }
};

export const computeKinematicFingerprint = (
  urdfXml: string,
  options: ComputeKinematicFingerprintOptions = {}
): KinematicFingerprint => {
  const digits = Number.isInteger(options.quantizationDecimals)
    ? Math.max(0, Number(options.quantizationDecimals))
    : DEFAULT_KINEMATIC_FINGERPRINT_DECIMALS;

  const document = parseXmlDocument(urdfXml);
  if (hasParserError(document)) {
    throw new Error("Invalid URDF XML.");
  }

  const joints = Array.from(document.querySelectorAll("joint"));
  const links = new Set<string>();
  const parentCounts = new Map<string, number>();
  const childCounts = new Map<string, number>();
  const edgeRecords: Array<{
    jointType: string;
    parent: string;
    child: string;
    axis: [number, number, number];
    originXYZ: [number, number, number];
    originRPY: [number, number, number];
    limits: [number | null, number | null];
  }> = [];

  for (const joint of joints) {
    const parentName = joint.querySelector("parent")?.getAttribute("link")?.trim() || "";
    const childName = joint.querySelector("child")?.getAttribute("link")?.trim() || "";
    if (!parentName || !childName) continue;

    links.add(parentName);
    links.add(childName);
    parentCounts.set(parentName, (parentCounts.get(parentName) || 0) + 1);
    childCounts.set(childName, (childCounts.get(childName) || 0) + 1);

    const axis = parseXYZ(joint.querySelector("axis")?.getAttribute("xyz"), [1, 0, 0]).map((value) =>
      quantize(value, digits)
    ) as [number, number, number];
    const originXYZ = parseXYZ(joint.querySelector("origin")?.getAttribute("xyz"), [0, 0, 0]).map((value) =>
      quantize(value, digits)
    ) as [number, number, number];
    const originRPY = parseXYZ(joint.querySelector("origin")?.getAttribute("rpy"), [0, 0, 0]).map((value) =>
      quantize(value, digits)
    ) as [number, number, number];

    const parseLimit = (name: "lower" | "upper"): number | null => {
      const raw = joint.querySelector("limit")?.getAttribute(name);
      if (!raw) return null;
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) return null;
      return quantize(parsed, digits);
    };

    edgeRecords.push({
      jointType: joint.getAttribute("type") || "unknown",
      parent: parentName,
      child: childName,
      axis,
      originXYZ,
      originRPY,
      limits: [parseLimit("lower"), parseLimit("upper")],
    });
  }

  const linkSignature = (linkName: string): [number, number] => [
    childCounts.get(linkName) || 0,
    parentCounts.get(linkName) || 0,
  ];

  const strictEdges = edgeRecords.map((record) => ({
    joint_type: record.jointType,
    parent_sig: linkSignature(record.parent),
    child_sig: linkSignature(record.child),
    axis: record.axis,
    origin_xyz: record.originXYZ,
    origin_rpy: record.originRPY,
    limits: record.limits,
  }));
  const looseEdges = edgeRecords.map((record) => ({
    joint_type: record.jointType,
    parent_sig: linkSignature(record.parent),
    child_sig: linkSignature(record.child),
  }));

  const strictPayload = {
    joint_count: strictEdges.length,
    link_count: links.size,
    edges: [...strictEdges].sort((left, right) =>
      toCanonicalJson(left).localeCompare(toCanonicalJson(right))
    ),
  };
  const loosePayload = {
    joint_count: looseEdges.length,
    link_count: links.size,
    edges: [...looseEdges].sort((left, right) =>
      toCanonicalJson(left).localeCompare(toCanonicalJson(right))
    ),
  };

  return {
    strict: sha256Hex(toCanonicalJson(strictPayload)),
    loose: sha256Hex(toCanonicalJson(loosePayload)),
  };
};

export const computeSha256Text = (value: string): string => sha256Hex(value);
