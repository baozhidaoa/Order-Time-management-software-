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
    plan: {
      id: GUIDE_CARD_IDS.plan,
      title: "快速上手",
      items: [
        "右滑可见计划页面。",
        "待办适合跟踪要做的事。",
        "打卡适合每天或每周重复的习惯。",
      ],
    },
    diary: {
      id: GUIDE_CARD_IDS.diary,
      title: "快速上手",
      items: [
        "点日期或已有条目都可以开始写。",
        "标题和正文至少写一项。",
        "分类可选，不分也能保存。",
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
    const createdAt = new Date(now).toISOString();
    const diarySpecs = [
      {
        id: "guide-entry-import-backup",
        title: GUIDE_DIARY_TITLES[0],
        offsetDays: 0,
        content: [
          "想完整备份当前全部数据：用“全部分片 ZIP 导出”。它会把 bundle-manifest.json、core.json、plans-recurring.json 和全部月分片一起打包。",
          "换电脑或换手机，想完整恢复：用“导入数据”选择整包文件，再选“整包替换当前数据”。这样当前设备会完全变成导入源那份数据。（是将其中的数据导入到该软件的存储处，而不是使用导入的那份文件！）",
          "如果当前机器里已经有数据，不确定会不会覆盖掉：先导出一份整包 ZIP 备份，再决定导入模式。",
          "记住一句话：整包替换会清掉未导入内容；差异导入不会。",
        ].join("\n"),
      },
      {
        id: "guide-entry-directory-bundle",
        title: GUIDE_DIARY_TITLES[1],
        offsetDays: -1,
        content: [
          "现在的实时存储不是一个越存越大的单 JSON，而是一个目录里的多份 JSON，这叫目录 bundle。",
          "core.json 放项目、待办、打卡项、年度目标、日记分类这些核心数据；plans-recurring.json 单独放重复计划。",
          "records、diaryEntries、dailyCheckins、checkins、plans（一次性）会按月拆分，所以页面只读取当前时间范围命中的月份，不会每次都把全部历史一次性读出来。",
          "这样做的好处很直接：数据大时更快、更稳，也更适合安卓端和同步目录。",
          "如果你在单分区导出里只看到“记录”，通常不是功能没做完，而是当前只有记录这个 section 产生了月分片；核心数据和重复计划一直都在整包 ZIP 里。",
        ].join("\n"),
      },
      {
        id: "guide-entry-storage-scenarios",
        title: GUIDE_DIARY_TITLES[2],
        offsetDays: -2,
        content: [
          "场景 1：我换设备了，只想完整搬家。做法：先在旧设备导出整包 ZIP，再到新设备导入，并选择“整包替换当前数据”。",
          "场景 2：我现在这台机器里已经有数据，只想把另一份数据补进来。做法：用整包“差异导入（只替换有差异的单位）”。它不会删除未导入内容。",
          "场景 3：我只想补 2026-03 的记录。做法：导出或拿到那个 section 对应月份的单分区 JSON，再导入时选择“替换该月份分区”或“合并该月份分区”。",
          "场景 4：我误拿到一份不完整的数据，担心把现有内容冲掉。做法：不要用整包替换，先导出一份备份，再用差异导入。",
          "差异导入的逻辑是：核心区按字段替换；重复计划和月分片只处理导入源里出现的内容，并按 ID 或自然键逐条覆盖(每条记录都有一个专属id)；未命中的旧条目会保留。它不是按整天或整月整块替换。",
        ].join("\n"),
      },
    ];

    return diarySpecs.map((item) => ({
      id: item.id,
      date: formatDateText(shiftDate(now, item.offsetDays)),
      title: item.title,
      content: item.content,
      categoryId: "",
      createdAt,
      updatedAt: createdAt,
    }));
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
    const normalizedGuideState = normalizeGuideState(guideState);
    const dismissedGuideDiaryEntryIds = new Set(
      normalizedGuideState.dismissedGuideDiaryEntryIds,
    );
    const latestGuideEntries = buildGuideDiaryEntries(now).filter((entry) => {
      const guideDiaryEntryId = resolveGuideDiaryEntryId(entry, now);
      return (
        !guideDiaryEntryId ||
        !dismissedGuideDiaryEntryIds.has(guideDiaryEntryId)
      );
    });
    const latestGuideIds = new Set(
      latestGuideEntries
        .map((entry) => String(entry?.id || "").trim())
        .filter(Boolean),
    );
    const hasLegacyGuideEntries = sourceEntries.some((entry) =>
      LEGACY_GUIDE_DIARY_TITLES.includes(String(entry?.title || "").trim()) &&
      !dismissedGuideDiaryEntryIds.has(resolveGuideDiaryEntryId(entry, now)),
    );
    const currentGuideEntryCount = sourceEntries.filter((entry) => {
      const id = resolveGuideDiaryEntryId(entry, now);
      return id && latestGuideIds.has(id);
    }).length;

    if (
      !hasLegacyGuideEntries &&
      currentGuideEntryCount >= latestGuideEntries.length
    ) {
      return sourceEntries;
    }

    const retainedEntries = sourceEntries.filter(
      (entry) => !isStorageGuideDiaryEntry(entry),
    );
    return [...latestGuideEntries, ...retainedEntries];
  }

  function getGuideCard(pageKey) {
    const card = GUIDE_CARD_MAP[String(pageKey || "").trim()];
    return card ? cloneValue(card) : null;
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
