export type TaskFamilyKey =
  | "load"
  | "health"
  | "validate"
  | "analyze"
  | "format"
  | "edit"
  | "normalize"
  | "optimize"
  | "convert";

export type CommandSectionKey = TaskFamilyKey | "xacro-runtime";

export type CommandCatalogEntry = {
  sections: readonly CommandSectionKey[];
  usage: readonly string[];
};

export type TaskFamilyDefinition = {
  key: TaskFamilyKey;
  title: string;
  summary: string;
  commands: readonly SupportedCommandName[];
};

export type HelpSectionDefinition = {
  key: CommandSectionKey;
  title: string;
  summary?: string;
  commands: readonly SupportedCommandName[];
};

const TASK_FAMILY_ORDER = [
  "load",
  "health",
  "validate",
  "analyze",
  "format",
  "edit",
  "normalize",
  "optimize",
  "convert",
] as const satisfies readonly TaskFamilyKey[];

const TASK_FAMILY_METADATA = {
  load: {
    title: "Load Sources",
    summary: "Prepare files, local repositories, or GitHub repositories as a single URDF.",
  },
  health: {
    title: "Health",
    summary: "Audit structural, inertial, axis, and orientation risks before modifying URDFs.",
  },
  validate: {
    title: "Validate",
    summary: "Check whether a prepared URDF is structurally valid.",
  },
  analyze: {
    title: "Analyze",
    summary: "Inspect robot structure, morphology, mesh references, and diffs.",
  },
  format: {
    title: "Format",
    summary: "Apply stable formatting and normalization transforms to URDF text.",
  },
  edit: {
    title: "Edit",
    summary: "Apply safe structural mutations to an existing URDF.",
  },
  normalize: {
    title: "Normalize",
    summary: "Apply runtime-neutral orientation and joint-frame normalization workflows.",
  },
  optimize: {
    title: "Optimize",
    summary: "Repair paths and reduce heavy meshes for downstream tools.",
  },
  convert: {
    title: "Convert",
    summary: "Convert between URDF, XACRO, MJCF, and initial USD outputs with task-specific helpers.",
  },
} as const satisfies Record<TaskFamilyKey, { title: string; summary: string }>;

const AUXILIARY_HELP_SECTION_ORDER = ["xacro-runtime"] as const satisfies readonly Exclude<
  CommandSectionKey,
  TaskFamilyKey
>[];

const AUXILIARY_HELP_SECTION_METADATA = {
  "xacro-runtime": {
    title: "XACRO runtime support",
  },
} as const satisfies Record<Exclude<CommandSectionKey, TaskFamilyKey>, { title: string }>;

export const COMMAND_CATALOG = {
  validate: {
    sections: ["validate"],
    usage: ["  validate --urdf <path>"],
  },
  "health-check": {
    sections: ["health"],
    usage: ["  health-check --urdf <path> [--strict]"],
  },
  analyze: {
    sections: ["analyze"],
    usage: ["  analyze --urdf <path>"],
  },
  "robot-type": {
    sections: ["analyze"],
    usage: ["  robot-type --urdf <path>"],
  },
  "morphology-card": {
    sections: ["analyze"],
    usage: ["  morphology-card --urdf <path> [--name-hints <a,b,c>] [--no-name-heuristics]"],
  },
  "gallery-generate": {
    sections: ["analyze"],
    usage: [
      "  gallery-generate --urdf <path> [--out <path>]",
      "  gallery-generate --local <repo> | --github <owner/repo|url> [--ref <branch>] [--path <subdir>] [--out <path>]",
    ],
  },
  "guess-orientation": {
    sections: ["analyze"],
    usage: [
      "  guess-orientation --urdf <path> [--target-up <x|y|z>] [--target-forward <x|y|z>]",
    ],
  },
  diff: {
    sections: ["analyze"],
    usage: ["  diff --left <path> --right <path>"],
  },
  "fix-mesh-paths": {
    sections: ["optimize"],
    usage: ["  fix-mesh-paths --urdf <path> [--package <name>] [--out <path>]"],
  },
  "mesh-refs": {
    sections: ["analyze"],
    usage: ["  mesh-refs --urdf <path>"],
  },
  "canonical-order": {
    sections: ["format"],
    usage: ["  canonical-order --urdf <path> [--out <path>]"],
  },
  "pretty-print": {
    sections: ["format"],
    usage: ["  pretty-print --urdf <path> [--indent <n>] [--out <path>]"],
  },
  "normalize-axes": {
    sections: ["format"],
    usage: ["  normalize-axes --urdf <path> [--out <path>]"],
  },
  "snap-axes": {
    sections: ["format"],
    usage: ["  snap-axes --urdf <path> [--tolerance <n>] [--out <path>]"],
  },
  "set-joint-axis": {
    sections: ["edit"],
    usage: ['  set-joint-axis --urdf <path> --joint <name> --xyz "0 1 0" [--out <path>]'],
  },
  "set-joint-type": {
    sections: ["edit"],
    usage: [
      "  set-joint-type --urdf <path> --joint <name> --type <revolute|continuous|prismatic|fixed|floating|planar> [--lower <n>] [--upper <n>] [--out <path>]",
    ],
  },
  "set-joint-limits": {
    sections: ["edit"],
    usage: [
      "  set-joint-limits --urdf <path> --joint <name> --lower <n> --upper <n> [--out <path>]",
    ],
  },
  "set-joint-velocity": {
    sections: ["edit"],
    usage: [
      "  set-joint-velocity --urdf <path> --joint <name> --velocity <n> [--out <path>]",
    ],
  },
  "canonicalize-joint-frame": {
    sections: ["normalize"],
    usage: [
      "  canonicalize-joint-frame --urdf <path> [--target-axis <x|y|z>] [--joint <name> | --joints <a,b,c>] [--out <path>]",
    ],
  },
  "rotate-90": {
    sections: ["edit"],
    usage: ["  rotate-90 --urdf <path> --axis <x|y|z> [--out <path>]"],
  },
  "apply-orientation": {
    sections: ["edit", "normalize"],
    usage: [
      "  apply-orientation --urdf <path> --source-up <axis> --source-forward <axis> [--target-up <axis>] [--target-forward <axis>] [--out <path>]",
    ],
  },
  "normalize-robot": {
    sections: ["normalize"],
    usage: [
      "  normalize-robot --urdf <path> [--apply] [--snap-axes] [--canonicalize-joint-frame] [--target-axis <x|y|z>] [--source-up <axis>] [--source-forward <axis>] [--target-up <axis>] [--target-forward <axis>] [--pretty-print] [--canonical-order] [--out <path>]",
    ],
  },
  "remove-joints": {
    sections: ["edit"],
    usage: ["  remove-joints --urdf <path> --joints <a,b,c> [--out <path>]"],
  },
  "reassign-joint": {
    sections: ["edit"],
    usage: [
      "  reassign-joint --urdf <path> --joint <name> --parent <link> --child <link> [--out <path>]",
    ],
  },
  "set-material-color": {
    sections: ["edit"],
    usage: [
      "  set-material-color --urdf <path> --link <name> --material <name> --color <#RRGGBB> [--out <path>]",
    ],
  },
  "mesh-to-assets": {
    sections: ["optimize"],
    usage: ["  mesh-to-assets --urdf <path> [--out <path>]"],
  },
  "urdf-to-mjcf": {
    sections: ["convert"],
    usage: ["  urdf-to-mjcf --urdf <path> [--out <path>]"],
  },
  "urdf-to-usd": {
    sections: ["convert"],
    usage: [
      "  urdf-to-usd --urdf <path> [--root <dir>] [--out <path>]",
      "  urdf-to-usd --path <file|repo> [--entry <repo-path>] [--root <dir>] [--args name=value,...] [--python <path>] [--wheel <path>] [--out <path>]",
    ],
  },
  "urdf-to-xacro": {
    sections: ["convert"],
    usage: ["  urdf-to-xacro --urdf <path> [--out <path>]"],
  },
  "xacro-to-urdf": {
    sections: ["convert"],
    usage: [
      "  xacro-to-urdf --xacro <path> [--root <dir>] [--args name=value,...] [--python <path>] [--wheel <path>] [--out <path>]",
      "  xacro-to-urdf --local <repo> --entry <repo-path> [--args name=value,...] [--python <path>] [--wheel <path>] [--out <path>]",
      "  xacro-to-urdf --github <owner/repo|url> --entry <repo-path> [--ref <branch>] [--path <subdir>] [--token <token>] [--args name=value,...] [--python <path>] [--wheel <path>] [--out <path>]",
    ],
  },
  "probe-xacro-runtime": {
    sections: ["xacro-runtime"],
    usage: ["  probe-xacro-runtime [--python <path>] [--wheel <path>]"],
  },
  "setup-xacro-runtime": {
    sections: ["xacro-runtime"],
    usage: ["  setup-xacro-runtime [--python <path>] [--venv <path>]"],
  },
  "load-source": {
    sections: ["load"],
    usage: [
      "  load-source --path <local-file-or-dir> [--entry <repo-path>] [--root <dir>] [--args name=value,...] [--python <path>] [--wheel <path>] [--out <path>]",
      "  load-source --github <owner/repo|url> [--entry <repo-path>] [--ref <branch>] [--subdir <path>] [--token <token>] [--args name=value,...] [--python <path>] [--wheel <path>] [--out <path>]",
    ],
  },
  "rename-joint": {
    sections: ["edit"],
    usage: ["  rename-joint --urdf <path> --joint <old> --name <new> [--out <path>]"],
  },
  "rename-link": {
    sections: ["edit"],
    usage: ["  rename-link --urdf <path> --link <old> --name <new> [--out <path>]"],
  },
  "inspect-repo": {
    sections: ["load"],
    usage: [
      "  inspect-repo --local <path> | --github <owner/repo|url> [--ref <branch>] [--path <subdir>] [--max-candidates <n>] [--token <token>] [--out <path>]",
    ],
  },
  "repair-mesh-refs": {
    sections: ["optimize"],
    usage: [
      "  repair-mesh-refs --local <repo|urdf-path> | --github <owner/repo|url> [--urdf <repo-path>] [--ref <branch>] [--path <subdir>] [--token <token>] [--out <path>]",
    ],
  },
  "repo-fixes": {
    sections: ["optimize"],
    usage: [
      "  repo-fixes --local <repo> | --github <owner/repo|url> [--ref <branch>] [--path <subdir>] [--out <path>]",
    ],
  },
  "inspect-meshes": {
    sections: ["optimize"],
    usage: [
      "  inspect-meshes --mesh-dir <path> [--max-faces <n>] [--meshes <a.stl,b.stl>] [--limits <a.stl=100000,b.stl=50000>]",
    ],
  },
  "compress-meshes": {
    sections: ["optimize"],
    usage: [
      "  compress-meshes --mesh-dir <path> [--max-faces <n>] [--meshes <a.stl,b.stl>] [--limits <a.stl=100000,b.stl=50000>] [--in-place | --out-dir <path>]",
    ],
  },
} as const satisfies Record<string, CommandCatalogEntry>;

export type SupportedCommandName = keyof typeof COMMAND_CATALOG;
export type CommandName = SupportedCommandName | "help";

export const SUPPORTED_COMMANDS = Object.keys(COMMAND_CATALOG) as SupportedCommandName[];

export const COMMAND_USAGE_BY_NAME: Readonly<Record<SupportedCommandName, readonly string[]>> =
  SUPPORTED_COMMANDS.reduce(
    (usageByName, commandName) => {
      usageByName[commandName] = COMMAND_CATALOG[commandName].usage;
      return usageByName;
    },
    {} as Record<SupportedCommandName, readonly string[]>
  );

const getCommandsForSection = (sectionKey: CommandSectionKey): SupportedCommandName[] =>
  SUPPORTED_COMMANDS.filter((commandName) =>
    COMMAND_CATALOG[commandName].sections.some((section) => section === sectionKey)
  );

export const TASK_FAMILIES: readonly TaskFamilyDefinition[] = TASK_FAMILY_ORDER.map((key) => ({
  key,
  ...TASK_FAMILY_METADATA[key],
  commands: getCommandsForSection(key),
}));

export const CLI_HELP_SECTIONS: readonly HelpSectionDefinition[] = [
  ...TASK_FAMILIES,
  ...AUXILIARY_HELP_SECTION_ORDER.map((key) => ({
    key,
    ...AUXILIARY_HELP_SECTION_METADATA[key],
    commands: getCommandsForSection(key),
  })),
];
