import crypto from "crypto";
import path from "path";

export const OFFLINE_ASSET_MANIFEST_FILE_NAME = "offline-assets-manifest.js";
export const OFFLINE_ASSET_MANIFEST_GLOBAL =
  "__CONTROLER_OFFLINE_ASSET_MANIFEST__";
export const OFFLINE_ASSET_KEYS = Object.freeze([
  "chart",
  "d3",
  "calHeatmapJs",
  "calHeatmapCss",
]);

export function createOfflineAssetDefinitions(repoRoot) {
  return Object.freeze([
    {
      key: "chart",
      sourcePath: path.join(
        repoRoot,
        "node_modules",
        "chart.js",
        "dist",
        "chart.umd.js",
      ),
      filePrefix: "chart.runtime",
      extension: ".js",
    },
    {
      key: "d3",
      sourcePath: path.join(repoRoot, "node_modules", "d3", "dist", "d3.min.js"),
      filePrefix: "d3.runtime",
      extension: ".js",
    },
    {
      key: "calHeatmapJs",
      sourcePath: path.join(
        repoRoot,
        "node_modules",
        "cal-heatmap",
        "dist",
        "cal-heatmap.min.js",
      ),
      filePrefix: "cal-heatmap.runtime",
      extension: ".js",
    },
    {
      key: "calHeatmapCss",
      sourcePath: path.join(
        repoRoot,
        "node_modules",
        "cal-heatmap",
        "dist",
        "cal-heatmap.css",
      ),
      filePrefix: "cal-heatmap",
      extension: ".css",
    },
  ]);
}

export function createOfflineAssetDefinitionMap(repoRoot) {
  return new Map(
    createOfflineAssetDefinitions(repoRoot).map((definition) => [
      definition.key,
      definition,
    ]),
  );
}

export function buildOfflineAssetFileName(definition, sourceBuffer) {
  const hash = crypto
    .createHash("sha256")
    .update(sourceBuffer)
    .digest("hex")
    .slice(0, 12);
  return `${definition.filePrefix}.${hash}${definition.extension}`;
}

export function buildOfflineAssetManifest(definitions, assetBuffersByKey) {
  const manifest = {};
  definitions.forEach((definition) => {
    const sourceBuffer = assetBuffersByKey.get(definition.key);
    if (!Buffer.isBuffer(sourceBuffer)) {
      throw new Error(`缺少离线资源内容: ${definition.key}`);
    }
    manifest[definition.key] = buildOfflineAssetFileName(
      definition,
      sourceBuffer,
    );
  });
  return Object.freeze(manifest);
}

export function buildOfflineAssetManifestSource(manifest) {
  const serializedManifest = JSON.stringify(manifest, null, 2);
  return `(() => {
  const manifest = Object.freeze(${serializedManifest});
  const globalScope =
    typeof window !== "undefined"
      ? window
      : typeof globalThis !== "undefined"
        ? globalThis
        : this;
  globalScope.${OFFLINE_ASSET_MANIFEST_GLOBAL} = manifest;
})();\n`;
}

export function isOfflineAssetManifest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  return OFFLINE_ASSET_KEYS.every((key) => {
    return typeof value[key] === "string" && value[key].trim();
  });
}
