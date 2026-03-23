import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const helpersDir = path.dirname(fileURLToPath(import.meta.url));
export const rootDir = path.resolve(helpersDir, "..", "..");

const { installDomGlobals } = await import(
  pathToFileURL(path.join(rootDir, "scripts", "install-dom-globals.mjs")).href
);

installDomGlobals();

export const lib = await import(
  pathToFileURL(path.join(rootDir, "dist", "index.js")).href
);

export const browserLib = await import(
  pathToFileURL(path.join(rootDir, "dist", "browser.mjs")).href
);
