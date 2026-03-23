# Release Checklist

Ship a release only when all of these are true:

1. `pnpm release:verify` passes locally.
2. `pnpm test:real-repos` passes on a clean networked machine.
3. `dist/` is current after the build.
4. install checks pass for packed, git, and local global installs.
5. the shell still opens by default with `ilu` and direct-input flows still work.
6. `README.md`, `docs/scope.md`, `docs/troubleshooting.md`, and `CHANGELOG.md` are current.
7. the version in `package.json` matches the intended release tag.

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

- [CI workflow](../.github/workflows/ci.yml): multi-Node build, tests, smoke, install, browser entry, and performance budget
- [Release workflow](../.github/workflows/release.yml): release-grade Linux verification, real-repo checks, and packed tarball artifact
