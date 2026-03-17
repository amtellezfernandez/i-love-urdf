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
  const customSummary = await inspectRepositoryFiles(files, readTextForMySource);
}
```

## Current API Areas

- Parsing: URDF document parsing, link/joint/sensor helpers, link name extraction
- Analysis: inertials, collisions, mesh reference analysis
- Conversion: URDF to MJCF, URDF to XACRO, XACRO request/response helpers
- Mesh: mesh path parsing, mesh format checks, repository mesh resolution
- Repository: candidate discovery, package/dependency name extraction, repository package helpers, generic source inspection, local/GitHub repo inspection, repo-aware mesh reference repair
- Transforms: joint removal, joint relinking, material updates, mesh path updates
- Utilities: pretty printing, canonical ordering, axis normalization, URDF rotation, diff helpers
- CLI: validation, analysis, diffing, transform commands, conversion commands, rename commands, local/GitHub repo inspection, repo-aware mesh repair
- Validation: structural and semantic URDF validation

## Runtime Note

Some XML-oriented APIs rely on `DOMParser` and `XMLSerializer`. Browsers already provide these globals. In Node.js environments, install DOM globals before calling those APIs.
