# i-love-urdf

Core URDF parsing, validation, conversion, mesh, and transform utilities.

This repository is the code-first home for the URDF toolkit. The website lives separately in `i-love-urdf-web` and should document how to install, clone, and use this package rather than carrying the implementation itself.

## Install

```sh
npm install
npm run build
```

## CLI

```sh
i-love-urdf validate --urdf robot.urdf
i-love-urdf pretty-print --urdf robot.urdf --out robot.pretty.urdf
i-love-urdf normalize-axes --urdf robot.urdf --out robot.axes.urdf
```

## Example

```ts
import {
  parseURDF,
  validateUrdf,
  convertURDFToMJCF,
  prettyPrintURDF,
} from "i-love-urdf";

const parsed = parseURDF(urdfXml);
const validation = validateUrdf(urdfXml);
const converted = convertURDFToMJCF(urdfXml);
const formatted = prettyPrintURDF(urdfXml);
```

## Current API Areas

- Parsing: URDF document parsing, link/joint/sensor helpers, link name extraction
- Analysis: inertials, collisions, mesh reference analysis
- Conversion: URDF to MJCF, URDF to XACRO, XACRO request/response helpers
- Mesh: mesh path parsing, mesh format checks, repository mesh resolution
- Transforms: joint removal, joint relinking, material updates, mesh path updates
- Utilities: pretty printing, canonical ordering, axis normalization, URDF rotation, diff helpers
- Validation: structural and semantic URDF validation

## Runtime Note

Some XML-oriented APIs rely on `DOMParser` and `XMLSerializer`. Browsers already provide these globals. In Node.js environments, install DOM globals before calling those APIs.
