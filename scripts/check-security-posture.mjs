#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootPackageJsonPath = path.join(root, "package.json");
const rootPackage = JSON.parse(fs.readFileSync(rootPackageJsonPath, "utf8"));
const rootRequire = createRequire(rootPackageJsonPath);
const disallowedRootLifecycleScripts = ["preinstall", "install", "postinstall", "prepare"];
const disallowedDependencyLifecycleScripts = ["preinstall", "install", "postinstall"];

const findings = [];
const visited = new Set();
const expectedManagedXacroRuntimePackages = ["xacro==2.1.1", "PyYAML==6.0.3"];

const getLifecycleScriptNames = (packageJson, blockedNames) =>
  blockedNames.filter(
    (name) => typeof packageJson.scripts?.[name] === "string" && packageJson.scripts[name].trim().length > 0
  );

const resolveInstalledPackageJsonPath = (dependencyName, resolver) => {
  try {
    return resolver.resolve(`${dependencyName}/package.json`);
  } catch (error) {
    if (!error || typeof error !== "object" || error.code !== "ERR_PACKAGE_PATH_NOT_EXPORTED") {
      throw error;
    }
  }

  const resolvedEntryPath = resolver.resolve(dependencyName);
  let currentDir = path.dirname(resolvedEntryPath);

  while (true) {
    const candidate = path.join(currentDir, "package.json");
    if (fs.existsSync(candidate)) {
      const parsed = JSON.parse(fs.readFileSync(candidate, "utf8"));
      if (parsed.name === dependencyName) {
        return candidate;
      }
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      throw new Error(`Could not resolve package root for ${dependencyName}`);
    }
    currentDir = parentDir;
  }
};

const inspectDependency = (dependencyName, resolver, ancestry = []) => {
  const packageJsonPath = resolveInstalledPackageJsonPath(dependencyName, resolver);
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const packageId = `${packageJson.name}@${packageJson.version}`;
  if (visited.has(packageId)) {
    return;
  }
  visited.add(packageId);

  const lifecycleScripts = getLifecycleScriptNames(packageJson, disallowedDependencyLifecycleScripts);
  if (lifecycleScripts.length > 0) {
    findings.push({
      packageId,
      lifecycleScripts,
      path: [...ancestry, packageId].join(" -> "),
    });
  }

  const nextResolver = createRequire(packageJsonPath);
  const childDependencies = {
    ...(packageJson.dependencies ?? {}),
    ...(packageJson.optionalDependencies ?? {}),
  };

  for (const childDependency of Object.keys(childDependencies)) {
    try {
      inspectDependency(childDependency, nextResolver, [...ancestry, packageId]);
    } catch (error) {
      if (Object.prototype.hasOwnProperty.call(packageJson.optionalDependencies ?? {}, childDependency)) {
        continue;
      }
      throw error;
    }
  }
};

const rootLifecycleScripts = getLifecycleScriptNames(rootPackage, disallowedRootLifecycleScripts);
if (rootLifecycleScripts.length > 0) {
  findings.push({
    packageId: `${rootPackage.name}@${rootPackage.version}`,
    lifecycleScripts: rootLifecycleScripts,
    path: `${rootPackage.name}@${rootPackage.version}`,
  });
}

for (const dependencyName of Object.keys({
  ...(rootPackage.dependencies ?? {}),
  ...(rootPackage.optionalDependencies ?? {}),
})) {
  inspectDependency(dependencyName, rootRequire);
}

const distXacroNodePath = path.join(root, "dist", "xacro", "xacroNode.js");
if (!fs.existsSync(distXacroNodePath)) {
  findings.push({
    packageId: `${rootPackage.name}@${rootPackage.version}`,
    lifecycleScripts: ["missing dist/xacro/xacroNode.js build artifact"],
    path: `${rootPackage.name}@${rootPackage.version}`,
  });
} else {
  const xacroNodeModule = await import(pathToFileURL(distXacroNodePath).href);
  const managedPackages = xacroNodeModule.MANAGED_XACRO_RUNTIME_PACKAGES;
  if (
    !Array.isArray(managedPackages) ||
    managedPackages.length !== expectedManagedXacroRuntimePackages.length ||
    managedPackages.some((value, index) => value !== expectedManagedXacroRuntimePackages[index])
  ) {
    findings.push({
      packageId: `${rootPackage.name}@${rootPackage.version}`,
      lifecycleScripts: [`unexpected managed XACRO runtime pins (${JSON.stringify(managedPackages)})`],
      path: `${rootPackage.name}@${rootPackage.version}`,
    });
  }
}

if (findings.length > 0) {
  console.error("[security] Install lifecycle hooks are not allowed in the production install path.");
  for (const finding of findings) {
    console.error(
      `[security] ${finding.packageId} declares ${finding.lifecycleScripts.join(", ")} via ${finding.path}`
    );
  }
  process.exit(1);
}

console.log("[security] No install lifecycle hooks found in the production dependency graph.");
console.log(
  `[security] Managed XACRO runtime is pinned to ${expectedManagedXacroRuntimePackages.join(", ")}.`
);
