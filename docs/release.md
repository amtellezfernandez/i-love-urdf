# Release Checklist

Ship a release only when all of these are true:

1. `pnpm release:verify` passes locally.
2. `pnpm test:real-repos` passes on a clean networked machine.
3. `dist/` is current after the build.
4. install checks pass for packed, git, and local global installs with lifecycle scripts disabled.
5. the security posture check still reports no production install hooks in the shipped dependency graph.
6. the production vulnerability gate still reports no known advisories in the shipped runtime dependency graph.
7. the architecture budget still passes for surface area, privileged APIs, failure concentration, and reusable core share.
8. the shell still opens by default with `ilu` and direct-input flows still work.
9. `ilu doctor` still reports the correct support tier, auth state, and xacro runtime on the release machine.
10. `ilu bug-report` still writes a support bundle with diagnostics and optional local repro inputs.
11. `README.md`, `docs/scope.md`, `docs/support.md`, `docs/troubleshooting.md`, and `CHANGELOG.md` are current.
12. the version in `package.json` matches the intended release tag.

## Local deterministic gate

```sh
pnpm release:verify
```

This runs:

- build
- architecture budget checks
- security posture checks
- production vulnerability audit
- install-path checks
- browser entry checks
- test suite
- xacro runtime setup and probe
- smoke suite
- performance budget checks

## Extended release gate

```sh
pnpm release:verify:full
```

This adds the real-repository verification pass.

## CI gates

- [CI workflow](../.github/workflows/ci.yml): Linux multi-Node verification plus macOS and Windows build, install, test, and smoke gates
- [Release workflow](../.github/workflows/release.yml): macOS and Windows readiness gates, then release-grade Linux verification, real-repo checks, generated release notes, packed tarball artifact, GitHub Release creation, and npm publish when `NPM_TOKEN` is configured

## Release notes

Generate the release notes that the tag workflow will publish:

```sh
pnpm release:notes -- --version <version>
```
