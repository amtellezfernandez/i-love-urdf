import * as meshFormatsConfig from "./meshFormats.constants.json";
import { createExtensionSupport } from "../formats/extensionSupport";

type MeshFormatsConfig = {
  supportedMeshExtensions?: string[];
  additionalMeshResourceExtensions?: string[];
};

const defaults = meshFormatsConfig as MeshFormatsConfig;

const meshSupport = createExtensionSupport({
  primaryExtensions: defaults.supportedMeshExtensions,
  additionalExtensions: defaults.additionalMeshResourceExtensions,
});

export const SUPPORTED_MESH_EXTENSIONS = meshSupport.primaryExtensions;
export const SUPPORTED_MESH_RESOURCE_EXTENSIONS = meshSupport.supportedExtensions;

export const extractExtension = meshSupport.extractExtension;

export const extractExtensionWithoutDot = (value: string): string | null => {
  const ext = extractExtension(value);
  return ext ? ext.slice(1) : null;
};

export const isSupportedMeshExtension = meshSupport.isPrimarySupported;
export const isSupportedMeshResource = meshSupport.isSupported;

export const meshExtensionsDisplay = meshSupport.describePrimary;
export const describeSupportedMeshExtensions = meshSupport.describePrimary;
export const meshExtensionsAcceptList = meshSupport.primaryAcceptList;

export type MeshSupportStatus =
  | { ok: true; extension: string }
  | { ok: false; extension?: string; reason: string };

export const getMeshSupportStatus = (value: string): MeshSupportStatus => {
  const ext = extractExtension(value);
  if (!ext) {
    return {
      ok: false,
      reason: `Missing mesh file extension. Supported formats: ${describeSupportedMeshExtensions()}.`,
    };
  }
  if (!isSupportedMeshExtension(ext)) {
    return {
      ok: false,
      extension: ext,
      reason: `Unsupported mesh format "${ext}". Supported formats: ${describeSupportedMeshExtensions()}.`,
    };
  }
  return { ok: true, extension: ext };
};
