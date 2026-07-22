const { pathToFileURL } = require("url");

const DEFAULT_PAGES = Object.freeze([
  "index",
  "stats",
  "plan",
  "todo",
  "diary",
  "settings",
]);

function safeSend(webContents, channel, payload) {
  if (!webContents || webContents.isDestroyed()) return false;
  try {
    webContents.send(channel, payload);
    return true;
  } catch (_error) {
    return false;
  }
}

class DesktopPagePool {
  constructor(options = {}) {
    this.window = options.window;
    this.WebContentsView = options.WebContentsView;
    this.preloadPath = options.preloadPath;
    this.resolvePagePath = options.resolvePagePath;
    this.onMetric = typeof options.onMetric === "function" ? options.onMetric : () => {};
    this.onLoadFailure =
      typeof options.onLoadFailure === "function" ? options.onLoadFailure : () => {};
    this.allowedPages = new Set(options.pages || DEFAULT_PAGES);
    this.maxSlots = Math.max(1, Math.min(3, Number(options.maxSlots) || 3));
    this.slots = [];
    this.slotByWebContentsId = new Map();
    this.activeSlot = null;
    this.latestRequestId = "";
    this.prewarmQueue = [];
    this.prewarmTimer = null;
    this.disposed = false;
  }

  initialize(page = "index") {
    const primary = this.createSlot({
      kind: "primary",
      webContents: this.window.webContents,
      page,
      href: this.window.webContents.getURL(),
      ready: false,
    });
    this.activeSlot = primary;
    this.resize();
    return primary;
  }

  createSlot(options = {}) {
    let view = null;
    let webContents = options.webContents || null;
    if (!webContents) {
      view = new this.WebContentsView({
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          enableRemoteModule: false,
          sandbox: false,
          preload: this.preloadPath,
          backgroundThrottling: false,
        },
      });
      webContents = view.webContents;
      view.setVisible(false);
      this.window.contentView.addChildView(view);
    }
    const slot = {
      id: `page-slot-${this.slots.length + 1}`,
      kind: options.kind || "secondary",
      view,
      webContents,
      page: options.page || "",
      href: options.href || "",
      ready: options.ready === true,
      loading: false,
      request: null,
      sourceWebContents: null,
      prewarming: false,
      lastUsedAt: Date.now(),
      timings: null,
    };
    this.slots.push(slot);
    this.slotByWebContentsId.set(webContents.id, slot);
    this.bindSlotEvents(slot);
    return slot;
  }

  bindSlotEvents(slot) {
    slot.webContents.on("did-start-navigation", (_event, url, _inPlace, isMainFrame) => {
      if (!isMainFrame || !slot.loading) return;
      slot.href = url || slot.href;
      if (slot.timings && !slot.timings.navigationStartedAt) {
        slot.timings.navigationStartedAt = Date.now();
      }
    });
    slot.webContents.on("did-finish-load", () => {
      slot.href = slot.webContents.getURL() || slot.href;
      if (slot.timings) slot.timings.htmlFinishedAt = Date.now();
      this.notifyActivity(
        slot,
        slot === this.activeSlot,
        slot === this.activeSlot ? "html-finished-active" : "html-finished-hidden",
        slot.request,
      );
    });
    slot.webContents.on(
      "did-fail-load",
      (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
        if (!isMainFrame || errorCode === -3) return;
        const failedRequest = slot.request;
        const wasPrewarming = slot.prewarming;
        slot.loading = false;
        slot.ready = false;
        slot.request = null;
        slot.prewarming = false;
        if (failedRequest) {
          this.onLoadFailure({
            request: failedRequest,
            errorCode,
            errorDescription,
            url: validatedURL || slot.href,
          });
        }
        if (wasPrewarming) this.runNextPrewarm();
      },
    );
    slot.webContents.on("destroyed", () => {
      this.slotByWebContentsId.delete(slot.webContents.id);
    });
  }

  owns(webContents) {
    return !!webContents && this.slotByWebContentsId.has(webContents.id);
  }

  getSlot(webContents) {
    return webContents ? this.slotByWebContentsId.get(webContents.id) || null : null;
  }

  getActiveWebContents() {
    return this.activeSlot?.webContents || this.window?.webContents || null;
  }

  getAllWebContents() {
    return this.slots
      .map((slot) => slot.webContents)
      .filter((contents) => contents && !contents.isDestroyed());
  }

  buildTargetUrl(page, href = "") {
    const target = pathToFileURL(this.resolvePagePath(`${page}.html`));
    try {
      const requested = new URL(href, target);
      target.search = requested.search;
      target.hash = requested.hash;
    } catch (_error) {}
    return target.toString();
  }

  normalizeRequest(request = {}) {
    const page = String(request.page || "").replace(/\.html$/i, "").trim();
    const requestId = String(request.requestId || "").trim();
    if (!this.allowedPages.has(page) || !requestId) return null;
    return {
      ...request,
      page,
      requestId,
      href: this.buildTargetUrl(page, request.href),
      requestedAt: Math.max(0, Number(request.requestedAt) || Date.now()),
      hostReceivedAt: Date.now(),
    };
  }

  navigate(rawRequest = {}, sourceWebContents = null) {
    if (this.disposed) return { state: "rejected", reason: "pool-disposed" };
    const request = this.normalizeRequest(rawRequest);
    if (!request) return { state: "rejected", reason: "invalid-request" };
    this.cancelPrewarmTimer();
    this.latestRequestId = request.requestId;

    const hotSlot = this.slots.find(
      (slot) => slot.ready && slot.page === request.page && slot.href === request.href,
    );
    if (hotSlot) {
      this.activate(hotSlot, request, "hot-renderer");
      return { state: "accepted-now", cacheSource: "hot-renderer", requestId: request.requestId };
    }

    const loadingSlot = this.slots.find(
      (slot) => slot.loading && slot.page === request.page && slot.href === request.href,
    );
    if (loadingSlot) {
      loadingSlot.request = request;
      loadingSlot.sourceWebContents = sourceWebContents;
      loadingSlot.prewarming = false;
      loadingSlot.timings = this.createTimings(request, "prewarm-in-flight");
      return { state: "queued", cacheSource: "prewarm-in-flight", requestId: request.requestId };
    }

    const slot = this.selectLoadSlot();
    if (!slot) return { state: "rejected", reason: "no-page-slot", requestId: request.requestId };
    const cacheSource = slot.page ? "lru-reload" : "empty-slot";
    this.loadSlot(slot, request.page, request.href, {
      request,
      sourceWebContents,
      prewarming: false,
      cacheSource,
    });
    return {
      state: "queued",
      cacheSource,
      requestId: request.requestId,
    };
  }

  fallbackNavigate(rawRequest = {}) {
    const request = this.normalizeRequest(rawRequest);
    if (!request || !this.activeSlot) return false;
    this.latestRequestId = request.requestId;
    this.loadSlot(this.activeSlot, request.page, request.href, {
      request: { ...request, fallbackAttempted: true },
      sourceWebContents: this.activeSlot.webContents,
      prewarming: false,
      cacheSource: "web-navigation-fallback",
    });
    return true;
  }

  createTimings(request, cacheSource) {
    return {
      requestId: request?.requestId || "",
      page: request?.page || "",
      requestedAt: Math.max(0, Number(request?.requestedAt) || Date.now()),
      hostReceivedAt: Math.max(0, Number(request?.hostReceivedAt) || Date.now()),
      loadStartedAt: Date.now(),
      navigationStartedAt: 0,
      htmlFinishedAt: 0,
      pageReadyAt: 0,
      targetVisibleAt: 0,
      cacheSource,
    };
  }

  selectLoadSlot() {
    let slot = this.slots.find((entry) => entry !== this.activeSlot && !entry.page);
    if (slot) return slot;
    if (this.slots.length < this.maxSlots) return this.createSlot();
    const candidates = this.slots
      .filter((entry) => entry !== this.activeSlot)
      .sort((left, right) => left.lastUsedAt - right.lastUsedAt);
    slot = candidates.find((entry) => entry.prewarming) || candidates[0] || null;
    if (slot?.loading) slot.webContents.stop();
    return slot;
  }

  loadSlot(slot, page, href, options = {}) {
    slot.page = page;
    slot.href = href;
    slot.ready = false;
    slot.loading = true;
    slot.request = options.request || null;
    slot.sourceWebContents = options.sourceWebContents || null;
    slot.prewarming = options.prewarming === true;
    slot.lastUsedAt = Date.now();
    slot.timings = this.createTimings(options.request, options.cacheSource || "hidden-load");
    if (slot.view) slot.view.setVisible(false);
    this.notifyActivity(slot, false, options.prewarming ? "prewarm-load" : "navigation-load");
    void slot.webContents.loadURL(href).catch((error) => {
      if (!slot.loading) return;
      const request = slot.request;
      slot.loading = false;
      slot.ready = false;
      slot.request = null;
      slot.prewarming = false;
      if (request) this.onLoadFailure({ request, error, url: href });
    });
  }

  markPageReady(webContents, payload = {}) {
    const slot = this.getSlot(webContents);
    if (!slot) return { matched: false };
    const reportedPage = String(payload?.page || "").replace(/\.html$/i, "").trim();
    if (this.allowedPages.has(reportedPage)) slot.page = reportedPage;
    slot.ready = true;
    slot.loading = false;
    slot.href = slot.webContents.getURL() || slot.href;
    slot.lastUsedAt = Date.now();
    if (slot.timings) slot.timings.pageReadyAt = Date.now();
    const request = slot.request;
    const wasPrewarming = slot.prewarming;
    slot.prewarming = false;
    slot.request = null;
    if (request && request.requestId === this.latestRequestId) {
      this.activate(slot, request, slot.timings?.cacheSource || "hidden-load");
    } else {
      this.notifyActivity(slot, slot === this.activeSlot, "page-ready-hidden");
    }
    if (wasPrewarming) this.runNextPrewarm();
    return { matched: true, activated: slot === this.activeSlot, requestId: request?.requestId || "" };
  }

  activate(slot, request = null, cacheSource = "hot-renderer") {
    if (!slot || this.disposed) return false;
    this.activeSlot = slot;
    slot.lastUsedAt = Date.now();
    this.slots.forEach((entry) => {
      if (entry.view) entry.view.setVisible(entry === slot);
      this.notifyActivity(
        entry,
        entry === slot,
        entry === slot ? "target-visible" : "hidden-by-navigation",
        request,
      );
    });
    if (slot.view) this.window.contentView.addChildView(slot.view);
    slot.webContents.focus();
    const timings = slot.timings || this.createTimings(request, cacheSource);
    timings.pageReadyAt ||= Date.now();
    timings.targetVisibleAt = Date.now();
    timings.cacheSource = cacheSource || timings.cacheSource;
    const durationMs = Math.max(0, timings.targetVisibleAt - timings.requestedAt);
    this.onMetric({
      ...timings,
      durationMs,
      slotCount: this.slots.filter((entry) => !!entry.page).length,
    });
    slot.timings = null;
    return true;
  }

  notifyActivity(slot, active, reason, request = null) {
    safeSend(slot.webContents, "ui:page-activity-changed", {
      active: active === true,
      slot: slot.id,
      page: slot.page,
      href: slot.href,
      requestId: request?.requestId || "",
      reason,
      receivedAt: Date.now(),
    });
  }

  broadcast(channel, payload) {
    this.getAllWebContents().forEach((contents) => safeSend(contents, channel, payload));
  }

  sendToActive(channel, payload) {
    return safeSend(this.getActiveWebContents(), channel, payload);
  }

  resize() {
    if (!this.window || this.window.isDestroyed()) return;
    const bounds = this.window.getContentBounds();
    this.slots.forEach((slot) => {
      if (slot.view) {
        slot.view.setBounds({ x: 0, y: 0, width: bounds.width, height: bounds.height });
      }
    });
  }

  schedulePrewarm(pages = DEFAULT_PAGES, delayMs = 600) {
    if (this.disposed) return;
    const activePage = this.activeSlot?.page || "";
    const cachedPages = new Set(this.slots.filter((slot) => slot.ready).map((slot) => slot.page));
    this.prewarmQueue = pages
      .map((page) => String(page || "").trim())
      .filter((page) => this.allowedPages.has(page) && page !== activePage && !cachedPages.has(page))
      .slice(0, Math.max(0, this.maxSlots - 1));
    this.cancelPrewarmTimer();
    if (!this.prewarmQueue.length) return;
    this.prewarmTimer = setTimeout(() => {
      this.prewarmTimer = null;
      this.runNextPrewarm();
    }, Math.max(0, Number(delayMs) || 0));
  }

  runNextPrewarm() {
    if (this.disposed || !this.prewarmQueue.length) return;
    if (this.slots.some((slot) => slot.loading && !slot.prewarming)) return;
    const page = this.prewarmQueue.shift();
    if (!page || this.slots.some((slot) => slot.ready && slot.page === page)) {
      this.runNextPrewarm();
      return;
    }
    const slot = this.selectLoadSlot();
    if (!slot) return;
    this.loadSlot(slot, page, this.buildTargetUrl(page), {
      prewarming: true,
      cacheSource: "idle-prewarm",
    });
  }

  cancelPrewarmTimer() {
    if (this.prewarmTimer) clearTimeout(this.prewarmTimer);
    this.prewarmTimer = null;
  }

  trimToCurrent() {
    this.cancelPrewarmTimer();
    this.prewarmQueue = [];
    this.slots.forEach((slot) => {
      if (slot === this.activeSlot) return;
      if (slot.loading) slot.webContents.stop();
      slot.page = "";
      slot.href = "";
      slot.ready = false;
      slot.loading = false;
      slot.request = null;
      slot.prewarming = false;
      if (slot.view) slot.view.setVisible(false);
      void slot.webContents.loadURL("about:blank").catch(() => undefined);
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelPrewarmTimer();
    this.slots.forEach((slot) => {
      if (!slot.view) return;
      try {
        this.window.contentView.removeChildView(slot.view);
      } catch (_error) {}
      if (!slot.webContents.isDestroyed()) slot.webContents.close();
    });
    this.slots = [];
    this.slotByWebContentsId.clear();
    this.activeSlot = null;
  }
}

module.exports = DesktopPagePool;
module.exports.DEFAULT_PAGES = DEFAULT_PAGES;
