# Scope and Guarantees

## What `ilu` is for

`ilu` is a local-first CLI for loading, inspecting, validating, repairing, and converting URDF/XACRO robot descriptions.

It is optimized for:

- pasting a GitHub repo like `owner/repo`
- dropping a local folder, `.urdf`, `.xacro`, or `.zip`
- getting a quick answer about whether the robot description is structurally usable
- finding the next thing to fix when it is not

## Supported inputs

- public GitHub repos, GitHub URLs, and common GitHub SSH remotes
- local folders containing URDF/XACRO assets
- local `.urdf` files
- local `.xacro` files when the XACRO runtime is available
- local `.zip` bundles containing robot description assets

## What happens automatically

When `ilu` can resolve a single URDF from the source you give it, it automatically:

1. loads the source
2. validates the URDF structure
3. runs the main health check
4. keeps that source as the active shell context for follow-up actions

If a repo or folder has multiple likely entrypoints, `ilu` shows a picker and waits for a single selection.

## What a passing result means

If `ilu` says validation and health checks passed, it means:

- the URDF parsed successfully
- required structure checks passed
- the main health heuristics did not detect obvious axis, orientation, or structure risks

It does not guarantee:

- physical correctness
- simulator-specific compatibility
- controller correctness
- mesh scale correctness in every downstream tool
- that every ROS/XACRO dependency in a larger stack is available

## Current limits

- Linux, macOS, and Windows are all CI-gated for build, install, tests, and smoke coverage
- the release-grade Linux gate still carries the performance budget, XACRO probe, and real-repository verification
- private GitHub repos require a token or `gh auth login`
- XACRO expansion may need `!xacro`
- very large repos or repos with external ROS package dependencies may still need manual narrowing
- `ilu doctor` is the first support command when environment, auth, or runtime setup looks wrong

## Design goal

The shell should let a new user paste a source, get a trustworthy first answer quickly, and understand the next fix with minimal reading and minimal commands.
