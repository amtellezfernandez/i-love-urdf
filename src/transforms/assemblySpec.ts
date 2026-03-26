export type AssemblyPoseLike = {
  x: number;
  y: number;
  z: number;
  yaw: number;
};

export type AssemblyMountOrigin = {
  xyz: [number, number, number];
  rpy: [number, number, number];
};

export type AssemblySpecRobot = {
  id: string;
  name: string;
  urdfContent: string;
  isPrimary?: boolean;
  mount?: AssemblyMountOrigin;
};

export type AssemblySpec = {
  robotName: string;
  robots: AssemblySpecRobot[];
};

export type CreateAssemblySpecModel = {
  id: string;
  name: string;
  urdfContent: string;
  isPrimary?: boolean;
};

export type CreateAssemblySpecOptions = {
  robotName?: string;
  spacing?: number;
  poses?: Record<string, AssemblyPoseLike>;
  primaryRobotId?: string | null;
};

export type AssemblySpecValidationResult = {
  isValid: boolean;
  errors: string[];
};

const sanitizeRobotName = (value: string): string => {
  const normalized = value
    .trim()
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!normalized) {
    return "assembled_robot";
  }
  if (/^[0-9]/.test(normalized)) {
    return `m_${normalized}`;
  }
  return normalized;
};

export const createAssemblySpec = (
  models: CreateAssemblySpecModel[],
  options: CreateAssemblySpecOptions = {}
): AssemblySpec => {
  const robotName = sanitizeRobotName(options.robotName || "assembled_robot");
  const spacing = Number.isFinite(options.spacing) ? Math.max(options.spacing || 0, 0) : 1.5;
  const primaryRobotId =
    options.primaryRobotId ||
    models.find((model) => model.isPrimary)?.id ||
    models[0]?.id ||
    null;

  return {
    robotName,
    robots: models.map((model, index) => {
      const pose = options.poses?.[model.id];
      return {
        id: model.id,
        name: model.name,
        urdfContent: model.urdfContent,
        isPrimary: model.id === primaryRobotId,
        mount: {
          xyz: pose ? [pose.x, pose.y, pose.z] : [index * spacing, 0, 0],
          rpy: pose ? [0, pose.yaw, 0] : [0, 0, 0],
        },
      };
    }),
  };
};

export const validateAssemblySpec = (spec: AssemblySpec): AssemblySpecValidationResult => {
  const errors: string[] = [];
  if (!spec.robotName.trim()) {
    errors.push("Assembly robotName is required.");
  }
  if (spec.robots.length === 0) {
    errors.push("Assembly requires at least one robot.");
  }
  const seenIds = new Set<string>();
  spec.robots.forEach((robot, index) => {
    if (!robot.id.trim()) {
      errors.push(`Robot ${index + 1} is missing an id.`);
    } else if (seenIds.has(robot.id)) {
      errors.push(`Robot id "${robot.id}" is duplicated.`);
    } else {
      seenIds.add(robot.id);
    }
    if (!robot.name.trim()) {
      errors.push(`Robot ${index + 1} is missing a name.`);
    }
    if (!robot.urdfContent.trim()) {
      errors.push(`Robot "${robot.name || robot.id || index + 1}" is missing URDF content.`);
    }
  });
  return {
    isValid: errors.length === 0,
    errors,
  };
};
