"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCliCommandHelpers = exports.parseArgs = void 0;
const fs = require("node:fs");
const path = require("node:path");
const process = require("node:process");
const commandCatalog_1 = require("./commandCatalog");
const SUPPORTED_COMMAND_SET = new Set(commandCatalog_1.SUPPORTED_COMMANDS);
const AXIS_SPEC_VALUES = ["x", "y", "z", "+x", "+y", "+z", "-x", "-y", "-z"];
const AXIS_SPEC_SET = new Set(AXIS_SPEC_VALUES);
const SIMPLE_AXIS_VALUES = ["x", "y", "z"];
const SIMPLE_AXIS_SET = new Set(SIMPLE_AXIS_VALUES);
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const readText = (filePath) => fs.readFileSync(filePath, "utf8");
const writeText = (filePath, content) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, "utf8");
};
const fail = (message) => {
    console.error(message);
    process.exit(2);
};
const coerceArgValues = (value) => {
    if (value === undefined)
        return [];
    return Array.isArray(value) ? value : [value];
};
const getStringArgValues = (args, key) => coerceArgValues(args.get(key)).filter((value) => typeof value === "string" && value.length > 0);
const getLastStringArg = (args, key) => {
    const values = getStringArgValues(args, key);
    return values[values.length - 1];
};
const requireStringArg = (args, key) => {
    const value = getLastStringArg(args, key);
    if (!value) {
        fail(`Missing required argument --${key}`);
    }
    return value;
};
const getOptionalStringArg = (args, key) => {
    return getLastStringArg(args, key);
};
const getOptionalNumberArg = (args, key) => {
    const value = getOptionalStringArg(args, key);
    if (value === undefined)
        return undefined;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        fail(`Invalid numeric argument --${key}: ${value}`);
    }
    return parsed;
};
const getDelimitedStringArg = (args, primaryKey, fallbackKey) => {
    const values = getStringArgValues(args, primaryKey);
    if (values.length === 0 && fallbackKey) {
        values.push(...getStringArgValues(args, fallbackKey));
    }
    if (values.length === 0)
        return [];
    return values.flatMap((value) => value
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0));
};
const getKeyValueArg = (args, primaryKey, fallbackKey) => {
    const values = getStringArgValues(args, primaryKey);
    if (values.length === 0 && fallbackKey) {
        values.push(...getStringArgValues(args, fallbackKey));
    }
    if (values.length === 0)
        return {};
    const result = {};
    for (const pair of values.flatMap((value) => value
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0))) {
        const separatorIndex = pair.indexOf("=");
        if (separatorIndex <= 0) {
            fail(`Invalid key=value pair: ${pair}`);
        }
        const key = pair.slice(0, separatorIndex).trim();
        const mappedValue = pair.slice(separatorIndex + 1).trim();
        if (!key) {
            fail(`Invalid key=value pair: ${pair}`);
        }
        result[key] = mappedValue;
    }
    return result;
};
const getNumericKeyValueArg = (args, primaryKey, fallbackKey) => {
    const raw = getKeyValueArg(args, primaryKey, fallbackKey);
    const numeric = {};
    for (const [key, value] of Object.entries(raw)) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            fail(`Invalid numeric value for ${key}: ${value}`);
        }
        numeric[key] = parsed;
    }
    return numeric;
};
const parseTripletArg = (raw, label) => {
    const parts = raw
        .trim()
        .split(/\s+/)
        .slice(0, 3)
        .map((value) => Number(value));
    if (parts.length !== 3 ||
        !Number.isFinite(parts[0]) ||
        !Number.isFinite(parts[1]) ||
        !Number.isFinite(parts[2])) {
        fail(`Invalid ${label}: ${raw}. Expected three numeric values like "0 1 0".`);
    }
    return [parts[0], parts[1], parts[2]];
};
const getAxisSpecArg = (args, key) => {
    const value = getOptionalStringArg(args, key);
    if (!value)
        return undefined;
    if (AXIS_SPEC_SET.has(value)) {
        return value;
    }
    fail(`Invalid --${key} value: ${value}. Expected x, y, z, +x, +y, +z, -x, -y, or -z.`);
};
const getSimpleAxisArg = (args, key) => {
    const value = getOptionalStringArg(args, key);
    if (!value)
        return undefined;
    if (SIMPLE_AXIS_SET.has(value)) {
        return value;
    }
    fail(`Invalid --${key} value: ${value}. Expected x, y, or z.`);
};
const requireHexColorArg = (args, key) => {
    const value = requireStringArg(args, key).trim();
    if (!HEX_COLOR_PATTERN.test(value)) {
        fail(`Invalid hex color for --${key}: ${value}. Expected #RRGGBB.`);
    }
    return value;
};
const writeOutIfRequested = (outPath, content) => {
    if (!outPath)
        return;
    writeText(outPath, content);
};
const parseArgs = (argv) => {
    const [, , rawCommand = "help", ...rest] = argv;
    const command = SUPPORTED_COMMAND_SET.has(rawCommand)
        ? rawCommand
        : "help";
    const args = new Map();
    const positionals = [];
    for (let index = 0; index < rest.length; index += 1) {
        const token = rest[index];
        if (!token.startsWith("--")) {
            positionals.push(token);
            continue;
        }
        const key = token.slice(2);
        const nextToken = rest[index + 1];
        const appendArg = (value) => {
            const previous = args.get(key);
            if (previous === undefined) {
                args.set(key, value);
                return;
            }
            args.set(key, [...coerceArgValues(previous), value]);
        };
        if (!nextToken || nextToken.startsWith("--")) {
            appendArg(true);
            continue;
        }
        appendArg(nextToken);
        index += 1;
    }
    return { rawCommand, command, args, positionals };
};
exports.parseArgs = parseArgs;
const createCliCommandHelpers = () => ({
    fail,
    readText,
    requireStringArg,
    getOptionalStringArg,
    getOptionalNumberArg,
    getDelimitedStringArg,
    getKeyValueArg,
    getNumericKeyValueArg,
    parseTripletArg,
    getAxisSpecArg,
    getSimpleAxisArg,
    requireHexColorArg,
    writeOutIfRequested,
});
exports.createCliCommandHelpers = createCliCommandHelpers;
