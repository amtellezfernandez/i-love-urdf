/**
 * URDF Joint Limits Parser
 *
 * Parses joint types and limits from URDF XML
 */
export interface JointLimitInfo {
    type: string;
    lower: number | null;
    upper: number | null;
    velocity?: number | null;
}
export interface JointLimits {
    [jointName: string]: JointLimitInfo;
}
/**
 * Parses joint types and limits from URDF XML content
 * @param urdfContent URDF XML content as string
 * @returns Map of joint names to their limit information
 */
export declare function parseJointLimitsFromDocument(xmlDoc: Document): JointLimits;
/**
 * Parses joint types and limits from URDF XML content
 * @param urdfContent URDF XML content as string
 * @returns Map of joint names to their limit information
 */
export declare function parseJointLimitsFromURDF(urdfContent: string): JointLimits;
/**
 * Gets joint limits for a specific joint, with fallback values
 * @param limitsMap Parsed joint limits map
 * @param jointName Name of the joint
 * @returns Object with lower and upper limits, or defaults for unlimited joints
 */
export declare function getJointLimits(limitsMap: JointLimits, jointName: string): {
    lower: number;
    upper: number;
};
