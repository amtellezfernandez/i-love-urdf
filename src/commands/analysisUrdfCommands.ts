import {
  analyzeUrdf,
  buildRobotMorphologyCard,
  compareUrdfs,
  guessUrdfOrientation,
  healthCheckUrdf,
  identifyRobotType,
  validateUrdf,
} from "../index";
import { emitJson, readRequiredUrdfInput, type AnalysisCommandHandler } from "./analysisCommandRuntime";

export const ANALYSIS_URDF_COMMAND_HANDLERS = {
  diff: (args, helpers) => {
    const leftPath = helpers.requireStringArg(args, "left");
    const rightPath = helpers.requireStringArg(args, "right");
    emitJson({
      ...compareUrdfs(helpers.readText(leftPath), helpers.readText(rightPath)),
      leftPath,
      rightPath,
    });
  },

  validate: (args, helpers) => {
    emitJson(validateUrdf(readRequiredUrdfInput(args, helpers).urdfContent));
  },

  "health-check": (args, helpers) => {
    const result = healthCheckUrdf(readRequiredUrdfInput(args, helpers).urdfContent);
    emitJson(result);
    if (Boolean(args.get("strict")) && !result.ok) {
      process.exit(1);
    }
  },

  analyze: (args, helpers) => {
    emitJson(analyzeUrdf(readRequiredUrdfInput(args, helpers).urdfContent));
  },

  "robot-type": (args, helpers) => {
    emitJson({ robotType: identifyRobotType(readRequiredUrdfInput(args, helpers).urdfContent) });
  },

  "morphology-card": (args, helpers) => {
    const { urdfContent } = readRequiredUrdfInput(args, helpers);
    emitJson(
      buildRobotMorphologyCard(analyzeUrdf(urdfContent), {
        nameHints: helpers.getDelimitedStringArg(args, "name-hints"),
        includeNameHeuristics: !Boolean(args.get("no-name-heuristics")),
      })
    );
  },

  "guess-orientation": (args, helpers) => {
    const { urdfContent } = readRequiredUrdfInput(args, helpers);
    emitJson(
      guessUrdfOrientation(urdfContent, {
        targetUpAxis: helpers.getSimpleAxisArg(args, "target-up"),
        targetForwardAxis: helpers.getSimpleAxisArg(args, "target-forward"),
      })
    );
  },
} satisfies Record<
  | "diff"
  | "validate"
  | "health-check"
  | "analyze"
  | "robot-type"
  | "morphology-card"
  | "guess-orientation",
  AnalysisCommandHandler
>;
