const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const signWindowsFile = require("./windows-authenticode-sign.js");

function findRceditBinary() {
  const envPath = process.env.ORDER_RCEDIT_PATH;
  if (envPath && fs.existsSync(envPath)) {
    return envPath;
  }

  const cacheRoots = [
    path.join(
      os.homedir(),
      "AppData",
      "Local",
      "electron-builder",
      "Cache",
      "winCodeSign-2.6.0",
      "rcedit-x64.exe",
    ),
    path.join(
      os.homedir(),
      "AppData",
      "Local",
      "electron-builder",
      "Cache",
      "winCodeSign",
    ),
  ];

  for (const candidate of cacheRoots) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  const vendorCacheDir = cacheRoots[1];
  if (!fs.existsSync(vendorCacheDir) || !fs.statSync(vendorCacheDir).isDirectory()) {
    return null;
  }

  const entries = fs
    .readdirSync(vendorCacheDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => right.name.localeCompare(left.name, "en"));

  for (const entry of entries) {
    const candidate = path.join(vendorCacheDir, entry.name, "rcedit-x64.exe");
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

module.exports = async (context) => {
  if (context.electronPlatformName !== "win32") {
    return;
  }

  const productFilename = context.packager?.appInfo?.productFilename || "Order";
  const exePath = path.join(context.appOutDir, `${productFilename}.exe`);
  if (!fs.existsSync(exePath)) {
    throw new Error(`Windows afterPack 未找到主程序: ${exePath}`);
  }

  const rceditPath = findRceditBinary();
  if (!rceditPath) {
    throw new Error(
      "Windows afterPack 未找到 rcedit-x64.exe，请先完成一次 winCodeSign 下载，或通过 ORDER_RCEDIT_PATH 指定路径。",
    );
  }

  const iconPath = path.join(__dirname, "..", "images", "Order.ico");
  const packageJsonPath = path.join(__dirname, "..", "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const version = String(packageJson.version || "1.0.0");
  const companyName = String(packageJson.author || "Order contributors");
  const productName = String(
    packageJson?.build?.productName || packageJson.productName || "Order",
  );

  const args = [
    exePath,
    "--set-icon",
    iconPath,
    "--set-version-string",
    "FileDescription",
    productName,
    "--set-version-string",
    "ProductName",
    productName,
    "--set-version-string",
    "CompanyName",
    companyName,
    "--set-version-string",
    "InternalName",
    productName,
    "--set-version-string",
    "OriginalFilename",
    `${productFilename}.exe`,
    "--set-file-version",
    version,
    "--set-product-version",
    version,
  ];

  const result = spawnSync(rceditPath, args, {
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error(
      `Windows afterPack 执行 rcedit 失败，退出码: ${
        result.status == null ? "unknown" : result.status
      }`,
    );
  }

  if (process.env.WIN_CSC_LINK) {
    await signWindowsFile({
      path: exePath,
      hash: "sha256",
      isNest: false,
      cscInfo: {
        file: process.env.WIN_CSC_LINK,
        password: process.env.WIN_CSC_KEY_PASSWORD || "",
      },
    });
  }
};
