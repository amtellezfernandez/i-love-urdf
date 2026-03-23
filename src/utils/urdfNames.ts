export const sanitizeUrdfName = (name: string, allowHyphen = true): string => {
  if (!name) return "";
  const trimmed = name.trim().replace(/\s+/g, "_");
  const allowed = allowHyphen ? ["_", "-"] : ["_"];
  const sanitized = Array.from(trimmed)
    .map((char) => {
      if (/[a-zA-Z0-9]/.test(char)) return char;
      if (allowed.includes(char)) return char;
      return "_";
    })
    .join("");
  if (sanitized && /\d/.test(sanitized[0])) {
    return `_${sanitized}`;
  }
  return sanitized;
};

export type SanitizeNamesOptions = {
  allowHyphen?: boolean;
  lowerCase?: boolean;
};

export const sanitizeNames = (
  name: string,
  options: SanitizeNamesOptions = {}
): string => {
  const allowHyphen = options.allowHyphen ?? false;
  const lowerCase = options.lowerCase ?? true;
  const sanitized = sanitizeUrdfName(name, allowHyphen)
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!sanitized) return "";

  const normalized = lowerCase ? sanitized.toLowerCase() : sanitized;
  return /^\d/.test(normalized) ? `_${normalized}` : normalized;
};
