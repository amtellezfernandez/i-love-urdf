# i-love-urdf

Tools for loading, checking, editing, and converting URDFs.

`i-love-urdf` is the core package behind `urdf-studio`.
The CLI command is `ilu`.
The website docs live in `i-love-urdf-web`.

## Install

Requirements:

- Node.js 20.19.6
- Corepack

```sh
# use the pinned Node first (.nvmrc / .node-version)
corepack enable
pnpm install
pnpm build
pnpm setup:xacro
pnpm exec ilu probe-xacro-runtime
```

From a repo checkout, run the CLI as `pnpm exec ilu ...`.
Use plain `ilu ...` only when the package is installed as a real CLI in your environment.

## Common CLI Commands

```sh
# load a file or repo
ilu load-source --path ./robot.urdf
ilu inspect-repo --local ./my-robot-repo
ilu load-source --github owner/repo --entry urdf/robot.urdf.xacro --out robot.urdf

# check a robot
ilu validate --urdf robot.urdf
ilu health-check --urdf robot.urdf
ilu analyze --urdf robot.urdf
ilu guess-orientation --urdf robot.urdf

# edit / clean up
ilu pretty-print --urdf robot.urdf --out robot.pretty.urdf
ilu snap-axes --urdf robot.urdf --out robot.snapped.urdf
ilu rename-link --urdf robot.urdf --link tool --name tool0 --out robot.edited.urdf
ilu normalize-robot --urdf robot.urdf --snap-axes --canonicalize-joint-frame

# mesh / conversion
ilu fix-mesh-paths --urdf robot.urdf --out robot.fixed.urdf
ilu inspect-meshes --mesh-dir ./meshes
ilu compress-meshes --mesh-dir ./meshes --in-place
ilu urdf-to-mjcf --urdf robot.urdf --out robot.xml
ilu urdf-to-xacro --urdf robot.urdf --out robot.urdf.xacro
ilu xacro-to-urdf --xacro robot.urdf.xacro --out robot.urdf
```

If you are starting from a repo or a XACRO entrypoint, begin with `inspect-repo` or `load-source`.

## Node API

```ts
import { convertLoadedSourceToMJCF, validateLoadedSource } from "i-love-urdf";
import { loadSourceFromPath } from "i-love-urdf/load-source-node";

const loaded = await loadSourceFromPath({ path: "./robot.urdf.xacro" });
const validation = validateLoadedSource(loaded);
const mjcf = convertLoadedSourceToMJCF(loaded);

console.log(validation.isValid, mjcf.stats.bodiesCreated);
```

## XACRO Runtime

`xacro-to-urdf` needs a Python XACRO runtime.
`pnpm setup:xacro` creates a managed runtime under `.i-love-urdf/xacro-runtime`.

```sh
pnpm exec ilu probe-xacro-runtime
pnpm exec ilu setup-xacro-runtime
```

## License

Source-available, not open-source.
See [LICENSE](/home/am/dev/i-love-urdf/LICENSE).

## Attribution

The MJCF converter follows the structure used by `urdf2mjcf`.
