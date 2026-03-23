"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isWindowsAbsolutePath = exports.normalizeFilesystemInput = exports.expandHomePath = exports.normalizeShellInput = exports.stripMatchingQuotes = exports.decodeShellEscapes = exports.getHomeDirectory = void 0;
const os = require("node:os");
const path = require("node:path");
const getHomeDirectory = (env = process.env) => {
    const envHome = env.HOME?.trim() || env.USERPROFILE?.trim();
    return envHome || os.homedir();
};
exports.getHomeDirectory = getHomeDirectory;
const decodeShellEscapes = (value) => {
    let decoded = "";
    for (let index = 0; index < value.length; index += 1) {
        const character = value[index];
        if (character !== "\\") {
            decoded += character;
            continue;
        }
        const next = value[index + 1];
        if (next === undefined) {
            decoded += "\\";
            continue;
        }
        if (next === " " || next === "\t" || next === '"' || next === "'" || next === "\\") {
            decoded += next;
            index += 1;
            continue;
        }
        // Preserve backslashes in Windows paths like C:\Users\robot.
        decoded += "\\";
    }
    return decoded;
};
exports.decodeShellEscapes = decodeShellEscapes;
const stripMatchingQuotes = (value) => {
    if (value.length >= 2 &&
        ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
        return value.slice(1, -1);
    }
    return value;
};
exports.stripMatchingQuotes = stripMatchingQuotes;
const normalizeShellInput = (rawValue) => (0, exports.decodeShellEscapes)((0, exports.stripMatchingQuotes)(rawValue.trim()));
exports.normalizeShellInput = normalizeShellInput;
const expandHomePath = (value, env = process.env) => {
    if (!value.startsWith("~")) {
        return value;
    }
    const home = (0, exports.getHomeDirectory)(env);
    if (!home) {
        return value;
    }
    if (value === "~") {
        return home;
    }
    return path.join(home, value.slice(1));
};
exports.expandHomePath = expandHomePath;
const normalizeFilesystemInput = (rawValue, env = process.env) => (0, exports.expandHomePath)((0, exports.normalizeShellInput)(rawValue), env);
exports.normalizeFilesystemInput = normalizeFilesystemInput;
const isWindowsAbsolutePath = (value) => /^[A-Za-z]:[\\/]/.test(value) || value.startsWith("\\\\");
exports.isWindowsAbsolutePath = isWindowsAbsolutePath;
