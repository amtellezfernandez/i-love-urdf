import { analyzeUrdf } from "../analysis/analyzeUrdf";
import { convertURDFToMJCF } from "../convert/urdfToMJCF";
import { convertURDFToXacro } from "../convert/urdfToXacro";
import { canonicalOrderURDF } from "../utils/canonicalOrdering";
import { normalizeJointAxes } from "../utils/normalizeJointAxes";
import { prettyPrintURDF } from "../utils/prettyPrintURDF";
import { compareUrdfs } from "../utils/urdfDiffUtils";
import { validateUrdf } from "../validation/validateUrdf";
import type { UrdfTransformResult } from "../transforms/urdfTransforms";

export type LoadedUrdfSourceLike = {
  urdf: string;
  entryPath?: string;
  inspectedPath?: string;
  rootPath?: string;
  source?: string;
  sourceKind?: string;
  inspectionMode?: string;
  repositoryUrl?: string;
  ref?: string;
};

export const replaceLoadedSourceUrdf = <T extends LoadedUrdfSourceLike>(
  source: T,
  urdf: string
): T => ({
  ...source,
  urdf,
});

export const validateLoadedSource = <T extends LoadedUrdfSourceLike>(source: T) =>
  validateUrdf(source.urdf);

export const analyzeLoadedSource = <T extends LoadedUrdfSourceLike>(source: T) =>
  analyzeUrdf(source.urdf);

export const compareLoadedSources = <
  TLeft extends LoadedUrdfSourceLike,
  TRight extends LoadedUrdfSourceLike,
>(
  left: TLeft,
  right: TRight
) => compareUrdfs(left.urdf, right.urdf);

export const prettyPrintLoadedSource = <T extends LoadedUrdfSourceLike>(
  source: T,
  indent: number = 2
): T => replaceLoadedSourceUrdf(source, prettyPrintURDF(source.urdf, indent));

export const canonicalOrderLoadedSource = <T extends LoadedUrdfSourceLike>(source: T): T =>
  replaceLoadedSourceUrdf(source, canonicalOrderURDF(source.urdf));

export const normalizeLoadedSourceAxes = <T extends LoadedUrdfSourceLike>(source: T) => {
  const result = normalizeJointAxes(source.urdf);
  return {
    ...result,
    nextSource: replaceLoadedSourceUrdf(source, result.urdfContent),
  };
};

export const convertLoadedSourceToMJCF = <T extends LoadedUrdfSourceLike>(source: T) =>
  convertURDFToMJCF(source.urdf);

export const convertLoadedSourceToXacro = <T extends LoadedUrdfSourceLike>(source: T) =>
  convertURDFToXacro(source.urdf);

export const applyLoadedSourceTransform = <
  T extends LoadedUrdfSourceLike,
  TResult extends UrdfTransformResult,
>(
  source: T,
  transform: (urdf: string) => TResult
): TResult & { nextSource: T } => {
  const result = transform(source.urdf);
  return {
    ...result,
    nextSource: replaceLoadedSourceUrdf(source, result.content),
  };
};
