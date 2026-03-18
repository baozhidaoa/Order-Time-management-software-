const fs = require("fs-extra");
const path = require("path");
const uiLanguage = require("./shared/ui-language.js");

const MAX_TIMEOUT_MS = 2147483647;
const REARM_INTERVAL_MS = 15 * 60 * 1000;
const STALE_GRACE_MS = 2 * 60 * 1000;

class DesktopNotificationScheduler {
  constructor({ app, Notification, getLanguage }) {
    this.app = app;
    this.Notification = Notification;
    this.getLanguage =
      typeof getLanguage === "function"
        ? getLanguage
        : () => uiLanguage.DEFAULT_LANGUAGE;
    this.schedulePath = path.join(
      this.app.getPath("userData"),
      "notification-schedule.json",
    );
    this.entries = [];
    this.entryTimers = new Map();
    this.rearmTimer = null;
    this.openMainActionHandler = null;
    this.ready = false;
    this.restorePersistedEntries();
  }

  getCurrentLanguage() {
    return uiLanguage.normalizeLanguage(this.getLanguage());
  }

  getDefaultReminderTitle() {
    return uiLanguage.t(this.getCurrentLanguage(), "notification.reminderTitle");
  }

  setOpenMainActionHandler(handler) {
    this.openMainActionHandler =
      typeof handler === "function" ? handler : null;
  }

  markReady() {
    this.ready = true;
    this.rearm();
  }

  dispose() {
    this.ready = false;
    this.clearTimers();
  }

  isSupported() {
    return typeof this.Notification?.isSupported === "function"
      ? this.Notification.isSupported()
      : true;
  }

  normalizeEntry(entry = {}) {
    const reminderAt = Number(entry.reminderAt);
    const key = String(entry.key || "").trim();
    if (!key || !Number.isFinite(reminderAt) || reminderAt <= 0) {
      return null;
    }

    return {
      key,
      title:
        String(entry.title || this.getDefaultReminderTitle()).trim() ||
        this.getDefaultReminderTitle(),
      message: String(entry.message || "").trim(),
      reminderAt: Math.round(reminderAt),
      page: String(entry.page || "plan").trim() || "plan",
      action: String(entry.action || "").trim(),
      source: String(entry.source || "desktop-reminder").trim() || "desktop-reminder",
      payload:
        entry.payload && typeof entry.payload === "object" && !Array.isArray(entry.payload)
          ? { ...entry.payload }
          : {},
    };
  }

  normalizeEntries(entries = []) {
    const byKey = new Map();
    const now = Date.now();
    for (const rawEntry of Array.isArray(entries) ? entries : []) {
      const entry = this.normalizeEntry(rawEntry);
      if (!entry || entry.reminderAt < now - STALE_GRACE_MS) {
        continue;
      }
      byKey.set(entry.key, entry);
    }
    return [...byKey.values()].sort(
      (left, right) => left.reminderAt - right.reminderAt,
    );
  }

  restorePersistedEntries() {
    try {
      if (!fs.existsSync(this.schedulePath)) {
        this.entries = [];
        return;
      }
      const raw = fs.readFileSync(this.schedulePath, "utf8");
      const parsed = JSON.parse(raw);
      this.entries = this.normalizeEntries(parsed?.entries || []);
    } catch (error) {
      console.error("读取桌面提醒计划失败:", error);
      this.entries = [];
    }
  }

  persistEntries() {
    try {
      fs.ensureDirSync(path.dirname(this.schedulePath));
      fs.writeFileSync(
        this.schedulePath,
        JSON.stringify({ entries: this.entries }, null, 2),
        "utf8",
      );
    } catch (error) {
      console.error("写入桌面提醒计划失败:", error);
    }
  }

  clearTimers() {
    this.entryTimers.forEach((timerId) => {
      clearTimeout(timerId);
    });
    this.entryTimers.clear();
    if (this.rearmTimer) {
      clearTimeout(this.rearmTimer);
      this.rearmTimer = null;
    }
  }

  scheduleRearm() {
    if (this.rearmTimer) {
      clearTimeout(this.rearmTimer);
    }
    this.rearmTimer = setTimeout(() => {
      this.rearmTimer = null;
      this.rearm();
    }, REARM_INTERVAL_MS);
  }

  consumeEntry(entryKey) {
    const nextEntries = this.entries.filter((entry) => entry.key !== entryKey);
    if (nextEntries.length === this.entries.length) {
      return;
    }
    this.entries = nextEntries;
    this.persistEntries();
  }

  dispatchEntry(entry) {
    if (!this.ready || !this.isSupported()) {
      return false;
    }

    this.consumeEntry(entry.key);

    try {
      const notification = new this.Notification({
        title: entry.title || this.getDefaultReminderTitle(),
        body: entry.message || "",
        silent: false,
      });
      notification.on("click", () => {
        if (!this.openMainActionHandler) {
          return;
        }
        Promise.resolve(
          this.openMainActionHandler({
            page: entry.page || "plan",
            action: entry.action || "",
            source: entry.source || "desktop-reminder",
            payload: entry.payload || {},
            reminderKey: entry.key,
          }),
        ).catch((error) => {
          console.error("处理桌面提醒点击失败:", error);
        });
      });
      notification.show();
      return true;
    } catch (error) {
      console.error("发送桌面提醒失败:", error);
      return false;
    }
  }

  rearm() {
    this.clearTimers();
    if (!this.ready || !this.isSupported()) {
      return;
    }

    const now = Date.now();
    const dueEntries = [];

    for (const entry of this.entries) {
      const delay = entry.reminderAt - now;
      if (delay <= 0) {
        dueEntries.push(entry);
        continue;
      }
      if (delay > MAX_TIMEOUT_MS) {
        continue;
      }
      const timerId = setTimeout(() => {
        this.entryTimers.delete(entry.key);
        this.dispatchEntry(entry);
      }, delay);
      this.entryTimers.set(entry.key, timerId);
    }

    if (this.entries.length > 0) {
      this.scheduleRearm();
    }

    for (const entry of dueEntries) {
      this.dispatchEntry(entry);
    }
  }

  requestPermission() {
    const supported = this.isSupported();
    return {
      supported,
      granted: supported,
      asked: false,
      platform: process.platform,
      mode: "electron-main",
    };
  }

  sync(payload = {}) {
    this.entries = this.normalizeEntries(payload?.entries || []);
    this.persistEntries();
    this.rearm();
    return {
      ok: true,
      supported: this.isSupported(),
      scheduledCount: this.entries.length,
      platform: process.platform,
      mode: "electron-main",
    };
  }
}

module.exports = DesktopNotificationScheduler;
