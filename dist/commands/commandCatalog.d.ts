export type TaskFamilyKey = "load" | "health" | "validate" | "analyze" | "format" | "edit" | "normalize" | "optimize" | "convert";
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
export declare const COMMAND_CATALOG: {
    readonly validate: {
        readonly sections: readonly ["validate"];
        readonly usage: readonly ["  validate --urdf <path>"];
    };
    readonly "health-check": {
        readonly sections: readonly ["health"];
        readonly usage: readonly ["  health-check --urdf <path> [--strict]"];
    };
    readonly analyze: {
        readonly sections: readonly ["analyze"];
        readonly usage: readonly ["  analyze --urdf <path>"];
    };
    readonly "robot-type": {
        readonly sections: readonly ["analyze"];
        readonly usage: readonly ["  robot-type --urdf <path>"];
    };
    readonly "morphology-card": {
        readonly sections: readonly ["analyze"];
        readonly usage: readonly ["  morphology-card --urdf <path> [--name-hints <a,b,c>] [--no-name-heuristics]"];
    };
    readonly "gallery-generate": {
        readonly sections: readonly ["analyze"];
        readonly usage: readonly ["  gallery-generate --urdf <path> [--out <path>]", "  gallery-generate --local <repo> | --github <owner/repo|url> [--ref <branch>] [--path <subdir>] [--out <path>]"];
    };
    readonly "gallery-render": {
        readonly sections: readonly ["analyze"];
        readonly usage: readonly ["  gallery-render --local <repo> | --github <owner/repo|url> --app <url> --urdf <repo-path> [--urdf <repo-path> ...] [--asset image] [--asset video] --out <path>"];
    };
    readonly "gallery-build-publish": {
        readonly sections: readonly ["analyze"];
        readonly usage: readonly ["  gallery-build-publish --spec <path> [--out <path>]"];
    };
    readonly "guess-orientation": {
        readonly sections: readonly ["analyze"];
        readonly usage: readonly ["  guess-orientation --urdf <path> [--target-up <x|y|z>] [--target-forward <x|y|z>]"];
    };
    readonly diff: {
        readonly sections: readonly ["analyze"];
        readonly usage: readonly ["  diff --left <path> --right <path>"];
    };
    readonly "fix-mesh-paths": {
        readonly sections: readonly ["optimize"];
        readonly usage: readonly ["  fix-mesh-paths --urdf <path> [--package <name>] [--out <path>]"];
    };
    readonly "bundle-mesh-assets": {
        readonly sections: readonly ["optimize"];
        readonly usage: readonly ["  bundle-mesh-assets --urdf <path> [--out <path>]"];
    };
    readonly "mesh-refs": {
        readonly sections: readonly ["analyze"];
        readonly usage: readonly ["  mesh-refs --urdf <path>"];
    };
    readonly "canonical-order": {
        readonly sections: readonly ["format"];
        readonly usage: readonly ["  canonical-order --urdf <path> [--out <path>]"];
    };
    readonly "pretty-print": {
        readonly sections: readonly ["format"];
        readonly usage: readonly ["  pretty-print --urdf <path> [--indent <n>] [--out <path>]"];
    };
    readonly "normalize-axes": {
        readonly sections: readonly ["format"];
        readonly usage: readonly ["  normalize-axes --urdf <path> [--out <path>]"];
    };
    readonly "snap-axes": {
        readonly sections: readonly ["format"];
        readonly usage: readonly ["  snap-axes --urdf <path> [--tolerance <n>] [--out <path>]"];
    };
    readonly "set-joint-axis": {
        readonly sections: readonly ["edit"];
        readonly usage: readonly ["  set-joint-axis --urdf <path> --joint <name> --xyz \"0 1 0\" [--out <path>]"];
    };
    readonly "set-joint-origin": {
        readonly sections: readonly ["edit"];
        readonly usage: readonly ["  set-joint-origin --urdf <path> --joint <name> --xyz \"0 0 0\" --rpy \"0 0 0\" [--out <path>]"];
    };
    readonly "set-joint-type": {
        readonly sections: readonly ["edit"];
        readonly usage: readonly ["  set-joint-type --urdf <path> --joint <name> --type <revolute|continuous|prismatic|fixed|floating|planar> [--lower <n>] [--upper <n>] [--out <path>]"];
    };
    readonly "set-joint-limits": {
        readonly sections: readonly ["edit"];
        readonly usage: readonly ["  set-joint-limits --urdf <path> --joint <name> --lower <n> --upper <n> [--out <path>]"];
    };
    readonly "set-joint-velocity": {
        readonly sections: readonly ["edit"];
        readonly usage: readonly ["  set-joint-velocity --urdf <path> --joint <name> --velocity <n> [--out <path>]"];
    };
    readonly "canonicalize-joint-frame": {
        readonly sections: readonly ["normalize"];
        readonly usage: readonly ["  canonicalize-joint-frame --urdf <path> [--target-axis <x|y|z>] [--joint <name> | --joints <a,b,c>] [--out <path>]"];
    };
    readonly "rotate-90": {
        readonly sections: readonly ["edit"];
        readonly usage: readonly ["  rotate-90 --urdf <path> --axis <x|y|z> [--out <path>]"];
    };
    readonly "apply-orientation": {
        readonly sections: readonly ["edit", "normalize"];
        readonly usage: readonly ["  apply-orientation --urdf <path> --source-up <axis> --source-forward <axis> [--target-up <axis>] [--target-forward <axis>] [--out <path>]"];
    };
    readonly "normalize-robot": {
        readonly sections: readonly ["normalize"];
        readonly usage: readonly ["  normalize-robot --urdf <path> [--apply] [--snap-axes] [--canonicalize-joint-frame] [--target-axis <x|y|z>] [--source-up <axis>] [--source-forward <axis>] [--target-up <axis>] [--target-forward <axis>] [--pretty-print] [--canonical-order] [--out <path>]"];
    };
    readonly "remove-joints": {
        readonly sections: readonly ["edit"];
        readonly usage: readonly ["  remove-joints --urdf <path> --joints <a,b,c> [--out <path>]"];
    };
    readonly "reassign-joint": {
        readonly sections: readonly ["edit"];
        readonly usage: readonly ["  reassign-joint --urdf <path> --joint <name> --parent <link> --child <link> [--out <path>]"];
    };
    readonly "set-material-color": {
        readonly sections: readonly ["edit"];
        readonly usage: readonly ["  set-material-color --urdf <path> --link <name> --material <name> --color <#RRGGBB> [--out <path>]"];
    };
    readonly "merge-urdf": {
        readonly sections: readonly ["edit"];
        readonly usage: readonly ["  merge-urdf --urdf <path> --attach <path[,path]> [--name <robot>] [--spacing <n>] [--out <path>]"];
    };
    readonly "replace-subrobot": {
        readonly sections: readonly ["edit"];
        readonly usage: readonly ["  replace-subrobot --urdf <path> --replace-root <link> --replacement <path> --replacement-root <link> [--mount-parent <link>] [--mount-joint <name>] [--prefix <value>] [--xyz \"0 0 0\"] [--rpy \"0 0 0\"] [--calibrate] [--portable] [--out <path>]"];
    };
    readonly "mesh-to-assets": {
        readonly sections: readonly ["optimize"];
        readonly usage: readonly ["  mesh-to-assets --urdf <path> [--out <path>]"];
    };
    readonly "urdf-to-mjcf": {
        readonly sections: readonly ["convert"];
        readonly usage: readonly ["  urdf-to-mjcf --urdf <path> [--out <path>]"];
    };
    readonly "urdf-to-usd": {
        readonly sections: readonly ["convert"];
        readonly usage: readonly ["  urdf-to-usd --urdf <path> [--root <dir>] [--out <path>]", "  urdf-to-usd --path <file|repo> [--entry <repo-path>] [--root <dir>] [--args name=value,...] [--python <path>] [--wheel <path>] [--out <path>]"];
    };
    readonly "urdf-to-xacro": {
        readonly sections: readonly ["convert"];
        readonly usage: readonly ["  urdf-to-xacro --urdf <path> [--out <path>]"];
    };
    readonly "xacro-to-urdf": {
        readonly sections: readonly ["convert"];
        readonly usage: readonly ["  xacro-to-urdf --xacro <path> [--root <dir>] [--args name=value,...] [--python <path>] [--wheel <path>] [--out <path>]", "  xacro-to-urdf --local <repo> --entry <repo-path> [--args name=value,...] [--python <path>] [--wheel <path>] [--out <path>]", "  xacro-to-urdf --github <owner/repo|url> --entry <repo-path> [--ref <branch>] [--path <subdir>] [--token <token>] [--args name=value,...] [--python <path>] [--wheel <path>] [--out <path>]"];
    };
    readonly "probe-xacro-runtime": {
        readonly sections: readonly ["xacro-runtime"];
        readonly usage: readonly ["  probe-xacro-runtime [--python <path>] [--wheel <path>]"];
    };
    readonly "setup-xacro-runtime": {
        readonly sections: readonly ["xacro-runtime"];
        readonly usage: readonly ["  setup-xacro-runtime [--python <path>] [--venv <path>]"];
    };
    readonly "load-source": {
        readonly sections: readonly ["load"];
        readonly usage: readonly ["  load-source --path <local-file-or-dir> [--entry <repo-path>] [--root <dir>] [--args name=value,...] [--python <path>] [--wheel <path>] [--out <path>]", "  load-source --github <owner/repo|url> [--entry <repo-path>] [--ref <branch>] [--subdir <path>] [--token <token>] [--args name=value,...] [--python <path>] [--wheel <path>] [--out <path>]"];
    };
    readonly assemble: {
        readonly sections: readonly ["load"];
        readonly usage: readonly ["  assemble --urdf <path> [--attach <path[,path]>] [--name <label>]"];
    };
    readonly "rename-joint": {
        readonly sections: readonly ["edit"];
        readonly usage: readonly ["  rename-joint --urdf <path> --joint <old> --name <new> [--out <path>]"];
    };
    readonly "rename-link": {
        readonly sections: readonly ["edit"];
        readonly usage: readonly ["  rename-link --urdf <path> --link <old> --name <new> [--out <path>]"];
    };
    readonly "inspect-repo": {
        readonly sections: readonly ["load"];
        readonly usage: readonly ["  inspect-repo --local <path> | --github <owner/repo|url> [--ref <branch>] [--path <subdir>] [--max-candidates <n>] [--token <token>] [--out <path>]"];
    };
    readonly "repair-mesh-refs": {
        readonly sections: readonly ["optimize"];
        readonly usage: readonly ["  repair-mesh-refs --local <repo|urdf-path> | --github <owner/repo|url> [--urdf <repo-path>] [--ref <branch>] [--path <subdir>] [--token <token>] [--out <path>]"];
    };
    readonly "repo-fixes": {
        readonly sections: readonly ["optimize"];
        readonly usage: readonly ["  repo-fixes --local <repo> | --github <owner/repo|url> [--ref <branch>] [--path <subdir>] [--out <path>]"];
    };
    readonly "inspect-meshes": {
        readonly sections: readonly ["optimize"];
        readonly usage: readonly ["  inspect-meshes --mesh-dir <path> [--max-faces <n>] [--meshes <a.stl,b.stl>] [--limits <a.stl=100000,b.stl=50000>]"];
    };
    readonly "compress-meshes": {
        readonly sections: readonly ["optimize"];
        readonly usage: readonly ["  compress-meshes --mesh-dir <path> [--max-faces <n>] [--meshes <a.stl,b.stl>] [--limits <a.stl=100000,b.stl=50000>] [--in-place | --out-dir <path>]"];
    };
};
export type SupportedCommandName = keyof typeof COMMAND_CATALOG;
export type CommandName = SupportedCommandName | "help";
export declare const SUPPORTED_COMMANDS: SupportedCommandName[];
export declare const COMMAND_USAGE_BY_NAME: Readonly<Record<SupportedCommandName, readonly string[]>>;
export declare const TASK_FAMILIES: readonly TaskFamilyDefinition[];
export declare const CLI_HELP_SECTIONS: readonly HelpSectionDefinition[];
