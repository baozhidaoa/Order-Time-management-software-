(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }
  root.ControlerIndexRecordPersistence = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function ensureArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function cloneValue(value) {
    if (value === null || value === undefined) {
      return value;
    }
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      return value;
    }
  }

  function normalizePeriodId(value) {
    const normalized = String(value || "").trim();
    return normalized || "";
  }

  function normalizeRecordLoadMode(mode) {
    return String(mode || "").trim() === "full-history"
      ? "full-history"
      : "recent-range";
  }

  function getRecordPeriodId(record = {}) {
    const anchor =
      record?.endTime || record?.timestamp || record?.startTime || "";
    return /^\d{4}-\d{2}/.test(anchor) ? anchor.slice(0, 7) : "undated";
  }

  function getRecordPeriodIds(items = [], options = {}) {
    const resolvePeriodId =
      typeof options.getPeriodId === "function"
        ? options.getPeriodId
        : getRecordPeriodId;
    return Array.from(
      new Set(
        ensureArray(items)
          .map((item) => normalizePeriodId(resolvePeriodId(item) || "undated"))
          .filter(Boolean),
      ),
    );
  }

  function buildRecordMergeKey(record = {}) {
    const recordId = String(record?.id || "").trim();
    if (recordId) {
      return `id:${recordId}`;
    }
    return [
      record?.projectId || "",
      record?.name || "",
      record?.startTime || "",
      record?.endTime || "",
      record?.timestamp || "",
      record?.spendtime || "",
    ].join("|");
  }

  function compareRecordDates(left, right) {
    const leftText = String(
      left?.endTime || left?.timestamp || left?.startTime || "",
    ).trim();
    const rightText = String(
      right?.endTime || right?.timestamp || right?.startTime || "",
    ).trim();
    const leftTime = leftText ? Date.parse(leftText) || 0 : 0;
    const rightTime = rightText ? Date.parse(rightText) || 0 : 0;
    return leftTime - rightTime;
  }

  function sortRecordItems(items = []) {
    return ensureArray(items).slice().sort(compareRecordDates);
  }

  function mergeRecordItemsByPeriods(
    existingItems = [],
    incomingItems = [],
    periodIds = [],
    options = {},
  ) {
    const resolvePeriodId =
      typeof options.getPeriodId === "function"
        ? options.getPeriodId
        : getRecordPeriodId;
    const targetPeriods = new Set(
      ensureArray(periodIds)
        .map((periodId) => normalizePeriodId(periodId))
        .filter(Boolean),
    );
    if (!targetPeriods.size) {
      return ensureArray(incomingItems).slice();
    }
    const preserved = ensureArray(existingItems).filter(
      (item) => !targetPeriods.has(resolvePeriodId(item)),
    );
    return [...preserved, ...ensureArray(incomingItems)];
  }

  function groupRecordsByPeriod(items = [], options = {}) {
    const resolvePeriodId =
      typeof options.getPeriodId === "function"
        ? options.getPeriodId
        : getRecordPeriodId;
    const clone =
      typeof options.cloneValue === "function" ? options.cloneValue : cloneValue;
    const grouped = new Map();
    ensureArray(items).forEach((item) => {
      const periodId = normalizePeriodId(resolvePeriodId(item) || "undated");
      if (!periodId) {
        return;
      }
      if (!grouped.has(periodId)) {
        grouped.set(periodId, []);
      }
      grouped.get(periodId).push(clone(item));
    });
    return grouped;
  }

  function applyRecordMutations(existingItems = [], mutations = {}, options = {}) {
    const buildMergeKey =
      typeof options.buildMergeKey === "function"
        ? options.buildMergeKey
        : buildRecordMergeKey;
    const sortItems =
      typeof options.sortItems === "function" ? options.sortItems : sortRecordItems;
    const clone =
      typeof options.cloneValue === "function" ? options.cloneValue : cloneValue;
    const merged = new Map();

    sortItems(ensureArray(existingItems)).forEach((item) => {
      merged.set(buildMergeKey(item), clone(item));
    });

    ensureArray(mutations?.removedItems).forEach((item) => {
      const mergeKey = buildMergeKey(item);
      if (mergeKey) {
        merged.delete(mergeKey);
      }
      const recordId = String(item?.id || "").trim();
      if (recordId) {
        merged.delete(`id:${recordId}`);
      }
    });

    ensureArray(mutations?.upserts).forEach((item) => {
      merged.set(buildMergeKey(item), clone(item));
    });

    return sortItems(Array.from(merged.values()));
  }

  function resolveRecordLoadResult(options = {}) {
    const mode = normalizeRecordLoadMode(options.mode);
    const existingItems = ensureArray(options.existingItems);
    const fallbackItems = ensureArray(options.fallbackItems);
    const rangeItems = ensureArray(options.rangeItems);
    const getPeriodId =
      typeof options.getPeriodId === "function"
        ? options.getPeriodId
        : getRecordPeriodId;
    const rangePeriodIds = ensureArray(options.rangePeriodIds)
      .map((periodId) => normalizePeriodId(periodId))
      .filter(Boolean);
    const mergeByPeriods =
      typeof options.mergeByPeriods === "function"
        ? options.mergeByPeriods
        : (currentItems, incomingItems, targetPeriodIds) =>
            mergeRecordItemsByPeriods(currentItems, incomingItems, targetPeriodIds, {
              getPeriodId,
            });

    let items = fallbackItems.slice();
    if (mode === "recent-range") {
      items = rangeItems.slice();
    } else if (rangeItems.length || rangePeriodIds.length) {
      items = mergeByPeriods(existingItems, rangeItems, rangePeriodIds);
    }

    return {
      mode,
      items,
      loadedPeriodIds:
        mode === "full-history"
          ? getRecordPeriodIds(items, {
              getPeriodId,
            })
          : rangePeriodIds.length
            ? rangePeriodIds.slice()
            : getRecordPeriodIds(rangeItems, {
                getPeriodId,
              }),
    };
  }

  async function persistRecordMutations(options = {}) {
    const clone =
      typeof options.cloneValue === "function" ? options.cloneValue : cloneValue;
    const getPeriodId =
      typeof options.getPeriodId === "function"
        ? options.getPeriodId
        : getRecordPeriodId;
    const buildMergeKey =
      typeof options.buildMergeKey === "function"
        ? options.buildMergeKey
        : buildRecordMergeKey;
    const sortItems =
      typeof options.sortItems === "function" ? options.sortItems : sortRecordItems;
    const loadSectionRange = options.loadSectionRange;
    const saveSectionRange = options.saveSectionRange;

    if (typeof saveSectionRange !== "function") {
      throw new Error("persistRecordMutations 缺少 saveSectionRange");
    }

    const allRecordsLoaded = options.allRecordsLoaded === true;
    const supportsPatch = options.supportsPatch === true;
    const currentRecords = ensureArray(options.currentRecords).map((item) =>
      clone(item),
    );
    const upsertsByPeriod = groupRecordsByPeriod(options.upserts, {
      getPeriodId,
      cloneValue: clone,
    });
    const removedByPeriod = groupRecordsByPeriod(options.removedItems, {
      getPeriodId,
      cloneValue: clone,
    });
    const targetPeriodIds = new Set(
      ensureArray(options.periodIds)
        .map((periodId) => normalizePeriodId(periodId))
        .filter(Boolean),
    );
    const forceReplacePeriodIds = new Set(
      ensureArray(options.forceReplacePeriodIds)
        .map((periodId) => normalizePeriodId(periodId))
        .filter(Boolean),
    );

    upsertsByPeriod.forEach((_items, periodId) => {
      targetPeriodIds.add(periodId);
    });
    removedByPeriod.forEach((_items, periodId) => {
      targetPeriodIds.add(periodId);
    });

    const persistTasks = Array.from(targetPeriodIds).map(async (periodId) => {
      const periodUpserts = upsertsByPeriod.get(periodId) || [];
      const periodRemovedItems = removedByPeriod.get(periodId) || [];
      const hasExplicitMutations =
        periodUpserts.length > 0 || periodRemovedItems.length > 0;
      const canUsePatch =
        supportsPatch &&
        !forceReplacePeriodIds.has(periodId) &&
        hasExplicitMutations &&
        periodRemovedItems.every(
          (item) => typeof item?.id === "string" && item.id.trim(),
        );

      if (canUsePatch) {
        const removeIds = periodRemovedItems
          .map((item) => String(item?.id || "").trim())
          .filter(Boolean);
        await saveSectionRange("records", {
          periodId,
          mode: "patch",
          items: periodUpserts.map((item) => clone(item)),
          removedItems: periodRemovedItems.map((item) => clone(item)),
          removeIds,
        });
        return {
          periodId,
          mode: "patch",
          itemCount: periodUpserts.length,
          removedCount: periodRemovedItems.length,
        };
      }

      if (allRecordsLoaded) {
        const nextItems = sortItems(
          currentRecords.filter((item) => getPeriodId(item) === periodId),
        );
        await saveSectionRange("records", {
          periodId,
          mode: "replace",
          items: nextItems.map((item) => clone(item)),
        });
        return {
          periodId,
          mode: "replace",
          itemCount: nextItems.length,
          removedCount: periodRemovedItems.length,
          source: "memory",
        };
      }

      if (!hasExplicitMutations) {
        return {
          periodId,
          mode: "skipped",
          itemCount: 0,
          removedCount: 0,
          source: "no-op",
        };
      }
      if (typeof loadSectionRange !== "function") {
        throw new Error("persistRecordMutations 缺少 loadSectionRange");
      }

      const authoritativeRange = await loadSectionRange("records", {
        periodIds: [periodId],
      });
      const authoritativeItems = ensureArray(authoritativeRange?.items).filter(
        (item) => getPeriodId(item) === periodId,
      );
      const nextItems = applyRecordMutations(
        authoritativeItems,
        {
          upserts: periodUpserts,
          removedItems: periodRemovedItems,
        },
        {
          buildMergeKey,
          sortItems,
          cloneValue: clone,
        },
      );
      await saveSectionRange("records", {
        periodId,
        mode: "replace",
        items: nextItems.map((item) => clone(item)),
      });
      return {
        periodId,
        mode: "replace",
        itemCount: nextItems.length,
        removedCount: periodRemovedItems.length,
        source: "storage",
      };
    });

    return Promise.all(persistTasks);
  }

  return {
    cloneValue,
    normalizeRecordLoadMode,
    getRecordPeriodId,
    getRecordPeriodIds,
    buildRecordMergeKey,
    sortRecordItems,
    mergeRecordItemsByPeriods,
    resolveRecordLoadResult,
    groupRecordsByPeriod,
    applyRecordMutations,
    persistRecordMutations,
  };
});
