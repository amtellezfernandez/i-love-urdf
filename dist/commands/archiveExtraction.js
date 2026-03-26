"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inspectZipArchiveMetadata = exports.extractZipArchiveToTempRoot = exports.sanitizeArchiveEntryPath = exports.MAX_ARCHIVE_TOTAL_BYTES = exports.MAX_ARCHIVE_ENTRY_BYTES = exports.MAX_ARCHIVE_ENTRY_COUNT = void 0;
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const AdmZip = require("adm-zip");
exports.MAX_ARCHIVE_ENTRY_COUNT = 5000;
exports.MAX_ARCHIVE_ENTRY_BYTES = 256 * 1024 * 1024;
exports.MAX_ARCHIVE_TOTAL_BYTES = 512 * 1024 * 1024;
const resolveExtractedArchiveRoot = (archiveRoot) => {
    const entries = fs
        .readdirSync(archiveRoot, { withFileTypes: true })
        .filter((entry) => entry.name !== "__MACOSX" && entry.name !== ".DS_Store");
    if (entries.length === 1 && entries[0]?.isDirectory()) {
        return path.join(archiveRoot, entries[0].name);
    }
    return archiveRoot;
};
const sanitizeArchiveEntryPath = (entryName) => {
    const trimmed = entryName.trim();
    if (/^[A-Za-z]:/.test(trimmed) || trimmed.startsWith("/") || trimmed.startsWith("\\")) {
        throw new Error(`Archive entry uses an absolute path: ${entryName}`);
    }
    const withoutDrivePrefix = trimmed.replace(/^[A-Za-z]:/, "");
    const normalized = path.posix.normalize(withoutDrivePrefix.replace(/\\/g, "/").replace(/^\/+/, ""));
    if (!normalized || normalized === ".") {
        throw new Error("Archive entry has an empty path.");
    }
    if (normalized === ".." || normalized.startsWith("../") || normalized.includes("/../")) {
        throw new Error(`Archive entry escapes the extraction root: ${entryName}`);
    }
    return normalized;
};
exports.sanitizeArchiveEntryPath = sanitizeArchiveEntryPath;
const resolveArchiveTargetPath = (archiveRoot, relativeEntryPath) => {
    const targetPath = path.resolve(archiveRoot, ...relativeEntryPath.split("/"));
    const normalizedRoot = path.resolve(archiveRoot);
    if (targetPath !== normalizedRoot && !targetPath.startsWith(`${normalizedRoot}${path.sep}`)) {
        throw new Error(`Archive entry escapes the extraction root: ${relativeEntryPath}`);
    }
    return targetPath;
};
const extractZipArchiveToTempRoot = (archivePath, options = {}) => {
    const archiveRoot = fs.mkdtempSync(path.join(options.tempDir ?? os.tmpdir(), "ilu-archive-"));
    const maxEntries = options.maxEntries ?? exports.MAX_ARCHIVE_ENTRY_COUNT;
    const maxEntryBytes = options.maxEntryBytes ?? exports.MAX_ARCHIVE_ENTRY_BYTES;
    const maxTotalBytes = options.maxTotalBytes ?? exports.MAX_ARCHIVE_TOTAL_BYTES;
    try {
        const archive = new AdmZip(archivePath);
        const entries = archive.getEntries();
        if (entries.length > maxEntries) {
            throw new Error(`Archive contains too many entries (${entries.length}).`);
        }
        let totalBytes = 0;
        for (const entry of entries) {
            const relativeEntryPath = (0, exports.sanitizeArchiveEntryPath)(entry.entryName);
            const targetPath = resolveArchiveTargetPath(archiveRoot, relativeEntryPath);
            if (entry.isDirectory) {
                fs.mkdirSync(targetPath, { recursive: true });
                continue;
            }
            const expectedSize = Number(entry.header.size ?? 0);
            if (!Number.isFinite(expectedSize) || expectedSize < 0) {
                throw new Error(`Archive entry has an invalid size: ${relativeEntryPath}`);
            }
            if (expectedSize > maxEntryBytes) {
                throw new Error(`Archive entry exceeds the allowed size budget: ${relativeEntryPath}`);
            }
            totalBytes += expectedSize;
            if (totalBytes > maxTotalBytes) {
                throw new Error("Archive exceeds the allowed total size budget.");
            }
            fs.mkdirSync(path.dirname(targetPath), { recursive: true });
            const content = entry.getData();
            if (content.length > maxEntryBytes) {
                throw new Error(`Archive entry exceeds the allowed size budget: ${relativeEntryPath}`);
            }
            fs.writeFileSync(targetPath, content);
        }
        return {
            archiveRoot,
            workingPath: resolveExtractedArchiveRoot(archiveRoot),
        };
    }
    catch (error) {
        fs.rmSync(archiveRoot, { recursive: true, force: true });
        throw error;
    }
};
exports.extractZipArchiveToTempRoot = extractZipArchiveToTempRoot;
const inspectZipArchiveMetadata = (archivePath) => {
    const archive = new AdmZip(archivePath);
    const entries = archive.getEntries();
    const compressedBytes = fs.statSync(archivePath).size;
    const expandedBytes = entries.reduce((sum, entry) => {
        if (entry.isDirectory) {
            return sum;
        }
        const size = Number(entry.header.size ?? 0);
        return sum + (Number.isFinite(size) && size > 0 ? size : 0);
    }, 0);
    return {
        compressedBytes,
        expandedBytes,
        entryCount: entries.length,
    };
};
exports.inspectZipArchiveMetadata = inspectZipArchiveMetadata;
