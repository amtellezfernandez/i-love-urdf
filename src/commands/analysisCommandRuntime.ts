import { parseMeshReference } from "../mesh/meshPaths";
import { parseXml } from "../xmlDom";
import type { CliArgMap, CliCommandHelpers } from "./commandHelpers";

export type AnalysisCommandHandler = (
  args: CliArgMap,
  helpers: CliCommandHelpers
) => Promise<void> | void;

export const emitJson = (value: unknown) => {
  console.log(JSON.stringify(value, null, 2));
};

export const readRequiredUrdfInput = (
  args: CliArgMap,
  helpers: CliCommandHelpers
) => {
  const urdfPath = helpers.getOptionalStringArg(args, "urdf");
  if (!urdfPath) {
    helpers.fail("Missing required argument --urdf");
  }

  return {
    urdfPath,
    urdfContent: helpers.readText(urdfPath),
  };
};

export const extractMeshRefs = (urdfContent: string) => {
  const doc = parseXml(urdfContent);
  const meshElements = Array.from(doc.querySelectorAll("mesh"));

  return meshElements
    .map((meshElement) => meshElement.getAttribute("filename") || "")
    .filter((ref) => ref.length > 0)
    .map((ref) => parseMeshReference(ref));
};
