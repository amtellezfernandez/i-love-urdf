import * as fs from "node:fs";
import * as path from "node:path";
import * as process from "node:process";
import { collectDoctorReport } from "./cliDoctor";
import type { CliArgMap } from "./commandHelpers";

type BugReportAttachment = {
  label: string;
  path: string;
  kind: "file-copy" | "directory-manifest";
};

type BugReportBundle = {
  generatedAt: string;
  version: 1;
  doctor: Awaited<ReturnType<typeof collectDoctorReport>>;
  inputs: {
    urdfPath?: string;
    sourcePath?: string;
    cwd: string;
  };
  attachments: BugReportAttachment[];
};

const MAX_DIRECTORY_ENTRIES = 200;

const getStringArg = (args: CliArgMap, key: string): string | undefined => {
  const value = args.get(key);
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
};

const timestampForPath = (): string =>
  new Date().toISOString().replace(/[:-]/g, "").replace(/\..+$/, "").replace("T", "-");

const sanitizeFileName = (value: string): string => value.replace(/[^a-zA-Z0-9._-]+/g, "_");

const collectDirectoryEntries = (
  rootDir: string,
  limit = MAX_DIRECTORY_ENTRIES
): string[] => {
  const entries: string[] = [];
  const queue = [rootDir];

  while (queue.length > 0 && entries.length < limit) {
    const current = queue.shift();
    if (!current) {
      break;
    }

    const children = fs
      .readdirSync(current, { withFileTypes: true })
      .filter((entry) => entry.name !== ".git" && entry.name !== "node_modules")
      .sort((left, right) => left.name.localeCompare(right.name));

    for (const child of children) {
      const absolute = path.join(current, child.name);
      const relative = path.relative(rootDir, absolute) || child.name;
      if (child.isDirectory()) {
        entries.push(`${relative}/`);
        if (entries.length >= limit) {
          break;
        }
        queue.push(absolute);
      } else {
        entries.push(relative);
        if (entries.length >= limit) {
          break;
        }
      }
    }
  }

  return entries;
};

const attachInputPath = (
  inputPath: string,
  label: string,
  attachmentsDir: string
): BugReportAttachment | null => {
  const resolvedPath = path.resolve(inputPath);
  if (!fs.existsSync(resolvedPath)) {
    return null;
  }

  if (fs.statSync(resolvedPath).isDirectory()) {
    const manifestPath = path.join(
      attachmentsDir,
      `${sanitizeFileName(label)}-tree.txt`
    );
    const entries = collectDirectoryEntries(resolvedPath);
    fs.writeFileSync(
      manifestPath,
      [`source ${resolvedPath}`, "", ...entries].join("\n") + "\n",
      "utf8"
    );
    return {
      label,
      path: manifestPath,
      kind: "directory-manifest",
    };
  }

  const fileName = `${sanitizeFileName(label)}-${sanitizeFileName(path.basename(resolvedPath))}`;
  const attachmentPath = path.join(attachmentsDir, fileName);
  fs.copyFileSync(resolvedPath, attachmentPath);
  return {
    label,
    path: attachmentPath,
    kind: "file-copy",
  };
};

export const renderBugReportHelp = (): string =>
  [
    "Capture a support bundle with `ilu doctor` output and optional local repro inputs.",
    "",
    "Usage",
    "  ilu bug-report",
    "  ilu bug-report --out <dir>",
    "  ilu bug-report --out <dir> --urdf <path>",
    "  ilu bug-report --out <dir> --source <path>",
    "",
    "What it writes",
    "  report.json with runtime, support, auth, and xacro diagnostics",
    "  copied local input files when --urdf or --source points to a file",
    "  a compact directory tree manifest when --source points to a local folder",
  ].join("\n");

export const runBugReportCommand = async (args: CliArgMap): Promise<void> => {
  const requestedOutDir = getStringArg(args, "out");
  const outDir = path.resolve(
    requestedOutDir ?? path.join(process.cwd(), `ilu-bug-report-${timestampForPath()}`)
  );
  const attachmentsDir = path.join(outDir, "attachments");
  const urdfPath = getStringArg(args, "urdf");
  const sourcePath = getStringArg(args, "source");

  fs.mkdirSync(attachmentsDir, { recursive: true });

  const bundle: BugReportBundle = {
    generatedAt: new Date().toISOString(),
    version: 1,
    doctor: await collectDoctorReport(),
    inputs: {
      urdfPath: urdfPath ? path.resolve(urdfPath) : undefined,
      sourcePath: sourcePath ? path.resolve(sourcePath) : undefined,
      cwd: process.cwd(),
    },
    attachments: [],
  };

  if (urdfPath) {
    const attachment = attachInputPath(urdfPath, "urdf", attachmentsDir);
    if (attachment) {
      bundle.attachments.push(attachment);
    }
  }

  if (sourcePath) {
    const attachment = attachInputPath(sourcePath, "source", attachmentsDir);
    if (attachment) {
      bundle.attachments.push(attachment);
    }
  }

  fs.writeFileSync(
    path.join(outDir, "report.json"),
    JSON.stringify(bundle, null, 2) + "\n",
    "utf8"
  );

  console.log(`wrote bug report to ${outDir}`);
  console.log(`report ${path.join(outDir, "report.json")}`);
  if (bundle.attachments.length > 0) {
    for (const attachment of bundle.attachments) {
      console.log(`${attachment.label} ${attachment.path}`);
    }
  }
};
