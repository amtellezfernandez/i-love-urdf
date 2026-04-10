import {
  extractPackageNameFromPackageXml,
  normalizeRepositoryPath,
  type PackageNameByPath,
  type RepositoryFileEntry,
} from "./repositoryMeshResolution";

const REPOSITORY_PACKAGE_XML_READ_CONCURRENCY = 8;

export const buildPackageNameByPathFromRepositoryFiles = async <T extends RepositoryFileEntry>(
  files: T[],
  readText: (file: T) => Promise<string>
): Promise<PackageNameByPath> => {
  const overrides: Record<string, string> = {};
  const packageFiles = files.filter(
    (file) =>
      file.type === "file" &&
      (file.path.toLowerCase().endsWith("/package.xml") || file.path.toLowerCase() === "package.xml")
  );

  if (packageFiles.length === 0) {
    return overrides;
  }

  let cursor = 0;

  const workers = Array.from(
    { length: Math.min(REPOSITORY_PACKAGE_XML_READ_CONCURRENCY, packageFiles.length) },
    async () => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= packageFiles.length) {
          return;
        }
        const file = packageFiles[index];
        if (!file) {
          return;
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
    }
  );

  await Promise.all(workers);

  return overrides;
};
