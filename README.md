# i-love-urdf

Fast interactive shell for inspecting, validating, repairing, and converting URDF/XACRO robot descriptions.

```sh
npm install -g --install-links=true git+https://github.com/amtellezfernandez/i-love-urdf.git
ilu
```

Inside `ilu`:

- paste `owner/repo` or drop a local folder, `.urdf`, `.xacro`, or `.zip`
- `ilu` auto-runs validation and a health check when it can
- if there are multiple entrypoints, use arrows and `Enter` to pick one
- press `Tab` to complete the selected slash option
- run `!xacro` if a source needs the XACRO runtime
- type `/` only when you want direct actions like `/analyze`, `/health`, `/validate`, `/orientation`, `/open`, or `/inspect`
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
- [Troubleshooting](docs/troubleshooting.md)
- [Release checklist](docs/release.md)
- [Changelog](CHANGELOG.md)
