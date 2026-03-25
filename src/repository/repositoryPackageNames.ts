import {
  extractPackageNameFromPackageXml,
  normalizeRepositoryPath,
  type PackageNameByPath,
  type RepositoryFileEntry,
} from "./repositoryMeshResolution";

export const buildPackageNameByPathFromRepositoryFiles = async <T extends RepositoryFileEntry>(
  files: T[],
  readText: (file: T) => Promise<string>
): Promise<PackageNameByPath> => {
  const overrides: Record<string, string> = {};

  for (const file of files) {
    if (file.type !== "file" || !file.path.toLowerCase().endsWith("/package.xml") && file.path.toLowerCase() !== "package.xml") {
      continue;
    }

    try {
      const packageName = extractPackageNameFromPackageXml(await readText(file));
      if (!packageName) {
        continue;
      }
      overrides[normalizeRepositoryPath(file.path)] = packageName;
    } catch {
      continue;
    }
  }

  return overrides;
};
