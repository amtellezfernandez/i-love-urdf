#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { getBrowserRuntimeExports } from "./browser-exports.mjs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const destinationDir = path.join(root, "dist", "xacro");
const browserEntryPath = path.join(root, "dist", "browser.mjs");
const cliEntryPath = path.join(root, "dist", "cli.js");
const copiedXacroAssets = ["xacro_expand_runtime.py", "xacroContract.runtime.cjs"];
const browserExports = getBrowserRuntimeExports(root);

fs.mkdirSync(destinationDir, { recursive: true });
for (const assetName of copiedXacroAssets) {
  fs.copyFileSync(path.join(root, "src", "xacro", assetName), path.join(destinationDir, assetName));
}
if (fs.existsSync(cliEntryPath)) {
  fs.chmodSync(cliEntryPath, 0o755);
}
fs.writeFileSync(
  browserEntryPath,
  [
    'import browserLib from "./browser.js";',
    "",
    ...browserExports.map((name) => `export const ${name} = browserLib.${name};`),
    "",
  ].join("\n"),
  "utf8"
);
