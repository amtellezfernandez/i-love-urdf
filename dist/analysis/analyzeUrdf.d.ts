import { type JointAxisMap } from "../parsing/parseJointAxis";
import { type JointHierarchyNode } from "../parsing/parseJointHierarchy";
import { type JointLimits } from "../parsing/parseJointLimits";
import { type LinkData } from "../parsing/parseLinkData";
import { type ParsedSensor } from "../parsing/parseSensors";
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
export type CollisionGeometry = {
    type: "box";
    size: [number, number, number];
} | {
    type: "sphere";
    radius: number;
} | {
    type: "cylinder";
    radius: number;
    length: number;
} | {
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
export declare const extractMeshReferencesFromDocument: (xmlDoc: Document) => string[];
export declare const extractInertialsFromDocument: (xmlDoc: Document) => InertialEntry[];
export declare const analyzeUrdfDocument: (xmlDoc: Document) => UrdfAnalysis;
export declare const analyzeUrdf: (urdfContent: string) => UrdfAnalysis;
