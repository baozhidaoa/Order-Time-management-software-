import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const sharedContractSourcePath = path.join(
  repoRoot,
  "shared",
  "platform-contract.js",
);
const pagesContractTargetPath = path.join(repoRoot, "pages", "platform-contract.js");
const mobileContractTargetPath = path.join(
  repoRoot,
  "ControlerApp",
  "platform-contract.js",
);
const offlineAssetsDir = path.join(repoRoot, "pages", "offline-assets");
const chartRuntimeSourcePath = path.join(
  repoRoot,
  "node_modules",
  "chart.js",
  "dist",
  "chart.umd.js",
);
const mobileAndroidWebDir = path.join(
  repoRoot,
  "ControlerApp",
  "android",
  "app",
  "src",
  "main",
  "assets",
  "controler-web",
);
const mobileIosWebDir = path.join(repoRoot, "ControlerApp", "ios", "controler-web");

const assets = [
  {
    from: chartRuntimeSourcePath,
    to: path.join(offlineAssetsDir, "chart.runtime.js"),
  },
  {
    from: path.join(repoRoot, "node_modules", "d3", "dist", "d3.min.js"),
    to: path.join(offlineAssetsDir, "d3.min.js"),
  },
  {
    from: path.join(
      repoRoot,
      "node_modules",
      "cal-heatmap",
      "dist",
      "cal-heatmap.min.js",
    ),
    to: path.join(offlineAssetsDir, "cal-heatmap.min.js"),
  },
  {
    from: path.join(
      repoRoot,
      "node_modules",
      "cal-heatmap",
      "dist",
      "cal-heatmap.css",
    ),
    to: path.join(offlineAssetsDir, "cal-heatmap.css"),
  },
];

await fs.ensureDir(offlineAssetsDir);
if (!(await fs.pathExists(sharedContractSourcePath))) {
  throw new Error(`缺少共享平台契约文件: ${sharedContractSourcePath}`);
}
await fs.copy(sharedContractSourcePath, pagesContractTargetPath, {
  overwrite: true,
});

function formatRelativeRepoPath(targetPath) {
  return path.relative(repoRoot, targetPath).replace(/\\/g, "/");
}

async function canReuseExistingCopy(fromPath, toPath) {
  try {
    if (!(await fs.pathExists(toPath))) {
      return false;
    }

    const [fromStats, toStats] = await Promise.all([
      fs.stat(fromPath),
      fs.stat(toPath),
    ]);

    return (
      fromStats.isFile() &&
      toStats.isFile() &&
      fromStats.size === toStats.size &&
      Math.trunc(fromStats.mtimeMs) === Math.trunc(toStats.mtimeMs)
    );
  } catch (error) {
    if (error?.code === "EPERM") {
      return true;
    }
    return false;
  }
}

for (const asset of assets) {
  if (!(await fs.pathExists(asset.from))) {
    throw new Error(`缺少资源文件: ${asset.from}`);
  }
  try {
    await fs.copy(asset.from, asset.to, { overwrite: true });
  } catch (error) {
    if (
      error?.code === "EPERM" &&
      (await canReuseExistingCopy(asset.from, asset.to))
    ) {
      continue;
    }
    if (error?.code === "EPERM") {
      console.warn(`跳过被占用的资源文件: ${asset.to}`);
      continue;
    }
    throw error;
  }
}

const expectedRuntimeAssetFiles = new Set(
  assets.map((asset) => path.basename(asset.to)),
);
for (const entry of await fs.readdir(offlineAssetsDir)) {
  const fullPath = path.join(offlineAssetsDir, entry);
  let stats = null;
  try {
    stats = await fs.stat(fullPath);
  } catch (error) {
    if (error?.code === "EPERM") {
      continue;
    }
    throw error;
  }
  if (stats.isFile() && !expectedRuntimeAssetFiles.has(entry)) {
    await fs.remove(fullPath);
  }
}

async function copyDirectoryTree(sourceDir, targetDir) {
  await fs.ensureDir(targetDir);
  const entries = await fs.readdir(sourceDir);

  for (const entry of entries) {
    if (sourceDir === path.join(repoRoot, "pages") && entry === "runtime-assets") {
      continue;
    }

    const sourcePath = path.join(sourceDir, entry);
    const targetPath = path.join(targetDir, entry);
    let sourceStats = null;

    try {
      sourceStats = await fs.stat(sourcePath);
    } catch (error) {
      if (error?.code === "EPERM") {
        console.warn(`跳过被占用的资源文件: ${formatRelativeRepoPath(sourcePath)}`);
        continue;
      }
      throw error;
    }

    if (sourceStats.isDirectory()) {
      await copyDirectoryTree(sourcePath, targetPath);
      continue;
    }

    if (!sourceStats.isFile()) {
      continue;
    }

    try {
      await fs.copy(sourcePath, targetPath, { overwrite: true });
    } catch (error) {
      if (error?.code === "EPERM") {
        console.warn(`跳过被占用的资源文件: ${formatRelativeRepoPath(sourcePath)}`);
        continue;
      }
      throw error;
    }
  }
}

if (await fs.pathExists(path.join(repoRoot, "ControlerApp"))) {
  await fs.copy(sharedContractSourcePath, mobileContractTargetPath, {
    overwrite: true,
  });
  await fs.emptyDir(mobileAndroidWebDir);
  await fs.emptyDir(mobileIosWebDir);
  await copyDirectoryTree(path.join(repoRoot, "pages"), mobileAndroidWebDir);
  await copyDirectoryTree(path.join(repoRoot, "pages"), mobileIosWebDir);
}

console.log("已同步离线 Web 资源到 pages/offline-assets 和 React Native 移动端资源目录");
