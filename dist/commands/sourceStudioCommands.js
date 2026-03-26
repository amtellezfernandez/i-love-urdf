"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SOURCE_STUDIO_COMMAND_HANDLERS = void 0;
const assemblySession_1 = require("../session/assemblySession");
const sourceCommandRuntime_1 = require("./sourceCommandRuntime");
exports.SOURCE_STUDIO_COMMAND_HANDLERS = {
    assemble: async (args, helpers) => {
        const primaryUrdfPath = helpers.getOptionalStringArg(args, "urdf");
        if (!primaryUrdfPath) {
            helpers.fail("assemble requires --urdf <path>.");
        }
        const attachArg = helpers.getOptionalStringArg(args, "attach");
        const attachPaths = (attachArg || "")
            .split(",")
            .map((item) => item.trim())
            .filter((item) => item.length > 0);
        const assembly = (0, assemblySession_1.createAssemblySession)({
            urdfPaths: [primaryUrdfPath, ...attachPaths],
            label: helpers.getOptionalStringArg(args, "name"),
        });
        const visualizer = await (0, assemblySession_1.openStudioForAssemblySession)(assembly.snapshot.sessionId);
        const started = visualizer.started;
        let visualizerStart;
        if ("code" in started) {
            visualizerStart = {
                ok: false,
                code: started.code,
                reason: started.reason,
                studioRoot: started.studioRoot,
            };
        }
        else {
            visualizerStart = {
                ok: true,
                studioRoot: started.studioRoot,
            };
        }
        (0, sourceCommandRuntime_1.emitJsonPayload)(helpers, undefined, {
            ok: started.ok,
            sessionId: assembly.snapshot.sessionId,
            sessionDir: assembly.sessionDir,
            workspaceRoot: assembly.snapshot.workspaceRoot,
            studioUrl: visualizer.studioUrl,
            copiedFiles: assembly.copiedFiles,
            robotCount: assembly.snapshot.robots.length,
            selectedPaths: assembly.snapshot.selectedPaths,
            visualizerOpened: visualizer.opened,
            visualizerStart,
        });
    },
};
