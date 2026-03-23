#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(root, "dist", "cli.js");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ilu-real-repos-"));

process.on("exit", () => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const log = (message) => {
  console.log(`[real-repos] ${message}`);
};

const formatCommand = (command, args) =>
  [command, ...args]
    .map((part) => (/\s/.test(part) ? JSON.stringify(part) : part))
    .join(" ");

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    env: options.env ?? process.env,
    encoding: "utf8",
  });

  if (result.error) {
    throw result.error;
  }

  if (!options.allowFailure && result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(
      `Command failed: ${formatCommand(command, args)}${
        output ? `\n${output}` : ""
      }`
    );
  }

  return result;
};

const runCli = (args, options = {}) => run(process.execPath, [cliPath, ...args], options);

const runCliJson = (args, options = {}) => {
  const result = runCli(args, options);
  const stdout = result.stdout.trim();
  if (!stdout) {
    throw new Error(`Expected JSON output from: ${formatCommand("ilu", args)}`);
  }
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(
      `Failed to parse JSON output from: ${formatCommand("ilu", args)}\n${stdout}`
    );
  }
};

const cloneRepo = ({ name, url, branch }) => {
  const destination = path.join(tempRoot, name);
  const cloneArgs = ["clone", "--depth", "1"];
  if (branch) {
    cloneArgs.push("--branch", branch);
  }
  cloneArgs.push(url, destination);
  log(`cloning ${url}`);
  run("git", cloneArgs, { cwd: tempRoot });
  return destination;
};

const requireValidUrdf = (urdfPath, label) => {
  const result = runCliJson(["validate", "--urdf", urdfPath]);
  assert(result.isValid === true, `${label} did not validate as URDF`);
};

const requireHealthCheckPass = (urdfPath, label, { strict = true } = {}) => {
  const args = ["health-check", "--urdf", urdfPath];
  if (strict) {
    args.push("--strict");
  }
  runCli(args);
  log(`${label}: health-check${strict ? " --strict" : ""} passed`);
};

const findCandidate = (summary, targetPath) =>
  summary.candidates.find((candidate) => candidate.path === targetPath) ?? null;

const requireXacroArg = (candidate, name, expectedDefaultValue) => {
  const match = candidate?.xacroArgs?.find((arg) => arg.name === name) ?? null;
  assert(match, `Missing xacro arg ${name} in inspect-repo output for ${candidate?.path ?? "unknown candidate"}`);
  if (expectedDefaultValue !== undefined) {
    assert(
      match.defaultValue === expectedDefaultValue,
      `Unexpected default for xacro arg ${name}: ${match.defaultValue}`
    );
  }
  return match;
};

const xacroRuntime = runCliJson([
  "setup-xacro-runtime",
  "--venv",
  path.join(tempRoot, "xacro-runtime"),
]);
assert(xacroRuntime.available === true, "setup-xacro-runtime did not produce a usable runtime");
assert(
  typeof xacroRuntime.pythonExecutable === "string" && xacroRuntime.pythonExecutable.length > 0,
  "setup-xacro-runtime did not return a pythonExecutable"
);
log(`using xacro runtime at ${xacroRuntime.pythonExecutable}`);

const anymalRepo = cloneRepo({
  name: "anymal_b_simple_description",
  url: "https://github.com/ANYbotics/anymal_b_simple_description.git",
});
const anymalInspection = runCliJson(["inspect-repo", "--local", anymalRepo]);
assert(anymalInspection.primaryCandidatePath === "urdf/anymal.urdf", "ANYmal primary candidate changed");
const anymalUrdfPath = path.join(tempRoot, "anymal.urdf");
runCli(["load-source", "--path", anymalRepo, "--out", anymalUrdfPath]);
requireValidUrdf(anymalUrdfPath, "ANYmal");
requireHealthCheckPass(anymalUrdfPath, "ANYmal");

const ros2ControlRepo = cloneRepo({
  name: "ros2_control_demos",
  url: "https://github.com/ros-controls/ros2_control_demos.git",
});
const rrbotEntryPath = "example_9/description/urdf/rrbot.urdf.xacro";
const rrbotInspection = runCliJson([
  "inspect-repo",
  "--local",
  ros2ControlRepo,
  "--max-candidates",
  "128",
]);
const rrbotCandidate = findCandidate(rrbotInspection, rrbotEntryPath);
assert(rrbotCandidate, `inspect-repo did not find ${rrbotEntryPath}`);
requireXacroArg(rrbotCandidate, "prefix", "");
requireXacroArg(rrbotCandidate, "use_gazebo", "false");
const rrbotUrdfPath = path.join(tempRoot, "rrbot.urdf");
runCli([
  "load-source",
  "--path",
  ros2ControlRepo,
  "--entry",
  rrbotEntryPath,
  "--python",
  xacroRuntime.pythonExecutable,
  "--out",
  rrbotUrdfPath,
]);
requireValidUrdf(rrbotUrdfPath, "RRBot example_9");

const urRepo = cloneRepo({
  name: "Universal_Robots_ROS2_Description",
  url: "https://github.com/UniversalRobots/Universal_Robots_ROS2_Description.git",
  branch: "rolling",
});
const urEntryPath = "urdf/ur_mocked.urdf.xacro";
const urInspection = runCliJson([
  "inspect-repo",
  "--local",
  urRepo,
  "--max-candidates",
  "64",
]);
const urCandidate = findCandidate(urInspection, urEntryPath);
assert(urCandidate, `inspect-repo did not find ${urEntryPath}`);
const requiredNameArg = requireXacroArg(urCandidate, "name", "ur");
assert(requiredNameArg.isRequired === false, "UR name arg should be optional because it has a default");
requireXacroArg(urCandidate, "ur_type", "ur5x");

const missingUrArgs = runCli(
  [
    "load-source",
    "--path",
    urRepo,
    "--entry",
    urEntryPath,
    "--python",
    xacroRuntime.pythonExecutable,
  ],
  { allowFailure: true }
);
assert(missingUrArgs.status !== 0, "UR load-source unexpectedly succeeded without required args");
const missingUrArgsOutput = [missingUrArgs.stdout, missingUrArgs.stderr].filter(Boolean).join("\n");
assert(
  missingUrArgsOutput.includes("--args name=<value>"),
  "UR missing-arg guidance did not include the suggested --args flag"
);
assert(
  missingUrArgsOutput.includes("Undefined substitution argument name"),
  "UR missing-arg guidance did not preserve the original xacro error"
);

const urUrdfPath = path.join(tempRoot, "ur5e.urdf");
runCli([
  "load-source",
  "--path",
  urRepo,
  "--entry",
  urEntryPath,
  "--args",
  "name=ur,ur_type=ur5e",
  "--python",
  xacroRuntime.pythonExecutable,
  "--out",
  urUrdfPath,
]);
requireValidUrdf(urUrdfPath, "Universal Robots ur_mocked");

const turtlebotRepo = cloneRepo({
  name: "turtlebot3",
  url: "https://github.com/ROBOTIS-GIT/turtlebot3.git",
  branch: "main",
});
const turtlebotInspection = runCliJson([
  "inspect-repo",
  "--local",
  turtlebotRepo,
  "--max-candidates",
  "32",
]);
assert(
  turtlebotInspection.primaryCandidatePath ===
    "turtlebot3_description/urdf/turtlebot3_burger.urdf",
  "TurtleBot3 primary candidate changed"
);
const turtlebotUrdfPath = path.join(tempRoot, "turtlebot3_burger.urdf");
runCli(["load-source", "--path", turtlebotRepo, "--out", turtlebotUrdfPath]);
requireValidUrdf(turtlebotUrdfPath, "TurtleBot3 burger");
requireHealthCheckPass(turtlebotUrdfPath, "TurtleBot3 burger");

const openManipulatorRepo = cloneRepo({
  name: "open_manipulator",
  url: "https://github.com/ROBOTIS-GIT/open_manipulator.git",
});
const openManipulatorEntryPath =
  "open_manipulator_description/urdf/omx_f/omx_f.urdf.xacro";
const openManipulatorInspection = runCliJson([
  "inspect-repo",
  "--local",
  openManipulatorRepo,
  "--max-candidates",
  "64",
]);
const openManipulatorCandidate = findCandidate(
  openManipulatorInspection,
  openManipulatorEntryPath
);
assert(
  openManipulatorCandidate,
  `inspect-repo did not find ${openManipulatorEntryPath}`
);
const openManipulatorUrdfPath = path.join(tempRoot, "open_manipulator.urdf");
runCli([
  "load-source",
  "--path",
  openManipulatorRepo,
  "--entry",
  openManipulatorEntryPath,
  "--python",
  xacroRuntime.pythonExecutable,
  "--out",
  openManipulatorUrdfPath,
]);
requireValidUrdf(openManipulatorUrdfPath, "OpenManipulator omx_f");
requireHealthCheckPass(openManipulatorUrdfPath, "OpenManipulator omx_f", {
  strict: false,
});

const fanucRepo = cloneRepo({
  name: "fanuc",
  url: "https://github.com/ros-industrial/fanuc.git",
  branch: "noetic-devel",
});
const fanucEntryPath = "fanuc_lrmate200i_support/urdf/lrmate200i.xacro";
const fanucInspection = runCliJson([
  "inspect-repo",
  "--local",
  fanucRepo,
  "--max-candidates",
  "64",
]);
const fanucCandidate = findCandidate(fanucInspection, fanucEntryPath);
assert(fanucCandidate, `inspect-repo did not find ${fanucEntryPath}`);
const fanucUrdfPath = path.join(tempRoot, "fanuc_lrmate200i.urdf");
runCli([
  "load-source",
  "--path",
  fanucRepo,
  "--entry",
  fanucEntryPath,
  "--python",
  xacroRuntime.pythonExecutable,
  "--out",
  fanucUrdfPath,
]);
requireValidUrdf(fanucUrdfPath, "Fanuc LR Mate 200i");
requireHealthCheckPass(fanucUrdfPath, "Fanuc LR Mate 200i");

const bitbotsRepo = cloneRepo({
  name: "bitbots_meta",
  url: "https://github.com/bit-bots/bitbots_meta.git",
  branch: "main",
});
const bitbotsEntryPath = "src/bitbots_robot/wolfgang_description/urdf/robot.urdf";
const bitbotsInspection = runCliJson([
  "inspect-repo",
  "--local",
  bitbotsRepo,
  "--max-candidates",
  "64",
]);
assert(
  bitbotsInspection.primaryCandidatePath === bitbotsEntryPath,
  "Bit-Bots primary candidate changed"
);
const bitbotsUrdfPath = path.join(tempRoot, "wolfgang.urdf");
runCli([
  "load-source",
  "--path",
  bitbotsRepo,
  "--entry",
  bitbotsEntryPath,
  "--out",
  bitbotsUrdfPath,
]);
requireValidUrdf(bitbotsUrdfPath, "Bit-Bots Wolfgang");
requireHealthCheckPass(bitbotsUrdfPath, "Bit-Bots Wolfgang", { strict: false });

log("all real-repo checks passed");
