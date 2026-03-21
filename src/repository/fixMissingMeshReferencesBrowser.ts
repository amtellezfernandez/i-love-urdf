import { normalizeMeshPathForMatch } from "../mesh/meshPaths";
import type { PackageRootMap } from "../mesh/meshResolverBrowser";
import {
  buildRepositoryFileEntriesFromPaths,
} from "./repositoryMeshResolution";
import {
  fixMissingMeshReferencesInRepository,
  type FixMissingMeshReferencesResult,
  type MeshReferenceCorrection,
} from "./fixMissingMeshReferences";

export type { FixMissingMeshReferencesResult, MeshReferenceCorrection };

export type FixMissingMeshReferencesBrowserOptions = {
  basePath?: string;
  packageRoots?: PackageRootMap;
};

export const fixMissingMeshReferences = (
  urdfContent: string,
  meshFiles: Record<string, Blob> | undefined,
  options: FixMissingMeshReferencesBrowserOptions = {}
): FixMissingMeshReferencesResult => {
  if (!urdfContent.trim()) {
    return {
      success: false,
      content: urdfContent,
      corrections: [],
      unresolved: [],
      error: "Empty URDF",
    };
  }

  if (!meshFiles || Object.keys(meshFiles).length === 0) {
    return {
      success: false,
      content: urdfContent,
      corrections: [],
      unresolved: [],
      error: "No mesh files available",
    };
  }

  const normalizedBasePath = normalizeMeshPathForMatch(options.basePath ?? "");
  const urdfPath = normalizedBasePath ? `${normalizedBasePath}/robot.urdf` : "robot.urdf";
  const repositoryFiles = buildRepositoryFileEntriesFromPaths([
    urdfPath,
    ...Object.keys(meshFiles),
  ]);

  return fixMissingMeshReferencesInRepository(urdfContent, urdfPath, repositoryFiles, {
    packageRoots: options.packageRoots,
  });
};
