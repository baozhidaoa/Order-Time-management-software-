(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(root.ControlerGuideBundle || null);
    return;
  }
  root.ControlerGuideUI = factory(root.ControlerGuideBundle || null);
})(typeof globalThis !== "undefined" ? globalThis : this, function (guideBundle) {
  const GUIDE_STORAGE_KEY =
    guideBundle?.GUIDE_STATE_STORAGE_KEY || "guideState";
  const GUIDE_STORAGE_EVENT = "controler:storage-data-changed";
  let pendingGuideStateSnapshot = null;
  let guideStateSyncBound = false;

  function localizeGuideText(value) {
    return (
      globalThis?.ControlerI18n?.translateUiText?.(String(value ?? "")) ||
      String(value ?? "")
    );
  }

  function getDefaultGuideState() {
    return guideBundle?.getDefaultGuideState?.() || {
      bundleVersion: 1,
      dismissedCardIds: [],
      dismissedGuideDiaryEntryIds: [],
    };
  }

  function normalizeGuideStateValue(value) {
    return (
      guideBundle?.normalizeGuideState?.(value) ||
      (value && typeof value === "object" && !Array.isArray(value)
        ? value
        : getDefaultGuideState())
    );
  }

  function cloneGuideState(value) {
    try {
      return JSON.parse(JSON.stringify(normalizeGuideStateValue(value)));
    } catch (error) {
      return normalizeGuideStateValue(value);
    }
  }

  function areGuideStatesEqual(left, right) {
    try {
      return (
        JSON.stringify(normalizeGuideStateValue(left)) ===
        JSON.stringify(normalizeGuideStateValue(right))
      );
    } catch (error) {
      return false;
    }
  }

  function reconcilePendingGuideStateSnapshot(persistedGuideState = null) {
    if (
      pendingGuideStateSnapshot &&
      persistedGuideState &&
      areGuideStatesEqual(pendingGuideStateSnapshot, persistedGuideState)
    ) {
      pendingGuideStateSnapshot = null;
    }
  }

  function readPersistedGuideStateSnapshot() {
    try {
      const managedState =
        typeof window.ControlerStorage?.dump === "function"
          ? window.ControlerStorage.dump()
          : null;
      if (
        managedState &&
        typeof managedState === "object" &&
        !Array.isArray(managedState) &&
        managedState.guideState &&
        typeof managedState.guideState === "object"
      ) {
        return {
          hasGuideState: true,
          guideState: cloneGuideState(managedState.guideState),
        };
      }
    } catch (error) {
      console.error("读取受管引导状态失败，回退本地读取:", error);
    }

    try {
      const rawValue = localStorage.getItem(GUIDE_STORAGE_KEY);
      return {
        hasGuideState: rawValue !== null,
        guideState:
          rawValue !== null
            ? cloneGuideState(JSON.parse(rawValue))
            : cloneGuideState(getDefaultGuideState()),
      };
    } catch (error) {
      return {
        hasGuideState: true,
        guideState: cloneGuideState(getDefaultGuideState()),
      };
    }
  }

  function ensureGuideStateSyncBinding() {
    if (guideStateSyncBound || typeof window === "undefined") {
      return;
    }
    guideStateSyncBound = true;
    window.addEventListener(GUIDE_STORAGE_EVENT, (event) => {
      const detail =
        event && typeof event.detail === "object" && event.detail
          ? event.detail
          : {};
      const changedSections = Array.isArray(detail.changedSections)
        ? detail.changedSections.map((section) => String(section || "").trim())
        : [];
      if (!changedSections.includes("guideState")) {
        return;
      }
      if (detail?.data?.guideState && typeof detail.data.guideState === "object") {
        reconcilePendingGuideStateSnapshot(detail.data.guideState);
        return;
      }
      const persistedSnapshot = readPersistedGuideStateSnapshot();
      if (persistedSnapshot.hasGuideState) {
        reconcilePendingGuideStateSnapshot(persistedSnapshot.guideState);
      }
    });
  }

  function getGuideStateSnapshot() {
    ensureGuideStateSyncBinding();
    const persistedSnapshot = readPersistedGuideStateSnapshot();
    if (persistedSnapshot.hasGuideState) {
      reconcilePendingGuideStateSnapshot(persistedSnapshot.guideState);
    }
    if (pendingGuideStateSnapshot) {
      return {
        hasGuideState: true,
        guideState: cloneGuideState(pendingGuideStateSnapshot),
        pending: true,
      };
    }
    return {
      hasGuideState: persistedSnapshot.hasGuideState,
      guideState: cloneGuideState(persistedSnapshot.guideState),
      pending: false,
    };
  }

  function readGuideState() {
    return getGuideStateSnapshot().guideState || cloneGuideState(getDefaultGuideState());
  }

  function persistGuideStateViaManagedSetItem(normalizedState) {
    if (typeof window.ControlerStorage?.setItem !== "function") {
      return false;
    }
    window.ControlerStorage.setItem(GUIDE_STORAGE_KEY, normalizedState);
    if (typeof window.ControlerStorage?.persistNow === "function") {
      void window.ControlerStorage
        .persistNow()
        .then(() => {
          const persistedSnapshot = readPersistedGuideStateSnapshot();
          if (persistedSnapshot.hasGuideState) {
            reconcilePendingGuideStateSnapshot(persistedSnapshot.guideState);
          }
        })
        .catch((error) => {
          console.error("立即落盘引导状态失败:", error);
        });
    }
    return true;
  }

  function persistGuideStateViaElectronCoreReplaceSync(normalizedState) {
    if (typeof window.electronAPI?.storageReplaceCoreStateSync !== "function") {
      return false;
    }
    const result = window.electronAPI.storageReplaceCoreStateSync(
      {
        guideState: normalizedState,
      },
      {
        reason: "guide-state",
      },
    );
    if (result && typeof result === "object" && result.guideState) {
      reconcilePendingGuideStateSnapshot(result.guideState);
    } else {
      const persistedSnapshot = readPersistedGuideStateSnapshot();
      if (persistedSnapshot.hasGuideState) {
        reconcilePendingGuideStateSnapshot(persistedSnapshot.guideState);
      }
    }
    return true;
  }

  function persistGuideStateViaLocalStorage(normalizedState) {
    localStorage.setItem(GUIDE_STORAGE_KEY, JSON.stringify(normalizedState));
    reconcilePendingGuideStateSnapshot(normalizedState);
    return true;
  }

  function saveGuideState(nextState) {
    const normalizedState = cloneGuideState(nextState);
    pendingGuideStateSnapshot = cloneGuideState(normalizedState);
    ensureGuideStateSyncBinding();
    let optimisticManagedWriteApplied = false;
    let syncElectronCoreWriteApplied = false;

    try {
      optimisticManagedWriteApplied = persistGuideStateViaManagedSetItem(
        normalizedState,
      );
    } catch (error) {
      console.error("写入引导即时镜像失败，将继续尝试 core 持久化:", error);
    }

    try {
      syncElectronCoreWriteApplied = persistGuideStateViaElectronCoreReplaceSync(
        normalizedState,
      );
      if (syncElectronCoreWriteApplied) {
        return normalizedState;
      }
    } catch (error) {
      console.error("同步写入 Electron 引导状态失败，将回退异步持久化:", error);
    }

    if (typeof window.ControlerStorage?.replaceCoreState === "function") {
      void window.ControlerStorage
        .replaceCoreState(
          {
            guideState: normalizedState,
          },
          {
            reason: "guide-state",
          },
        )
        .then((result) => {
          if (result && typeof result === "object" && result.guideState) {
            reconcilePendingGuideStateSnapshot(result.guideState);
            return;
          }
          const persistedSnapshot = readPersistedGuideStateSnapshot();
          if (persistedSnapshot.hasGuideState) {
            reconcilePendingGuideStateSnapshot(persistedSnapshot.guideState);
          }
        })
        .catch((error) => {
          console.error("同步引导状态失败，回退普通存储保存:", error);
          try {
            if (
              syncElectronCoreWriteApplied ||
              optimisticManagedWriteApplied ||
              persistGuideStateViaManagedSetItem(normalizedState)
            ) {
              return;
            }
          } catch (managedError) {
            console.error("回退普通引导存储失败:", managedError);
          }
          try {
            persistGuideStateViaLocalStorage(normalizedState);
          } catch (storageError) {
            console.error("写入本地引导镜像失败:", storageError);
          }
        });
      return normalizedState;
    }

    try {
      if (persistGuideStateViaManagedSetItem(normalizedState)) {
        return normalizedState;
      }
    } catch (error) {
      console.error("同步保存引导状态失败，回退本地保存:", error);
    }

    persistGuideStateViaLocalStorage(normalizedState);
    return normalizedState;
  }

  function dismissGuideCard(cardId) {
    const currentState = readGuideState();
    if (
      currentState.dismissedCardIds.includes(cardId) ||
      !String(cardId || "").trim()
    ) {
      return currentState;
    }

    return saveGuideState({
      ...currentState,
      dismissedCardIds: [...currentState.dismissedCardIds, cardId],
    });
  }

  function isGuideCardDismissed(cardId) {
    return readGuideState().dismissedCardIds.includes(String(cardId || "").trim());
  }

  function renderCard(container, cardDefinition, options = {}) {
    if (!(container instanceof HTMLElement) || !cardDefinition?.id) {
      return false;
    }

    container.innerHTML = "";
    if (isGuideCardDismissed(cardDefinition.id)) {
      container.hidden = true;
      return false;
    }

    const card = document.createElement("section");
    card.className = "guide-card";
    card.dataset.guideCardId = cardDefinition.id;

    const header = document.createElement("div");
    header.className = "guide-card-header";

    const title = document.createElement("h3");
    title.className = "guide-card-title";
    title.textContent = localizeGuideText(cardDefinition.title || "快速上手");
    header.appendChild(title);

    const dismissButton = document.createElement("button");
    dismissButton.type = "button";
    dismissButton.className = "guide-card-dismiss";
    dismissButton.textContent =
      localizeGuideText(
        typeof options.dismissText === "string" && options.dismissText.trim()
          ? options.dismissText.trim()
          : "删除引导",
      );
    dismissButton.addEventListener("click", () => {
      dismissGuideCard(cardDefinition.id);
      container.innerHTML = "";
      container.hidden = true;
      if (typeof options.onDismiss === "function") {
        options.onDismiss(cardDefinition.id);
      }
    });
    header.appendChild(dismissButton);
    card.appendChild(header);

    const list = document.createElement("ul");
    list.className = "guide-card-list";
    const items = Array.isArray(cardDefinition.items) ? cardDefinition.items : [];
    items.forEach((itemText) => {
      const item = document.createElement("li");
      item.className = "guide-card-item";
      item.textContent = localizeGuideText(itemText || "");
      list.appendChild(item);
    });
    card.appendChild(list);

    container.appendChild(card);
    container.hidden = false;
    return true;
  }

  return {
    getGuideStateSnapshot,
    readGuideState,
    saveGuideState,
    dismissGuideCard,
    isGuideCardDismissed,
    renderCard,
  };
});
