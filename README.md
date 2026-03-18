# i-love-urdf

Code-first URDF loading, validation, editing, optimization, and conversion.

The package is now organized around a source-first flow:

1. load a file, local repo, or GitHub repo into one prepared URDF
2. run task-family helpers or leaf commands on that prepared result
3. keep repo-aware context only when a task actually needs it

The website lives separately in `i-love-urdf-web` and should explain these workflows rather than duplicate implementation.

## Attribution

Some parts of `i-love-urdf` are adapted from upstream code and that should stay explicit.

- `i-love-urdf` is the extracted and renamed continuation of the `pretty-urdf` package that originally lived inside `urdf-studio`: <https://github.com/amtellezfernandez/urdf-studio/tree/main/pretty-urdf>
- `urdf-studio` now consumes `i-love-urdf` as the active shared package instead of continuing to depend on `pretty-urdf`
- Several edit-oriented helpers now exposed here were ported from the `urdf-studio` web editor: <https://github.com/amtellezfernandez/urdf-studio/tree/main/web/src/features/urdf/editor>
- The MJCF converter in `src/convert/urdfToMJCF.ts` follows the structure used by `urdf2mjcf`: <https://github.com/kscalelabs/urdf2mjcf>

## Install

```sh
npm install
npm run build
npm run setup:xacro
```

Check the managed XACRO runtime:

```sh
i-love-urdf probe-xacro-runtime
```

## Task Families

- `Load Sources`: `load-source`, `inspect-repo`
- `Validate`: `validate`
- `Analyze`: `analyze`, `mesh-refs`, `diff`
- `Format`: `pretty-print`, `canonical-order`, `normalize-axes`
- `Edit`: `rename-joint`, `rename-link`, `reassign-joint`, `remove-joints`, `set-material-color`, `rotate-90`
- `Optimize`: `fix-mesh-paths`, `mesh-to-assets`, `repair-mesh-refs`, `inspect-meshes`, `compress-meshes`
- `Convert`: `urdf-to-mjcf`, `urdf-to-xacro`, `xacro-to-urdf`

Leaf commands still work directly. The change is the mental model, not a breaking CLI rewrite.

## CLI Quick Start

Load or inspect first:

```sh
i-love-urdf load-source --path ./robot.urdf
i-love-urdf inspect-repo --local ./my-robot-repo
i-love-urdf load-source --github owner/repo --entry urdf/robot.urdf.xacro --out robot.urdf
```

Then run tasks:

```sh
i-love-urdf validate --urdf robot.urdf
i-love-urdf analyze --urdf robot.urdf
i-love-urdf pretty-print --urdf robot.urdf --out robot.pretty.urdf
i-love-urdf rename-link --urdf robot.urdf --link tool --name tool0 --out robot.edited.urdf
i-love-urdf inspect-meshes --mesh-dir ./meshes
i-love-urdf compress-meshes --mesh-dir ./meshes --in-place
i-love-urdf urdf-to-mjcf --urdf robot.urdf --out robot.xml
i-love-urdf urdf-to-xacro --urdf robot.urdf --out robot.urdf.xacro
i-love-urdf xacro-to-urdf --xacro robot.urdf.xacro --out robot.urdf
```

Repository flow:

1. `inspect-repo` to identify the likely URDF or XACRO entrypoint.
2. `load-source` or `xacro-to-urdf` if you need one prepared URDF from that source.
3. run validation, formatting, editing, optimization, or conversion commands on the prepared result.

MuJoCo flow:

1. `load-source` or `xacro-to-urdf` to get a resolved URDF.
2. `urdf-to-mjcf` to generate MJCF.
3. if the CLI warns about heavy STL assets, run `inspect-meshes` or `compress-meshes` on the mesh directory and try again.

## Node Usage

Load once, then run tasks on the prepared source:

```ts
import {
  analyzeLoadedSource,
  convertLoadedSourceToMJCF,
  prettyPrintLoadedSource,
  validateLoadedSource,
} from "i-love-urdf";
import { loadSourceFromPath } from "i-love-urdf/load-source-node";

async function main() {
  const loaded = await loadSourceFromPath({ path: "./robot.urdf.xacro" });
  const validation = validateLoadedSource(loaded);
  const analysis = analyzeLoadedSource(loaded);
  const formatted = prettyPrintLoadedSource(loaded, 2);
  const mjcf = convertLoadedSourceToMJCF(formatted);
  console.log(validation.isValid, analysis.robotName, mjcf.stats.bodiesCreated);
}
```

The loaded-source task helpers are thin wrappers over the existing pure URDF utilities. You can still call those lower-level APIs directly if you already have raw URDF text.

For repo-aware flows:

```ts
import { inspectLocalRepositoryUrdfs } from "i-love-urdf/local";
import { loadSourceFromGitHub } from "i-love-urdf/load-source-node";
```

## Current API Areas

- Source loading: local file/repo or GitHub repo normalized into a prepared URDF result with metadata
- Task helpers: loaded-source validation, analysis, formatting, comparison, and conversion helpers
- Parsing: URDF document parsing, link/joint/sensor helpers, link name extraction
- Analysis: inertials, collisions, mesh reference analysis
- Conversion: URDF to MJCF, URDF to XACRO, runtime-backed XACRO to URDF, XACRO request/response helpers
- Mesh: mesh path parsing, mesh format checks, repository mesh resolution
- Mesh compression: binary STL inspection and target-face-limit repair for heavy mesh sets
- Repository: candidate discovery, package/dependency name extraction, repository package helpers, generic source inspection, local/GitHub repo inspection, repo-aware mesh reference repair
- Transforms: joint removal, joint relinking, material updates, mesh path updates
- Utilities: pretty printing, canonical ordering, axis normalization, URDF rotation, diff helpers
- Validation: structural and semantic URDF validation

## Mesh Optimization

MuJoCo rejects STL meshes above its face limit. `inspect-meshes` shows current STL face counts and target limits. `compress-meshes` rewrites only the STL files above their target face limits.

```sh
i-love-urdf inspect-meshes --mesh-dir ./meshes
i-love-urdf inspect-meshes --mesh-dir ./meshes --limits heavy.stl=100000
i-love-urdf compress-meshes --mesh-dir ./meshes --in-place
i-love-urdf compress-meshes --mesh-dir ./meshes --meshes heavy.stl --limits heavy.stl=100000 --out-dir ./meshes.optimized
```

If you do not pass `--limits`, the default target is the MuJoCo face limit.

## Runtime Note

Some XML-oriented APIs rely on `DOMParser` and `XMLSerializer`. Browsers already provide these globals. In Node.js environments, install DOM globals before calling those APIs.

`xacro-to-urdf` is runtime-backed and needs a Python XACRO runtime. `i-love-urdf` can manage that runtime in the current project for you.

Default standalone flow:

```sh
npm run setup:xacro
i-love-urdf probe-xacro-runtime
```

That installs a managed runtime under `.i-love-urdf/xacro-runtime`, and the CLI will auto-detect it from the current working directory or its parent directories.

Advanced runtime options:

- a Python interpreter with `xacro` installed
- a vendored `xacrodoc` wheel pointed to by `I_LOVE_URDF_XACRODOC_WHEEL`

Bootstrap the managed runtime explicitly with:

```sh
i-love-urdf setup-xacro-runtime
i-love-urdf setup-xacro-runtime --python /path/to/python
i-love-urdf setup-xacro-runtime --venv /custom/path/to/xacro-runtime
```
