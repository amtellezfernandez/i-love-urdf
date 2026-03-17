#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const source = path.join(root, "src", "xacro", "xacro_expand_runtime.py");
const destinationDir = path.join(root, "dist", "xacro");
const destination = path.join(destinationDir, "xacro_expand_runtime.py");

fs.mkdirSync(destinationDir, { recursive: true });
fs.copyFileSync(source, destination);
