# Security Policy

## Supported release line

- the current `main` / latest published `1.x` release line is supported

## Install and update posture

- the published CLI installs without npm lifecycle scripts
- `ilu update` uses npm package installs with `--ignore-scripts`
- tagged npm releases publish with provenance in the release workflow
- the release gate fails if the shipped production dependency graph adds install hooks
- the release gate fails if `pnpm audit --prod` reports a known vulnerability

## Managed XACRO runtime

- `ilu` only bootstraps the managed XACRO runtime when the user explicitly requests it
- the managed runtime is installed into an isolated virtualenv under `.i-love-urdf/xacro-runtime`
- the managed runtime is pinned to reviewed package versions
- `ilu doctor` reports the active XACRO runtime and installed package versions

## Reporting a vulnerability

- do not open a public issue for credential exposure, remote code execution, or supply-chain concerns
- report the issue privately through the repository security reporting flow if it is enabled
- if private reporting is not available, contact the maintainers directly before public disclosure

## What to include

- affected `ilu` version
- platform and Node version
- whether the issue happens during install, update, shell startup, XACRO bootstrap, or normal runtime
- a minimal repro or the output of `ilu doctor --json`
