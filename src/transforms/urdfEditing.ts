import { parseURDF, serializeURDF } from "../parsing/urdfParser";
import { sanitizeUrdfName } from "../utils/urdfNames";
import type { UrdfTransformResult } from "./urdfTransforms";

const findNamedElement = (
  document: Document,
  tagName: string,
  name: string
): Element | null =>
  Array.from(document.querySelectorAll(tagName)).find(
    (element) => element.getAttribute("name") === name
  ) ?? null;

const validateReplacementName = (value: string, label: string): string | null => {
  const sanitized = sanitizeUrdfName(value);
  if (!sanitized) {
    return null;
  }
  if (sanitized !== value.trim()) {
    console.warn(`${label} sanitized to "${sanitized}" before applying rename.`);
  }
  return sanitized;
};

export const renameJointInUrdf = (
  urdfContent: string,
  oldJointName: string,
  newJointName: string
): UrdfTransformResult => {
  if (!urdfContent.trim()) {
    return { success: false, content: urdfContent, error: "No URDF content available" };
  }

  const sanitizedNewName = validateReplacementName(newJointName, "Joint name");
  if (!sanitizedNewName) {
    return { success: false, content: urdfContent, error: "New joint name cannot be empty" };
  }

  if (oldJointName === sanitizedNewName) {
    return { success: true, content: urdfContent };
  }

  const parsed = parseURDF(urdfContent);
  if (!parsed.isValid) {
    return { success: false, content: urdfContent, error: parsed.error };
  }

  const joint = findNamedElement(parsed.document, "joint", oldJointName);
  if (!joint) {
    return {
      success: false,
      content: urdfContent,
      error: `Joint "${oldJointName}" not found`,
    };
  }

  if (findNamedElement(parsed.document, "joint", sanitizedNewName)) {
    return {
      success: false,
      content: urdfContent,
      error: `Joint "${sanitizedNewName}" already exists`,
    };
  }

  joint.setAttribute("name", sanitizedNewName);
  parsed.document.querySelectorAll("mimic").forEach((mimic) => {
    if (mimic.getAttribute("joint") === oldJointName) {
      mimic.setAttribute("joint", sanitizedNewName);
    }
  });

  return { success: true, content: serializeURDF(parsed.document) };
};

export const renameLinkInUrdf = (
  urdfContent: string,
  oldLinkName: string,
  newLinkName: string
): UrdfTransformResult => {
  if (!urdfContent.trim()) {
    return { success: false, content: urdfContent, error: "No URDF content available" };
  }

  const sanitizedNewName = validateReplacementName(newLinkName, "Link name");
  if (!sanitizedNewName) {
    return { success: false, content: urdfContent, error: "New link name cannot be empty" };
  }

  if (oldLinkName === sanitizedNewName) {
    return { success: true, content: urdfContent };
  }

  const parsed = parseURDF(urdfContent);
  if (!parsed.isValid) {
    return { success: false, content: urdfContent, error: parsed.error };
  }

  const link = findNamedElement(parsed.document, "link", oldLinkName);
  if (!link) {
    return {
      success: false,
      content: urdfContent,
      error: `Link "${oldLinkName}" not found`,
    };
  }

  if (findNamedElement(parsed.document, "link", sanitizedNewName)) {
    return {
      success: false,
      content: urdfContent,
      error: `Link "${sanitizedNewName}" already exists`,
    };
  }

  link.setAttribute("name", sanitizedNewName);
  parsed.document.querySelectorAll("joint").forEach((joint) => {
    const parent = joint.querySelector("parent");
    const child = joint.querySelector("child");
    if (parent?.getAttribute("link") === oldLinkName) {
      parent.setAttribute("link", sanitizedNewName);
    }
    if (child?.getAttribute("link") === oldLinkName) {
      child.setAttribute("link", sanitizedNewName);
    }
  });

  return { success: true, content: serializeURDF(parsed.document) };
};
