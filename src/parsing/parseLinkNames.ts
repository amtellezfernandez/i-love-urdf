/**
 * Parses link names from URDF content.
 */
import { getDirectChildrenByTag, parseURDF, validateURDFDocument } from "./urdfParser";

export function parseLinkNamesFromDocument(xmlDoc: Document): string[] {
  try {
    const validation = validateURDFDocument(xmlDoc);
    if (!validation.robot) {
      return [];
    }

    const links = getDirectChildrenByTag(validation.robot, "link");
    const linkNames: string[] = [];

    links.forEach((link) => {
      const name = link.getAttribute("name");
      if (name) {
        linkNames.push(name);
      }
    });

    return linkNames;
  } catch {
    return [];
  }
}

export function parseLinkNames(urdfContent: string): string[] {
  const parsed = parseURDF(urdfContent);
  if (!parsed.isValid) {
    return [];
  }
  return parseLinkNamesFromDocument(parsed.document);
}
