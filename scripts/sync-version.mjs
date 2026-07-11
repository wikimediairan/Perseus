import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const packageJsonPath = path.join(root, "package.json");
const cargoTomlPath = path.join(root, "src-tauri", "Cargo.toml");
const tauriConfPath = path.join(root, "src-tauri", "tauri.conf.json");

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const version = packageJson.version;

if (!version) {
  console.error("No version found in package.json");
  process.exit(1);
}

let cargoToml = fs.readFileSync(cargoTomlPath, "utf8");

cargoToml = cargoToml.replace(/^version\s*=\s*".*"$/m, `version = "${version}"`);

fs.writeFileSync(cargoTomlPath, cargoToml);

const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, "utf8"));
tauriConf.version = version;

fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + "\n");

console.log(`Synced version ${version}`);
