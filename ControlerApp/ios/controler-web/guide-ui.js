(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(root.ControlerGuideBundle || null);
    return;
  }
  root.ControlerGuideUI = factory(root.ControlerGuideBundle || null);
})(typeof globalThis !== "undefined" ? globalThis : this, function (guideBundle) {
  const GUIDE_STORAGE_KEY =
    guideBundle?.GUIDE_STATE_STORAGE_KEY || "guideState";

  function localizeGuideText(value) {
    return (
      globalThis?.ControlerI18n?.translateUiText?.(String(value ?? "")) ||
      String(value ?? "")
    );
  }

  function readGuideState() {
    try {
      return guideBundle?.normalizeGuideState?.(
        JSON.parse(localStorage.getItem(GUIDE_STORAGE_KEY) || "null"),
      ) || { bundleVersion: 1, dismissedCardIds: [] };
    } catch (error) {
      return guideBundle?.getDefaultGuideState?.() || {
        bundleVersion: 1,
        dismissedCardIds: [],
      };
    }
  }

  function saveGuideState(nextState) {
    const normalizedState =
      guideBundle?.normalizeGuideState?.(nextState) || nextState || {};
    localStorage.setItem(GUIDE_STORAGE_KEY, JSON.stringify(normalizedState));
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
    readGuideState,
    saveGuideState,
    dismissGuideCard,
    isGuideCardDismissed,
    renderCard,
  };
});
