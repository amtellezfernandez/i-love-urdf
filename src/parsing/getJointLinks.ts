/**
 * Gets the parent and child link names for a given joint name from URDF content.
 */
import { getDirectChildrenByTag, parseURDF } from "./urdfParser";

export function getJointLinks(
  urdfContent: string,
  jointName: string
): { parentLink: string | null; childLink: string | null } {
  const parsed = parseURDF(urdfContent);
  if (!parsed.isValid) {
    return { parentLink: null, childLink: null };
  }

  try {
    const robot = parsed.document.querySelector("robot");
    if (!robot) {
      return { parentLink: null, childLink: null };
    }

    const joint =
      getDirectChildrenByTag(robot, "joint").find(
        (jointElement) => jointElement.getAttribute("name") === jointName
      ) ?? null;
    if (!joint) {
      return { parentLink: null, childLink: null };
    }

    const parent = joint.querySelector("parent");
    const child = joint.querySelector("child");

    return {
      parentLink: parent?.getAttribute("link") || null,
      childLink: child?.getAttribute("link") || null,
    };
  } catch {
    return { parentLink: null, childLink: null };
  }
}
