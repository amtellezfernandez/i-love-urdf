import { SUPPORTED_MESH_EXTENSIONS } from "./meshFormats";
import {
  resolveMeshBlobFromReference,
  type MeshBlobMap,
  type PackageRootMap,
} from "./meshResolverBrowser";

const buildMeshDecodeFallbackRefs = (meshRef: string): string[] => {
  const cleaned = meshRef.split("?")[0]?.split("#")[0] ?? meshRef;
  const match = cleaned.match(/\.[^./\\]+$/);
  if (!match) return [];
  const currentExt = match[0].toLowerCase();
  const base = cleaned.slice(0, -match[0].length);
  return SUPPORTED_MESH_EXTENSIONS
    .filter((ext) => ext !== currentExt)
    .map((ext) => `${base}${ext}`);
};

export type ResolvedMeshCandidate = {
  ref: string;
  resolvedPath: string;
  blob: Blob;
};

export const resolveMeshCandidates = (params: {
  ref: string;
  meshFiles: MeshBlobMap;
  urdfBasePath?: string;
  packageRoots?: PackageRootMap;
}): ResolvedMeshCandidate[] => {
  const { ref, meshFiles, urdfBasePath, packageRoots } = params;
  const refs = [ref, ...buildMeshDecodeFallbackRefs(ref)];
  const seen = new Set<string>();
  const out: ResolvedMeshCandidate[] = [];

  refs.forEach((candidateRef) => {
    const resolved = resolveMeshBlobFromReference(
      candidateRef,
      meshFiles,
      urdfBasePath,
      packageRoots
    );
    if (!resolved) return;
    if (seen.has(resolved.path)) return;
    seen.add(resolved.path);
    out.push({
      ref: candidateRef,
      resolvedPath: resolved.path,
      blob: resolved.blob,
    });
  });

  return out;
};
