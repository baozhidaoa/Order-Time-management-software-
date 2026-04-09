(() => {
  const MAX_DATE_KEY = "9999-12-31";

  function normalizeCheckinScheduleDateKey(dateValue = "") {
    const directText = String(dateValue || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(directText)) {
      return directText;
    }
    if (/^\d{4}-\d{2}-\d{2}T/.test(directText)) {
      return directText.slice(0, 10);
    }
    if (!directText) {
      return "";
    }
    const parsed = new Date(directText);
    if (Number.isNaN(parsed.getTime())) {
      return "";
    }
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(
      parsed.getDate(),
    ).padStart(2, "0")}`;
  }

  function normalizeCheckinScheduleReferenceDate(referenceDate = null) {
    if (referenceDate instanceof Date && !Number.isNaN(referenceDate.getTime())) {
      return normalizeCheckinScheduleDateKey(referenceDate);
    }
    return normalizeCheckinScheduleDateKey(referenceDate) || normalizeCheckinScheduleDateKey(new Date());
  }

  function parseCheckinScheduleTimestamp(value = "") {
    const timestamp = Date.parse(String(value || "").trim());
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  function buildNormalizedCheckinScheduleRange(
    rangeLike = {},
    itemLike = {},
    sourceIndex = 0,
  ) {
    const normalizedStartDate = normalizeCheckinScheduleDateKey(
      rangeLike?.startDate || itemLike?.startDate || "",
    );
    if (!normalizedStartDate) {
      return null;
    }
    return {
      id: String(rangeLike?.id || "").trim(),
      startDate: normalizedStartDate,
      endDate: normalizeCheckinScheduleDateKey(
        rangeLike?.endDate || itemLike?.endDate || "",
      ),
      createdAt:
        String(rangeLike?.createdAt || itemLike?.createdAt || "").trim() || "",
      updatedAt:
        String(rangeLike?.updatedAt || itemLike?.updatedAt || "").trim() || "",
      sourceIndex:
        Number.isInteger(sourceIndex) && sourceIndex >= 0 ? sourceIndex : 0,
    };
  }

  function getCheckinScheduleSourceRanges(itemLike = {}) {
    if (Array.isArray(itemLike?.scheduleRanges) && itemLike.scheduleRanges.length > 0) {
      return itemLike.scheduleRanges;
    }
    return itemLike && typeof itemLike === "object" ? [itemLike] : [];
  }

  function isCheckinScheduleRangeOngoing(rangeLike = {}, referenceDate = null) {
    const normalizedReferenceDate =
      normalizeCheckinScheduleReferenceDate(referenceDate);
    const normalizedEndDate = normalizeCheckinScheduleDateKey(rangeLike?.endDate);
    return !normalizedEndDate || normalizedReferenceDate < normalizedEndDate;
  }

  function isBetterCheckinScheduleRangeCandidate(
    candidate,
    current,
    referenceDate = null,
  ) {
    if (!current) {
      return true;
    }

    const candidateOngoing = isCheckinScheduleRangeOngoing(
      candidate,
      referenceDate,
    );
    const currentOngoing = isCheckinScheduleRangeOngoing(current, referenceDate);
    if (candidateOngoing !== currentOngoing) {
      return candidateOngoing;
    }

    const candidateEndScore =
      normalizeCheckinScheduleDateKey(candidate?.endDate) || MAX_DATE_KEY;
    const currentEndScore =
      normalizeCheckinScheduleDateKey(current?.endDate) || MAX_DATE_KEY;
    if (candidateEndScore !== currentEndScore) {
      return candidateEndScore > currentEndScore;
    }

    const candidateUpdatedAt = Math.max(
      parseCheckinScheduleTimestamp(candidate?.updatedAt),
      parseCheckinScheduleTimestamp(candidate?.createdAt),
    );
    const currentUpdatedAt = Math.max(
      parseCheckinScheduleTimestamp(current?.updatedAt),
      parseCheckinScheduleTimestamp(current?.createdAt),
    );
    if (candidateUpdatedAt !== currentUpdatedAt) {
      return candidateUpdatedAt > currentUpdatedAt;
    }

    return (candidate?.sourceIndex || 0) >= (current?.sourceIndex || 0);
  }

  function getCheckinScheduleDisplayRanges(itemLike = {}, options = {}) {
    const normalizedReferenceDate = normalizeCheckinScheduleReferenceDate(
      options?.referenceDate,
    );
    const groupedByStartDate = new Map();

    getCheckinScheduleSourceRanges(itemLike).forEach((rangeLike, sourceIndex) => {
      const normalizedRange = buildNormalizedCheckinScheduleRange(
        rangeLike,
        itemLike,
        sourceIndex,
      );
      if (!normalizedRange) {
        return;
      }

      const rangeKey = normalizedRange.startDate;
      const current = groupedByStartDate.get(rangeKey) || null;
      if (
        isBetterCheckinScheduleRangeCandidate(
          normalizedRange,
          current,
          normalizedReferenceDate,
        )
      ) {
        groupedByStartDate.set(rangeKey, normalizedRange);
      }
    });

    return Array.from(groupedByStartDate.values()).sort((left, right) => {
      if (left.startDate !== right.startDate) {
        return left.startDate.localeCompare(right.startDate);
      }
      return (left.sourceIndex || 0) - (right.sourceIndex || 0);
    });
  }

  function formatCheckinScheduleDisplayDate(dateText = "", formatter = null) {
    const normalizedDate = normalizeCheckinScheduleDateKey(dateText);
    if (!normalizedDate) {
      return "";
    }
    if (typeof formatter === "function") {
      const formatted = formatter(normalizedDate);
      return String(formatted || "").trim();
    }
    const parsed = new Date(normalizedDate);
    if (Number.isNaN(parsed.getTime())) {
      return normalizedDate;
    }
    return `${parsed.getFullYear()}年${parsed.getMonth() + 1}月${parsed.getDate()}日`;
  }

  function formatCheckinScheduleDisplayLabel(rangeLike = {}, options = {}) {
    const normalizedReferenceDate = normalizeCheckinScheduleReferenceDate(
      options?.referenceDate,
    );
    const startLabel = formatCheckinScheduleDisplayDate(
      rangeLike?.startDate,
      options?.formatDate,
    );
    if (!startLabel) {
      return "";
    }
    if (isCheckinScheduleRangeOngoing(rangeLike, normalizedReferenceDate)) {
      return startLabel;
    }
    const endLabel = formatCheckinScheduleDisplayDate(
      rangeLike?.endDate,
      options?.formatDate,
    );
    return endLabel ? `${startLabel}—${endLabel}` : startLabel;
  }

  function getCheckinScheduleDisplayLabels(itemLike = {}, options = {}) {
    return getCheckinScheduleDisplayRanges(itemLike, options)
      .map((rangeLike) => formatCheckinScheduleDisplayLabel(rangeLike, options))
      .filter(Boolean);
  }

  window.ControlerCheckinScheduleUtils = {
    normalizeDateKey: normalizeCheckinScheduleDateKey,
    normalizeReferenceDate: normalizeCheckinScheduleReferenceDate,
    isRangeOngoing: isCheckinScheduleRangeOngoing,
    getDisplayRanges: getCheckinScheduleDisplayRanges,
    formatDisplayDate: formatCheckinScheduleDisplayDate,
    formatDisplayLabel: formatCheckinScheduleDisplayLabel,
    getDisplayLabels: getCheckinScheduleDisplayLabels,
  };
})();
