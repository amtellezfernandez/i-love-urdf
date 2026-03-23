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

The report includes:

- `ilu` version and install source
- node version, platform, architecture, and TTY state
- support tier for the current machine
- GitHub auth availability
- XACRO runtime availability
