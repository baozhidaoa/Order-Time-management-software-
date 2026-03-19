const fs = require("fs");
const path = require("path");

const WINDOW_WIDTH = 1600;
const WINDOW_HEIGHT = 1000;

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function settlePage(windowRef, delayMs = 800) {
  try {
    await windowRef.webContents.executeJavaScript(
      "document.fonts?.ready ? document.fonts.ready.then(() => true) : true",
      true,
    );
  } catch (error) {
    console.warn("等待页面字体失败:", error);
  }
  await wait(delayMs);
}

async function loadPage(windowRef, filePath, delayMs = 800) {
  await windowRef.loadFile(filePath);
  await settlePage(windowRef, delayMs);
}

async function reloadPage(windowRef, delayMs = 1000) {
  await windowRef.webContents.executeJavaScript("window.location.reload(); true;", true);
  await settlePage(windowRef, delayMs);
}

async function execute(windowRef, script) {
  return windowRef.webContents.executeJavaScript(script, true);
}

async function capture(windowRef, outputPath, rectScript = "") {
  let rect = null;
  if (rectScript) {
    rect = await execute(windowRef, rectScript);
    await wait(300);
  }
  const image = rect
    ? await windowRef.webContents.capturePage(rect)
    : await windowRef.webContents.capturePage();
  fs.writeFileSync(outputPath, image.toPNG());
}

async function primeSharedDemoData(windowRef) {
  await loadPage(windowRef, path.join(windowRef.__pagesDir, "stats.html"), 1200);
  await execute(
    windowRef,
    `(() => {
      const storage = window.ControlerStorage;
      storage?.clear?.();
      window.localStorage.clear();

      if (typeof createTestProjects === "function") {
        createTestProjects();
      }
      if (typeof createTestData === "function") {
        createTestData();
      }

      const currentState =
        typeof storage?.dump === "function" ? storage.dump() : {};
      const nextPreferences = {
        ...(currentState?.statsPreferences || {}),
        uiState: {
          ...((currentState?.statsPreferences || {}).uiState || {}),
          viewMode: "table",
          generalRangeUnit: "day",
          heatmapRangeUnit: "month",
          tableLevelFilter: "all",
          pie: {
            selectionValue: "summary:all",
            collapsedKeys: [],
          },
          line: {
            selectionValue: "summary:all",
            collapsedKeys: [],
          },
          heatmap: {
            dataType: "project",
            projectFilter: "all",
            checkinItemId: "all",
            monthCount: 1,
          },
        },
      };

      storage?.setItem?.("statsPreferences", nextPreferences);
      storage?.setItem?.("appLanguage", "zh-CN");
      return {
        projects: Array.isArray(currentState?.projects) ? currentState.projects.length : 0,
        records: Array.isArray(currentState?.records) ? currentState.records.length : 0,
      };
    })();`,
  );
  await wait(600);
}

async function configureStatsPage(windowRef) {
  await loadPage(windowRef, path.join(windowRef.__pagesDir, "stats.html"), 1200);
  await execute(
    windowRef,
    `(() => {
      const formatDate = (value) => {
        const year = value.getFullYear();
        const month = String(value.getMonth() + 1).padStart(2, "0");
        const day = String(value.getDate()).padStart(2, "0");
        return year + "-" + month + "-" + day;
      };

      const end = new Date();
      const start = new Date(end);
      start.setDate(end.getDate() - 13);

      const applyValue = (id, value) => {
        const element = document.getElementById(id);
        if (!element) {
          return;
        }
        element.value = value;
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      };

      applyValue("stats-section-select", "table");
      applyValue("stats-range-unit-select", "day");
      applyValue("start-date-select", formatDate(start));
      applyValue("end-date-select", formatDate(end));
      window.scrollTo(0, 0);
      return true;
    })();`,
  );
  await settlePage(windowRef, 1600);
}

async function configurePlanPage(windowRef) {
  await loadPage(windowRef, path.join(windowRef.__pagesDir, "plan.html"), 1800);
  await execute(
    windowRef,
    `((waitMs) => new Promise((resolve) => {
      const run = async () => {
        try {
          document.getElementById("todo-view-btn")?.click?.();
          await new Promise((next) => setTimeout(next, waitMs));

          if (typeof createTestPlans === "function") {
            createTestPlans();
            if (typeof savePlans === "function") {
              await savePlans();
            }
          }

          if (typeof createTestTodos === "function") {
            createTestTodos();
            if (typeof saveData === "function") {
              saveData();
            }
          }
          resolve({
            hasTodos: typeof createTestTodos === "function",
            hasPlans: typeof createTestPlans === "function",
          });
        } catch (error) {
          console.error("Failed to prepare plan demo data:", error);
          resolve({
            hasTodos: false,
            hasPlans: false,
          });
        }
      };
      void run();
    }))(1400);`,
  );
  await wait(900);
  await reloadPage(windowRef, 1800);
  await execute(
    windowRef,
    `(() => {
      document.getElementById("todo-view-btn")?.click?.();
      window.scrollTo(0, 0);
      return true;
    })();`,
  );
  await settlePage(windowRef, 1800);
}

async function configureSettingsPage(windowRef) {
  await loadPage(windowRef, path.join(windowRef.__pagesDir, "settings.html"), 1200);
  await execute(
    windowRef,
    `(() => {
      if (typeof window.ControlerI18n?.setLanguage === "function") {
        window.ControlerI18n.setLanguage("en-US");
      }
      const languageSelect = document.getElementById("language-select");
      if (languageSelect instanceof HTMLSelectElement) {
        languageSelect.value = "en-US";
        languageSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
      const scroller = document.querySelector(".app-main");
      const card = document.querySelector(".settings-card--language");
      if (card instanceof HTMLElement && scroller instanceof HTMLElement) {
        scroller.scrollTop = Math.max(0, card.offsetTop - 120);
      }
      return true;
    })();`,
  );
  await settlePage(windowRef, 1200);
}

async function generateReadmeScreenshots({ BrowserWindow, baseDir }) {
  const outputDir = path.join(baseDir, "docs", "readme-assets");
  const pagesDir = path.join(baseDir, "pages");
  const partition = `persist:order-readme-demo-${Date.now()}`;

  fs.mkdirSync(outputDir, { recursive: true });

  const windowRef = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    show: false,
    backgroundColor: "#f2f4f8",
    paintWhenInitiallyHidden: true,
    autoHideMenuBar: true,
    webPreferences: {
      partition,
      contextIsolation: false,
      sandbox: false,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  windowRef.__pagesDir = pagesDir;

  try {
    await primeSharedDemoData(windowRef);

    await loadPage(windowRef, path.join(pagesDir, "index.html"), 1200);
    await capture(windowRef, path.join(outputDir, "record-overview-demo.png"));

    await configureStatsPage(windowRef);
    await capture(windowRef, path.join(outputDir, "stats-table-demo.png"));

    await configurePlanPage(windowRef);
    await capture(windowRef, path.join(outputDir, "plan-dashboard-demo.png"));

    await configureSettingsPage(windowRef);
    await capture(windowRef, path.join(outputDir, "settings-language-demo.png"));
  } finally {
    if (!windowRef.isDestroyed()) {
      windowRef.destroy();
    }
  }
}

module.exports = generateReadmeScreenshots;
