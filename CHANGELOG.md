# Changelog

## 1.0.0 - 2026-03-23

- split the interactive shell into dedicated type, config, recommendation, and UI helper modules
- added deterministic PTY shell regression coverage for tab completion, candidate picking, update prompts, repair prompts, and ctrl+c exit
- expanded real-repository verification to TurtleBot3, OpenManipulator, Fanuc, and Bit-Bots in addition to the existing release corpus
- added `ilu bug-report` to capture `ilu doctor` diagnostics plus optional local repro inputs
- upgraded tagged releases to generate formal release notes, create a GitHub Release, and publish to npm when `NPM_TOKEN` is configured
- promoted the package metadata and support surface to the OpenAI Robotics release posture

## 0.1.11 - 2026-03-23

- made `ilu` the only public CLI binary
- made `ilu` open the interactive shell by default
- shifted the shell to direct-input-first flows: paste `owner/repo` or drop a local source
- auto-run validation and health checks when a source resolves cleanly
- added picker-based candidate selection for multi-entrypoint repos and folders
- added shell completion and in-shell slash completion
- added `!xacro` setup and automatic retry for blocked XACRO loads
- tightened install verification, smoke coverage, and release checks
- hardened Windows and macOS support with cross-platform CI and shell-path parsing fixes
