import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const packageJsonPath = path.join(repoRoot, "package.json");
const packageJson = await fs.readJson(packageJsonPath);
const version = String(packageJson?.build?.buildVersion || packageJson?.version || "1.0.0");

const sourceApkPath = path.join(
  repoRoot,
  "ControlerApp",
  "android",
  "app",
  "build",
  "outputs",
  "apk",
  "release",
  "app-release.apk",
);
const distDir = path.join(repoRoot, "dist");
const targetApkPath = path.join(distDir, `Order-${version}-android.apk`);

if (!(await fs.pathExists(sourceApkPath))) {
  throw new Error(`未找到 Android APK: ${sourceApkPath}`);
}

await fs.ensureDir(distDir);
await fs.copy(sourceApkPath, targetApkPath, { overwrite: true });

console.log(`已复制 Android APK 到 ${targetApkPath}`);
