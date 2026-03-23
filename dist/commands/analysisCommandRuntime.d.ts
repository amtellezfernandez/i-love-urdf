import type { CliArgMap, CliCommandHelpers } from "./commandHelpers";
export type AnalysisCommandHandler = (args: CliArgMap, helpers: CliCommandHelpers) => Promise<void> | void;
export declare const emitJson: (value: unknown) => void;
export declare const readRequiredUrdfInput: (args: CliArgMap, helpers: CliCommandHelpers) => {
    urdfPath: string;
    urdfContent: string;
};
export declare const extractMeshRefs: (urdfContent: string) => import("../mesh/meshPaths").MeshReference[];
