(() => {
  const manifest = Object.freeze({
  "chart": "chart.runtime.ecc3cd1eeb8c.js",
  "d3": "d3.runtime.f2094bbf6141.js",
  "calHeatmapJs": "cal-heatmap.runtime.e2beb98eb0d4.js",
  "calHeatmapCss": "cal-heatmap.2d70c33309b2.css"
});
  const globalScope =
    typeof window !== "undefined"
      ? window
      : typeof globalThis !== "undefined"
        ? globalThis
        : this;
  globalScope.__CONTROLER_OFFLINE_ASSET_MANIFEST__ = manifest;
})();
