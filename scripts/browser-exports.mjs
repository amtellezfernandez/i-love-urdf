#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const IDENTIFIER_PATTERN = /^[A-Za-z_$][\w$]*$/;
const BROWSER_EXPORT_BLOCK_PATTERN = /export\s*\{([\s\S]*?)\}\s*from\s*["'][^"']+["'];?/g;
const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const parseRuntimeExportName = (specifier) => {
  const trimmed = specifier.trim();
  if (!trimmed || trimmed.startsWith("type ")) {
    return undefined;
  }

  const aliasSeparator = /\s+as\s+/;
  const exportName = aliasSeparator.test(trimmed)
    ? trimmed.split(aliasSeparator).at(-1)?.trim()
    : trimmed;

  if (!exportName || !IDENTIFIER_PATTERN.test(exportName)) {
    return undefined;
  }

  return exportName;
};

export const getBrowserRuntimeExports = (root = defaultRoot) => {
  const source = fs.readFileSync(path.join(root, "src", "browser.ts"), "utf8");
  const exports = [];

  for (const [, block] of source.matchAll(BROWSER_EXPORT_BLOCK_PATTERN)) {
    for (const specifier of block.split(",")) {
      const exportName = parseRuntimeExportName(specifier);
      if (exportName) {
        exports.push(exportName);
      }
    }
  }

  return Array.from(new Set(exports));
};
