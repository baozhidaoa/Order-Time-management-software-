const assert = require("assert");
const { EventEmitter } = require("events");
const path = require("path");
const DesktopPagePool = require("../desktop-page-pool.js");

let nextWebContentsId = 1;

class FakeWebContents extends EventEmitter {
  constructor() {
    super();
    this.id = nextWebContentsId++;
    this.url = "";
    this.messages = [];
    this.destroyed = false;
  }

  getURL() { return this.url; }
  isDestroyed() { return this.destroyed; }
  send(channel, payload) { this.messages.push({ channel, payload }); }
  focus() { this.focused = true; }
  stop() { this.stopped = true; }
  close() { this.destroyed = true; this.emit("destroyed"); }
  loadURL(url) {
    this.url = url;
    this.emit("did-start-navigation", {}, url, false, true);
    this.emit("did-finish-load");
    return Promise.resolve();
  }
}

class FakeWebContentsView {
  constructor() {
    this.webContents = new FakeWebContents();
    this.visible = false;
  }

  setVisible(visible) { this.visible = visible; }
  setBounds(bounds) { this.bounds = bounds; }
}

function createPool() {
  const primary = new FakeWebContents();
  const childViews = [];
  const window = {
    webContents: primary,
    isDestroyed: () => false,
    getContentBounds: () => ({ width: 1200, height: 800 }),
    contentView: {
      addChildView(view) {
        const current = childViews.indexOf(view);
        if (current >= 0) childViews.splice(current, 1);
        childViews.push(view);
      },
      removeChildView(view) {
        const current = childViews.indexOf(view);
        if (current >= 0) childViews.splice(current, 1);
      },
    },
  };
  const metrics = [];
  const failures = [];
  const pool = new DesktopPagePool({
    window,
    WebContentsView: FakeWebContentsView,
    preloadPath: "preload.js",
    resolvePagePath: (page) => path.join(process.cwd(), "pages", page),
    onMetric: (metric) => metrics.push(metric),
    onLoadFailure: (failure) => failures.push(failure),
  });
  primary.url = pool.buildTargetUrl("index");
  pool.initialize("index");
  pool.markPageReady(primary, { page: "index" });
  return { pool, primary, metrics, failures };
}

function request(page, sequence) {
  return {
    requestId: `request-${sequence}`,
    page,
    href: `${page}.html`,
    requestedAt: Date.now(),
  };
}

function testPoolNavigation() {
  const { pool, primary, metrics } = createPool();

  const statsAck = pool.navigate(request("stats", 1), primary);
  assert.strictEqual(statsAck.state, "queued");
  const statsSlot = pool.slots.find((slot) => slot.page === "stats");
  pool.markPageReady(statsSlot.webContents, { page: "stats" });
  assert.strictEqual(pool.activeSlot.page, "stats");

  const planAck = pool.navigate(request("plan", 2), statsSlot.webContents);
  assert.strictEqual(planAck.state, "queued");
  const planSlot = pool.slots.find((slot) => slot.page === "plan");
  pool.markPageReady(planSlot.webContents, { page: "plan" });
  assert.strictEqual(pool.slots.length, 3);
  assert.strictEqual(pool.activeSlot.page, "plan");

  const hotStatsAck = pool.navigate(request("stats", 3), planSlot.webContents);
  assert.strictEqual(hotStatsAck.cacheSource, "hot-renderer");
  assert.strictEqual(pool.activeSlot.page, "stats");
  assert.strictEqual(pool.slots.length, 3);

  const diaryAck = pool.navigate(request("diary", 4), statsSlot.webContents);
  assert.strictEqual(diaryAck.state, "queued");
  const diarySlot = pool.slots.find((slot) => slot.page === "diary");
  const duplicateAck = pool.navigate(request("diary", 5), statsSlot.webContents);
  assert.strictEqual(duplicateAck.cacheSource, "prewarm-in-flight");
  pool.markPageReady(diarySlot.webContents, { page: "diary" });
  assert.strictEqual(pool.activeSlot.page, "diary");
  assert.ok(metrics.length >= 4);
  assert.ok(pool.slots.length <= 3);

  pool.trimToCurrent();
  assert.strictEqual(pool.slots.filter((slot) => slot.page).length, 1);
  pool.dispose();
}

function testLatestReadyWins() {
  const { pool, primary } = createPool();
  pool.navigate(request("stats", 10), primary);
  const statsSlot = pool.slots.find((slot) => slot.page === "stats");
  pool.navigate(request("plan", 11), primary);
  const planSlot = pool.slots.find((slot) => slot.page === "plan");

  pool.markPageReady(statsSlot.webContents, { page: "stats" });
  assert.strictEqual(pool.activeSlot.page, "index");
  pool.markPageReady(planSlot.webContents, { page: "plan" });
  assert.strictEqual(pool.activeSlot.page, "plan");

  const hiddenState = statsSlot.webContents.messages
    .filter((message) => message.channel === "ui:page-activity-changed")
    .at(-1);
  assert.strictEqual(hiddenState.payload.active, false);
  pool.dispose();
}

testPoolNavigation();
testLatestReadyWins();
console.log("Desktop page pool tests passed");
