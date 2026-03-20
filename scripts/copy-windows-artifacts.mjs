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

const distDir = path.join(repoRoot, "dist");
const expectedPrefix = `Order-${semverVersion}-win-`;
const displayPrefix = `Order-${displayVersion}-win-`;
const latestYmlPath = path.join(distDir, "latest.yml");

if (!(await fs.pathExists(distDir))) {
  throw new Error(`未找到 dist 目录: ${distDir}`);
}

const entries = await fs.readdir(distDir);
const windowsArtifacts = entries.filter(
  (entry) =>
    entry.startsWith(expectedPrefix) &&
    (entry.endsWith(".exe") || entry.endsWith(".exe.blockmap")),
);
const displayArtifacts = entries.filter(
  (entry) =>
    entry.startsWith(displayPrefix) &&
    (entry.endsWith(".exe") || entry.endsWith(".exe.blockmap")),
);

if (windowsArtifacts.length === 0 && displayArtifacts.length === 0) {
  throw new Error(`未找到 Windows 构建产物，匹配前缀: ${expectedPrefix}`);
}

if (displayVersion !== semverVersion) {
  for (const entry of windowsArtifacts) {
    const sourcePath = path.join(distDir, entry);
    const targetPath = path.join(
      distDir,
      entry.replace(`Order-${semverVersion}-`, `Order-${displayVersion}-`),
    );
    await fs.move(sourcePath, targetPath, { overwrite: true });
    console.log(`已整理 Windows 产物到 ${targetPath}`);
  }
} else {
  console.log("Windows 构建产物版本名无需额外复制。");
}

if (await fs.pathExists(latestYmlPath)) {
  const latestYml = await fs.readFile(latestYmlPath, "utf8");
  const normalized = latestYml.replaceAll(
    `Order-${semverVersion}-`,
    `Order-${displayVersion}-`,
  );
  if (normalized !== latestYml) {
    await fs.writeFile(latestYmlPath, normalized, "utf8");
    console.log(`已更新 latest.yml 中的显示版本引用: ${latestYmlPath}`);
  }
}

const refreshedEntries = await fs.readdir(distDir);
const staleWindowsArtifacts = refreshedEntries.filter(
  (entry) =>
    /^Order-[\d.]+-win-[^.]+\.exe(?:\.blockmap)?$/.test(entry) &&
    !entry.startsWith(displayPrefix),
);

for (const entry of staleWindowsArtifacts) {
  const stalePath = path.join(distDir, entry);
  await fs.remove(stalePath);
  console.log(`已删除旧版 Windows 产物: ${stalePath}`);
}
