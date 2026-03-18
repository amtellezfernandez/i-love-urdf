export {
  parseURDF,
  serializeURDF,
  type ParsedURDF,
} from "./parsing/urdfParser";
export {
  parseLinkData,
  parseLinkDataFromDocument,
  type CollisionData,
  type InertialData,
  type LinkData,
  type OriginData,
  type VisualData,
} from "./parsing/parseLinkData";
export {
  parseSensors,
  parseSensorsFromDocument,
  type ParsedSensor,
  type SensorNoise,
} from "./parsing/parseSensors";
export {
  parseJointAxesFromDocument,
  parseJointAxesFromURDF,
  type JointAxisInfo,
  type JointAxisMap,
} from "./parsing/parseJointAxis";
export {
  getJointLimits,
  parseJointLimitsFromDocument,
  parseJointLimitsFromURDF,
  type JointLimitInfo,
  type JointLimits,
} from "./parsing/parseJointLimits";
export {
  parseJointHierarchy,
  parseJointHierarchyFromDocument,
  type JointHierarchyNode,
} from "./parsing/parseJointHierarchy";
export {
  parseLinkNames,
  parseLinkNamesFromDocument,
} from "./parsing/parseLinkNames";
export {
  getJointLinks,
} from "./parsing/getJointLinks";
export {
  findNamedUrdfElement,
  hasXacroSyntax,
  parsePlainUrdfDocument,
  type ParsePlainUrdfDocumentOptions,
  type ParsePlainUrdfDocumentResult,
  type PlainUrdfDocumentIssue,
} from "./parsing/safeUrdfDocument";
export {
  canonicalOrderURDF,
} from "./utils/canonicalOrdering";
export {
  compareUrdfs,
} from "./utils/urdfDiffUtils";
export {
  normalizeJointAxes,
  snapJointAxes,
  type AxisCorrection,
  type AxisError,
  type AxisNormalizationOptions,
  type AxisNormalizationResult,
} from "./utils/normalizeJointAxes";
export {
  prettyPrintURDF,
} from "./utils/prettyPrintURDF";
export {
  buildOrientationMappingRotation,
  applyOrientationToRobot,
  rotateRobot90Degrees,
  type AxisSpec,
} from "./utils/rotateRobot";
export {
  isSafeMeshPath,
  normalizeMeshPath,
  normalizeMeshPathForMatch,
  parseMeshReference,
  type MeshReference,
} from "./mesh/meshPaths";
export {
  fixMeshPaths,
} from "./mesh/fixMeshPaths";
export {
  inspectRepositoryCandidates,
  type InspectRepositoryCandidatesOptions,
  type RepositoryCandidateInspection,
} from "./repository/repositoryInspection";
export {
  resolveRepositoryXacroTargetPath,
} from "./repository/repositoryUrdfDiscovery";
export {
  buildRepositoryFileEntriesFromPaths,
  buildPackageRootsFromRepositoryFiles,
  extractPackageNameFromPackageXml,
  resolveRepositoryFileReference,
  resolveRepositoryMeshReferences,
  type BuildPackageRootsOptions,
  type PackageNameByPath,
  type RepositoryFileEntry,
} from "./repository/repositoryMeshResolution";
