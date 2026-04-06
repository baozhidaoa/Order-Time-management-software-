(() => {
  try {
    Object.defineProperty(navigator, "maxTouchPoints", {
      configurable: true,
      get() {
        return 5;
      },
    });
  } catch (error) {
    // Ignore environments that do not allow redefining the property.
  }

  try {
    Object.defineProperty(window, "ontouchstart", {
      configurable: true,
      enumerable: false,
      writable: true,
      value: null,
    });
  } catch (error) {
    // Ignore environments that do not allow redefining the property.
  }

  window.__CONTROLER_REVIEW_MOBILE__ = true;
})();
