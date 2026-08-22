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
const DESKTOP_TAURI_CONFIG_FILE = path.join(
  rootDir,
  "apps",
  "desktop",
  "src-tauri",
  "tauri.conf.json",
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

function createJsonVersionTarget(label, filePath) {
  return {
    label,
    read() {
      if (!fs.existsSync(filePath)) {
        throw new Error(
          `${label} not found: ${path.relative(rootDir, filePath)}`,
        );
      }

      const config = readJson(filePath);

      if (!config.version) {
        throw new Error(
          `${label} does not contain a version: ${path.relative(rootDir, filePath)}`,
        );
      }

      return config.version;
    },
    write(version) {
      const config = readJson(filePath);
      config.version = version;
      writeJson(filePath, config);
    },
  };
}

function createCargoVersionTarget(label, filePath) {
  function getPackageSection(content) {
    const start = content.search(/^\[package\]\s*$/m);

    if (start === -1) {
      throw new Error(
        `${label} does not contain a [package] section: ${path.relative(rootDir, filePath)}`,
      );
    }

    const nextSectionOffset = content
      .slice(start + 1)
      .search(/^\[[^\]]+\]\s*$/m);
    const end =
      nextSectionOffset !== -1 ? start + 1 + nextSectionOffset : content.length;

    return { start, end, section: content.slice(start, end) };
  }

  return {
    label,
    read() {
      if (!fs.existsSync(filePath)) {
        throw new Error(
          `${label} not found: ${path.relative(rootDir, filePath)}`,
        );
      }

      const content = fs.readFileSync(filePath, "utf8");
      const { section } = getPackageSection(content);
      const match = section.match(/^\s*version\s*=\s*"([^"]+)"\s*$/m);

      if (!match) {
        throw new Error(
          `${label} [package] section does not contain a version: ${path.relative(rootDir, filePath)}`,
        );
      }

      return match[1];
    },
    write(version) {
      const content = fs.readFileSync(filePath, "utf8");
      const { start, end, section } = getPackageSection(content);
      const versionRegex = /^(\s*version\s*=\s*")[^"]+("\s*)$/m;

      if (!versionRegex.test(section)) {
        throw new Error(
          `${label} [package] section does not contain a version: ${path.relative(rootDir, filePath)}`,
        );
      }

      const updatedSection = section.replace(versionRegex, `$1${version}$2`);
      fs.writeFileSync(
        filePath,
        content.slice(0, start) + updatedSection + content.slice(end),
        "utf8",
      );
    },
  };
}

const EXTRA_APP_TARGETS = [
  {
    appName: DESKTOP_APP_NAME,
    target: createCargoVersionTarget(
      `${DESKTOP_APP_NAME} Cargo.toml`,
      DESKTOP_CARGO_FILE,
    ),
  },
  {
    appName: DESKTOP_APP_NAME,
    target: createJsonVersionTarget(
      `${DESKTOP_APP_NAME} tauri.conf.json`,
      DESKTOP_TAURI_CONFIG_FILE,
    ),
  },
];

function checkTarget(target, expectedVersion) {
  const actual = target.read();

  if (actual === expectedVersion) {
    console.log(`✓ ${target.label} ${actual}`);
    return true;
  }

  console.error(`✗ ${target.label}`);
  console.error(`  expected: ${expectedVersion}`);
  console.error(`  actual:   ${actual}`);
  console.error();

  return false;
}

function syncTarget(target, expectedVersion) {
  const current = target.read();

  if (current === expectedVersion) {
    console.log(`✓ ${target.label} ${expectedVersion}`);
    return;
  }

  target.write(expectedVersion);
  console.log(`→ ${target.label}: ${current} → ${expectedVersion}`);
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

  for (const group of ["packages", "apps"]) {
    for (const [name, version] of Object.entries(config[group])) {
      if (expected.has(name)) {
        throw new Error(`Duplicate package name in version.json: ${name}`);
      }

      expected.set(name, { version, group });
    }
  }

  return expected;
}

function parseWorkspacePatterns() {
  if (!fs.existsSync(WORKSPACE_FILE)) {
    throw new Error(
      `pnpm-workspace.yaml not found: ${path.relative(rootDir, WORKSPACE_FILE)}`,
    );
  }

  const lines = fs.readFileSync(WORKSPACE_FILE, "utf8").split(/\r?\n/);
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

    regex += "\\^$+?.()|{}[]".includes(char) ? `\\${char}` : char;
  }

  return new RegExp(`${regex}$`);
}

function resolvePatternPackageFiles(pattern) {
  const normalizedPattern = pattern.replace(/\\/g, "/");
  const regex = globToRegex(normalizedPattern);
  const firstSegment = normalizedPattern.split("/")[0];
  const searchDirs = [
    { dir: rootDir, prefix: "" },
    { dir: path.join(rootDir, firstSegment), prefix: `${firstSegment}/` },
  ];

  const files = [];

  for (const { dir, prefix } of searchDirs) {
    if (!fs.existsSync(dir)) {
      continue;
    }

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }

      const relativePath = `${prefix}${entry.name}`;

      if (!regex.test(relativePath)) {
        continue;
      }

      const packageFile = path.join(dir, entry.name, "package.json");

      if (fs.existsSync(packageFile)) {
        files.push(packageFile);
      }
    }
  }

  return files;
}

function getWorkspacePackageFiles() {
  const files = new Set();

  for (const pattern of parseWorkspacePatterns()) {
    for (const file of resolvePatternPackageFiles(pattern)) {
      files.add(file);
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

    packages.set(packageJson.name, { filePath, packageJson });
  }

  return packages;
}

function reportOrphanWorkspacePackages(expected, workspace) {
  let hasErrors = false;

  for (const [name, pkg] of workspace) {
    if (!expected.has(name)) {
      console.error(`✗ ${name}`);
      console.error(
        `  ${path.relative(rootDir, pkg.filePath)} exists in the workspace but is missing from version.json.`,
      );
      console.error();
      hasErrors = true;
    }
  }

  return hasErrors;
}

function runExtraTargets(config, run) {
  let hasErrors = false;

  for (const { appName, target } of EXTRA_APP_TARGETS) {
    const expectedVersion = config.apps[appName];

    if (!expectedVersion) {
      console.error(`✗ ${appName} is missing from version.json apps.`);
      console.error();
      hasErrors = true;
      continue;
    }

    if (run(target, expectedVersion) === false) {
      hasErrors = true;
    }
  }

  return hasErrors;
}

function check() {
  const config = loadVersionConfig();
  const expected = collectExpectedVersions(config);
  const workspace = loadWorkspacePackages();

  let hasErrors = false;

  console.log("Checking workspace versions...\n");

  for (const [name, { version }] of expected) {
    const pkg = workspace.get(name);

    if (!pkg) {
      console.error(`✗ ${name}`);
      console.error(
        "  entry exists in version.json, but no matching workspace package was found.",
      );
      console.error();
      hasErrors = true;
      continue;
    }

    if (
      !checkTarget(
        { label: name, read: () => pkg.packageJson.version },
        version,
      )
    ) {
      hasErrors = true;
    }
  }

  hasErrors = reportOrphanWorkspacePackages(expected, workspace) || hasErrors;

  console.log("\nChecking additional app targets...\n");
  hasErrors =
    runExtraTargets(config, (target, expectedVersion) =>
      checkTarget(target, expectedVersion),
    ) || hasErrors;

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

    syncTarget(
      {
        label: name,
        read: () => pkg.packageJson.version,
        write: (v) => {
          pkg.packageJson.version = v;
          writeJson(pkg.filePath, pkg.packageJson);
        },
      },
      version,
    );
  }

  hasErrors = reportOrphanWorkspacePackages(expected, workspace) || hasErrors;

  if (hasErrors) {
    console.error("\nVersion synchronization failed.");
    process.exit(1);
  }

  console.log("\nSynchronizing additional app targets...\n");
  runExtraTargets(config, (target, expectedVersion) => {
    syncTarget(target, expectedVersion);
  });

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
