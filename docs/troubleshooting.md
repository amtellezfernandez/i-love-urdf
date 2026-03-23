# Troubleshooting

## First step

Run:

```sh
ilu doctor
```

If you need to attach the result to a bug report, use:

```sh
ilu doctor --json
```

If you need a support bundle with local repro inputs:

```sh
ilu bug-report --out <dir> [--urdf <path>] [--source <path>]
```

## GitHub repo failed to load

- public repos should work without setup
- for private repos or higher rate limits, run `gh auth login`
- you can also export `GITHUB_TOKEN` or `GH_TOKEN`

## `xacro runtime not set`

Run:

```sh
!xacro
```

inside `ilu`.

After setup completes, `ilu` retries the blocked load automatically.

## There are multiple entrypoints

That means the repo or folder contains multiple plausible URDF/XACRO roots.

- use arrow keys to move
- press `Enter` on the entrypoint you want
- if you picked the wrong one, paste the source again or use `/open`

## A path with spaces did not work

Drag and drop the path into `ilu` instead of retyping it manually. The shell accepts dropped local folders, `.urdf`, `.xacro`, and `.zip` paths directly.

## The repo loads but the result is incomplete

Run one of these on the active source:

- `/analyze`
- `/health`
- `/validate`
- `/orientation`
- `/inspect`

These are read-only follow-up actions that help narrow what needs to be fixed.

## Update

```sh
ilu update
```

## Uninstall

```sh
npm uninstall -g @openai/ilu
```
