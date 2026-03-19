/**
 * Parses URDF to get hierarchical joint structure
 */
export interface JointHierarchyNode {
    jointName: string;
    childLink: string;
    parentLink: string;
    type: string;
    children: JointHierarchyNode[];
    depth: number;
    order: number;
    parentJoint?: string;
}
interface JointHierarchy {
    rootJoints: JointHierarchyNode[];
    allJoints: Map<string, JointHierarchyNode>;
    orderedJoints: JointHierarchyNode[];
}
export declare function parseJointHierarchyFromDocument(xmlDoc: Document): JointHierarchy;
export declare function parseJointHierarchy(urdfContent: string): JointHierarchy;
export {};
