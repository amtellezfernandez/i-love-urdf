export type TaskFamilyKey =
  | "load"
  | "validate"
  | "analyze"
  | "format"
  | "edit"
  | "optimize"
  | "convert";

export type TaskFamilyDefinition = {
  key: TaskFamilyKey;
  title: string;
  summary: string;
  commands: readonly string[];
};

export const TASK_FAMILIES: readonly TaskFamilyDefinition[] = [
  {
    key: "load",
    title: "Load Sources",
    summary: "Normalize files, local repos, or GitHub repos into one prepared URDF.",
    commands: ["load-source", "inspect-repo"],
  },
  {
    key: "validate",
    title: "Validate",
    summary: "Check whether a prepared URDF is structurally usable.",
    commands: ["validate"],
  },
  {
    key: "analyze",
    title: "Analyze",
    summary: "Inspect robot structure, mesh references, and diffs.",
    commands: ["analyze", "guess-orientation", "mesh-refs", "diff"],
  },
  {
    key: "format",
    title: "Format",
    summary: "Apply stable formatting and cleanup transforms to URDF text.",
    commands: ["pretty-print", "canonical-order", "normalize-axes"],
  },
  {
    key: "edit",
    title: "Edit",
    summary: "Apply safe structural mutations to an existing URDF.",
    commands: [
      "set-joint-axis",
      "rename-joint",
      "rename-link",
      "reassign-joint",
      "remove-joints",
      "set-material-color",
      "rotate-90",
      "apply-orientation",
    ],
  },
  {
    key: "optimize",
    title: "Optimize",
    summary: "Repair paths and reduce heavy meshes for downstream tools.",
    commands: [
      "fix-mesh-paths",
      "mesh-to-assets",
      "repair-mesh-refs",
      "inspect-meshes",
      "compress-meshes",
    ],
  },
  {
    key: "convert",
    title: "Convert",
    summary: "Move between URDF, XACRO, and MJCF with task-specific helpers.",
    commands: ["urdf-to-mjcf", "urdf-to-xacro", "xacro-to-urdf"],
  },
] as const;
