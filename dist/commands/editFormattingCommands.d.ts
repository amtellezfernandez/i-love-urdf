export declare const EDIT_FORMATTING_COMMAND_HANDLERS: {
    "fix-mesh-paths": ({ args, helpers, urdfContent, outPath }: import("./editCommandRuntime").EditCommandContext) => void;
    "canonical-order": ({ helpers, urdfContent, outPath }: import("./editCommandRuntime").EditCommandContext) => void;
    "pretty-print": ({ args, helpers, urdfContent, outPath }: import("./editCommandRuntime").EditCommandContext) => void;
    "normalize-axes": ({ helpers, urdfContent, outPath }: import("./editCommandRuntime").EditCommandContext) => void;
    "snap-axes": ({ args, helpers, urdfContent, outPath }: import("./editCommandRuntime").EditCommandContext) => void;
    "mesh-to-assets": ({ helpers, urdfContent, outPath }: import("./editCommandRuntime").EditCommandContext) => void;
};
