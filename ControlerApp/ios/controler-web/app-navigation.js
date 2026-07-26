(() => {
  const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
  const items = [
    {
      key: "index",
      label: "记录",
      href: "index.html",
      icon: {
        nodes: [
          { tag: "circle", attrs: { cx: "12", cy: "12", r: "7.25" } },
          { tag: "path", attrs: { d: "M12 8.35v4.1l2.65 1.7" } },
        ],
      },
    },
    {
      key: "stats",
      label: "统计",
      href: "stats.html",
      icon: {
        nodes: [
          { tag: "path", attrs: { d: "M4.5 19.25h15" } },
          { tag: "path", attrs: { d: "M7.25 17.75v-5.5" } },
          { tag: "path", attrs: { d: "M12 17.75V7.25" } },
          { tag: "path", attrs: { d: "M16.75 17.75v-8" } },
        ],
      },
    },
    {
      key: "plan",
      label: "计划",
      href: "plan.html",
      icon: {
        nodes: [
          {
            tag: "rect",
            attrs: {
              x: "4.5",
              y: "5.75",
              width: "15",
              height: "13.25",
              rx: "3",
            },
          },
          { tag: "path", attrs: { d: "M8 3.75v4" } },
          { tag: "path", attrs: { d: "M16 3.75v4" } },
          { tag: "path", attrs: { d: "M4.5 9.75h15" } },
        ],
      },
    },
    {
      key: "todo",
      label: "待办",
      href: "todo.html",
      icon: {
        nodes: [
          {
            tag: "rect",
            attrs: {
              x: "5.25",
              y: "4.75",
              width: "13.5",
              height: "14.5",
              rx: "3",
            },
          },
          { tag: "path", attrs: { d: "M8.5 9.25h6.75" } },
          { tag: "path", attrs: { d: "M8.5 13h6.75" } },
          { tag: "path", attrs: { d: "M8.5 16.75h4.25" } },
          { tag: "path", attrs: { d: "M6.8 9.2h.01" } },
          { tag: "path", attrs: { d: "M6.8 12.95h.01" } },
          { tag: "path", attrs: { d: "M6.8 16.7h.01" } },
        ],
      },
    },
    {
      key: "diary",
      label: "日记",
      href: "diary.html",
      icon: {
        nodes: [
          {
            tag: "path",
            attrs: {
              d: "M7 4.75h7.25L18 8.5V19.25H7a2.25 2.25 0 0 1-2.25-2.25V7A2.25 2.25 0 0 1 7 4.75Z",
            },
          },
          { tag: "path", attrs: { d: "M14.25 4.75V8.5H18" } },
          { tag: "path", attrs: { d: "M8.5 12h6.5" } },
          { tag: "path", attrs: { d: "M8.5 15h4.5" } },
        ],
      },
    },
    {
      key: "settings",
      label: "设置",
      href: "settings.html",
      icon: {
        nodes: [
          {
            tag: "path",
            attrs: {
              d: "M12 8.7a3.3 3.3 0 1 0 0 6.6a3.3 3.3 0 0 0 0-6.6Z",
            },
          },
          {
            tag: "path",
            attrs: {
              d: "M19.15 13.1V10.9l-1.76-.46a5.83 5.83 0 0 0-.54-1.31l.95-1.56l-1.55-1.56l-1.57.95a5.86 5.86 0 0 0-1.3-.53L13.1 4.7h-2.2l-.46 1.73c-.46.12-.9.3-1.31.53l-1.56-.95L6.02 7.57l.95 1.56c-.23.41-.41.85-.53 1.31l-1.74.46v2.2l1.74.46c.12.46.3.9.53 1.31l-.95 1.56l1.55 1.56l1.56-.95c.41.23.85.41 1.31.53l.46 1.74h2.2l.46-1.74c.45-.12.89-.3 1.3-.53l1.57.95l1.55-1.56l-.95-1.56c.23-.41.42-.85.54-1.31Z",
            },
          },
        ],
      },
    },
  ];

  function createIcon(item, ownerDocument = document) {
    const wrapper = ownerDocument.createElement("span");
    wrapper.className = "app-nav-icon";
    wrapper.setAttribute("aria-hidden", "true");
    if (!item?.icon?.nodes?.length) {
      return wrapper;
    }

    const svg = ownerDocument.createElementNS(SVG_NAMESPACE, "svg");
    svg.classList.add("app-nav-icon-svg");
    Object.entries({
      viewBox: "0 0 24 24",
      "aria-hidden": "true",
      focusable: "false",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.8",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    }).forEach(([key, value]) => svg.setAttribute(key, value));

    item.icon.nodes.forEach((definition) => {
      const node = ownerDocument.createElementNS(
        SVG_NAMESPACE,
        definition.tag,
      );
      Object.entries(definition.attrs || {}).forEach(([key, value]) => {
        node.setAttribute(key, String(value));
      });
      svg.appendChild(node);
    });
    wrapper.appendChild(svg);
    return wrapper;
  }

  window.ControlerAppNavigation = Object.freeze({
    createIcon,
    items: Object.freeze(items),
  });
})();
