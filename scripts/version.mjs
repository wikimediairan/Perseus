#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const VERSION_FILE = path.join(rootDir, "version.json");
const WORKSPACE_FILE = path.join(rootDir, "pnpm-workspace.yaml");

const DESKTOP_APP_NAME = "perseus-desktop";
const DESKTOP_CARGO_FILE = path.join(
  rootDir,
  "apps",
  "desktop",
  "src-tauri",
  "Cargo.toml",
);

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(
      `Failed to read JSON file: ${path.relative(rootDir, filePath)}\n${error.message}`,
    );
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function isValidSemver(version) {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(
    version,
  );
}

function loadVersionConfig() {
  if (!fs.existsSync(VERSION_FILE)) {
    throw new Error(
      `version.json not found: ${path.relative(rootDir, VERSION_FILE)}`,
    );
  }

  const config = readJson(VERSION_FILE);

  if (!config || typeof config !== "object") {
    throw new Error("version.json must contain an object.");
  }

  for (const group of ["packages", "apps"]) {
    if (config[group] === undefined) {
      config[group] = {};
    }

    if (typeof config[group] !== "object" || Array.isArray(config[group])) {
      throw new Error(`version.json "${group}" must be an object.`);
    }

    for (const [name, version] of Object.entries(config[group])) {
      if (!isValidSemver(version)) {
        throw new Error(`Invalid version for ${name}: "${version}"`);
      }
    }
  }

  return config;
}

function collectExpectedVersions(config) {
  const expected = new Map();

  for (const [name, version] of Object.entries(config.packages)) {
    if (expected.has(name)) {
      throw new Error(`Duplicate package name in version.json: ${name}`);
    }

    expected.set(name, {
      version,
      group: "packages",
    });
  }

  for (const [name, version] of Object.entries(config.apps)) {
    if (expected.has(name)) {
      throw new Error(`Duplicate package name in version.json: ${name}`);
    }

    expected.set(name, {
      version,
      group: "apps",
    });
  }

  return expected;
}

function parseWorkspacePatterns() {
  if (!fs.existsSync(WORKSPACE_FILE)) {
    throw new Error(
      `pnpm-workspace.yaml not found: ${path.relative(
        rootDir,
        WORKSPACE_FILE,
      )}`,
    );
  }

  const content = fs.readFileSync(WORKSPACE_FILE, "utf8");

  const lines = content.split(/\r?\n/);

  const patterns = [];
  let insidePackages = false;

  for (const line of lines) {
    if (/^packages:\s*$/.test(line.trim())) {
      insidePackages = true;
      continue;
    }

    if (!insidePackages) {
      continue;
    }

    const match = line.match(/^\s*-\s+(.+?)\s*$/);

    if (match) {
      patterns.push(match[1].replace(/^["']|["']$/g, ""));
      continue;
    }

    if (line.trim() && !line.match(/^\s*#/)) {
      insidePackages = false;
    }
  }

  if (patterns.length === 0) {
    throw new Error(
      "No workspace package patterns found in pnpm-workspace.yaml.",
    );
  }

  return patterns;
}

function globToRegex(pattern) {
  const normalized = pattern.replace(/\\/g, "/");

  let regex = "^";

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];

    if (char === "*") {
      if (normalized[i + 1] === "*") {
        regex += ".*";
        i++;
      } else {
        regex += "[^/]*";
      }

      continue;
    }

    if ("\\^$+?.()|{}[]".includes(char)) {
      regex += `\\${char}`;
    } else {
      regex += char;
    }
  }

  regex += "$";

  return new RegExp(regex);
}

function getWorkspacePackageFiles() {
  const patterns = parseWorkspacePatterns();
  const files = new Set();

  for (const pattern of patterns) {
    const normalizedPattern = pattern.replace(/\\/g, "/");
    const regex = globToRegex(normalizedPattern);

    const rootEntries = fs.readdirSync(rootDir, {
      withFileTypes: true,
    });

    for (const entry of rootEntries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const relativePath = entry.name;

      if (!regex.test(relativePath)) {
        continue;
      }

      const packageFile = path.join(rootDir, relativePath, "package.json");

      if (fs.existsSync(packageFile)) {
        files.add(packageFile);
      }
    }

    const firstSegment = normalizedPattern.split("/")[0];
    const baseDir = path.join(rootDir, firstSegment);

    if (fs.existsSync(baseDir)) {
      for (const entry of fs.readdirSync(baseDir, {
        withFileTypes: true,
      })) {
        if (!entry.isDirectory()) {
          continue;
        }

        const relativePath = `${firstSegment}/${entry.name}`;

        if (!regex.test(relativePath)) {
          continue;
        }

        const packageFile = path.join(rootDir, relativePath, "package.json");

        if (fs.existsSync(packageFile)) {
          files.add(packageFile);
        }
      }
    }
  }

  return [...files];
}

function loadWorkspacePackages() {
  const packages = new Map();

  for (const filePath of getWorkspacePackageFiles()) {
    const packageJson = readJson(filePath);

    if (!packageJson.name) {
      throw new Error(
        `Workspace package has no "name": ${path.relative(rootDir, filePath)}`,
      );
    }

    if (!packageJson.version) {
      throw new Error(
        `Workspace package has no "version": ${packageJson.name}`,
      );
    }

    if (packages.has(packageJson.name)) {
      throw new Error(`Duplicate workspace package name: ${packageJson.name}`);
    }

    packages.set(packageJson.name, {
      filePath,
      packageJson,
    });
  }

  return packages;
}

function getCargoPackageSection(content) {
  const match = content.match(/^\[package\]\s*([\s\S]*?)(?=^\[[^\]]+\]|\s*$)/m);

  if (!match) {
    throw new Error(
      `Cargo.toml does not contain a [package] section: ${path.relative(
        rootDir,
        DESKTOP_CARGO_FILE,
      )}`,
    );
  }

  return match;
}

function readCargoPackageVersion() {
  if (!fs.existsSync(DESKTOP_CARGO_FILE)) {
    throw new Error(
      `Cargo.toml not found: ${path.relative(rootDir, DESKTOP_CARGO_FILE)}`,
    );
  }

  const content = fs.readFileSync(DESKTOP_CARGO_FILE, "utf8");

  const packageStart = content.search(/^\[package\]\s*$/m);

  if (packageStart === -1) {
    throw new Error(
      `Cargo.toml does not contain a [package] section: ${path.relative(
        rootDir,
        DESKTOP_CARGO_FILE,
      )}`,
    );
  }

  const nextSection = content.search(/^\[[^\]]+\]\s*$/m);

  const packageSectionEnd =
    nextSection !== -1 && nextSection > packageStart
      ? nextSection
      : content.length;

  const packageSection = content.slice(packageStart, packageSectionEnd);

  const versionMatch = packageSection.match(/^\s*version\s*=\s*"([^"]+)"\s*$/m);

  if (!versionMatch) {
    throw new Error(
      `Cargo.toml [package] section does not contain a version: ${path.relative(
        rootDir,
        DESKTOP_CARGO_FILE,
      )}`,
    );
  }

  return versionMatch[1];
}

function writeCargoPackageVersion(version) {
  if (!fs.existsSync(DESKTOP_CARGO_FILE)) {
    throw new Error(
      `Cargo.toml not found: ${path.relative(rootDir, DESKTOP_CARGO_FILE)}`,
    );
  }

  const content = fs.readFileSync(DESKTOP_CARGO_FILE, "utf8");

  const packageStart = content.search(/^\[package\]\s*$/m);

  if (packageStart === -1) {
    throw new Error(
      `Cargo.toml does not contain a [package] section: ${path.relative(
        rootDir,
        DESKTOP_CARGO_FILE,
      )}`,
    );
  }

  const nextSectionRelative = content
    .slice(packageStart + 1)
    .search(/^\[[^\]]+\]\s*$/m);

  const packageSectionEnd =
    nextSectionRelative !== -1
      ? packageStart + 1 + nextSectionRelative
      : content.length;

  const packageSection = content.slice(packageStart, packageSectionEnd);

  const versionRegex = /^(\s*version\s*=\s*")[^"]+("\s*)$/m;

  if (!versionRegex.test(packageSection)) {
    throw new Error(
      `Cargo.toml [package] section does not contain a version: ${path.relative(
        rootDir,
        DESKTOP_CARGO_FILE,
      )}`,
    );
  }

  const updatedPackageSection = packageSection.replace(
    versionRegex,
    `$1${version}$2`,
  );

  const updatedContent =
    content.slice(0, packageStart) +
    updatedPackageSection +
    content.slice(packageSectionEnd);

  fs.writeFileSync(DESKTOP_CARGO_FILE, updatedContent, "utf8");
}

function checkCargoVersion(expectedVersion) {
  const actualVersion = readCargoPackageVersion();

  if (actualVersion === expectedVersion) {
    console.log(`✓ ${DESKTOP_APP_NAME} Cargo.toml ${actualVersion}`);

    return false;
  }

  console.error(`✗ ${DESKTOP_APP_NAME} Cargo.toml`);
  console.error(`  expected: ${expectedVersion}`);
  console.error(`  actual:   ${actualVersion}`);
  console.error();

  return true;
}

function setCargoVersion(expectedVersion) {
  const currentVersion = readCargoPackageVersion();

  if (currentVersion === expectedVersion) {
    console.log(`✓ ${DESKTOP_APP_NAME} Cargo.toml ${expectedVersion}`);

    return;
  }

  writeCargoPackageVersion(expectedVersion);

  console.log(
    `→ ${DESKTOP_APP_NAME} Cargo.toml: ${currentVersion} → ${expectedVersion}`,
  );
}

function check() {
  const config = loadVersionConfig();
  const expected = collectExpectedVersions(config);
  const workspace = loadWorkspacePackages();

  let hasErrors = false;

  console.log("Checking workspace versions...\n");

  for (const [name, { version, group }] of expected) {
    const pkg = workspace.get(name);

    if (!pkg) {
      console.error(`✗ ${name}`);
      console.error(
        `  ${group} entry exists in version.json, but no matching workspace package was found.`,
      );
      console.error();

      hasErrors = true;
      continue;
    }

    const actual = pkg.packageJson.version;

    if (actual === version) {
      console.log(`✓ ${name} ${actual}`);
    } else {
      console.error(`✗ ${name}`);
      console.error(`  expected: ${version}`);
      console.error(`  actual:   ${actual}`);
      console.error();

      hasErrors = true;
    }
  }

  for (const [name, pkg] of workspace) {
    if (!expected.has(name)) {
      console.error(`✗ ${name}`);
      console.error(
        `  ${path.relative(
          rootDir,
          pkg.filePath,
        )} exists in the workspace but is missing from version.json.`,
      );
      console.error();

      hasErrors = true;
    }
  }

  console.log("Checking desktop Cargo.toml version...\n");

  const desktopVersion = config.apps[DESKTOP_APP_NAME];

  if (!desktopVersion) {
    console.error(`✗ ${DESKTOP_APP_NAME} is missing from version.json apps.`);
    console.error();

    hasErrors = true;
  } else if (checkCargoVersion(desktopVersion)) {
    hasErrors = true;
  }

  if (hasErrors) {
    console.error("Version consistency check failed.");
    process.exit(1);
  }

  console.log("Version consistency check passed.");
}

function set() {
  const config = loadVersionConfig();
  const expected = collectExpectedVersions(config);
  const workspace = loadWorkspacePackages();

  let hasErrors = false;

  console.log("Synchronizing package versions...\n");

  for (const [name, { version }] of expected) {
    const pkg = workspace.get(name);

    if (!pkg) {
      console.error(`✗ ${name}`);
      console.error("  No matching workspace package was found.");
      console.error();

      hasErrors = true;
      continue;
    }

    const currentVersion = pkg.packageJson.version;

    if (currentVersion === version) {
      console.log(`✓ ${name} ${version}`);
      continue;
    }

    pkg.packageJson.version = version;

    writeJson(pkg.filePath, pkg.packageJson);

    console.log(`→ ${name}: ${currentVersion} → ${version}`);
  }

  for (const [name, pkg] of workspace) {
    if (!expected.has(name)) {
      console.error(`✗ ${name}`);
      console.error(
        `  ${path.relative(
          rootDir,
          pkg.filePath,
        )} exists in the workspace but is missing from version.json.`,
      );
      console.error();

      hasErrors = true;
    }
  }

  if (hasErrors) {
    console.error("\nVersion synchronization failed.");
    process.exit(1);
  }

  console.log("\nSynchronizing desktop Cargo.toml version...\n");

  const desktopVersion = config.apps[DESKTOP_APP_NAME];

  if (!desktopVersion) {
    console.error(`✗ ${DESKTOP_APP_NAME} is missing from version.json apps.`);
    process.exit(1);
  }

  setCargoVersion(desktopVersion);

  console.log("\nVersion synchronization completed.");
}

const command = process.argv[2];

switch (command) {
  case "check":
    check();
    break;

  case "set":
    set();
    break;

  default:
    console.error("Usage: pnpm version:<check|set>");
    process.exit(1);
}
