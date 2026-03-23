# Support Matrix

## Platform tiers

- Linux: release-gated
- macOS: CI-gated
- Windows: CI-gated

Release-gated means the full release verification path runs there, including performance budget checks, XACRO probe/setup, and real-repository verification.

CI-gated means build, install, browser entry, tests, and smoke coverage are enforced there in CI.

## Node versions

- supported majors: 20, 22, 24
- release baseline: 20.19.6

## Runtime expectations

- public GitHub repos should work without auth
- private GitHub repos require `gh auth login`, `GITHUB_TOKEN`, or `GH_TOKEN`
- XACRO sources may require `!xacro` inside the shell or `ilu setup-xacro-runtime`
- when `ilu` bootstraps its managed XACRO runtime, it installs reviewed pinned packages inside an isolated virtualenv (`xacro==2.1.1`, `PyYAML==6.0.3`)

## ROS and XACRO expectations

- plain URDF files work without ROS installed
- XACRO expansion needs a working Python runtime plus the local `xacro` package bootstrapped by `ilu`
- repos that depend on external ROS packages outside the checked-out source may still need manual narrowing or extra package context

## GitHub behavior

- `owner/repo`, GitHub URLs, and common GitHub SSH remotes are accepted
- public repos use unauthenticated GitHub access until a token or `gh auth` session is present
- private repos and higher-rate access need `gh auth login`, `GITHUB_TOKEN`, or `GH_TOKEN`

## Simulator and export support

- read-only validation, health, analysis, and repo inspection are first-class
- URDF -> MJCF and initial USD export are supported from prepared URDF inputs
- simulator-specific controller, transmission, or plugin correctness is not guaranteed by a passing `ilu` check

## Known unsupported or partial patterns

- repos that need a full ROS workspace overlay to resolve external packages
- simulator-specific behavior that depends on runtime plugins rather than URDF/XACRO structure
- very large mixed repositories where the intended robot description is not localizable from the checked-out files alone

## Performance envelope

- Linux release gating enforces startup and validate budgets on the release baseline machine
- large real-world repos are part of the release gate, but clone time and GitHub latency are still network-bound
- the interactive shell is tuned for fast local investigation, not batch processing thousands of URDFs in one session

## First diagnostic command

Run:

```sh
ilu doctor
```

Use this when:

- a machine setup looks wrong
- GitHub auth is unclear
- XACRO expansion is failing
- you need a quick support snapshot before filing an issue

For machine-readable output:

```sh
ilu doctor --json
```

If you need to hand support a reproducible bundle:

```sh
ilu bug-report --out <dir> [--urdf <path>] [--source <path>]
```

The report includes:

- `ilu` version and install source
- node version, platform, architecture, and TTY state
- support tier for the current machine
- GitHub auth availability
- XACRO runtime availability
- installed managed XACRO package versions when a Python runtime is present
- optional copied local repro inputs or a source-tree manifest
