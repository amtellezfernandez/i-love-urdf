import { normalizeRepositoryPath, type RepositoryFileEntry } from "./repositoryMeshResolution";

export type RepositoryScope =
  | {
      kind: "root";
      path: "";
    }
  | {
      kind: "dir" | "file";
      path: string;
    };

export const matchesRepositoryScope = (
  repositoryPath: string,
  scope: RepositoryScope
): boolean => {
  if (scope.kind === "root") {
    return true;
  }

  const normalizedPath = normalizeRepositoryPath(repositoryPath);
  if (!normalizedPath) {
    return false;
  }

  if (scope.kind === "file") {
    return normalizedPath === scope.path;
  }

  return normalizedPath === scope.path || normalizedPath.startsWith(`${scope.path}/`);
};

export const resolveRepositoryScopeFromFiles = <T extends RepositoryFileEntry>(
  files: T[],
  requestedPath?: string
): RepositoryScope | null => {
  const normalizedRequestedPath = normalizeRepositoryPath(requestedPath || "");
  if (!normalizedRequestedPath) {
    return {
      kind: "root",
      path: "",
    };
  }

  const exactFile = files.find(
    (file) =>
      file.type === "file" && normalizeRepositoryPath(file.path) === normalizedRequestedPath
  );
  if (exactFile) {
    return {
      kind: "file",
      path: exactFile.path,
    };
  }

  const exactDirectory = files.find(
    (file) =>
      file.type === "dir" && normalizeRepositoryPath(file.path) === normalizedRequestedPath
  );
  if (exactDirectory) {
    return {
      kind: "dir",
      path: exactDirectory.path,
    };
  }

  const hasDescendants = files.some((file) =>
    normalizeRepositoryPath(file.path).startsWith(`${normalizedRequestedPath}/`)
  );
  if (!hasDescendants) {
    return null;
  }

  return {
    kind: "dir",
    path: normalizedRequestedPath,
  };
};

export const resolveRepositoryScopedPathFromFiles = <T extends RepositoryFileEntry>(
  files: T[],
  scope: RepositoryScope,
  requestedPath?: string
): string => {
  const normalizedRequestedPath = normalizeRepositoryPath(requestedPath || "");
  if (!normalizedRequestedPath) {
    return "";
  }

  const exactScope = resolveRepositoryScopeFromFiles(files, normalizedRequestedPath);
  if (exactScope?.kind === "file") {
    return exactScope.path;
  }

  if (scope.kind === "dir") {
    const scopedCandidatePath = normalizeRepositoryPath(`${scope.path}/${normalizedRequestedPath}`);
    const scopedCandidate = resolveRepositoryScopeFromFiles(files, scopedCandidatePath);
    if (scopedCandidate?.kind === "file") {
      return scopedCandidate.path;
    }
  }

  if (scope.kind === "file") {
    const scopeBasename = scope.path.split("/").pop() || scope.path;
    if (scopeBasename === normalizedRequestedPath) {
      return scope.path;
    }
  }

  return normalizedRequestedPath;
};
