import { parseXml } from "../xmlDom";

export type UrdfValidationIssue = {
  level: "error" | "warning";
  message: string;
  context?: string;
};

export type UrdfValidationResult = {
  isValid: boolean;
  issues: UrdfValidationIssue[];
};

const collectNames = (elements: Element[], attr: string): string[] =>
  elements
    .map((el) => el.getAttribute(attr) || "")
    .filter((name) => name.length > 0);

export const validateUrdf = (urdfContent: string): UrdfValidationResult => {
  const xmlDoc = parseXml(urdfContent);
  const parserError = xmlDoc.querySelector("parsererror");
  if (parserError) {
    return {
      isValid: false,
      issues: [
        {
          level: "error",
          message: parserError.textContent || "URDF XML parse error",
        },
      ],
    };
  }

  const robots = Array.from(xmlDoc.querySelectorAll("robot"));
  if (robots.length !== 1) {
    return {
      isValid: false,
      issues: [
        {
          level: "error",
          message: `Expected exactly one <robot> element, found ${robots.length}.`,
        },
      ],
    };
  }

  const issues: UrdfValidationIssue[] = [];
  const robot = robots[0];

  const links = Array.from(robot.querySelectorAll("link"));
  if (links.length === 0) {
    issues.push({ level: "error", message: "URDF has no <link> elements." });
  }

  const joints = Array.from(robot.querySelectorAll("joint"));

  const linkNames = collectNames(links, "name");
  const jointNames = collectNames(joints, "name");

  const duplicateLinks = linkNames.filter((name, idx) => linkNames.indexOf(name) !== idx);
  const duplicateJoints = jointNames.filter((name, idx) => jointNames.indexOf(name) !== idx);

  if (duplicateLinks.length) {
    issues.push({
      level: "error",
      message: `Duplicate link names: ${Array.from(new Set(duplicateLinks)).join(", ")}`,
    });
  }
  if (duplicateJoints.length) {
    issues.push({
      level: "error",
      message: `Duplicate joint names: ${Array.from(new Set(duplicateJoints)).join(", ")}`,
    });
  }

  const linkNameSet = new Set(linkNames);
  joints.forEach((joint) => {
    const jointName = joint.getAttribute("name") || "joint";
    const parent = joint.querySelector("parent")?.getAttribute("link") || "";
    const child = joint.querySelector("child")?.getAttribute("link") || "";
    if (!parent || !linkNameSet.has(parent)) {
      issues.push({
        level: "error",
        message: `Joint '${jointName}' references missing parent link '${parent}'.`,
      });
    }
    if (!child || !linkNameSet.has(child)) {
      issues.push({
        level: "error",
        message: `Joint '${jointName}' references missing child link '${child}'.`,
      });
    }
  });

  return {
    isValid: !issues.some((issue) => issue.level === "error"),
    issues,
  };
};
