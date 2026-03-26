export declare const EDIT_JOINT_COMMAND_HANDLERS: {
    "set-joint-axis": ({ args, helpers, urdfContent, outPath }: import("./editCommandRuntime").EditCommandContext) => void;
    "set-joint-type": ({ args, helpers, urdfContent, outPath }: import("./editCommandRuntime").EditCommandContext) => void;
    "set-joint-limits": ({ args, helpers, urdfContent, outPath }: import("./editCommandRuntime").EditCommandContext) => void;
    "set-joint-velocity": ({ args, helpers, urdfContent, outPath }: import("./editCommandRuntime").EditCommandContext) => void;
    "canonicalize-joint-frame": ({ args, helpers, urdfContent, outPath }: import("./editCommandRuntime").EditCommandContext) => void;
    "remove-joints": ({ args, helpers, urdfContent, outPath }: import("./editCommandRuntime").EditCommandContext) => void;
    "reassign-joint": ({ args, helpers, urdfContent, outPath }: import("./editCommandRuntime").EditCommandContext) => void;
    "set-material-color": ({ args, helpers, urdfContent, outPath }: import("./editCommandRuntime").EditCommandContext) => void;
    "merge-urdf": ({ args, helpers, urdfContent, urdfPath, outPath }: import("./editCommandRuntime").EditCommandContext) => void;
    "rename-joint": ({ args, helpers, urdfContent, outPath }: import("./editCommandRuntime").EditCommandContext) => void;
    "rename-link": ({ args, helpers, urdfContent, outPath }: import("./editCommandRuntime").EditCommandContext) => void;
};
