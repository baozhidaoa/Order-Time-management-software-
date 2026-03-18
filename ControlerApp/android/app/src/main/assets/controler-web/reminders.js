(() => {
  const uiTools = () => window.ControlerUI || null;
  const nativeBridge = () => window.ControlerNativeBridge || null;
  const POLL_INTERVAL_MS = 20 * 1000;
  const RECENT_LOOKBACK_MS = 90 * 1000;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const MINUTE_MS = 60 * 1000;
  const MAX_CUSTOM_OFFSET_DAYS = 30;
  const MAX_PLAN_BEFORE_MINUTES = 7 * 24 * 60;
  const REMINDER_SYNC_LOOKAHEAD_DAYS = 45;
  const REMINDER_SYNC_DEBOUNCE_MS = 600;
  const SHOWN_REMINDER_STORAGE_KEY = "__controler_shown_reminders__";
  const REMINDER_ALERT_CONFIRM_TEXT = "知道了";
  let pollTimer = null;
  let alertQueue = Promise.resolve();
  let lastPollAt = Date.now() - RECENT_LOOKBACK_MS;
  let shownReminderMap = loadShownReminderMap();
  let nativeReminderSyncTimer = 0;
  let lastNativeReminderScheduleSignature = "";

  function clampNumber(value, min, max, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(Math.max(parsed, min), max);
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function toDateText(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return "";
    }
    return [
      date.getFullYear(),
      pad2(date.getMonth() + 1),
      pad2(date.getDate()),
    ].join("-");
  }

  function toTimeText(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return "";
    }
    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  }

  function parseDateText(dateText) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateText || "").trim());
    if (!match) {
      return null;
    }
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const day = parseInt(match[3], 10);
    const date = new Date(year, month, day, 0, 0, 0, 0);
    if (
      Number.isNaN(date.getTime()) ||
      date.getFullYear() !== year ||
      date.getMonth() !== month ||
      date.getDate() !== day
    ) {
      return null;
    }
    return date;
  }

  function parseTimeParts(timeText, fallback = "09:00") {
    const normalizedText = String(timeText || fallback || "09:00").trim();
    const match = /^(\d{1,2}):(\d{2})$/.exec(normalizedText);
    if (!match) {
      return parseTimeParts(fallback, "09:00");
    }
    const hours = clampNumber(match[1], 0, 23, 9);
    const minutes = clampNumber(match[2], 0, 59, 0);
    return {
      hours,
      minutes,
      text: `${pad2(hours)}:${pad2(minutes)}`,
    };
  }

  function buildLocalDate(dateText, timeText = "00:00") {
    const baseDate = parseDateText(dateText);
    if (!baseDate) {
      return null;
    }
    const { hours, minutes } = parseTimeParts(timeText, "00:00");
    return new Date(
      baseDate.getFullYear(),
      baseDate.getMonth(),
      baseDate.getDate(),
      hours,
      minutes,
      0,
      0,
    );
  }

  function parseDateTimeLocalValue(value) {
    const normalized = String(value || "").trim();
    const match =
      /^(\d{4}-\d{2}-\d{2})[T\s](\d{1,2}:\d{2})$/.exec(normalized);
    if (!match) {
      return null;
    }
    return buildLocalDate(match[1], match[2]);
  }

  function addDays(date, dayOffset) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return null;
    }
    const next = new Date(date.getTime());
    next.setDate(next.getDate() + Number(dayOffset || 0));
    return next;
  }

  function diffCalendarDays(baseDateText, targetDateText) {
    const baseDate = parseDateText(baseDateText);
    const targetDate = parseDateText(targetDateText);
    if (!baseDate || !targetDate) {
      return 0;
    }
    const utcBase = Date.UTC(
      baseDate.getFullYear(),
      baseDate.getMonth(),
      baseDate.getDate(),
    );
    const utcTarget = Date.UTC(
      targetDate.getFullYear(),
      targetDate.getMonth(),
      targetDate.getDate(),
    );
    return Math.round((utcTarget - utcBase) / DAY_MS);
  }

  function ensureArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function getGlobalNotificationsEnabled() {
    return localStorage.getItem("notifications") !== "false";
  }

  function getElectronRuntime() {
    return window.electronAPI || null;
  }

  function getResolvedRuntimeMeta() {
    const electronAPI = getElectronRuntime();
    if (electronAPI?.runtimeMeta && typeof electronAPI.runtimeMeta === "object") {
      return electronAPI.runtimeMeta;
    }

    if (nativeBridge()?.isReactNativeApp) {
      return {
        runtime: "react-native",
        platform: nativeBridge()?.platform || "web",
        capabilities:
          nativeBridge()?.capabilities && typeof nativeBridge()?.capabilities === "object"
            ? nativeBridge().capabilities
            : {},
      };
    }

    const contract = window.ControlerPlatformContract || null;
    if (typeof contract?.getRuntimeProfile === "function") {
      return contract.getRuntimeProfile({
        isElectron: !!electronAPI?.isElectron,
        isReactNativeApp: !!nativeBridge()?.isReactNativeApp,
        platform:
          electronAPI?.platform ||
          nativeBridge()?.platform ||
          "web",
      });
    }

    return {
      runtime: electronAPI?.isElectron ? "electron" : "web",
      platform: electronAPI?.platform || nativeBridge()?.platform || "web",
      capabilities: {},
    };
  }

  function getRuntimeCapabilities() {
    const runtimeMeta = getResolvedRuntimeMeta();
    return runtimeMeta?.capabilities && typeof runtimeMeta.capabilities === "object"
      ? runtimeMeta.capabilities
      : {};
  }

  function hasNativeReminderSupport() {
    return !!getRuntimeCapabilities().nativeReminders;
  }

  function isAndroidNativeRuntime() {
    return (
      !!nativeBridge()?.isReactNativeApp &&
      nativeBridge()?.platform === "android"
    );
  }

  function normalizeBeforeMinutes(value, fallback = 15) {
    const safeFallback = clampNumber(fallback, 1, MAX_PLAN_BEFORE_MINUTES, 15);
    return clampNumber(value, 1, MAX_PLAN_BEFORE_MINUTES, safeFallback);
  }

  function normalizeOffsetDays(value, fallback = 0) {
    return clampNumber(
      value,
      -MAX_CUSTOM_OFFSET_DAYS,
      MAX_CUSTOM_OFFSET_DAYS,
      clampNumber(fallback, -MAX_CUSTOM_OFFSET_DAYS, MAX_CUSTOM_OFFSET_DAYS, 0),
    );
  }

  function inferReminderMode(rawValue, allowedModes, fallback = "none") {
    const rawMode = String(rawValue?.mode || "").trim();
    if (allowedModes.includes(rawMode)) {
      return rawMode;
    }
    if (rawValue?.enabled === false) {
      return "none";
    }
    if (allowedModes.includes("before_start") && rawValue?.minutesBefore != null) {
      return "before_start";
    }
    if (rawValue?.customTime) {
      return "custom";
    }
    return fallback;
  }

  function normalizePlanReminder(rawValue = {}, planLike = {}) {
    const reminder = rawValue && typeof rawValue === "object" ? rawValue : {};
    const mode = inferReminderMode(reminder, ["none", "before_start", "custom"]);
    const customTimeFallback = parseTimeParts(planLike?.startTime || "09:00", "09:00").text;
    return {
      enabled: mode !== "none" && reminder.enabled !== false,
      mode,
      minutesBefore: normalizeBeforeMinutes(reminder.minutesBefore, 15),
      customTime: parseTimeParts(reminder.customTime || customTimeFallback, customTimeFallback)
        .text,
      customOffsetDays: normalizeOffsetDays(reminder.customOffsetDays, 0),
    };
  }

  function normalizeTodoReminder(rawValue = {}, todoLike = {}) {
    const reminder = rawValue && typeof rawValue === "object" ? rawValue : {};
    const mode = inferReminderMode(reminder, ["none", "custom"]);
    const customTimeFallback = parseTimeParts(
      reminder.customTime ||
        (todoLike?.repeatType && todoLike.repeatType !== "none" ? "09:00" : "09:00"),
      "09:00",
    ).text;
    return {
      enabled: mode !== "none" && reminder.enabled !== false,
      mode,
      customTime: customTimeFallback,
      customOffsetDays: normalizeOffsetDays(reminder.customOffsetDays, 0),
    };
  }

  function normalizeCheckinReminder(rawValue = {}, itemLike = {}) {
    const reminder = rawValue && typeof rawValue === "object" ? rawValue : {};
    const mode = inferReminderMode(reminder, ["none", "custom"]);
    const customTimeFallback = parseTimeParts(
      reminder.customTime || itemLike?.customTime || "09:00",
      "09:00",
    ).text;
    return {
      enabled: mode !== "none" && reminder.enabled !== false,
      mode,
      customTime: customTimeFallback,
      customOffsetDays: 0,
    };
  }

  function parseRelativeCustomDateTimeInput(
    rawValue,
    baseDateText,
    options = {},
  ) {
    const {
      fallbackTime = "09:00",
      fallbackOffsetDays = 0,
      forceZeroOffset = false,
    } = options;
    const parsedDate = parseDateTimeLocalValue(rawValue);
    if (!parsedDate) {
      return {
        customTime: parseTimeParts(fallbackTime, "09:00").text,
        customOffsetDays: forceZeroOffset
          ? 0
          : normalizeOffsetDays(fallbackOffsetDays, 0),
      };
    }

    const parsedDateText = toDateText(parsedDate);
    return {
      customTime: toTimeText(parsedDate),
      customOffsetDays: forceZeroOffset
        ? 0
        : normalizeOffsetDays(diffCalendarDays(baseDateText, parsedDateText), 0),
    };
  }

  function buildRelativeCustomDateTimeValue(
    baseDateText,
    reminderConfig,
    fallbackTime = "09:00",
  ) {
    const baseDate = parseDateText(baseDateText) || new Date();
    const offsetDate = addDays(
      baseDate,
      normalizeOffsetDays(reminderConfig?.customOffsetDays, 0),
    );
    const dateText = toDateText(offsetDate);
    const timeText = parseTimeParts(
      reminderConfig?.customTime || fallbackTime,
      fallbackTime,
    ).text;
    return dateText ? `${dateText}T${timeText}` : "";
  }

  function formatReminderDateTime(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return "";
    }
    return `${toDateText(date)} ${toTimeText(date)}`;
  }

  function describeOffsetDays(dayOffset) {
    const safeOffset = normalizeOffsetDays(dayOffset, 0);
    if (safeOffset === 0) {
      return "当天";
    }
    if (safeOffset < 0) {
      return `提前 ${Math.abs(safeOffset)} 天`;
    }
    return `延后 ${safeOffset} 天`;
  }

  function describePlanReminder(planLike = {}, occurrenceDateText = null) {
    const reminder = normalizePlanReminder(planLike.notification, planLike);
    if (!reminder.enabled || reminder.mode === "none") {
      return "不通知";
    }
    const reminderDate = occurrenceDateText
      ? getPlanReminderDate(planLike, occurrenceDateText)
      : null;
    if (reminder.mode === "before_start") {
      return reminderDate
        ? `开始前 ${reminder.minutesBefore} 分钟（本次 ${formatReminderDateTime(reminderDate)}）`
        : `开始前 ${reminder.minutesBefore} 分钟`;
    }
    if (reminderDate) {
      return `自定义时间（本次 ${formatReminderDateTime(reminderDate)}）`;
    }
    return `自定义时间 ${describeOffsetDays(reminder.customOffsetDays)} ${reminder.customTime}`;
  }

  function describeTodoReminder(todoLike = {}, occurrenceDateText = null) {
    const reminder = normalizeTodoReminder(todoLike.notification, todoLike);
    if (!reminder.enabled || reminder.mode === "none") {
      return "不通知";
    }
    const reminderDate = occurrenceDateText
      ? getTodoReminderDate(todoLike, occurrenceDateText)
      : null;
    if (reminderDate) {
      return `自定义时间（本次 ${formatReminderDateTime(reminderDate)}）`;
    }
    return `自定义时间 ${describeOffsetDays(reminder.customOffsetDays)} ${reminder.customTime}`;
  }

  function describeCheckinReminder(itemLike = {}, occurrenceDateText = null) {
    const reminder = normalizeCheckinReminder(itemLike.notification, itemLike);
    if (!reminder.enabled || reminder.mode === "none") {
      return "不通知";
    }
    const reminderDate = occurrenceDateText
      ? getCheckinReminderDate(itemLike, occurrenceDateText)
      : null;
    if (reminderDate) {
      return `自定义时间（本次 ${formatReminderDateTime(reminderDate)}）`;
    }
    return `自定义时间 ${reminder.customTime}`;
  }

  function normalizePlanRepeatDays(planLike = {}) {
    const days = ensureArray(planLike.repeatDays)
      .map((value) => parseInt(value, 10))
      .filter((value) => value >= 0 && value <= 6);
    if (days.length > 0) {
      return days;
    }
    const planDate = parseDateText(planLike.date);
    return planDate ? [planDate.getDay()] : [];
  }

  function planOccursOnDate(planLike = {}, occurrenceDateText = "") {
    if (!occurrenceDateText) {
      return false;
    }
    if (ensureArray(planLike.excludedDates).includes(occurrenceDateText)) {
      return false;
    }
    const planDateText = String(planLike.date || "").trim();
    if (!planDateText) {
      return false;
    }
    if (occurrenceDateText === planDateText) {
      return true;
    }
    if (occurrenceDateText < planDateText) {
      return false;
    }

    switch (String(planLike.repeat || "none")) {
      case "daily":
        return true;
      case "weekly": {
        const occurrenceDate = parseDateText(occurrenceDateText);
        return (
          !!occurrenceDate &&
          normalizePlanRepeatDays(planLike).includes(occurrenceDate.getDay())
        );
      }
      case "monthly": {
        const occurrenceDate = parseDateText(occurrenceDateText);
        const startDate = parseDateText(planDateText);
        return (
          !!occurrenceDate &&
          !!startDate &&
          occurrenceDate.getDate() === startDate.getDate()
        );
      }
      default:
        return false;
    }
  }

  function normalizeTodoRepeatDays(todoLike = {}) {
    const days = ensureArray(todoLike.repeatWeekdays)
      .map((value) => parseInt(value, 10))
      .filter((value) => value >= 0 && value <= 6);
    if (days.length > 0) {
      return days;
    }
    const startDate = parseDateText(todoLike.startDate || todoLike.dueDate || "");
    return startDate ? [startDate.getDay()] : [];
  }

  function todoOccursOnDate(todoLike = {}, occurrenceDateText = "") {
    if (!occurrenceDateText || todoLike.completed) {
      return false;
    }
    const repeatType = String(todoLike.repeatType || "none");
    if (repeatType === "none") {
      return occurrenceDateText === String(todoLike.dueDate || "");
    }

    const startDateText = String(
      todoLike.startDate || todoLike.dueDate || occurrenceDateText,
    );
    if (!startDateText || occurrenceDateText < startDateText) {
      return false;
    }

    const endDateText = String(todoLike.endDate || "");
    if (endDateText && occurrenceDateText > endDateText) {
      return false;
    }

    if (repeatType === "weekly") {
      const occurrenceDate = parseDateText(occurrenceDateText);
      return (
        !!occurrenceDate &&
        normalizeTodoRepeatDays(todoLike).includes(occurrenceDate.getDay())
      );
    }

    return true;
  }

  function normalizeCheckinRepeatDays(itemLike = {}) {
    const days = ensureArray(itemLike.repeatWeekdays)
      .map((value) => parseInt(value, 10))
      .filter((value) => value >= 0 && value <= 6);
    if (days.length > 0) {
      return days;
    }
    const startDate = parseDateText(itemLike.startDate || "");
    return startDate ? [startDate.getDay()] : [];
  }

  function checkinOccursOnDate(itemLike = {}, occurrenceDateText = "") {
    if (!occurrenceDateText) {
      return false;
    }
    const startDateText = String(itemLike.startDate || occurrenceDateText);
    if (occurrenceDateText < startDateText) {
      return false;
    }
    const endDateText = String(itemLike.endDate || "");
    if (endDateText && occurrenceDateText > endDateText) {
      return false;
    }

    if (String(itemLike.repeatType || "daily") === "weekly") {
      const occurrenceDate = parseDateText(occurrenceDateText);
      return (
        !!occurrenceDate &&
        normalizeCheckinRepeatDays(itemLike).includes(occurrenceDate.getDay())
      );
    }

    return true;
  }

  function getPlanReminderDate(planLike = {}, occurrenceDateText = "") {
    if (!occurrenceDateText || planLike.isCompleted) {
      return null;
    }
    const reminder = normalizePlanReminder(planLike.notification, planLike);
    if (!reminder.enabled || reminder.mode === "none") {
      return null;
    }
    if (reminder.mode === "before_start") {
      const startDate = buildLocalDate(
        occurrenceDateText,
        planLike.startTime || "09:00",
      );
      if (!startDate) {
        return null;
      }
      return new Date(startDate.getTime() - reminder.minutesBefore * MINUTE_MS);
    }

    const reminderDate = addDays(
      parseDateText(occurrenceDateText),
      reminder.customOffsetDays,
    );
    if (!reminderDate) {
      return null;
    }
    return buildLocalDate(toDateText(reminderDate), reminder.customTime);
  }

  function getTodoReminderDate(todoLike = {}, occurrenceDateText = "") {
    if (!occurrenceDateText || todoLike.completed) {
      return null;
    }
    const reminder = normalizeTodoReminder(todoLike.notification, todoLike);
    if (!reminder.enabled || reminder.mode === "none") {
      return null;
    }
    const reminderDate = addDays(
      parseDateText(occurrenceDateText),
      reminder.customOffsetDays,
    );
    if (!reminderDate) {
      return null;
    }
    return buildLocalDate(toDateText(reminderDate), reminder.customTime);
  }

  function hasCheckedCheckinOccurrence(
    occurrenceDateText,
    itemId,
    dailyCheckins = [],
  ) {
    return ensureArray(dailyCheckins).some(
      (entry) =>
        String(entry?.itemId || "") === String(itemId || "") &&
        entry?.date === occurrenceDateText &&
        !!entry?.checked,
    );
  }

  function getCheckinReminderDate(
    itemLike = {},
    occurrenceDateText = "",
    dailyCheckins = [],
  ) {
    if (
      !occurrenceDateText ||
      hasCheckedCheckinOccurrence(occurrenceDateText, itemLike.id, dailyCheckins)
    ) {
      return null;
    }
    const reminder = normalizeCheckinReminder(itemLike.notification, itemLike);
    if (!reminder.enabled || reminder.mode === "none") {
      return null;
    }
    return buildLocalDate(occurrenceDateText, reminder.customTime);
  }

  function safeJsonParse(rawValue, fallback) {
    if (rawValue && typeof rawValue === "object") {
      return rawValue;
    }
    if (typeof rawValue !== "string" || !rawValue.trim()) {
      return fallback;
    }
    try {
      return JSON.parse(rawValue);
    } catch (error) {
      return fallback;
    }
  }

  function readStateArray(key) {
    const value = safeJsonParse(localStorage.getItem(key), []);
    return Array.isArray(value) ? value : [];
  }

  function loadShownReminderMap() {
    const parsed = safeJsonParse(
      sessionStorage.getItem(SHOWN_REMINDER_STORAGE_KEY),
      {},
    );
    const next = new Map();
    if (parsed && typeof parsed === "object") {
      Object.keys(parsed).forEach((key) => {
        const timestamp = Number(parsed[key]);
        if (Number.isFinite(timestamp)) {
          next.set(key, timestamp);
        }
      });
    }
    return next;
  }

  function persistShownReminderMap() {
    const snapshot = {};
    shownReminderMap.forEach((timestamp, key) => {
      snapshot[key] = timestamp;
    });
    sessionStorage.setItem(
      SHOWN_REMINDER_STORAGE_KEY,
      JSON.stringify(snapshot),
    );
  }

  function pruneShownReminderMap(now = Date.now()) {
    let changed = false;
    shownReminderMap.forEach((timestamp, key) => {
      if (now - timestamp > 12 * 60 * 60 * 1000) {
        shownReminderMap.delete(key);
        changed = true;
      }
    });
    if (changed) {
      persistShownReminderMap();
    }
  }

  function rememberShownReminder(key, timestamp) {
    shownReminderMap.set(key, timestamp);
    persistShownReminderMap();
  }

  function buildDateScanWindow(windowStartMs, windowEndMs) {
    const startAnchor = parseDateText(toDateText(new Date(windowStartMs)));
    const endAnchor = parseDateText(toDateText(new Date(windowEndMs)));
    const scanStart = addDays(startAnchor || new Date(), -MAX_CUSTOM_OFFSET_DAYS);
    const scanEnd = addDays(endAnchor || new Date(), MAX_CUSTOM_OFFSET_DAYS);
    return {
      start: scanStart,
      end: scanEnd,
    };
  }

  function iterateDateTexts(startDate, endDate, callback) {
    if (!startDate || !endDate) {
      return;
    }
    const cursor = new Date(startDate.getTime());
    let loopGuard = 0;
    while (cursor <= endDate && loopGuard < 200) {
      callback(toDateText(cursor));
      cursor.setDate(cursor.getDate() + 1);
      loopGuard += 1;
    }
  }

  function buildPlanReminderPayload(planLike, occurrenceDateText, reminderDate) {
    const planName = String(planLike?.name || "未命名计划").trim();
    return {
      key: `plan:${planLike?.id || ""}:${occurrenceDateText}:${reminderDate.getTime()}`,
      type: "plan",
      reminderAt: reminderDate.getTime(),
      title: "计划提醒",
      message: `${planName} 将于 ${occurrenceDateText} ${planLike?.startTime || "09:00"} 开始`,
      page: "plan",
      action: "",
      source: "plan-reminder",
      payload: {
        itemType: "plan",
        itemId: String(planLike?.id || ""),
        occurrenceDate: occurrenceDateText,
      },
    };
  }

  function buildTodoReminderPayload(todoLike, occurrenceDateText, reminderDate) {
    const todoTitle = String(todoLike?.title || "未命名待办").trim();
    return {
      key: `todo:${todoLike?.id || ""}:${occurrenceDateText}:${reminderDate.getTime()}`,
      type: "todo",
      reminderAt: reminderDate.getTime(),
      title: "待办提醒",
      message: `${todoTitle} 计划于 ${occurrenceDateText} 提醒你处理`,
      page: "plan",
      action: "",
      source: "todo-reminder",
      payload: {
        itemType: "todo",
        itemId: String(todoLike?.id || ""),
        occurrenceDate: occurrenceDateText,
      },
    };
  }

  function buildCheckinReminderPayload(itemLike, occurrenceDateText, reminderDate) {
    const checkinTitle = String(itemLike?.title || "未命名打卡").trim();
    return {
      key: `checkin:${itemLike?.id || ""}:${occurrenceDateText}:${reminderDate.getTime()}`,
      type: "checkin",
      reminderAt: reminderDate.getTime(),
      title: "打卡提醒",
      message: `${checkinTitle} 到时间了，记得完成今天的打卡`,
      page: "plan",
      action: "",
      source: "checkin-reminder",
      payload: {
        itemType: "checkin",
        itemId: String(itemLike?.id || ""),
        occurrenceDate: occurrenceDateText,
      },
    };
  }

  function collectDueReminders(windowStartMs, windowEndMs) {
    const { start, end } = buildDateScanWindow(windowStartMs, windowEndMs);
    const state = {
      plans: readStateArray("plans"),
      todos: readStateArray("todos"),
      checkinItems: readStateArray("checkinItems"),
      dailyCheckins: readStateArray("dailyCheckins"),
    };
    const dueItems = [];

    ensureArray(state.plans).forEach((planLike) => {
      const normalizedReminder = normalizePlanReminder(
        planLike?.notification,
        planLike,
      );
      if (!normalizedReminder.enabled) {
        return;
      }
      iterateDateTexts(start, end, (occurrenceDateText) => {
        if (!planOccursOnDate(planLike, occurrenceDateText)) {
          return;
        }
        const reminderDate = getPlanReminderDate(planLike, occurrenceDateText);
        if (
          reminderDate &&
          reminderDate.getTime() >= windowStartMs &&
          reminderDate.getTime() <= windowEndMs
        ) {
          dueItems.push(
            buildPlanReminderPayload(planLike, occurrenceDateText, reminderDate),
          );
        }
      });
    });

    ensureArray(state.todos).forEach((todoLike) => {
      const normalizedReminder = normalizeTodoReminder(
        todoLike?.notification,
        todoLike,
      );
      if (!normalizedReminder.enabled) {
        return;
      }
      iterateDateTexts(start, end, (occurrenceDateText) => {
        if (!todoOccursOnDate(todoLike, occurrenceDateText)) {
          return;
        }
        const reminderDate = getTodoReminderDate(todoLike, occurrenceDateText);
        if (
          reminderDate &&
          reminderDate.getTime() >= windowStartMs &&
          reminderDate.getTime() <= windowEndMs
        ) {
          dueItems.push(
            buildTodoReminderPayload(todoLike, occurrenceDateText, reminderDate),
          );
        }
      });
    });

    ensureArray(state.checkinItems).forEach((itemLike) => {
      const normalizedReminder = normalizeCheckinReminder(
        itemLike?.notification,
        itemLike,
      );
      if (!normalizedReminder.enabled) {
        return;
      }
      iterateDateTexts(start, end, (occurrenceDateText) => {
        if (!checkinOccursOnDate(itemLike, occurrenceDateText)) {
          return;
        }
        const reminderDate = getCheckinReminderDate(
          itemLike,
          occurrenceDateText,
          state.dailyCheckins,
        );
        if (
          reminderDate &&
          reminderDate.getTime() >= windowStartMs &&
          reminderDate.getTime() <= windowEndMs
        ) {
          dueItems.push(
            buildCheckinReminderPayload(itemLike, occurrenceDateText, reminderDate),
          );
        }
      });
    });

    dueItems.sort((left, right) => left.reminderAt - right.reminderAt);
    return dueItems;
  }

  function buildFutureReminderSchedule() {
    const now = Date.now();
    const dueItems = collectDueReminders(
      now - RECENT_LOOKBACK_MS,
      now + REMINDER_SYNC_LOOKAHEAD_DAYS * DAY_MS,
    );
    return dueItems.filter((item) => item.reminderAt >= now - RECENT_LOOKBACK_MS);
  }

  function buildNativeReminderSchedulePayload() {
    return {
      generatedAt: Date.now(),
      lookaheadDays: REMINDER_SYNC_LOOKAHEAD_DAYS,
      notificationsEnabled: getGlobalNotificationsEnabled(),
      entries: getGlobalNotificationsEnabled() ? buildFutureReminderSchedule() : [],
    };
  }

  function getNativeReminderScheduleSignature(payload = {}) {
    try {
      return JSON.stringify({
        notificationsEnabled: payload.notificationsEnabled !== false,
        entries: (Array.isArray(payload.entries) ? payload.entries : []).map((item) => ({
          key: item.key,
          reminderAt: item.reminderAt,
          page: item.page || "",
          action: item.action || "",
        })),
      });
    } catch (error) {
      return "";
    }
  }

  async function syncNativeReminderSchedule(options = {}) {
    const { force = false } = options;
    if (!hasNativeReminderSupport()) {
      return {
        ok: false,
        supported: false,
      };
    }

    const payload = buildNativeReminderSchedulePayload();
    const signature = getNativeReminderScheduleSignature(payload);
    if (!force && signature && signature === lastNativeReminderScheduleSignature) {
      return {
        ok: true,
        supported: true,
        skipped: true,
      };
    }

    const electronAPI = getElectronRuntime();
    try {
      let result = null;
      if (typeof nativeBridge()?.call === "function") {
        result = await nativeBridge().call("notifications.syncSchedule", payload);
      } else if (typeof electronAPI?.notificationsSyncSchedule === "function") {
        result = await electronAPI.notificationsSyncSchedule(payload);
      }
      if (result?.ok !== false && signature) {
        lastNativeReminderScheduleSignature = signature;
      }
      return result && typeof result === "object"
        ? result
        : {
            ok: true,
            supported: true,
          };
    } catch (error) {
      console.error("同步原生提醒计划失败:", error);
      return {
        ok: false,
        supported: true,
        message: error?.message || String(error),
      };
    }
  }

  function scheduleNativeReminderSync(options = {}) {
    const { force = false, immediate = false } = options;
    window.clearTimeout(nativeReminderSyncTimer);
    nativeReminderSyncTimer = window.setTimeout(() => {
      nativeReminderSyncTimer = 0;
      void syncNativeReminderSchedule({ force });
    }, immediate ? 0 : REMINDER_SYNC_DEBOUNCE_MS);
  }

  async function showThemedReminderAlert(reminderPayload) {
    const tools = uiTools();
    const openAlert = async () => {
      if (typeof tools?.alertDialog === "function") {
        await tools.alertDialog({
          title: reminderPayload.title || "提醒",
          message: reminderPayload.message || "",
          confirmText: REMINDER_ALERT_CONFIRM_TEXT,
        });
        return;
      }
      alert(reminderPayload.message || reminderPayload.title || "提醒");
    };

    alertQueue = alertQueue.then(openAlert).catch((error) => {
      console.error("展示提醒弹窗失败:", error);
    });
    return alertQueue;
  }

  async function dispatchReminder(reminderPayload) {
    if (!reminderPayload) {
      return false;
    }

    const permission = await ensurePermission({ interactive: false });
    if (
      permission.granted &&
      typeof Notification === "function" &&
      !hasNativeReminderSupport()
    ) {
      const notification = new Notification(reminderPayload.title || "提醒", {
        body: reminderPayload.message || "",
        tag: reminderPayload.key,
        renotify: true,
      });
      window.setTimeout(() => {
        notification.close();
      }, 12 * 1000);
      return true;
    }

    if (document.visibilityState === "visible") {
      await showThemedReminderAlert(reminderPayload);
      return true;
    }

    return false;
  }

  async function ensurePermission(options = {}) {
    const { interactive = false } = options;

    if (hasNativeReminderSupport()) {
      try {
        if (typeof nativeBridge()?.call === "function") {
          const payload = await nativeBridge().call(
            "notifications.requestPermission",
            {
              interactive,
            },
          );
          const result = payload && typeof payload === "object" ? payload : {};
          return {
            supported: result.supported !== false,
            granted: !!result.granted,
            asked: !!result.asked,
            platform: nativeBridge()?.platform || "native",
          };
        }

        if (typeof getElectronRuntime()?.notificationsRequestPermission === "function") {
          const payload = await getElectronRuntime().notificationsRequestPermission({
            interactive,
          });
          const result = payload && typeof payload === "object" ? payload : {};
          return {
            supported: result.supported !== false,
            granted: result.granted !== false,
            asked: !!result.asked,
            platform: getElectronRuntime()?.platform || "desktop",
          };
        }
      } catch (error) {
        console.error("请求原生通知权限失败:", error);
        return {
          supported: false,
          granted: false,
          asked: false,
          platform: getResolvedRuntimeMeta()?.platform || "native",
        };
      }
    }

    if (typeof Notification === "undefined") {
      return {
        supported: false,
        granted: false,
        asked: false,
        platform: "web",
      };
    }

    if (Notification.permission === "granted") {
      return {
        supported: true,
        granted: true,
        asked: false,
        platform: "web",
      };
    }

    if (!interactive) {
      return {
        supported: true,
        granted: false,
        asked: false,
        platform: "web",
      };
    }

    try {
      const permission = await Notification.requestPermission();
      return {
        supported: true,
        granted: permission === "granted",
        asked: true,
        platform: "web",
      };
    } catch (error) {
      console.error("请求浏览器通知权限失败:", error);
      return {
        supported: true,
        granted: false,
        asked: true,
        platform: "web",
      };
    }
  }

  async function requestPermissionIfNeeded(
    reminderType,
    reminderConfig,
    options = {},
  ) {
    const { silentWhenDisabled = true } = options;
    const enabled =
      reminderConfig &&
      typeof reminderConfig === "object" &&
      reminderConfig.enabled &&
      reminderConfig.mode !== "none";

    if (!enabled) {
      return {
        supported: true,
        granted: true,
        asked: false,
      };
    }

    if (!getGlobalNotificationsEnabled()) {
      return {
        supported: true,
        granted: false,
        asked: false,
      };
    }

    const result = await ensurePermission({ interactive: true });
    if (!result.supported) {
      return result;
    }

    if (!result.granted && !silentWhenDisabled) {
      await showThemedReminderAlert({
        title: `${reminderType || "提醒"}通知未启用`,
        message: "系统通知权限尚未开启，当前提醒设置会被保存，但可能不会弹出系统通知。",
      });
    }

    return result;
  }

  async function pollReminders(options = {}) {
    const { resetWindow = false } = options;
    if (hasNativeReminderSupport() || !getGlobalNotificationsEnabled()) {
      lastPollAt = Date.now();
      return;
    }

    const now = Date.now();
    pruneShownReminderMap(now);
    const windowStartMs = resetWindow
      ? now - RECENT_LOOKBACK_MS
      : lastPollAt - 1500;
    const windowEndMs = now + 1500;
    lastPollAt = now;

    const dueItems = collectDueReminders(windowStartMs, windowEndMs);
    for (const reminderPayload of dueItems) {
      if (shownReminderMap.has(reminderPayload.key)) {
        continue;
      }
      rememberShownReminder(reminderPayload.key, now);
      await dispatchReminder(reminderPayload);
    }
  }

  function refresh(options = {}) {
    const { resetWindow = false } = options;
    if (resetWindow) {
      lastPollAt = Date.now() - RECENT_LOOKBACK_MS;
    }
    void pollReminders({ resetWindow });
  }

  function shouldUseContinuousPolling() {
    return !hasNativeReminderSupport() && getGlobalNotificationsEnabled();
  }

  function startPolling(options = {}) {
    const { resetWindow = true } = options;
    if (pollTimer) {
      if (resetWindow) {
        refresh({ resetWindow: true });
      }
      return;
    }
    pollTimer = window.setInterval(() => {
      void pollReminders();
    }, POLL_INTERVAL_MS);
    if (resetWindow) {
      refresh({ resetWindow: true });
    }
  }

  function stopPolling() {
    if (!pollTimer) {
      return;
    }
    window.clearInterval(pollTimer);
    pollTimer = null;
  }

  function syncPollingState(options = {}) {
    const { resetWindow = false } = options;
    if (shouldUseContinuousPolling()) {
      startPolling({ resetWindow });
      return;
    }

    stopPolling();
    if (resetWindow) {
      refresh({ resetWindow: true });
    }
  }

  function bindLifecycle() {
    window.addEventListener("storage", () => {
      syncPollingState({ resetWindow: true });
      scheduleNativeReminderSync({ force: true });
    });
    window.addEventListener("controler:storage-data-changed", () => {
      syncPollingState({ resetWindow: true });
      scheduleNativeReminderSync({ force: true });
    });
    window.addEventListener("controler:native-app-resume", () => {
      syncPollingState({ resetWindow: true });
      scheduleNativeReminderSync({ force: true });
    });
    window.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        syncPollingState({ resetWindow: true });
        scheduleNativeReminderSync({ force: true });
      }
    });
    window.addEventListener("beforeunload", () => {
      stopPolling();
      window.clearTimeout(nativeReminderSyncTimer);
    });
  }

  window.ControlerReminders = {
    MAX_CUSTOM_OFFSET_DAYS,
    MAX_PLAN_BEFORE_MINUTES,
    ensurePermission,
    requestPermissionIfNeeded,
    refresh,
    syncNativeSchedule: syncNativeReminderSchedule,
    getGlobalNotificationsEnabled,
    normalizePlanReminder,
    normalizeTodoReminder,
    normalizeCheckinReminder,
    parseRelativeCustomDateTimeInput,
    buildRelativeCustomDateTimeValue,
    getPlanReminderDate,
    getTodoReminderDate,
    getCheckinReminderDate,
    describePlanReminder,
    describeTodoReminder,
    describeCheckinReminder,
    planOccursOnDate,
    todoOccursOnDate,
    checkinOccursOnDate,
    formatReminderDateTime,
    toDateText,
    toTimeText,
  };

  bindLifecycle();
  syncPollingState({ resetWindow: true });
  scheduleNativeReminderSync({ force: true, immediate: true });
})();
