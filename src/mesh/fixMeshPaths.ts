/**
 * Mesh Path Fixing Utility for URDF
 *
 * Detects and fixes common issues with mesh file paths:
 * - Absolute paths (/home/user/.../mesh.stl)
 * - Windows-style paths (meshes\part.stl)
 * - Paths with unnecessary .. segments
 * - Non-standard package paths
 *
 * Normalizes to standard ROS package:// format
 */

import { parseURDF, serializeURDF } from "../parsing/urdfParser";

export interface PathFixResult {
  urdfContent: string;
  corrections: PathCorrection[];
  packageName: string;
}

export interface PathCorrection {
  element: string; // "visual" or "collision"
  linkName: string;
  original: string;
  corrected: string;
  reason: string;
}

export interface FixMeshPathsOptions {
  packageName?: string;
  convertRelativeToPackage?: boolean;
}

/**
 * Normalizes a file path by resolving .. segments and converting backslashes
 */
function normalizePath(path: string, preserveLeadingSlash = false): string {
  // Convert Windows backslashes to forward slashes
  let normalized = path.replace(/\\/g, "/");

  // Remove duplicate slashes
  normalized = normalized.replace(/\/+/g, "/");

  const hasLeadingSlash = preserveLeadingSlash && normalized.startsWith("/");

  // Resolve .. segments
  const parts = normalized.split("/").filter(Boolean);
  const resolved: string[] = [];

  for (const part of parts) {
    if (part === "..") {
      if (resolved.length > 0) {
        resolved.pop();
      } else if (!hasLeadingSlash) {
        resolved.push(part);
      }
    } else if (part !== ".") {
      resolved.push(part);
    }
  }

  const joined = resolved.join("/");
  return hasLeadingSlash ? `/${joined}` : joined;
}

type MeshUriParts = {
  scheme: "package" | "file" | null;
  packageName?: string;
  path: string;
};

function splitMeshUri(path: string): MeshUriParts {
  if (path.startsWith("package://")) {
    const match = path.match(/^package:\/\/([^/]+)\/?(.*)$/);
    if (match) {
      return { scheme: "package", packageName: match[1], path: match[2] || "" };
    }
    return { scheme: "package", path: "" };
  }
  if (path.startsWith("file://")) {
    return { scheme: "file", path: path.slice("file://".length) };
  }
  return { scheme: null, path };
}

/**
 * Extracts the filename from a path
 */
function getFilename(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1];
}

/**
 * Determines if a path is absolute
 */
function isAbsolutePath(path: string): boolean {
  // Unix absolute path
  if (path.startsWith("/")) return true;
  // Windows absolute path (C:\, D:\, etc.)
  if (/^[A-Za-z]:[\\/]/.test(path)) return true;
  return false;
}

/**
 * Determines if a path is already a ROS package path
 */
function isPackagePath(path: string): boolean {
  return path.startsWith("package://");
}

/**
 * Extracts package name from a package:// path
 */
function extractPackageName(path: string): string | null {
  const match = path.match(/^package:\/\/([^/]+)/);
  return match ? match[1] : null;
}

/**
 * Detects common mesh folder patterns
 */
function detectMeshFolder(path: string): string {
  const normalized = path.toLowerCase();

  // Common mesh folder patterns
  const patterns = ["meshes/", "mesh/", "visual/", "visuals/", "collision/", "collisions/", "models/", "assets/"];

  for (const pattern of patterns) {
    const index = normalized.indexOf(pattern);
    if (index !== -1) {
      // Return from the mesh folder onwards
      return path.substring(index);
    }
  }

  // If no common folder is found, return only the filename.
  return getFilename(path);
}

/**
 * Fixes mesh paths in a URDF to use proper package:// format
 *
 * @param urdfContent - URDF XML content as string
 * @param packageName - Optional package name to use (auto-detected if not provided)
 * @returns Result with corrected URDF and list of corrections
 */
export function fixMeshPaths(
  urdfContent: string,
  packageNameOrOptions?: string | FixMeshPathsOptions
): PathFixResult {
  return fixMeshPathsInternal(urdfContent, packageNameOrOptions);
}

export function fixMeshPathsInternal(
  urdfContent: string,
  packageNameOrOptions?: string | FixMeshPathsOptions
): PathFixResult {
  const parsed = parseURDF(urdfContent);
  const options =
    typeof packageNameOrOptions === "string" ? { packageName: packageNameOrOptions } : packageNameOrOptions ?? {};
  const convertRelativeToPackage = options.convertRelativeToPackage ?? true;
  let packageName = options.packageName;

  const result: PathFixResult = {
    urdfContent: urdfContent,
    corrections: [],
    packageName: packageName || "",
  };

  if (!parsed.isValid) {
    return result;
  }

  const robot = parsed.document.querySelector("robot");
  if (!robot) {
    return result;
  }

  // Auto-detect package name from robot name if not provided
  if (!packageName) {
    const robotName = robot.getAttribute("name") || "robot";
    // Preserve the original package casing when we only have the robot name as a hint.
    packageName = robotName.replace(/\s+/g, "_");
    if (!packageName.endsWith("_description")) {
      packageName += "_description";
    }
    result.packageName = packageName;
  }

  // Find all mesh elements
  const meshElements = robot.querySelectorAll("mesh");

  for (const mesh of meshElements) {
    const filename = mesh.getAttribute("filename");
    if (!filename) continue;

    let correctedPath = filename;
    let reason = "";
    let needsCorrection = false;

    const uri = splitMeshUri(filename);

    // Get context (link name, visual/collision)
    const linkElement = mesh.closest("link");
    const linkName = linkElement?.getAttribute("name") || "unknown";
    const visualElement = mesh.closest("visual");
    const collisionElement = mesh.closest("collision");
    const elementType = visualElement ? "visual" : collisionElement ? "collision" : "unknown";

    // Handle explicit URI schemes first (preserve scheme and only normalize path part)
    if (uri.scheme === "file") {
      const normalized = normalizePath(uri.path, uri.path.startsWith("/"));
      correctedPath = `file://${normalized}`;
      reason = "Normalized file:// URI path";
      needsCorrection = correctedPath !== filename;
    } else if (uri.scheme === "package" && uri.packageName) {
      const normalized = normalizePath(uri.path);
      correctedPath = normalized
        ? `package://${uri.packageName}/${normalized}`
        : `package://${uri.packageName}`;
      reason = "Normalized package:// URI path";
      needsCorrection = correctedPath !== filename;
    } else if (isAbsolutePath(filename)) {
      // Absolute path - extract mesh folder and filename
      const meshPart = detectMeshFolder(normalizePath(filename));
      correctedPath = `package://${packageName}/${meshPart}`;
      reason = "Converted absolute path to package:// format";
      needsCorrection = true;
    } else if (filename.includes("\\")) {
      // Windows-style path
      const normalized = normalizePath(filename);
      if (isPackagePath(filename)) {
        correctedPath = filename.replace(/\\/g, "/");
      } else if (convertRelativeToPackage) {
        const meshPart = detectMeshFolder(normalized);
        correctedPath = `package://${packageName}/${meshPart}`;
      } else {
        correctedPath = normalized;
      }
      reason = "Fixed Windows-style backslashes";
      needsCorrection = true;
    } else if (filename.includes("/../") || filename.includes("/./")) {
      // Path with unnecessary segments
      if (isPackagePath(filename)) {
        const packageMatch = filename.match(/^(package:\/\/[^/]+)(.*)/);
        if (packageMatch) {
          const basePath = packageMatch[1];
          const restPath = normalizePath(packageMatch[2]);
          correctedPath = basePath + "/" + restPath;
        }
      } else if (convertRelativeToPackage) {
        const normalized = normalizePath(filename);
        const meshPart = detectMeshFolder(normalized);
        correctedPath = `package://${packageName}/${meshPart}`;
      } else {
        correctedPath = normalizePath(filename);
      }
      reason = "Normalized path segments (removed .. and .)";
      needsCorrection = true;
    } else if (!isPackagePath(filename)) {
      // Relative path without package:// prefix
      if (convertRelativeToPackage) {
        const normalized = normalizePath(filename);
        const meshPart = detectMeshFolder(normalized);
        correctedPath = `package://${packageName}/${meshPart}`;
        reason = "Added package:// prefix to relative path";
        needsCorrection = true;
      } else {
        const normalized = normalizePath(filename);
        correctedPath = normalized;
        reason = "Normalized relative mesh path";
        needsCorrection = correctedPath !== filename;
      }
    } else if (isPackagePath(filename)) {
      // Already a package path, but check for issues
      const normalized = filename.replace(/\/+/g, "/");
      if (normalized !== filename) {
        correctedPath = normalized;
        reason = "Removed duplicate slashes";
        needsCorrection = true;
      }
    }

    if (needsCorrection && correctedPath !== filename) {
      mesh.setAttribute("filename", correctedPath);

      result.corrections.push({
        element: elementType,
        linkName,
        original: filename,
        corrected: correctedPath,
        reason,
      });
    }
  }

  result.urdfContent = serializeURDF(parsed.document);
  return result;
}

/**
 * Convenience wrapper that returns only the corrected URDF string.
 *
 * @param urdfContent - URDF XML content as string
 * @param packageName - Optional package name to use
 * @returns Corrected URDF content
 */
