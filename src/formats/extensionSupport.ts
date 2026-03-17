export type ExtensionSupport = {
  primaryExtensions: readonly string[];
  supportedExtensions: readonly string[];
  extractExtension: (value: string) => string | null;
  isPrimarySupported: (value: string) => boolean;
  isSupported: (value: string) => boolean;
  describePrimary: () => string;
  primaryAcceptList: () => string;
};

const normalizeExtension = (value: string): string => {
  if (!value) return "";
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";
  return trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
};

const normalizeExtensionList = (values: string[] | undefined): readonly string[] => {
  const normalized = (values ?? []).map(normalizeExtension).filter((ext) => ext.length > 0);
  return Object.freeze(Array.from(new Set(normalized)));
};

const stripQueryAndHash = (value: string): string => {
  if (!value) return "";
  const [pathPart] = value.split("?");
  const [cleaned] = (pathPart ?? value).split("#");
  return cleaned ?? value;
};

export const createExtensionSupport = (params: {
  primaryExtensions?: string[];
  additionalExtensions?: string[];
}): ExtensionSupport => {
  const primaryExtensions = normalizeExtensionList(params.primaryExtensions);
  const supportedExtensions = normalizeExtensionList([
    ...primaryExtensions,
    ...(params.additionalExtensions ?? []),
  ]);

  const primarySet = new Set(primaryExtensions);
  const supportedSet = new Set(supportedExtensions);

  const extractExtension = (value: string): string | null => {
    const cleaned = stripQueryAndHash(value).trim();
    if (!cleaned) return null;
    const match = cleaned.toLowerCase().match(/\.([a-z0-9]+)$/);
    if (!match) return null;
    const ext = normalizeExtension(match[1]);
    return ext || null;
  };

  const isPrimarySupported = (value: string): boolean => {
    const ext = extractExtension(value);
    if (!ext) return false;
    return primarySet.has(ext);
  };

  const isSupported = (value: string): boolean => {
    const ext = extractExtension(value);
    if (!ext) return false;
    return supportedSet.has(ext);
  };

  const describePrimary = (): string => primaryExtensions.join(", ");
  const primaryAcceptList = (): string => primaryExtensions.join(",");

  return {
    primaryExtensions,
    supportedExtensions,
    extractExtension,
    isPrimarySupported,
    isSupported,
    describePrimary,
    primaryAcceptList,
  };
};
