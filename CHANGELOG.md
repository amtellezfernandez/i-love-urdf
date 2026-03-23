# Changelog

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
