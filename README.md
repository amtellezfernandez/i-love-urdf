# i-love-urdf

Tools for loading, checking, editing, converting, and structurally analyzing URDFs.

`i-love-urdf` is the core package behind `urdf-studio`.
The CLI command is `ilu`.
Global installs also expose `i-love-urdf` as a compatibility alias.
Website documentation lives in `i-love-urdf-web`.

The package includes a reusable robot morphology layer for producing machine-readable,
explainable summaries such as:

- branch counts: arms, legs, wheels
- kinematics: controllable joints, total DOF
- structural families: `humanoid-like`, `quadruped-like`, `mobile-manipulator`, `wheeled`
- canonical tags: `humanoid`, `quadruped`, `mobile-manipulator`, `end-effector`, `aerial`
- display tags: `Humanoid`, `Quadruped`, `Mobile Manipulator`, `End Effector`, `Drone`

The package also includes an orientation inference layer for producing explainable
Y-up / Z-up reports such as:

- likely up / forward / lateral basis directions
- geometry span evidence
- wheel-axis and joint-axis votes
- PCA-based directional cues
- explicit conflicts and suggested `apply-orientation` commands

For local repository workflows, the Node-only helpers can also augment
orientation and health checks with real STL/OBJ/DAE bounds resolved from disk.

## Install

The package is not currently published on the npm registry under `i-love-urdf`.
If you only need the CLI on a workstation, install it globally from GitHub, a release tarball, or a local checkout.

Requirements:

- Node.js 20, 22, or 24
- npm

Install the CLI globally from GitHub:

```sh
npm install -g --install-links=true git+https://github.com/amtellezfernandez/i-love-urdf.git
ilu --help
```

Use `--install-links=true` for GitHub installs so npm writes an actual global package instead of a temporary cache link.
Current GitHub installs include the built `dist/` tree directly in the repository, so rerunning the same command upgrades the global CLI in place.
Global installs expose both `ilu` and `i-love-urdf`, but the canonical command is `ilu`.
If you are reinstalling an older checkout or release that still used npm git-dependency preparation, run `npm uninstall -g i-love-urdf` first and then rerun the install command.

Install the CLI globally from a release tarball:

```sh
npm install -g ./path/to/i-love-urdf-<version>.tgz
ilu --help
```

Install the CLI globally from a local checkout:

```sh
git clone https://github.com/amtellezfernandez/i-love-urdf.git
cd i-love-urdf
npm install -g .
ilu --help
```

After modifying a local checkout, refresh the global CLI binaries with:

```sh
corepack pnpm refresh:global
```

When you are preparing a GitHub-installable commit or a release tarball from this repo, rebuild the tracked package output first:

```sh
corepack pnpm build:package
```

If you are developing from a repository checkout instead of installing the CLI globally, use the repository-local workflow below.

Repository development requirements:

- Node.js 20, 22, or 24
- Corepack

```sh
# optional: use the maintainer baseline (.nvmrc / .node-version / .tool-versions / Volta)
corepack enable
corepack pnpm install

# run the CLI from this repository checkout
corepack pnpm ilu --help

# run the targeted contract/invariant tests
corepack pnpm test

# verify git, tarball, and local-checkout install paths
corepack pnpm check:install

# optional: enable local XACRO expansion once per clone
corepack pnpm setup:xacro
corepack pnpm ilu probe-xacro-runtime
```

The repository is tested on Node `20.19.6`, and the package also supports current Node `22.x` and `24.x`.

From a repository checkout, run the CLI as `corepack pnpm ilu ...` (or `pnpm ilu ...` if `pnpm` is already on your `PATH`).
Use plain `ilu ...` when the package is installed as a global CLI in your environment.
`i-love-urdf ...` remains available as a compatibility alias.

When working against GitHub repositories, pass the repository with `--github <owner/repo|url>`.
For example, use `inspect-repo --github ANYbotics/anymal_b_simple_description` or `inspect-repo --github https://github.com/ANYbotics/anymal_b_simple_description`.
Do not write a `--https=...` flag; the URL belongs to the value of `--github`.

Before using a `--github` command on a new machine, complete this one-time setup:

```sh
gh auth login
gh auth status
```

If `gh` is already logged in, the CLI can use that authenticated session for GitHub repository commands.

GitHub auth for `--github` commands follows this order:

- `--token <token>`
- `GITHUB_TOKEN`
- `GH_TOKEN`
- GitHub CLI stored auth token when `gh` is installed and already logged in

If you already use `gh auth login` in your terminal, you usually do not need to pass `--token` manually.
If `gh` is not installed, use `--token`, `GITHUB_TOKEN`, or `GH_TOKEN` instead.
For CI or headless shells, set `GITHUB_TOKEN` or `GH_TOKEN` explicitly.
Git config identity such as `user.name` / `user.email` is not used for GitHub API auth.

## Common CLI Commands

Examples below use installed-CLI syntax with `ilu`.
`i-love-urdf` is a compatibility alias.
From a repository checkout, prepend `corepack pnpm` and keep the repository-local `ilu` command.

```sh
# load a file or repository
ilu load-source --path ./robot.urdf
ilu inspect-repo --local ./my-robot-repo
ilu inspect-repo --github ANYbotics/anymal_b_simple_description
ilu load-source --github owner/repo --entry urdf/robot.urdf.xacro --out robot.urdf

# check a robot
ilu validate --urdf robot.urdf
ilu health-check --urdf robot.urdf
ilu analyze --urdf robot.urdf
ilu robot-type --urdf robot.urdf
ilu morphology-card --urdf robot.urdf --name-hints unitree_go2,gripper
ilu guess-orientation --urdf robot.urdf

# edit / normalize
ilu pretty-print --urdf robot.urdf --out robot.pretty.urdf
ilu snap-axes --urdf robot.urdf --out robot.snapped.urdf
ilu rename-link --urdf robot.urdf --link tool --name tool0 --out robot.edited.urdf
ilu normalize-robot --urdf robot.urdf --snap-axes --canonicalize-joint-frame

# mesh / conversion
ilu fix-mesh-paths --urdf robot.urdf --out robot.fixed.urdf
ilu inspect-meshes --mesh-dir ./meshes
ilu compress-meshes --mesh-dir ./meshes --in-place
ilu urdf-to-mjcf --urdf robot.urdf --out robot.xml
ilu urdf-to-usd --urdf robot.urdf --root ./robot-repo --out robot.usda
ilu urdf-to-xacro --urdf robot.urdf --out robot.urdf.xacro
ilu xacro-to-urdf --xacro robot.urdf.xacro --out robot.urdf
```

If you are starting from a repository or a XACRO entrypoint, begin with `inspect-repo` or `load-source`.

## Robot Morphology Cards

Use `morphology-card` when you want a compact research-facing summary of a robot's
structure and inferred category tags.

Repository examples:
[research_mobile_manipulator_gripper.urdf](/home/am/dev/i-love-urdf/examples/morphology-card/research_mobile_manipulator_gripper.urdf)
with
[research_mobile_manipulator_gripper.card.json](/home/am/dev/i-love-urdf/examples/morphology-card/research_mobile_manipulator_gripper.card.json),
and
[research_humanoid_torso_hands.urdf](/home/am/dev/i-love-urdf/examples/morphology-card/research_humanoid_torso_hands.urdf)
with
[research_humanoid_torso_hands.card.json](/home/am/dev/i-love-urdf/examples/morphology-card/research_humanoid_torso_hands.card.json).

```sh
ilu morphology-card --urdf robot.urdf --name-hints atlas,hand
```

Example output:

```json
{
  "schema": "i-love-urdf/robot-morphology-card",
  "schemaVersion": "1.0.0",
  "summary": {
    "armCount": 2,
    "legCount": 2,
    "wheelCount": 0,
    "controllableJointCount": 29,
    "dofCount": 29,
    "primaryFamily": "humanoid-like"
  },
  "canonicalTags": ["humanoid"],
  "displayTags": ["Humanoid"],
  "tags": [
    {
      "tag": "humanoid",
      "confidence": "high",
      "source": "structure",
      "reasons": ["Detected 2 leg branches and 2 arm branches."]
    }
  ]
}
```

This output is designed to be:

- deterministic where possible
- explainable through explicit reasons
- machine-readable for robotics pipelines and dataset tooling
- versioned through stable `schema` and `schemaVersion` fields
- separate from product/UI wording

## Orientation Reports

Use `guess-orientation` and `buildRobotOrientationCard(...)` when you need a
compact, explainable orientation guess before normalization or downstream conversion.

For pure/core usage, the guess is built from URDF geometry, link/joint structure,
wheel-axis votes, and PCA over sampled points. For local loaded sources in Node,
`i-love-urdf/urdf-node` can augment that with real STL/OBJ/DAE AABB corners resolved from disk.

Repository examples:
[research_wheeled_z_up.urdf](/home/am/dev/i-love-urdf/examples/orientation-card/research_wheeled_z_up.urdf)
with
[research_wheeled_z_up.card.json](/home/am/dev/i-love-urdf/examples/orientation-card/research_wheeled_z_up.card.json),
and
[research_wheeled_y_up.urdf](/home/am/dev/i-love-urdf/examples/orientation-card/research_wheeled_y_up.urdf)
with
[research_wheeled_y_up.card.json](/home/am/dev/i-love-urdf/examples/orientation-card/research_wheeled_y_up.card.json).

```sh
ilu guess-orientation --urdf robot.urdf
```

Example output:

```json
{
  "schema": "i-love-urdf/robot-orientation-card",
  "schemaVersion": "1.0.0",
  "summary": {
    "classification": "y-up",
    "confidence": 0.89,
    "likelyUpDirection": "+y",
    "likelyForwardDirection": "+x"
  },
  "targetBasis": {
    "up": "+z",
    "forward": "+x"
  },
  "report": {
    "conflicts": [
      "PCA up cue suggests +z, while the final basis kept Y as up."
    ]
  },
  "suggestedApplyOrientation": {
    "command": "ilu apply-orientation --urdf robot.urdf --source-up +y --source-forward +x --target-up +z --target-forward +x --out robot.oriented.urdf"
  }
}
```

This output is designed to be:

- deterministic at the basis-selection level
- explainable through spans, wheel/joint votes, and PCA cues
- machine-readable for repair and downstream processing pipelines
- versioned through stable `schema` and `schemaVersion` fields
- explicit about evidence conflicts instead of hiding them

## Node API

```ts
import {
  analyzeUrdf,
  buildRobotOrientationCard,
  buildRobotMorphologyCard,
  checkPhysicsHealth,
  convertLoadedSourceToMJCF,
  guessUrdfOrientation,
  identifyRobotType,
  validateLoadedSource,
} from "i-love-urdf";
import { loadSourceFromPath } from "i-love-urdf/load-source-node";
import {
  buildLoadedSourceOrientationCard,
  checkLoadedSourcePhysicsHealth,
  convertLoadedSourceToUSD,
} from "i-love-urdf/urdf-node";

const loaded = await loadSourceFromPath({ path: "./robot.urdf.xacro" });
const validation = validateLoadedSource(loaded);
const robotType = identifyRobotType(loaded.urdf);
const physics = checkPhysicsHealth(loaded.urdf);
const mjcf = convertLoadedSourceToMJCF(loaded);
const card = buildRobotMorphologyCard(analyzeUrdf(loaded.urdf), {
  nameHints: ["go2", "gripper"],
});
const orientation = buildRobotOrientationCard(
  guessUrdfOrientation(loaded.urdf, {
    targetUpAxis: "z",
    targetForwardAxis: "x",
  })
);
const localOrientation = await buildLoadedSourceOrientationCard(loaded);
const localPhysics = await checkLoadedSourcePhysicsHealth(loaded);
const usd = await convertLoadedSourceToUSD(loaded, {
  outputPath: "./robot.usda",
});

console.log(
  validation.isValid,
  robotType,
  physics.ok,
  mjcf.stats.bodiesCreated,
  usd.stats.linksConverted,
  card.canonicalTags,
  orientation.summary.classification,
  localOrientation.meshAudit.sampledMeshFiles.length,
  localPhysics.meshAudit.unresolvedMeshReferences.length
);
```

## Current Core Capabilities

Current core capabilities in `i-love-urdf` include:

- `guessOrientation(...)` / `guessUrdfOrientation(...)`
- `identifyRobotType(...)`
- `checkPhysicsHealth(...)`
- `applyGlobalRotation(...)`
- `rotateInertiaTensor(...)`
- `normalizeJointAxis(...)`
- `alignJointToLocalZ(...)`
- `sanitizeNames(...)`
- `resolvePackagePaths(...)`
- `fixInertiaThresholds(...)`
- `convertURDFToUSD(...)`
- `convertURDFPathToUSD(...)`
- `convertLoadedSourceToUSD(...)`
- `convertMeshToUsd(...)`

```ts
import {
  alignJointToLocalZ,
  applyGlobalRotation,
  checkPhysicsHealth,
  convertURDFToUSD,
  fixInertiaThresholds,
  guessOrientation,
  identifyRobotType,
  normalizeJointAxis,
  rotateInertiaTensor,
  sanitizeNames,
} from "i-love-urdf";

const orientation = guessOrientation(robotUrdf);
const robotType = identifyRobotType(robotUrdf);
const physics = checkPhysicsHealth(robotUrdf);
const usd = convertURDFToUSD(robotUrdf);
const axis = normalizeJointAxis("0.01 0.98 0", { snapToCanonical: true });
const safeName = sanitizeNames("Left Arm.Link-1");
```

`URDF -> USD` is available as an initial USDA exporter with support for:

- stage metadata: `upAxis`, `metersPerUnit`, `kilogramsPerUnit`, `PhysicsScene`
- articulated link hierarchy with `PhysicsRigidBodyAPI`
- revolute / prismatic / fixed joints
- primitive visuals and collisions
- inline STL mesh export
- local repository mesh resolution for `package://` and relative paths via `convertURDFPathToUSD(...)` / `convertLoadedSourceToUSD(...)`

Current limitations are explicit:

- output is ASCII USDA, not binary USD
- local mesh conversion currently prioritizes STL input
- existing USD mesh assets can be referenced directly
- OBJ / DAE / GLB are not converted to USD yet
- the exporter is suitable for USD-based preprocessing, not full scene authoring

For browser bundlers, use the browser-safe entrypoint:

```ts
import {
  analyzeUrdf,
  buildRobotMorphologyCard,
  buildRobotOrientationCard,
  guessUrdfOrientation,
  parseURDF,
  prettyPrintURDF,
} from "i-love-urdf/browser";
```

## XACRO Runtime

`xacro-to-urdf` and XACRO-backed `load-source` flows need a local Python XACRO runtime.
If you installed the CLI globally, create that managed runtime in your project directory with:

```sh
ilu setup-xacro-runtime
ilu probe-xacro-runtime
```

From a repository checkout, the equivalent setup is:

```sh
corepack pnpm setup:xacro
corepack pnpm ilu probe-xacro-runtime
```

## License

Source-available; not open source.
See [LICENSE](/home/am/dev/i-love-urdf/LICENSE).

## Attribution

The MJCF converter follows the structure used by `urdf2mjcf`.
