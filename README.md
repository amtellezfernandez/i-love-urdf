# i-love-urdf

Core URDF parsing, validation, conversion, mesh, and transform utilities.

This repository is the code-first home for the URDF toolkit. The website lives separately in `i-love-urdf-web` and should document how to install, clone, and use this package rather than carrying the implementation itself.

## Attribution

Some parts of `i-love-urdf` are adapted from upstream code and that should stay explicit.

- `i-love-urdf` is the extracted and renamed continuation of the `pretty-urdf` package that originally lived inside `urdf-studio`: <https://github.com/amtellezfernandez/urdf-studio/tree/main/pretty-urdf>
- `urdf-studio` now consumes `i-love-urdf` as the active shared package instead of continuing to depend on `pretty-urdf`
- Several edit-oriented helpers now exposed here were ported from the `urdf-studio` web editor: <https://github.com/amtellezfernandez/urdf-studio/tree/main/web/src/features/urdf/editor>
- The MJCF converter in `src/convert/urdfToMJCF.ts` follows the structure used by `urdf2mjcf`: <https://github.com/kscalelabs/urdf2mjcf>
- If more upstream code is brought into this repository, keep that attribution visible here and in `i-love-urdf-web`.

## Install

```sh
npm install
npm run build
npm run setup:xacro
```

Check the managed runtime:

```sh
i-love-urdf probe-xacro-runtime
```

## CLI

```sh
i-love-urdf validate --urdf robot.urdf
i-love-urdf analyze --urdf robot.urdf
i-love-urdf diff --left before.urdf --right after.urdf
i-love-urdf pretty-print --urdf robot.urdf --out robot.pretty.urdf
i-love-urdf normalize-axes --urdf robot.urdf --out robot.axes.urdf
i-love-urdf remove-joints --urdf robot.urdf --joints wrist_joint,finger_joint --out robot.trimmed.urdf
i-love-urdf reassign-joint --urdf robot.urdf --joint elbow_joint --parent upper_arm --child forearm --out robot.rewired.urdf
i-love-urdf set-material-color --urdf robot.urdf --link base_link --material base_red --color '#ff0033' --out robot.red.urdf
i-love-urdf mesh-to-assets --urdf robot.urdf --out robot.assets.urdf
i-love-urdf urdf-to-mjcf --urdf robot.urdf --out robot.xml
i-love-urdf urdf-to-xacro --urdf robot.urdf --out robot.urdf.xacro
i-love-urdf load-source --path ./robot.urdf
i-love-urdf load-source --path ./robot.urdf.xacro --out robot.urdf
i-love-urdf load-source --path ./my-robot-repo --entry urdf/robot.urdf
i-love-urdf load-source --github owner/repo --entry urdf/robot.urdf.xacro --out robot.urdf
i-love-urdf probe-xacro-runtime
i-love-urdf setup-xacro-runtime
i-love-urdf xacro-to-urdf --xacro robot.urdf.xacro --out robot.urdf
i-love-urdf xacro-to-urdf --local ./my-robot-repo --xacro robots/arm.urdf.xacro --out robots/arm.urdf
i-love-urdf xacro-to-urdf --github owner/repo --xacro robots/arm.urdf.xacro --out robots/arm.urdf
i-love-urdf inspect-repo --local ./my-robot-repo
i-love-urdf inspect-repo --github owner/repo
i-love-urdf repair-mesh-refs --local ./my-robot-repo --urdf robots/arm.urdf --out robots/arm.fixed.urdf
i-love-urdf repair-mesh-refs --github owner/repo --urdf robots/arm.urdf --out robots/arm.fixed.urdf
i-love-urdf rename-joint --urdf robot.urdf --joint joint_a --name shoulder_joint --out robot.renamed.urdf
i-love-urdf rename-link --urdf robot.urdf --link link_a --name shoulder_link --out robot.renamed.urdf
```

Repository flow:

1. `inspect-repo` to identify likely URDF/Xacro entrypoints.
2. Use the returned candidate path with `repair-mesh-refs`, `validate`, `urdf-to-mjcf`, or any other command.

## Example

```ts
import {
  parseURDF,
  validateUrdf,
  convertURDFToMJCF,
  inspectGitHubRepositoryUrdfs,
  inspectRepositoryFiles,
  prettyPrintURDF,
  repairGitHubRepositoryMeshReferences,
} from "i-love-urdf";
import { inspectLocalRepositoryUrdfs } from "i-love-urdf/local";
import { loadSourceFromPath } from "i-love-urdf/load-source-node";
import { expandLocalXacroToUrdf } from "i-love-urdf/xacro-node";

async function main() {
  const parsed = parseURDF(urdfXml);
  const validation = validateUrdf(urdfXml);
  const converted = convertURDFToMJCF(urdfXml);
  const formatted = prettyPrintURDF(urdfXml);
  const localSummary = await inspectLocalRepositoryUrdfs({ path: "./my-robot-repo" });
  const repoSummary = await inspectGitHubRepositoryUrdfs({ owner: "owner", repo: "robot-repo" });
  const repaired = await repairGitHubRepositoryMeshReferences(
    { owner: "owner", repo: "robot-repo" },
    { urdfPath: "robots/arm.urdf" }
  );
  const prepared = await loadSourceFromPath({ path: "./robot.urdf.xacro" });
  const expanded = await expandLocalXacroToUrdf({
    xacroPath: "./robot.urdf.xacro",
    rootPath: ".",
  });
  const customSummary = await inspectRepositoryFiles(files, readTextForMySource);
}
```

## Current API Areas

- Source loading: local file/repo or GitHub repo normalized into a prepared URDF result with metadata
- Parsing: URDF document parsing, link/joint/sensor helpers, link name extraction
- Analysis: inertials, collisions, mesh reference analysis
- Conversion: URDF to MJCF, URDF to XACRO, runtime-backed XACRO to URDF, XACRO request/response helpers
- Mesh: mesh path parsing, mesh format checks, repository mesh resolution
- Repository: candidate discovery, package/dependency name extraction, repository package helpers, generic source inspection, local/GitHub repo inspection, repo-aware mesh reference repair
- Transforms: joint removal, joint relinking, material updates, mesh path updates
- Utilities: pretty printing, canonical ordering, axis normalization, URDF rotation, diff helpers
- CLI: validation, analysis, diffing, transform commands, conversion commands, rename commands, local/GitHub repo inspection, repo-aware mesh repair
- Validation: structural and semantic URDF validation

## Load Source

`load-source` is the new normalization layer. It accepts a local file, a local repo, or a GitHub repo and gives you one prepared URDF plus metadata about where it came from.

Examples:

```sh
i-love-urdf load-source --path ./robot.urdf
i-love-urdf load-source --path ./robot.urdf.xacro --out robot.urdf
i-love-urdf load-source --path ./my-robot-repo --entry urdf/robot.urdf
i-love-urdf load-source --github ros/urdf_tutorial --entry urdf/08-macroed.urdf.xacro
```

For Node usage:

```ts
import { loadSourceFromPath, loadSourceFromGitHub } from "i-love-urdf/load-source-node";
```

## Runtime Note

Some XML-oriented APIs rely on `DOMParser` and `XMLSerializer`. Browsers already provide these globals. In Node.js environments, install DOM globals before calling those APIs.

`xacro-to-urdf` is different: it is runtime-backed and needs a Python Xacro runtime. `i-love-urdf` can manage that runtime in the current project for you.

Default standalone flow:

```sh
npm run setup:xacro
i-love-urdf probe-xacro-runtime
```

That installs a managed runtime under `.i-love-urdf/xacro-runtime`, and the CLI will auto-detect it from the current working directory or its parent directories.

Advanced runtime options:

- a Python interpreter with `xacro` installed
- a vendored `xacrodoc` wheel pointed to by `I_LOVE_URDF_XACRODOC_WHEEL`

Check that setup with:

```sh
i-love-urdf probe-xacro-runtime
i-love-urdf probe-xacro-runtime --python /path/to/python
```

Bootstrap the managed runtime explicitly with:

```sh
i-love-urdf setup-xacro-runtime
i-love-urdf setup-xacro-runtime --python /path/to/python
i-love-urdf setup-xacro-runtime --venv /custom/path/to/xacro-runtime
```
