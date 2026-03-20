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
const winUnpackedDir = path.join(distDir, "win-unpacked");
const localAppDir = process.env.ORDER_LOCAL_APP_DIR || "E:\\App\\Order";
const localPackagesDir = path.join(localAppDir, "packages");

function isCurrentPackageArtifact(fileName) {
  const normalized = fileName.toLowerCase();
  if (fileName === "latest.yml" || fileName === "RELEASES" || fileName === "OrderInternal.cer") {
    return true;
  }
  if (fileName === `Order-${displayVersion}-android.apk`) {
    return true;
  }
  if (fileName === `Order-${displayVersion}-setup.exe`) {
    return true;
  }
  if (
    fileName.startsWith(`Order-${displayVersion}-win-`) &&
    (fileName.endsWith(".exe") || fileName.endsWith(".exe.blockmap"))
  ) {
    return true;
  }
  if (normalized === `order-${semverVersion.toLowerCase()}-full.nupkg`) {
    return true;
  }
  return false;
}

function isVersionedPackageArtifact(fileName) {
  return (
    /^Order-[\d.]+-android\.apk$/.test(fileName) ||
    /^Order-[\d.]+-setup\.exe$/.test(fileName) ||
    /^Order-[\d.]+-win-[^.]+\.exe$/.test(fileName) ||
    /^Order-[\d.]+-win-[^.]+\.exe\.blockmap$/.test(fileName) ||
    /^order-[\d.]+-full\.nupkg$/i.test(fileName)
  );
}

function getReleaseSourceDirs() {
  const candidates = [
    path.join(distDir, `release-v${displayVersion}`),
    path.join(distDir, `release-v${semverVersion}`),
    distDir,
  ];
  return [...new Set(candidates)];
}

async function syncRuntimeFiles() {
  if (!(await fs.pathExists(winUnpackedDir))) {
    console.log(`未找到 win-unpacked 目录，跳过本地程序同步: ${winUnpackedDir}`);
    return;
  }

  await fs.ensureDir(localAppDir);

  const entries = await fs.readdir(winUnpackedDir, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(winUnpackedDir, entry.name);
    const targetPath = path.join(localAppDir, entry.name);
    if (entry.isDirectory()) {
      await fs.remove(targetPath);
    }
    await fs.copy(sourcePath, targetPath, { overwrite: true });
    console.log(`已同步本地程序文件: ${targetPath}`);
  }

  const repoLicensePath = path.join(repoRoot, "LICENSE");
  if (await fs.pathExists(repoLicensePath)) {
    await fs.copy(repoLicensePath, path.join(localAppDir, "LICENSE"), { overwrite: true });
  }
}

async function syncPackageArtifacts() {
  await fs.ensureDir(localPackagesDir);

  const releaseSourceDirs = getReleaseSourceDirs();
  const selectedArtifacts = new Map();

  for (const sourceDir of releaseSourceDirs) {
    if (!(await fs.pathExists(sourceDir))) {
      continue;
    }
    const entries = await fs.readdir(sourceDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }
      if (!isCurrentPackageArtifact(entry.name) || selectedArtifacts.has(entry.name)) {
        continue;
      }
      selectedArtifacts.set(entry.name, path.join(sourceDir, entry.name));
    }
  }

  if (selectedArtifacts.size === 0) {
    console.log("未找到可同步的最新发布产物，跳过 packages 目录同步。");
    return;
  }

  for (const [fileName, sourcePath] of selectedArtifacts.entries()) {
    const targetPath = path.join(localPackagesDir, fileName);
    await fs.copy(sourcePath, targetPath, { overwrite: true });
    console.log(`已同步发布产物: ${targetPath}`);
  }

  const keepFiles = new Set(selectedArtifacts.keys());
  const packageEntries = await fs.readdir(localPackagesDir, { withFileTypes: true });
  for (const entry of packageEntries) {
    if (!entry.isFile()) {
      continue;
    }
    if (!isVersionedPackageArtifact(entry.name) || keepFiles.has(entry.name)) {
      continue;
    }
    const stalePath = path.join(localPackagesDir, entry.name);
    await fs.remove(stalePath);
    console.log(`已删除旧版发布产物: ${stalePath}`);
  }
}

if (!(await fs.pathExists(distDir))) {
  throw new Error(`未找到 dist 目录: ${distDir}`);
}

await syncRuntimeFiles();
await syncPackageArtifacts();

console.log(`本地发布目录已同步到最新版本: ${localAppDir}`);
