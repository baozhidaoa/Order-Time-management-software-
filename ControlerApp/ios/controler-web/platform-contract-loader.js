(() => {
  const currentScript =
    document.currentScript instanceof HTMLScriptElement
      ? document.currentScript
      : null;

  const resolveContractSource = () => {
    try {
      const currentUrl = new URL(
        currentScript?.src || "",
        window.location.href,
      );
      const pathname = String(currentUrl.pathname || "").replace(/\\/g, "/");
      if (pathname.includes("/pages/")) {
        return "../shared/platform-contract.js";
      }
    } catch (error) {
      console.error("解析平台契约加载路径失败:", error);
    }
    return "platform-contract.js";
  };

  const source = resolveContractSource();
  document.write(`<script src="${source}"><\/script>`);
})();
