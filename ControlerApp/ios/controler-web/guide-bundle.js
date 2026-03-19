(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }
  root.ControlerGuideBundle = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const GUIDE_BUNDLE_VERSION = 2;
  const GUIDE_STATE_STORAGE_KEY = "guideState";
  const GUIDE_CARD_IDS = Object.freeze({
    record: "guide-card-record",
    plan: "guide-card-plan",
    diary: "guide-card-diary",
    widget: "guide-card-widget",
  });
  const GUIDE_CARD_MAP = Object.freeze({
    record: {
      id: GUIDE_CARD_IDS.record,
      title: "快速上手",
      items: [
        "先创建项目，再开始或结束计时。",
        "第一次计时时可以不输入下一个项目，一次计时结束后会自动形成记录。",
        "统计页会直接读取这些记录。",
        "长按项目拖至目标项目可移动位置或改变分级。",
        "改变创建项目名称，以前所有记录的名称都会跟着改变",
        "创建项目不可同名,改变名称时同名是合并，所有记录合并至目标名称，并删除被改项目",
        "一级二级项目双击折叠收起；项目列表单击（饼状图和折线图处也是）。",
        "单击记录编辑，仅最后一次记录的删除可以回滚时间（可重复）。",
        "其余的只能于统计页面的表格视图中双击编辑名称或删除，不可改变时间。",
        "所有视图均可放大",
      ],
    },
    widget: {
      id: GUIDE_CARD_IDS.widget,
      title: "快速上手",
      items: [
        "先选要放到桌面的组件类型。",
        "添加后可在桌面调整位置和大小。",
        "若是该处无法添加至桌面（安卓端），则通过手机系统的插件功能添加。",
      ],
    },
  });
  const GUIDE_DIARY_TITLES = Object.freeze([
    "导入和导出到底怎么选",
    "为什么现在是一个目录里的多份 JSON",
    "换设备 / 合并数据 / 只补一个月数据时该怎么做",
  ]);
  const LEGACY_GUIDE_DIARY_TITLES = Object.freeze([
    "数据导入与备份",
    "同步 JSON 文件怎么选",
    "双端同步（需要时再看）",
  ]);
  const GUIDE_BUSINESS_ARRAY_KEYS = Object.freeze([
    "projects",
    "records",
    "plans",
    "todos",
    "checkinItems",
    "dailyCheckins",
    "checkins",
    "diaryEntries",
    "diaryCategories",
  ]);

  function cloneValue(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function isNonEmptyPlainObject(value) {
    return (
      !!value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length > 0
    );
  }

  function normalizeGuideIdList(values) {
    return Array.isArray(values)
      ? values
          .map((value) => String(value || "").trim())
          .filter(
            (value, index, list) => value && list.indexOf(value) === index,
          )
      : [];
  }

  function getDefaultGuideState() {
    return {
      bundleVersion: GUIDE_BUNDLE_VERSION,
      dismissedCardIds: [],
      dismissedGuideDiaryEntryIds: [],
    };
  }

  function normalizeGuideState(rawState) {
    const source =
      rawState && typeof rawState === "object" && !Array.isArray(rawState)
        ? rawState
        : {};
    const dismissedCardIds = normalizeGuideIdList(source.dismissedCardIds);
    const dismissedGuideDiaryEntryIds = normalizeGuideIdList(
      source.dismissedGuideDiaryEntryIds || source.dismissedDiaryEntryIds,
    );

    return {
      bundleVersion: GUIDE_BUNDLE_VERSION,
      dismissedCardIds,
      dismissedGuideDiaryEntryIds,
    };
  }

  function formatDateText(dateValue) {
    const year = dateValue.getFullYear();
    const month = String(dateValue.getMonth() + 1).padStart(2, "0");
    const day = String(dateValue.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function shiftDate(baseDate, offsetDays) {
    const nextDate = new Date(baseDate);
    nextDate.setDate(nextDate.getDate() + offsetDays);
    return nextDate;
  }

  function buildGuideDiaryEntries(now = new Date()) {
    return [];
  }

  function createGuideSeed(now = new Date()) {
    return {
      guideState: getDefaultGuideState(),
      diaryEntries: buildGuideDiaryEntries(now),
      diaryCategories: [],
    };
  }

  function isStorageGuideDiaryEntry(entry) {
    const id = String(entry?.id || "").trim();
    const title = String(entry?.title || "").trim();
    if (id.startsWith("guide-entry-")) {
      return true;
    }
    return (
      GUIDE_DIARY_TITLES.includes(title) ||
      LEGACY_GUIDE_DIARY_TITLES.includes(title)
    );
  }

  function resolveGuideDiaryEntryId(entry, now = new Date()) {
    const latestGuideEntries = buildGuideDiaryEntries(now);
    const entryId =
      typeof entry === "string" ? String(entry || "").trim() : String(entry?.id || "").trim();
    const entryTitle =
      typeof entry === "string"
        ? String(entry || "").trim()
        : String(entry?.title || "").trim();

    if (entryId) {
      const matchedById = latestGuideEntries.find(
        (guideEntry) => String(guideEntry?.id || "").trim() === entryId,
      );
      if (matchedById?.id) {
        return String(matchedById.id).trim();
      }
    }

    if (entryTitle) {
      const matchedByTitle = latestGuideEntries.find(
        (guideEntry) => String(guideEntry?.title || "").trim() === entryTitle,
      );
      if (matchedByTitle?.id) {
        return String(matchedByTitle.id).trim();
      }
      const legacyIndex = LEGACY_GUIDE_DIARY_TITLES.indexOf(entryTitle);
      if (legacyIndex >= 0 && latestGuideEntries[legacyIndex]?.id) {
        return String(latestGuideEntries[legacyIndex].id).trim();
      }
    }

    return "";
  }

  function dismissGuideDiaryEntry(rawState, entry, now = new Date()) {
    const currentState = normalizeGuideState(rawState);
    const guideDiaryEntryId = resolveGuideDiaryEntryId(entry, now);
    if (
      !guideDiaryEntryId ||
      currentState.dismissedGuideDiaryEntryIds.includes(guideDiaryEntryId)
    ) {
      return currentState;
    }

    return normalizeGuideState({
      ...currentState,
      dismissedGuideDiaryEntryIds: [
        ...currentState.dismissedGuideDiaryEntryIds,
        guideDiaryEntryId,
      ],
    });
  }

  function synchronizeGuideDiaryEntries(
    entries = [],
    now = new Date(),
    guideState = null,
  ) {
    const sourceEntries = Array.isArray(entries) ? entries : [];
    const retainedEntries = sourceEntries.filter(
      (entry) => !isStorageGuideDiaryEntry(entry),
    );
    if (retainedEntries.length === sourceEntries.length) {
      return sourceEntries;
    }
    return retainedEntries;
  }

  function getGuideCard(pageKey) {
    void pageKey;
    return null;
  }

  function hasMeaningfulBusinessData(rawState) {
    if (!rawState || typeof rawState !== "object" || Array.isArray(rawState)) {
      return false;
    }

    if (
      GUIDE_BUSINESS_ARRAY_KEYS.some(
        (key) => Array.isArray(rawState[key]) && rawState[key].length > 0,
      )
    ) {
      return true;
    }

    return isNonEmptyPlainObject(rawState.yearlyGoals);
  }

  function shouldSeedGuideBundle(rawState) {
    if (!rawState || typeof rawState !== "object" || Array.isArray(rawState)) {
      return true;
    }

    if (rawState.guideState && typeof rawState.guideState === "object") {
      return false;
    }

    return !hasMeaningfulBusinessData(rawState);
  }

  return {
    GUIDE_BUNDLE_VERSION,
    GUIDE_STATE_STORAGE_KEY,
    GUIDE_CARD_IDS,
    GUIDE_DIARY_TITLES,
    getDefaultGuideState,
    normalizeGuideState,
    buildGuideDiaryEntries,
    createGuideSeed,
    getGuideCard,
    isStorageGuideDiaryEntry,
    resolveGuideDiaryEntryId,
    dismissGuideDiaryEntry,
    synchronizeGuideDiaryEntries,
    shouldSeedGuideBundle,
  };
});
