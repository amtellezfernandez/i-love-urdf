import { parseURDF } from "../parsing/urdfParser";

export type JointLinkValidationResult =
  | { valid: true }
  | { valid: false; error: string };

export const validateJointLinkReassignment = (
  urdfContent: string,
  jointName: string,
  parentLink: string,
  childLink: string
): JointLinkValidationResult => {
  if (!urdfContent.trim()) {
    return { valid: false, error: "No URDF content available." };
  }
  if (!jointName.trim()) {
    return { valid: false, error: "Invalid joint name." };
  }
  if (!parentLink.trim() || !childLink.trim()) {
    return { valid: false, error: "Parent and child links are required." };
  }
  if (parentLink === childLink) {
    return { valid: false, error: "Parent and child links must be different." };
  }

  const parsed = parseURDF(urdfContent);
  if (!parsed.isValid) {
    return { valid: false, error: parsed.error ?? "Invalid URDF XML." };
  }

  const links = new Set<string>();
  parsed.document.querySelectorAll("link[name]").forEach((node) => {
    const name = node.getAttribute("name");
    if (name) {
      links.add(name);
    }
  });
  if (!links.has(parentLink)) {
    return { valid: false, error: `Parent link "${parentLink}" was not found.` };
  }
  if (!links.has(childLink)) {
    return { valid: false, error: `Child link "${childLink}" was not found.` };
  }

  const parentByChild = new Map<string, string>();
  let jointFound = false;
  let parentConflictError: string | null = null;

  parsed.document.querySelectorAll("joint").forEach((jointNode) => {
    if (parentConflictError) {
      return;
    }

    const name = jointNode.getAttribute("name") ?? "";
    const parentNode = jointNode.querySelector("parent");
    const childNode = jointNode.querySelector("child");
    let parent = parentNode?.getAttribute("link") ?? "";
    let child = childNode?.getAttribute("link") ?? "";

    if (name === jointName) {
      parent = parentLink;
      child = childLink;
      jointFound = true;
    }
    if (!parent || !child) {
      return;
    }

    const existingParent = parentByChild.get(child);
    if (existingParent && existingParent !== parent) {
      parentConflictError = `Link "${child}" cannot have multiple parent links.`;
      return;
    }
    parentByChild.set(child, parent);
  });

  if (parentConflictError) {
    return { valid: false, error: parentConflictError };
  }

  if (!jointFound) {
    return { valid: false, error: `Joint "${jointName}" was not found.` };
  }

  const adjacency = new Map<string, string[]>();
  links.forEach((link) => adjacency.set(link, []));
  parentByChild.forEach((parent, child) => {
    if (!adjacency.has(parent)) {
      adjacency.set(parent, []);
    }
    adjacency.get(parent)?.push(child);
  });

  const state = new Map<string, 0 | 1 | 2>();
  const hasCycleFrom = (link: string): boolean => {
    const current = state.get(link) ?? 0;
    if (current === 1) {
      return true;
    }
    if (current === 2) {
      return false;
    }

    state.set(link, 1);
    const children = adjacency.get(link) ?? [];
    for (const child of children) {
      if (hasCycleFrom(child)) {
        return true;
      }
    }
    state.set(link, 2);
    return false;
  };

  for (const link of links) {
    if (hasCycleFrom(link)) {
      return {
        valid: false,
        error: "Joint link update would create a kinematic cycle.",
      };
    }
  }

  const rootCount = Array.from(links).filter((link) => !parentByChild.has(link)).length;
  if (rootCount === 0) {
    return {
      valid: false,
      error: "Joint link update would leave the robot without a root link.",
    };
  }

  return { valid: true };
};
