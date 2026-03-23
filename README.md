# ILU

OpenAI Robotics interactive shell for inspecting, validating, repairing, and converting URDF/XACRO robot descriptions.

```sh
npm install -g --ignore-scripts --install-links=true i-love-urdf
ilu
```

Inside `ilu`:

- paste `owner/repo` or drop a local folder, `.urdf`, `.xacro`, or `.zip`
- `ilu` auto-runs validation and a health check when it can
- if `ilu` finds an obvious safe repair, it offers one and `Enter` accepts it
- if a repo has many robots, `ilu` lets you pick one, run `/gallery` for the whole repo, or apply `/repo-fixes`
- if a newer release is available, `ilu` asks whether you want to update
- if you reopen `ilu` after `Ctrl+C`, it offers to resume the last session
- run `ilu doctor` if the machine, auth, or xacro runtime looks wrong
- run `ilu bug-report --out <dir>` if you need a support bundle with diagnostics and local repro inputs
- if there are multiple entrypoints, use arrows and `Enter` to pick one
- press `Tab` to complete the selected slash option
- run `!xacro` if a source needs the XACRO runtime
- type `/` only when you want direct actions like `/align`, `/analyze`, `/health`, `/validate`, `/orientation`, `/gallery`, `/repo-fixes`, `/open`, or `/inspect`
- run `/visualize` to open the same working session in URDF Studio
- run `ilu resume` to reopen the most recent session directly
- run `ilu attach <session-id>` to resume that same working copy from another terminal
- press `Ctrl+C` to exit

Update:

```sh
ilu update
```

Uninstall:

```sh
npm uninstall -g i-love-urdf
```

Docs:

- [Scope and guarantees](docs/scope.md)
- [Support matrix](docs/support.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Release checklist](docs/release.md)
- [Changelog](CHANGELOG.md)
