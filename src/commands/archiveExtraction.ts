import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import AdmZip = require("adm-zip");

export const MAX_ARCHIVE_ENTRY_COUNT = 5_000;
export const MAX_ARCHIVE_ENTRY_BYTES = 256 * 1024 * 1024;
export const MAX_ARCHIVE_TOTAL_BYTES = 512 * 1024 * 1024;

export type ExtractZipArchiveOptions = {
  tempDir?: string;
  maxEntries?: number;
  maxEntryBytes?: number;
  maxTotalBytes?: number;
};

export type ExtractZipArchiveResult = {
  archiveRoot: string;
  workingPath: string;
};

export type ZipArchiveMetadata = {
  compressedBytes: number;
  expandedBytes: number;
  entryCount: number;
};

const resolveExtractedArchiveRoot = (archiveRoot: string): string => {
  const entries = fs
    .readdirSync(archiveRoot, { withFileTypes: true })
    .filter((entry) => entry.name !== "__MACOSX" && entry.name !== ".DS_Store");

  if (entries.length === 1 && entries[0]?.isDirectory()) {
    return path.join(archiveRoot, entries[0].name);
  }

  return archiveRoot;
};

export const sanitizeArchiveEntryPath = (entryName: string): string => {
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

const resolveArchiveTargetPath = (archiveRoot: string, relativeEntryPath: string): string => {
  const targetPath = path.resolve(archiveRoot, ...relativeEntryPath.split("/"));
  const normalizedRoot = path.resolve(archiveRoot);
  if (targetPath !== normalizedRoot && !targetPath.startsWith(`${normalizedRoot}${path.sep}`)) {
    throw new Error(`Archive entry escapes the extraction root: ${relativeEntryPath}`);
  }
  return targetPath;
};

export const extractZipArchiveToTempRoot = (
  archivePath: string,
  options: ExtractZipArchiveOptions = {}
): ExtractZipArchiveResult => {
  const archiveRoot = fs.mkdtempSync(path.join(options.tempDir ?? os.tmpdir(), "ilu-archive-"));
  const maxEntries = options.maxEntries ?? MAX_ARCHIVE_ENTRY_COUNT;
  const maxEntryBytes = options.maxEntryBytes ?? MAX_ARCHIVE_ENTRY_BYTES;
  const maxTotalBytes = options.maxTotalBytes ?? MAX_ARCHIVE_TOTAL_BYTES;

  try {
    const archive = new AdmZip(archivePath);
    const entries = archive.getEntries();

    if (entries.length > maxEntries) {
      throw new Error(`Archive contains too many entries (${entries.length}).`);
    }

    let totalBytes = 0;
    for (const entry of entries) {
      const relativeEntryPath = sanitizeArchiveEntryPath(entry.entryName);
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
  } catch (error) {
    fs.rmSync(archiveRoot, { recursive: true, force: true });
    throw error;
  }
};

export const inspectZipArchiveMetadata = (archivePath: string): ZipArchiveMetadata => {
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
