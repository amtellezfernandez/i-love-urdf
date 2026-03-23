/**
 * Parses axis information from URDF joints.
 */
export interface JointAxisInfo {
    xyz: [number, number, number];
}
export interface JointAxisMap {
    [jointName: string]: JointAxisInfo;
}
/**
 * Parse axis information from an already-parsed URDF document
 */
export declare function parseJointAxesFromDocument(xmlDoc: Document): JointAxisMap;
/**
 * Parse axis information from URDF content
 */
export declare function parseJointAxesFromURDF(urdfContent: string): JointAxisMap;
