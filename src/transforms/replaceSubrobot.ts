import { parseURDF, serializeURDF } from "../parsing/urdfParser";

export type ReplaceSubrobotOptions = {
  targetRootLink: string;
  replacementUrdfContent: string;
  replacementRootLink: string;
  mountParentLink?: string;
  mountJointName?: string;
  prefix?: string;
  mount?: {
    xyz?: [number, number, number];
    rpy?: [number, number, number];
  };
};

export type ReplaceSubrobotResult = {
  success: boolean;
  content: string;
  removedLinks: string[];
  removedJoints: string[];
  importedLinks: string[];
  importedJoints: string[];
  mountParentLink?: string;
  mountedRootLink?: string;
  mountJointName?: string;
  error?: string;
};

const getRobotElement = (document: Document): Element | null => document.querySelector("robot");

const getDirectChildrenByTag = (parent: Element, tagName: string): Element[] =>
  Array.from(parent.children).filter((element) => element.tagName === tagName);

const sanitizePrefix = (value: string): string =>
  value
    .trim()
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");

const normalizeComparableName = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const formatCandidateList = (names: readonly string[]): string =>
  names.slice(0, 5).map((name) => `"${name}"`).join(", ");

const collectDescendantLinks = (
  rootLinkName: string,
  joints: readonly Element[]
): Set<string> => {
  const descendants = new Set<string>([rootLinkName]);
  let progressed = true;

  while (progressed) {
    progressed = false;
    joints.forEach((joint) => {
      const parentLink = joint.querySelector("parent")?.getAttribute("link");
      const childLink = joint.querySelector("child")?.getAttribute("link");
      if (!parentLink || !childLink) {
        return;
      }
      if (!descendants.has(parentLink) || descendants.has(childLink)) {
        return;
      }
      descendants.add(childLink);
      progressed = true;
    });
  }

  return descendants;
};

const renameMaterialReferences = (node: Element, materialMap: Map<string, string>) => {
  node.querySelectorAll("material[name]").forEach((material) => {
    const materialName = material.getAttribute("name");
    if (!materialName) {
      return;
    }
    const mappedName = materialMap.get(materialName);
    if (mappedName) {
      material.setAttribute("name", mappedName);
    }
  });
};

const resolveName = (sourceName: string, prefix: string): string =>
  prefix ? `${prefix}__${sourceName}` : sourceName;

const buildCollisionSet = (elements: readonly Element[]): Set<string> =>
  new Set(elements.map((element) => element.getAttribute("name") || "").filter(Boolean));

const parseTripletOrZero = (value: string | null | undefined): [number, number, number] => {
  const parsed = (value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((entry) => Number(entry));
  if (parsed.length !== 3 || parsed.some((entry) => !Number.isFinite(entry))) {
    return [0, 0, 0];
  }
  return [parsed[0], parsed[1], parsed[2]];
};

const getOriginAttributes = (
  joint: Element | null
): { xyz: [number, number, number]; rpy: [number, number, number] } => {
  const origin = joint?.querySelector("origin");
  return {
    xyz: parseTripletOrZero(origin?.getAttribute("xyz")),
    rpy: parseTripletOrZero(origin?.getAttribute("rpy")),
  };
};

const fail = (content: string, error: string): ReplaceSubrobotResult => ({
  success: false,
  content,
  removedLinks: [],
  removedJoints: [],
  importedLinks: [],
  importedJoints: [],
  error,
});

const resolveRequestedName = (
  requestedName: string,
  availableNames: readonly string[],
  kind: string
): { ok: true; value: string } | { ok: false; error: string } => {
  if (availableNames.includes(requestedName)) {
    return { ok: true, value: requestedName };
  }

  const requestedLower = requestedName.toLowerCase();
  const requestedTokens = requestedName
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
  const caseInsensitiveMatches = availableNames.filter((name) => name.toLowerCase() === requestedLower);
  if (caseInsensitiveMatches.length === 1) {
    return { ok: true, value: caseInsensitiveMatches[0] as string };
  }

  const requestedNormalized = normalizeComparableName(requestedName);
  const normalizedMatches = availableNames.filter(
    (name) => normalizeComparableName(name) === requestedNormalized
  );
  if (normalizedMatches.length === 1) {
    return { ok: true, value: normalizedMatches[0] as string };
  }

  const substringMatches = availableNames.filter((name) => {
    const candidateLower = name.toLowerCase();
    const candidateNormalized = normalizeComparableName(name);
    return (
      candidateLower.includes(requestedLower) ||
      candidateNormalized.includes(requestedNormalized) ||
      requestedNormalized.includes(candidateNormalized)
    );
  });
  if (substringMatches.length === 1) {
    return { ok: true, value: substringMatches[0] as string };
  }

  if (
    caseInsensitiveMatches.length > 1 ||
    normalizedMatches.length > 1 ||
    substringMatches.length > 1
  ) {
    const ambiguousMatches =
      caseInsensitiveMatches.length > 1
        ? caseInsensitiveMatches
        : normalizedMatches.length > 1
          ? normalizedMatches
          : substringMatches;
    return {
      ok: false,
      error: `Ambiguous ${kind} "${requestedName}". Matches: ${formatCandidateList(ambiguousMatches)}`,
    };
  }

  const suggestions = availableNames.filter((name) => {
    const candidateLower = name.toLowerCase();
    const candidateNormalized = normalizeComparableName(name);
    return (
      candidateNormalized.includes(requestedNormalized) ||
      requestedNormalized.includes(candidateNormalized) ||
      requestedTokens.some((token) => candidateLower.includes(token))
    );
  });

  return {
    ok: false,
    error:
      suggestions.length > 0
        ? `${kind} "${requestedName}" not found. Closest matches: ${formatCandidateList(suggestions)}`
        : `${kind} "${requestedName}" not found`,
  };
};

export const replaceSubrobotInUrdf = (
  hostUrdfContent: string,
  options: ReplaceSubrobotOptions
): ReplaceSubrobotResult => {
  if (!hostUrdfContent.trim()) {
    return fail(hostUrdfContent, "No URDF content available");
  }

  const hostParsed = parseURDF(hostUrdfContent);
  if (!hostParsed.isValid) {
    return fail(hostUrdfContent, hostParsed.error || "Failed to parse host URDF");
  }

  const replacementParsed = parseURDF(options.replacementUrdfContent);
  if (!replacementParsed.isValid) {
    return fail(
      hostUrdfContent,
      replacementParsed.error || "Failed to parse replacement URDF"
    );
  }

  const hostRobot = getRobotElement(hostParsed.document);
  const replacementRobot = getRobotElement(replacementParsed.document);
  if (!hostRobot || !replacementRobot) {
    return fail(hostUrdfContent, "Missing <robot> element");
  }

  const hostLinks = getDirectChildrenByTag(hostRobot, "link");
  const hostJoints = getDirectChildrenByTag(hostRobot, "joint");
  const availableHostLinkNames = hostLinks
    .map((link) => link.getAttribute("name") || "")
    .filter(Boolean);
  const resolvedTargetRoot = resolveRequestedName(
    options.targetRootLink,
    availableHostLinkNames,
    "Target root link"
  );
  if (resolvedTargetRoot.ok === false) {
    return fail(hostUrdfContent, resolvedTargetRoot.error);
  }
  const targetRootName = resolvedTargetRoot.value;
  const targetRoot = hostLinks.find((link) => link.getAttribute("name") === targetRootName);
  if (!targetRoot) {
    return fail(hostUrdfContent, `Target root link "${targetRootName}" not found`);
  }

  const inboundJoints = hostJoints.filter(
    (joint) => joint.querySelector("child")?.getAttribute("link") === targetRootName
  );
  if (inboundJoints.length === 0) {
    return fail(
      hostUrdfContent,
      `No inbound joint found for target root "${targetRootName}"`
    );
  }

  let resolvedMountJointName = options.mountJointName;
  if (options.mountJointName) {
    const inboundJointNames = inboundJoints
      .map((joint) => joint.getAttribute("name") || "")
      .filter(Boolean);
    const resolved = resolveRequestedName(options.mountJointName, inboundJointNames, "Mount joint");
    if (resolved.ok === false) {
      return fail(hostUrdfContent, resolved.error);
    }
    resolvedMountJointName = resolved.value;
  }

  let resolvedMountParentLink = options.mountParentLink;
  if (options.mountParentLink) {
    const inboundParentNames = inboundJoints
      .map((joint) => joint.querySelector("parent")?.getAttribute("link") || "")
      .filter(Boolean);
    const resolved = resolveRequestedName(options.mountParentLink, inboundParentNames, "Mount parent link");
    if (resolved.ok === false) {
      return fail(hostUrdfContent, resolved.error);
    }
    resolvedMountParentLink = resolved.value;
  }

  const selectedInboundJoint =
    inboundJoints.find((joint) => {
      const parentLink = joint.querySelector("parent")?.getAttribute("link");
      if (resolvedMountJointName && joint.getAttribute("name") !== resolvedMountJointName) {
        return false;
      }
      if (resolvedMountParentLink && parentLink !== resolvedMountParentLink) {
        return false;
      }
      return true;
    }) || null;

  if (!selectedInboundJoint) {
    return fail(
      hostUrdfContent,
      `Could not resolve mount joint for target root "${targetRootName}"`
    );
  }

  const preservedMountParent =
    selectedInboundJoint.querySelector("parent")?.getAttribute("link") || undefined;
  if (!preservedMountParent) {
    return fail(hostUrdfContent, `Mount parent link for "${targetRootName}" is missing`);
  }

  const removedLinkSet = collectDescendantLinks(targetRootName, hostJoints);
  const removedLinks = Array.from(removedLinkSet);
  const removedJointElements = hostJoints.filter((joint) => {
    const parentLink = joint.querySelector("parent")?.getAttribute("link");
    const childLink = joint.querySelector("child")?.getAttribute("link");
    return (
      childLink === targetRootName ||
      (parentLink ? removedLinkSet.has(parentLink) : false) ||
      (childLink ? removedLinkSet.has(childLink) : false)
    );
  });
  const removedJoints = removedJointElements
    .map((joint) => joint.getAttribute("name") || "")
    .filter(Boolean);

  const replacementLinks = getDirectChildrenByTag(replacementRobot, "link");
  const replacementJoints = getDirectChildrenByTag(replacementRobot, "joint");
  const replacementMaterials = getDirectChildrenByTag(replacementRobot, "material");
  const replacementLinkNames = replacementLinks
    .map((link) => link.getAttribute("name") || "")
    .filter(Boolean);
  const resolvedReplacementRoot = resolveRequestedName(
    options.replacementRootLink,
    replacementLinkNames,
    "Replacement root link"
  );
  if (resolvedReplacementRoot.ok === false) {
    return fail(hostUrdfContent, resolvedReplacementRoot.error);
  }
  const replacementRootName = resolvedReplacementRoot.value;
  const replacementRoot = replacementLinks.find(
    (link) => link.getAttribute("name") === replacementRootName
  );
  if (!replacementRoot) {
    return fail(
      hostUrdfContent,
      `Replacement root link "${replacementRootName}" not found`
    );
  }

  const replacementLinkSet = collectDescendantLinks(replacementRootName, replacementJoints);
  const importLinks = replacementLinks.filter((link) =>
    replacementLinkSet.has(link.getAttribute("name") || "")
  );
  const importJoints = replacementJoints.filter((joint) => {
    const parentLink = joint.querySelector("parent")?.getAttribute("link");
    const childLink = joint.querySelector("child")?.getAttribute("link");
    return Boolean(
      parentLink &&
        childLink &&
        replacementLinkSet.has(parentLink) &&
        replacementLinkSet.has(childLink)
    );
  });

  const prefix = sanitizePrefix(options.prefix || "");
  const hostLinkNames = buildCollisionSet(
    hostLinks.filter((link) => !removedLinkSet.has(link.getAttribute("name") || ""))
  );
  const hostJointNames = buildCollisionSet(
    hostJoints.filter((joint) => !removedJoints.includes(joint.getAttribute("name") || ""))
  );
  const hostMaterialNames = buildCollisionSet(getDirectChildrenByTag(hostRobot, "material"));

  const linkMap = new Map<string, string>();
  for (const link of importLinks) {
    const sourceName = link.getAttribute("name");
    if (!sourceName) {
      continue;
    }
    const mappedName = resolveName(sourceName, prefix);
    if (hostLinkNames.has(mappedName)) {
      return fail(
        hostUrdfContent,
        `Imported link "${mappedName}" would collide with an existing host link. Use --prefix.`
      );
    }
    linkMap.set(sourceName, mappedName);
  }

  const jointMap = new Map<string, string>();
  for (const joint of importJoints) {
    const sourceName = joint.getAttribute("name");
    if (!sourceName) {
      continue;
    }
    const mappedName = resolveName(sourceName, prefix);
    if (hostJointNames.has(mappedName)) {
      return fail(
        hostUrdfContent,
        `Imported joint "${mappedName}" would collide with an existing host joint. Use --prefix.`
      );
    }
    jointMap.set(sourceName, mappedName);
  }

  const materialMap = new Map<string, string>();
  for (const material of replacementMaterials) {
    const sourceName = material.getAttribute("name");
    if (!sourceName) {
      continue;
    }
    const mappedName = resolveName(sourceName, prefix);
    if (hostMaterialNames.has(mappedName)) {
      return fail(
        hostUrdfContent,
        `Imported material "${mappedName}" would collide with an existing host material. Use --prefix.`
      );
    }
    materialMap.set(sourceName, mappedName);
  }

  removedJointElements.forEach((joint) => joint.remove());
  hostLinks
    .filter((link) => removedLinkSet.has(link.getAttribute("name") || ""))
    .forEach((link) => link.remove());

  replacementMaterials.forEach((material) => {
    const cloned = material.cloneNode(true) as Element;
    const sourceName = material.getAttribute("name");
    const mappedName = sourceName ? materialMap.get(sourceName) : null;
    if (mappedName) {
      cloned.setAttribute("name", mappedName);
    }
    hostRobot.appendChild(cloned);
  });

  importLinks.forEach((link) => {
    const cloned = link.cloneNode(true) as Element;
    const sourceName = link.getAttribute("name");
    const mappedName = sourceName ? linkMap.get(sourceName) : null;
    if (mappedName) {
      cloned.setAttribute("name", mappedName);
    }
    renameMaterialReferences(cloned, materialMap);
    hostRobot.appendChild(cloned);
  });

  importJoints.forEach((joint) => {
    const cloned = joint.cloneNode(true) as Element;
    const sourceJointName = joint.getAttribute("name");
    const mappedJointName = sourceJointName ? jointMap.get(sourceJointName) : null;
    if (mappedJointName) {
      cloned.setAttribute("name", mappedJointName);
    }

    const parent = cloned.querySelector("parent");
    const child = cloned.querySelector("child");
    const mappedParent = parent?.getAttribute("link")
      ? linkMap.get(parent.getAttribute("link") || "")
      : null;
    const mappedChild = child?.getAttribute("link")
      ? linkMap.get(child.getAttribute("link") || "")
      : null;
    if (parent && mappedParent) {
      parent.setAttribute("link", mappedParent);
    }
    if (child && mappedChild) {
      child.setAttribute("link", mappedChild);
    }

    const mimic = cloned.querySelector("mimic");
    const mappedMimic = mimic?.getAttribute("joint")
      ? jointMap.get(mimic.getAttribute("joint") || "")
      : null;
    if (mimic && mappedMimic) {
      mimic.setAttribute("joint", mappedMimic);
    }

    hostRobot.appendChild(cloned);
  });

  const mountJoint = hostParsed.document.createElement("joint");
  const mountJointName =
    resolvedMountJointName ||
    selectedInboundJoint.getAttribute("name") ||
    `${linkMap.get(replacementRootName) || replacementRootName}_mount`;
  mountJoint.setAttribute("name", mountJointName);
  mountJoint.setAttribute("type", selectedInboundJoint.getAttribute("type") || "fixed");

  const origin = hostParsed.document.createElement("origin");
  const preservedOrigin = getOriginAttributes(selectedInboundJoint);
  const mountXyz = options.mount?.xyz || preservedOrigin.xyz;
  const mountRpy = options.mount?.rpy || preservedOrigin.rpy;
  origin.setAttribute("xyz", mountXyz.join(" "));
  origin.setAttribute("rpy", mountRpy.join(" "));
  mountJoint.appendChild(origin);

  const parent = hostParsed.document.createElement("parent");
  parent.setAttribute("link", preservedMountParent);
  mountJoint.appendChild(parent);

  const child = hostParsed.document.createElement("child");
  child.setAttribute(
    "link",
    linkMap.get(replacementRootName) || replacementRootName
  );
  mountJoint.appendChild(child);

  hostRobot.appendChild(mountJoint);

  return {
    success: true,
    content: serializeURDF(hostParsed.document),
    removedLinks,
    removedJoints,
    importedLinks: importLinks
      .map((link) => link.getAttribute("name") || "")
      .filter(Boolean)
      .map((name) => linkMap.get(name) || name),
    importedJoints: importJoints
      .map((joint) => joint.getAttribute("name") || "")
      .filter(Boolean)
      .map((name) => jointMap.get(name) || name),
    mountParentLink: preservedMountParent,
    mountedRootLink: linkMap.get(replacementRootName) || replacementRootName,
    mountJointName,
  };
};
