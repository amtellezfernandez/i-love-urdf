/**
 * Parse link names from URDF content
 */
import { parseXml } from "../xmlDom";

export function parseLinkNamesFromDocument(xmlDoc: Document): string[] {
  try {
    const links = xmlDoc.querySelectorAll("link");
    const linkNames: string[] = [];

    links.forEach((link) => {
      const name = link.getAttribute("name");
      if (name) {
        linkNames.push(name);
      }
    });

    return linkNames;
  } catch (error) {
    console.error("Error parsing link names from URDF:", error);
    return [];
  }
}

export function parseLinkNames(urdfContent: string): string[] {
  const xmlDoc = parseXml(urdfContent);
  return parseLinkNamesFromDocument(xmlDoc);
}
