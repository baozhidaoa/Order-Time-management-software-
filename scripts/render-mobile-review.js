const fs = require("fs");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const ROOT_DIR = path.resolve(__dirname, "..");
const PAGES_DIR = path.join(ROOT_DIR, "pages");
const REVIEW_DIR = path.join(ROOT_DIR, "docs", "design-review");
const OUTPUT_DIR = path.join(ROOT_DIR, "docs", "design-review-assets");
const PRELOAD_FILE = path.join(__dirname, "mobile-review-preload.js");

const WINDOW_WIDTH = 430;
const WINDOW_HEIGHT = 932;

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function execute(windowRef, script) {
  return windowRef.webContents.executeJavaScript(script, true);
}

async function settlePage(windowRef, delayMs = 900) {
  try {
    await execute(
      windowRef,
      "document.fonts?.ready ? document.fonts.ready.then(() => true) : true",
    );
  } catch (error) {
    console.warn("等待字体稳定失败:", error);
  }
  await wait(delayMs);
}

async function forceMobileReviewShell(windowRef) {
  await execute(
    windowRef,
    `(() => {
      const root = document.documentElement;
      const body = document.body;
      const viewportHeight = ${JSON.stringify(`${WINDOW_HEIGHT}px`)};
      const viewportWidth = ${JSON.stringify(`${WINDOW_WIDTH}px`)};
      if (root) {
        root.classList.add("controler-mobile-runtime", "controler-android-native");
        root.style.setProperty("--controler-stable-visual-viewport-height", viewportHeight);
        root.style.setProperty("--controler-visual-viewport-height", viewportHeight);
        root.style.setProperty("--controler-review-width", viewportWidth);
      }
      if (body) {
        body.classList.add("controler-mobile-runtime", "controler-android-native");
        body.style.setProperty("--controler-stable-visual-viewport-height", viewportHeight);
        body.style.setProperty("--controler-visual-viewport-height", viewportHeight);
        body.style.setProperty("--controler-review-width", viewportWidth);
      }
      window.dispatchEvent(new Event("resize"));
      return true;
    })();`,
  );
  await wait(450);
}

async function loadPage(windowRef, filePath, delayMs = 1100, forceMobile = true) {
  await windowRef.loadFile(filePath);
  if (forceMobile) {
    await forceMobileReviewShell(windowRef);
  }
  await settlePage(windowRef, delayMs);
}

async function setTheme(windowRef, themeId) {
  await execute(
    windowRef,
    `(() => {
      localStorage.setItem("selectedTheme", ${JSON.stringify(themeId)});
      window.dispatchEvent(new Event("controler:storage-data-changed"));
      document.documentElement.setAttribute("data-theme", ${JSON.stringify(themeId)});
      return document.documentElement.getAttribute("data-theme");
    })();`,
  );
  await wait(240);
}

async function capture(windowRef, outputName) {
  const image = await windowRef.webContents.capturePage();
  const outputPath = path.join(OUTPUT_DIR, outputName);
  fs.writeFileSync(outputPath, image.toPNG());
  return outputPath;
}

async function primeSharedDemoData(windowRef) {
  await loadPage(windowRef, path.join(PAGES_DIR, "stats.html"), 1300);
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

      const currentState = typeof storage?.dump === "function" ? storage.dump() : {};
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
      storage?.setItem?.("selectedTheme", "champagne-sandstone");
      return {
        projectCount: Array.isArray(currentState?.projects) ? currentState.projects.length : 0,
        recordCount: Array.isArray(currentState?.records) ? currentState.records.length : 0,
      };
    })();`,
  );
  await wait(700);
}

async function prepareCurrentRecord(windowRef) {
  await setTheme(windowRef, "champagne-sandstone");
  await loadPage(windowRef, path.join(PAGES_DIR, "index.html"), 1400);
  await execute(
    windowRef,
    `(() => {
      window.scrollTo(0, 0);
      const scroller = document.querySelector(".app-main");
      if (scroller instanceof HTMLElement) {
        scroller.scrollTop = 0;
      }
      return true;
    })();`,
  );
  await settlePage(windowRef, 900);
}

async function prepareCurrentPlan(windowRef) {
  await setTheme(windowRef, "midnight-indigo");
  await loadPage(windowRef, path.join(PAGES_DIR, "plan.html"), 1800);
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

          document.getElementById("todo-view-btn")?.click?.();
          window.scrollTo(0, 0);
          const scroller = document.querySelector(".app-main");
          if (scroller instanceof HTMLElement) {
            scroller.scrollTop = 0;
          }
          resolve(true);
        } catch (error) {
          console.error("计划页演示数据准备失败:", error);
          resolve(false);
        }
      };
      void run();
    }))(1100);`,
  );
  await wait(900);
  await loadPage(windowRef, path.join(PAGES_DIR, "plan.html"), 1800);
  await execute(
    windowRef,
    `(() => {
      document.getElementById("todo-view-btn")?.click?.();
      window.scrollTo(0, 0);
      const scroller = document.querySelector(".app-main");
      if (scroller instanceof HTMLElement) {
        scroller.scrollTop = 0;
      }
      return true;
    })();`,
  );
  await settlePage(windowRef, 1100);
}

async function prepareCurrentSettings(windowRef) {
  await setTheme(windowRef, "champagne-sandstone");
  await loadPage(windowRef, path.join(PAGES_DIR, "settings.html"), 1500);
  await execute(
    windowRef,
    `(() => {
      const scroller = document.querySelector(".app-main");
      const card = document.querySelector(".settings-card--navigation");
      if (card instanceof HTMLElement && scroller instanceof HTMLElement) {
        scroller.scrollTop = Math.max(0, card.offsetTop - 96);
      }
      return true;
    })();`,
  );
  await settlePage(windowRef, 1200);
}

async function prepareConcept(windowRef, fileName) {
  await loadPage(windowRef, path.join(REVIEW_DIR, fileName), 650, false);
  await execute(
    windowRef,
    `(() => {
      window.scrollTo(0, 0);
      return true;
    })();`,
  );
  await settlePage(windowRef, 500);
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const windowRef = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    show: false,
    backgroundColor: "#081019",
    autoHideMenuBar: true,
    paintWhenInitiallyHidden: true,
    webPreferences: {
      preload: PRELOAD_FILE,
      contextIsolation: false,
      sandbox: false,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  try {
    await primeSharedDemoData(windowRef);

    await prepareCurrentRecord(windowRef);
    const currentRecord = await capture(windowRef, "current-mobile-record.png");

    await prepareCurrentPlan(windowRef);
    const currentPlan = await capture(windowRef, "current-mobile-plan.png");

    await prepareCurrentSettings(windowRef);
    const currentSettings = await capture(windowRef, "current-mobile-settings-nav.png");

    await prepareConcept(windowRef, "mobile-record-concept.html");
    const conceptRecord = await capture(windowRef, "concept-mobile-record.png");

    await prepareConcept(windowRef, "mobile-plan-concept.html");
    const conceptPlan = await capture(windowRef, "concept-mobile-plan.png");

    await prepareConcept(windowRef, "mobile-settings-concept.html");
    const conceptSettings = await capture(windowRef, "concept-mobile-settings.png");

    console.log("移动端评审图已生成:");
    [
      currentRecord,
      currentPlan,
      currentSettings,
      conceptRecord,
      conceptPlan,
      conceptSettings,
    ].forEach((filePath) => {
      console.log(` - ${filePath}`);
    });
  } finally {
    if (!windowRef.isDestroyed()) {
      windowRef.destroy();
    }
    app.quit();
  }
}

app.whenReady().then(() => {
  void main().catch((error) => {
    console.error("生成移动端评审图失败:", error);
    app.quit();
    process.exitCode = 1;
  });
});
