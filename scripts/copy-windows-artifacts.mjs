import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const packageJsonPath = path.join(repoRoot, "package.json");
const packageJson = await fs.readJson(packageJsonPath);
const semverVersion = String(packageJson?.version || "1.0.0");
const displayVersion = String(packageJson?.build?.buildVersion || semverVersion);

if (displayVersion === semverVersion) {
  console.log("Windows 构建产物版本名无需额外复制。");
  process.exit(0);
}

const distDir = path.join(repoRoot, "dist");
const expectedPrefix = `Order-${semverVersion}-win-`;

if (!(await fs.pathExists(distDir))) {
  throw new Error(`未找到 dist 目录: ${distDir}`);
}

const entries = await fs.readdir(distDir);
const windowsArtifacts = entries.filter(
  (entry) =>
    entry.startsWith(expectedPrefix) &&
    (entry.endsWith(".exe") || entry.endsWith(".exe.blockmap")),
);

if (windowsArtifacts.length === 0) {
  throw new Error(`未找到 Windows 构建产物，匹配前缀: ${expectedPrefix}`);
}

for (const entry of windowsArtifacts) {
  const sourcePath = path.join(distDir, entry);
  const targetPath = path.join(
    distDir,
    entry.replace(`Order-${semverVersion}-`, `Order-${displayVersion}-`),
  );
  await fs.move(sourcePath, targetPath, { overwrite: true });
  console.log(`已整理 Windows 产物到 ${targetPath}`);
}
