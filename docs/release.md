# Release Checklist

Ship a release only when all of these are true:

1. `pnpm release:verify` passes locally.
2. `pnpm test:real-repos` passes on a clean networked machine.
3. `dist/` is current after the build.
4. install checks pass for packed, git, and local global installs.
5. the shell still opens by default with `ilu` and direct-input flows still work.
6. `ilu doctor` still reports the correct support tier, auth state, and xacro runtime on the release machine.
7. `ilu bug-report` still writes a support bundle with diagnostics and optional local repro inputs.
8. `README.md`, `docs/scope.md`, `docs/support.md`, `docs/troubleshooting.md`, and `CHANGELOG.md` are current.
9. the version in `package.json` matches the intended release tag.

## Local deterministic gate

```sh
pnpm release:verify
```

This runs:

- build
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
