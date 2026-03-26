import { createAssemblySession, openStudioForAssemblySession } from "../session/assemblySession";
import { emitJsonPayload, type SourceCommandHandler } from "./sourceCommandRuntime";

export const SOURCE_STUDIO_COMMAND_HANDLERS = {
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

    const assembly = createAssemblySession({
      urdfPaths: [primaryUrdfPath, ...attachPaths],
      label: helpers.getOptionalStringArg(args, "name"),
    });
    const visualizer = await openStudioForAssemblySession(assembly.snapshot.sessionId);
    const started = visualizer.started;
    let visualizerStart:
      | { ok: true; studioRoot: string | null }
      | { ok: false; code: string; reason: string; studioRoot: string | null };
    if ("code" in started) {
      visualizerStart = {
        ok: false,
        code: started.code,
        reason: started.reason,
        studioRoot: started.studioRoot,
      };
    } else {
      visualizerStart = {
        ok: true,
        studioRoot: started.studioRoot,
      };
    }

    emitJsonPayload(helpers, undefined, {
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
} satisfies Record<"assemble", SourceCommandHandler>;
