/**
 * Canonical Ordering Utility for URDF
 *
 * Reorders URDF elements to follow standard ROS conventions:
 * - Robot level: link, joint, transmission, gazebo
 * - Link level: visual, collision, inertial
 * - Joint level: origin, parent, child, axis, limit, dynamics, mimic, safety_controller
 */
/**
 * Reorders URDF elements to follow canonical/standard ordering
 *
 * @param urdfContent - URDF XML content as string
 * @returns URDF with canonically ordered elements
 */
export declare function canonicalOrderURDF(urdfContent: string): string;
