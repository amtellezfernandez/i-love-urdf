#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");

const run = (command, args) => {
  execFileSync(command, args, {
    cwd: root,
    stdio: "inherit",
  });
};

run(process.execPath, [path.join(root, "node_modules", "typescript", "bin", "tsc"), "-p", "./tsconfig.build.json"]);
run(process.execPath, [path.join(root, "scripts", "postbuild.mjs")]);
