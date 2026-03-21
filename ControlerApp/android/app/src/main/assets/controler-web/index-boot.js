;/* pages/project-stats-utils.js */
(() => {
  const SINGLE_SUFFIX = "（单）";
  const TOTAL_SUFFIX = "（总）";
  const storageBundleApi = window.ControlerStorageBundle || null;
  const PROJECT_DIRECT_DURATION_KEY =
    storageBundleApi?.PROJECT_DIRECT_DURATION_KEY || "cachedDirectDurationMs";

  function normalizeProjectLevel(level) {
    const numericLevel = parseInt(level, 10);
    if ([1, 2, 3].includes(numericLevel)) {
      return numericLevel;
    }

    if (typeof level === "string") {
      if (level.includes("一级")) return 1;
      if (level.includes("二级")) return 2;
      if (level.includes("三级")) return 3;
    }

    return 1;
  }

  function stringHash(input) {
    const text = String(input || "");
    let hash = 0;
    for (let index = 0; index < text.length; index += 1) {
      hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
    }
    return hash;
  }

  function parseCssColor(colorText) {
    if (!colorText || typeof colorText !== "string") return null;
    const color = colorText.trim();

    const hex3 = color.match(/^#([0-9a-fA-F]{3})$/);
    if (hex3) {
      const [r, g, b] = hex3[1].split("").map((value) => {
        return parseInt(value + value, 16);
      });
      return { r, g, b };
    }

    const hex6 = color.match(/^#([0-9a-fA-F]{6})$/);
    if (hex6) {
      return {
        r: parseInt(hex6[1].slice(0, 2), 16),
        g: parseInt(hex6[1].slice(2, 4), 16),
        b: parseInt(hex6[1].slice(4, 6), 16),
      };
    }

    const rgb = color.match(
      /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*[\d.]+)?\s*\)$/i,
    );
    if (rgb) {
      return {
        r: Math.min(255, parseInt(rgb[1], 10)),
        g: Math.min(255, parseInt(rgb[2], 10)),
        b: Math.min(255, parseInt(rgb[3], 10)),
      };
    }

    return null;
  }

  function defaultColorForName(name) {
    const colors = [
      "#79af85",
      "#4299e1",
      "#ed8936",
      "#9f7aea",
      "#f56565",
      "#48bb78",
      "#ecc94b",
      "#667eea",
      "#ed64a6",
      "#38b2ac",
      "#9ccc65",
      "#ff7043",
      "#42a5f5",
      "#7e57c2",
    ];
    return colors[stringHash(name) % colors.length];
  }

  function mixColor(colorText, targetText, ratio = 0.2) {
    const source = parseCssColor(colorText) || parseCssColor(defaultColorForName(""));
    const target = parseCssColor(targetText) || source;
    const safeRatio = Math.min(Math.max(Number(ratio) || 0, 0), 1);

    const mixChannel = (left, right) => {
      return Math.round(left + (right - left) * safeRatio);
    };

    return `rgb(${mixChannel(source.r, target.r)}, ${mixChannel(source.g, target.g)}, ${mixChannel(source.b, target.b)})`;
  }

  function parseSpendTimeToMs(spendtime) {
    if (!spendtime || typeof spendtime !== "string") return 0;

    let totalMs = 0;
    const dayMatch = spendtime.match(/(\d+)天/);
    const hourMatch = spendtime.match(/(\d+)小时/);
    const minuteMatch = spendtime.match(/(\d+)分钟/);
    const lessThanMinute = spendtime.includes("小于1分钟") || spendtime.includes("小于1min");

    if (dayMatch) totalMs += parseInt(dayMatch[1], 10) * 24 * 60 * 60 * 1000;
    if (hourMatch) totalMs += parseInt(hourMatch[1], 10) * 60 * 60 * 1000;
    if (minuteMatch) totalMs += parseInt(minuteMatch[1], 10) * 60 * 1000;
    if (lessThanMinute) totalMs += 30 * 1000;

    return totalMs;
  }

  function parseSpendTimeToHours(spendtime) {
    return parseSpendTimeToMs(spendtime) / (1000 * 60 * 60);
  }

  function buildProjectHierarchyIndex(projects = []) {
    const allNodes = (Array.isArray(projects) ? projects : [])
      .filter((project) => project && typeof project === "object")
      .map((project) => ({
        id: String(project.id || "").trim(),
        name: String(project.name || "").trim(),
        level: normalizeProjectLevel(project.level),
        parentId: project.parentId ? String(project.parentId).trim() : "",
        color:
          typeof project.color === "string" && project.color.trim()
            ? project.color.trim()
            : defaultColorForName(project.name),
        raw: project,
      }))
      .filter((project) => project.id && project.name);

    const byId = new Map(allNodes.map((node) => [node.id, node]));
    const byName = new Map();
    allNodes.forEach((node) => {
      byName.set(node.name, node);
    });

    const childrenByParent = new Map();
    const roots = [];

    const pushChild = (parentId, node) => {
      if (!childrenByParent.has(parentId)) {
        childrenByParent.set(parentId, []);
      }
      childrenByParent.get(parentId).push(node);
    };

    allNodes.forEach((node) => {
      if (node.parentId && node.parentId !== node.id && byId.has(node.parentId)) {
        pushChild(node.parentId, node);
        return;
      }
      roots.push(node);
    });

    const sortNodes = (nodes) => {
      return nodes.sort((left, right) => {
        if ((left.level || 1) !== (right.level || 1)) {
          return (left.level || 1) - (right.level || 1);
        }
        return left.name.localeCompare(right.name, "zh-CN");
      });
    };

    sortNodes(roots);
    childrenByParent.forEach((nodes) => sortNodes(nodes));

    return {
      allNodes,
      byId,
      byName,
      childrenByParent,
      roots,
    };
  }

  function collectProjectSubtreeIds(projectId, hierarchyIndex) {
    const rootId = String(projectId || "");
    if (!rootId) return new Set();

    const result = new Set([rootId]);
    const queue = [rootId];

    while (queue.length > 0) {
      const current = queue.shift();
      const children = hierarchyIndex.childrenByParent.get(current) || [];
      children.forEach((child) => {
        if (!result.has(child.id)) {
          result.add(child.id);
          queue.push(child.id);
        }
      });
    }

    return result;
  }

  function findProjectForRecord(record, hierarchyOrProjects) {
    const hierarchy =
      hierarchyOrProjects && hierarchyOrProjects.byId && hierarchyOrProjects.byName
        ? hierarchyOrProjects
        : buildProjectHierarchyIndex(hierarchyOrProjects);

    if (record?.projectId) {
      const byId = hierarchy.byId.get(String(record.projectId || "").trim());
      if (byId) return byId;
    }

    if (record?.name) {
      const normalizedName = String(record.name || "").trim();
      if (hierarchy.byName.has(normalizedName)) {
        return hierarchy.byName.get(normalizedName);
      }
      const byPathLeaf = normalizedName
        .split("/")
        .map((part) => part.trim())
        .filter(Boolean)
        .pop();
      if (byPathLeaf && hierarchy.byName.has(byPathLeaf)) {
        return hierarchy.byName.get(byPathLeaf);
      }
    }

    return null;
  }

  function buildProjectPath(projectIdOrProject, hierarchyIndex) {
    const node =
      typeof projectIdOrProject === "string"
        ? hierarchyIndex.byId.get(projectIdOrProject) || null
        : projectIdOrProject && projectIdOrProject.id
          ? hierarchyIndex.byId.get(String(projectIdOrProject.id)) || projectIdOrProject
          : null;
    if (!node) return "";

    const names = [node.name];
    let current = node;
    let safety = 0;
    while (current.parentId && safety < 8) {
      const parent = hierarchyIndex.byId.get(current.parentId);
      if (!parent) break;
      names.unshift(parent.name);
      current = parent;
      safety += 1;
    }

    return names.join("/");
  }

  function getProjectStoredDirectDurationMs(project) {
    const directMs = Number(project?.[PROJECT_DIRECT_DURATION_KEY]);
    if (!Number.isFinite(directMs)) {
      return 0;
    }
    return Math.max(0, Math.round(directMs));
  }

  function createStatsContext(projects = [], records = [], options = {}) {
    const hierarchy = buildProjectHierarchyIndex(projects);
    const statsById = new Map();
    const useStoredDurations =
      storageBundleApi?.projectsHaveValidDurationCache?.(projects) === true &&
      (options.useStoredDurations === true ||
        (options.useStoredDurations !== false &&
          (!Array.isArray(records) || records.length === 0)));

    hierarchy.allNodes.forEach((project) => {
      statsById.set(project.id, {
        project,
        directMs: useStoredDurations
          ? getProjectStoredDirectDurationMs(project.raw)
          : 0,
        totalMs: 0,
        subtreeIds: new Set([project.id]),
      });
    });

    if (!useStoredDurations) {
      (Array.isArray(records) ? records : []).forEach((record) => {
        const project = findProjectForRecord(record, hierarchy);
        if (!project) return;
        const stat = statsById.get(project.id);
        if (!stat) return;
        stat.directMs += parseSpendTimeToMs(record.spendtime);
      });
    }

    const computed = new Set();
    const computeTotals = (projectId) => {
      if (computed.has(projectId)) {
        return statsById.get(projectId)?.totalMs || 0;
      }

      const stat = statsById.get(projectId);
      if (!stat) return 0;

      let totalMs = stat.directMs;
      const subtreeIds = new Set([projectId]);
      const children = hierarchy.childrenByParent.get(projectId) || [];

      children.forEach((child) => {
        totalMs += computeTotals(child.id);
        const childStat = statsById.get(child.id);
        if (childStat?.subtreeIds) {
          childStat.subtreeIds.forEach((subtreeId) => subtreeIds.add(subtreeId));
        }
      });

      stat.totalMs = totalMs;
      stat.subtreeIds = subtreeIds;
      computed.add(projectId);
      return totalMs;
    };

    hierarchy.roots.forEach((root) => computeTotals(root.id));
    hierarchy.allNodes.forEach((node) => computeTotals(node.id));

    const getChildren = (projectId) => {
      return (hierarchy.childrenByParent.get(String(projectId || "")) || []).slice();
    };

    const hasChildren = (projectId) => getChildren(projectId).length > 0;

    const getStat = (projectId) => {
      return (
        statsById.get(String(projectId || "")) || {
          project: hierarchy.byId.get(String(projectId || "")) || null,
          directMs: 0,
          totalMs: 0,
          subtreeIds: new Set(String(projectId || "") ? [String(projectId || "")] : []),
        }
      );
    };

    const compareProjectNodesByTotalDesc = (left, right) => {
      const leftTotal = getStat(left?.id).totalMs || 0;
      const rightTotal = getStat(right?.id).totalMs || 0;
      if (leftTotal !== rightTotal) {
        return rightTotal - leftTotal;
      }

      const leftLevel = normalizeProjectLevel(left?.level);
      const rightLevel = normalizeProjectLevel(right?.level);
      if (leftLevel !== rightLevel) {
        return leftLevel - rightLevel;
      }

      return String(left?.name || "").localeCompare(String(right?.name || ""), "zh-CN");
    };

    const sortProjectNodesByTotalDesc = (nodes = []) => {
      return (Array.isArray(nodes) ? nodes : [])
        .slice()
        .sort(compareProjectNodesByTotalDesc);
    };

    const compareDisplayItemsByValueDesc = (left, right) => {
      const leftValue = Number(left?.valueMs || 0);
      const rightValue = Number(right?.valueMs || 0);
      if (leftValue !== rightValue) {
        return rightValue - leftValue;
      }

      const leftLevel = normalizeProjectLevel(left?.level);
      const rightLevel = normalizeProjectLevel(right?.level);
      if (leftLevel !== rightLevel) {
        return leftLevel - rightLevel;
      }

      return String(left?.label || "").localeCompare(String(right?.label || ""), "zh-CN");
    };

    const getOrderedRoots = () => sortProjectNodesByTotalDesc(hierarchy.roots);

    const getOrderedChildren = (projectId) => {
      return sortProjectNodesByTotalDesc(getChildren(projectId));
    };

    const getBaseColor = (projectId) => {
      const project = hierarchy.byId.get(String(projectId || ""));
      return project?.color || defaultColorForName(project?.name || projectId || "");
    };

    const buildDisplayItem = (projectId, kind) => {
      const project = hierarchy.byId.get(String(projectId || ""));
      if (!project) return null;
      const stat = getStat(projectId);
      const path = buildProjectPath(project.id, hierarchy);
      const valueMs =
        kind === "total"
          ? stat.totalMs
          : kind === "single"
            ? stat.directMs
            : stat.directMs;
      const baseColor = getBaseColor(project.id);

      return {
        key: `${kind}:${project.id}`,
        projectId: project.id,
        label:
          kind === "total"
            ? project.level < 3
              ? `${project.name}${TOTAL_SUFFIX}`
              : project.name
            : kind === "single"
              ? `${project.name}${SINGLE_SUFFIX}`
              : project.name,
        shortLabel:
          kind === "total"
            ? project.level < 3
              ? `${project.name}${TOTAL_SUFFIX}`
              : project.name
            : kind === "single"
              ? `${project.name}${SINGLE_SUFFIX}`
              : project.name,
        path,
        pathLabel:
          kind === "total"
            ? project.level < 3
              ? `${path}${TOTAL_SUFFIX}`
              : path
            : kind === "single"
              ? `${path}${SINGLE_SUFFIX}`
              : path,
        level: project.level,
        kind,
        valueMs,
        color:
          kind === "single"
            ? mixColor(baseColor, "#ffffff", 0.22)
            : kind === "leaf"
              ? mixColor(baseColor, "#111111", 0.06)
              : baseColor,
        directMs: stat.directMs,
        totalMs: stat.totalMs,
        matchMode: kind === "total" ? "subtree" : "direct",
        subtreeIds: new Set(stat.subtreeIds || []),
        children: [],
      };
    };

    const buildLeafNode = (projectId, options = {}) => {
      const { includeZero = false, forceSingle = false } = options;
      const stat = getStat(projectId);
      const item = buildDisplayItem(
        projectId,
        forceSingle && hierarchy.byId.get(String(projectId || ""))?.level < 3
          ? "single"
          : "leaf",
      );
      if (!item) return null;
      if (!includeZero && (forceSingle ? stat.directMs : item.valueMs) <= 0) {
        return null;
      }
      return item;
    };

    const buildTotalNode = (projectId, options = {}) => {
      const { includeChildren = true, includeZero = false } = options;
      const project = hierarchy.byId.get(String(projectId || ""));
      if (!project) return null;

      if (project.level >= 3) {
        return buildLeafNode(project.id, { includeZero });
      }

      const stat = getStat(project.id);
      const node = buildDisplayItem(project.id, "total");
      if (!node) return null;

      if (includeChildren) {
        if (includeZero || stat.directMs > 0) {
          const singleNode = buildDisplayItem(project.id, "single");
          if (singleNode && (includeZero || singleNode.valueMs > 0)) {
            node.children.push(singleNode);
          }
        }

        getOrderedChildren(project.id).forEach((child) => {
          const childNode = buildTotalNode(child.id, {
            includeChildren: true,
            includeZero,
          });
          if (childNode) {
            node.children.push(childNode);
          }
        });

        node.children.sort(compareDisplayItemsByValueDesc);
      }

      if (!includeZero && node.valueMs <= 0 && node.children.length === 0) {
        return null;
      }

      return node;
    };

    function parseSelectionValue(selectionValue = "summary:all") {
      const safeSelection = String(selectionValue || "summary:all").trim();

      if (safeSelection.startsWith("project:")) {
        const projectId = String(safeSelection.split(":")[1] || "");
        if (hierarchy.byId.has(projectId)) {
          return {
            type: "project",
            projectId,
          };
        }
      }

      if (safeSelection.startsWith("summary:")) {
        const levelToken = String(safeSelection.split(":")[1] || "all").trim();
        if (["all", "1", "2", "3"].includes(levelToken)) {
          return {
            type: "summary",
            levelFilter: levelToken,
          };
        }
      }

      return {
        type: "summary",
        levelFilter: "all",
      };
    }

    function buildBreakdownTree(selectionValue = "summary:all", options = {}) {
      const { includeZero = false } = options;
      const selection = parseSelectionValue(selectionValue);
      const root = {
        key: `root:${selectionValue}`,
        kind: "root",
        label:
          selection.type === "project"
            ? hierarchy.byId.get(selection.projectId)?.name || "所选项目"
            : "全部项目（汇总）",
        shortLabel:
          selection.type === "project"
            ? hierarchy.byId.get(selection.projectId)?.name || "所选项目"
            : "全部项目（汇总）",
        pathLabel:
          selection.type === "project"
            ? buildProjectPath(selection.projectId, hierarchy)
            : "全部项目（汇总）",
        valueMs: 0,
        children: [],
      };

      if (selection.type === "summary") {
        if (selection.levelFilter === "all") {
          getOrderedRoots().forEach((rootProject) => {
            const rootNode = buildTotalNode(rootProject.id, {
              includeChildren: true,
              includeZero,
            });
            if (rootNode) {
              root.children.push(rootNode);
            }
          });
        } else if (selection.levelFilter === "1") {
          sortProjectNodesByTotalDesc(
            hierarchy.allNodes.filter((project) => project.level === 1),
          )
            .forEach((project) => {
              const node = buildTotalNode(project.id, {
                includeChildren: false,
                includeZero,
              });
              if (node) {
                root.children.push(node);
              }
            });
        } else if (selection.levelFilter === "2") {
          sortProjectNodesByTotalDesc(
            hierarchy.allNodes.filter((project) => project.level === 2),
          )
            .forEach((project) => {
              const node = buildTotalNode(project.id, {
                includeChildren: true,
                includeZero,
              });
              if (node) {
                root.children.push(node);
              }
            });
        } else if (selection.levelFilter === "3") {
          sortProjectNodesByTotalDesc(
            hierarchy.allNodes.filter((project) => project.level === 3),
          )
            .forEach((project) => {
              const node = buildLeafNode(project.id, {
                includeZero,
              });
              if (node) {
                root.children.push(node);
              }
            });
        }
      } else if (selection.type === "project") {
        const project = hierarchy.byId.get(selection.projectId);
        if (project) {
          if (project.level >= 3) {
            const leaf = buildLeafNode(project.id, { includeZero });
            if (leaf) {
              root.children.push(leaf);
            }
          } else {
            const stat = getStat(project.id);
            if (includeZero || stat.directMs > 0) {
              const singleNode = buildDisplayItem(project.id, "single");
              if (singleNode && (includeZero || singleNode.valueMs > 0)) {
                root.children.push(singleNode);
              }
            }

            getOrderedChildren(project.id).forEach((child) => {
              const childNode = buildTotalNode(child.id, {
                includeChildren: true,
                includeZero,
              });
              if (childNode) {
                root.children.push(childNode);
              }
            });

            if (root.children.length === 0) {
              const fallbackLeaf = buildLeafNode(project.id, {
                includeZero,
                forceSingle: true,
              });
              if (fallbackLeaf) {
                root.children.push(fallbackLeaf);
              }
            }
          }
        }
      }

      root.children.sort(compareDisplayItemsByValueDesc);
      root.valueMs = root.children.reduce((sum, child) => sum + (child.valueMs || 0), 0);
      return root;
    }

    function flattenBreakdownTree(tree, options = {}) {
      const { includeRoot = false } = options;
      const flattened = [];

      const walk = (node, depth = 0, parent = null) => {
        if (!node) return;
        if (depth > 0 || includeRoot) {
          flattened.push({
            ...node,
            depth,
            parentKey: parent?.key || "",
            parentLabel: parent?.label || "",
            rootLabel: tree?.label || "",
          });
        }
        (node.children || []).forEach((child) => walk(child, depth + 1, node));
      };

      walk(tree, 0, null);
      return flattened;
    }

    function matchesRecord(record, displayItem) {
      if (!displayItem) return false;
      const project = findProjectForRecord(record, hierarchy);
      if (!project) return false;
      const projectId = String(project.id || "");
      if (!projectId) return false;

      if (displayItem.matchMode === "subtree") {
        return displayItem.subtreeIds instanceof Set
          ? displayItem.subtreeIds.has(projectId)
          : false;
      }

      return projectId === String(displayItem.projectId || "");
    }

    function buildChartSelectorTree(allLabel = "全部项目（汇总）") {
      const createNode = (project) => {
        const children = getOrderedChildren(project.id).map((child) =>
          createNode(child),
        );
        return {
          value: `project:${project.id}`,
          label: project.name,
          triggerLabel: project.name,
          level: project.level,
          children,
        };
      };

      return [
        {
          value: "summary:all",
          label: allLabel,
          triggerLabel: allLabel,
          level: 0,
          children: [
            {
              value: "summary:1",
              label: "一级",
              triggerLabel: `${allLabel} / 一级`,
              level: 1,
              children: [],
            },
            {
              value: "summary:2",
              label: "二级",
              triggerLabel: `${allLabel} / 二级`,
              level: 2,
              children: [],
            },
            {
              value: "summary:3",
              label: "三级",
              triggerLabel: `${allLabel} / 三级`,
              level: 3,
              children: [],
            },
          ],
        },
        ...getOrderedRoots().map((rootNode) => createNode(rootNode)),
      ];
    }

    function buildAllProjectRows(options = {}) {
      const { includeZero = true } = options;
      const tree = buildBreakdownTree("summary:all", { includeZero });
      return flattenBreakdownTree(tree, { includeRoot: false });
    }

    return {
      hierarchy,
      statsById,
      parseSelectionValue,
      buildBreakdownTree,
      flattenBreakdownTree,
      buildChartSelectorTree,
      buildAllProjectRows,
      buildProjectPath(projectId) {
        return buildProjectPath(projectId, hierarchy);
      },
      findProjectForRecord(record) {
        return findProjectForRecord(record, hierarchy);
      },
      matchesRecord,
      getStat,
      getChildren,
      getOrderedChildren,
      hasChildren,
      getOrderedRoots,
      sortProjectNodesByTotalDesc,
      getProject(projectId) {
        return hierarchy.byId.get(String(projectId || "")) || null;
      },
      getProjectByName(name) {
        return hierarchy.byName.get(String(name || "").trim()) || null;
      },
      collectProjectSubtreeIds(projectId) {
        return collectProjectSubtreeIds(projectId, hierarchy);
      },
    };
  }

  window.ControlerProjectStats = {
    SINGLE_SUFFIX,
    TOTAL_SUFFIX,
    normalizeProjectLevel,
    parseCssColor,
    parseSpendTimeToMs,
    parseSpendTimeToHours,
    mixColor,
    defaultColorForName,
    buildProjectHierarchyIndex,
    collectProjectSubtreeIds,
    findProjectForRecord,
    buildProjectPath,
    createStatsContext,
  };
})();


;/* pages/data-index.js */
(() => {
  const projectStatsApi = window.ControlerProjectStats || null;

  function clampNumber(value, fallback = 0) {
    return Number.isFinite(value) ? value : fallback;
  }

  function parseFlexibleDate(value) {
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
    }
    if (typeof value !== "string" || !value.trim()) {
      return null;
    }

    const normalized = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      const [yearText, monthText, dayText] = normalized.split("-");
      const year = Number.parseInt(yearText, 10);
      const month = Number.parseInt(monthText, 10);
      const day = Number.parseInt(dayText, 10);
      if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
        return null;
      }
      return new Date(year, month - 1, day);
    }

    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function formatDateKey(value) {
    const date = parseFlexibleDate(value);
    if (!date) {
      return "";
    }
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function formatMonthKey(value) {
    const date = parseFlexibleDate(value);
    if (!date) {
      return "";
    }
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  function parseSpendTimeToHours(spendtime) {
    if (typeof projectStatsApi?.parseSpendTimeToHours === "function") {
      return projectStatsApi.parseSpendTimeToHours(spendtime);
    }
    if (!spendtime || typeof spendtime !== "string") return 0;

    let hours = 0;
    const dayMatch = spendtime.match(/(\d+)天/);
    const hourMatch = spendtime.match(/(\d+)小时/);
    const minuteMatch = spendtime.match(/(\d+)分钟/);
    const lessThanMinute =
      spendtime.includes("小于1分钟") || spendtime.includes("小于1min");

    if (dayMatch) hours += Number.parseInt(dayMatch[1], 10) * 24;
    if (hourMatch) hours += Number.parseInt(hourMatch[1], 10);
    if (minuteMatch) hours += Number.parseInt(minuteMatch[1], 10) / 60;
    if (lessThanMinute) hours += 1 / 60;
    return hours;
  }

  function buildFallbackProjectHierarchyIndex(projects = []) {
    const allNodes = (Array.isArray(projects) ? projects : [])
      .filter((project) => project && typeof project === "object")
      .map((project) => ({
        ...project,
        id: String(project.id || "").trim(),
        name: String(project.name || "").trim(),
        level: Number.parseInt(project.level, 10) || 1,
        parentId: project.parentId ? String(project.parentId).trim() : "",
      }))
      .filter((project) => project.id && project.name);

    const byId = new Map(allNodes.map((project) => [project.id, project]));
    const byName = new Map(allNodes.map((project) => [project.name, project]));
    const childrenByParent = new Map();
    const roots = [];

    const pushChild = (parentId, project) => {
      if (!childrenByParent.has(parentId)) {
        childrenByParent.set(parentId, []);
      }
      childrenByParent.get(parentId).push(project);
    };

    allNodes.forEach((project) => {
      if (
        project.parentId &&
        project.parentId !== project.id &&
        byId.has(project.parentId)
      ) {
        pushChild(project.parentId, project);
        return;
      }
      roots.push(project);
    });

    return {
      allNodes,
      byId,
      byName,
      childrenByParent,
      roots,
    };
  }

  function defaultPlanMatcher(plan, dateText) {
    const targetDateKey = formatDateKey(dateText) || String(dateText || "").trim();
    if (!plan || !targetDateKey) {
      return false;
    }
    if (typeof plan.isOnDate === "function") {
      return plan.isOnDate(targetDateKey);
    }
    const excludedDateSet =
      plan.excludedDateSet instanceof Set
        ? plan.excludedDateSet
        : Array.isArray(plan.excludedDates)
          ? new Set(
              plan.excludedDates
                .map((item) => formatDateKey(item) || String(item || "").trim())
                .filter(Boolean),
            )
          : null;
    if (excludedDateSet?.has(targetDateKey)) {
      return false;
    }

    const planDateKey = formatDateKey(plan.dateKey || plan.date);
    if (!planDateKey) {
      return false;
    }
    if (planDateKey === targetDateKey) {
      return true;
    }

    const repeat = String(plan.repeat || "none").trim().toLowerCase();
    if (repeat === "none" || targetDateKey < planDateKey) {
      return false;
    }
    if (repeat === "daily") {
      return true;
    }

    const targetDate = parseFlexibleDate(targetDateKey);
    if (!(targetDate instanceof Date) || Number.isNaN(targetDate.getTime())) {
      return false;
    }

    if (repeat === "weekly") {
      const repeatDays = Array.isArray(plan.repeatDays)
        ? plan.repeatDays
            .map((day) => Number.parseInt(day, 10))
            .filter((day) => day >= 0 && day <= 6)
        : [];
      if (repeatDays.length > 0) {
        return repeatDays.includes(targetDate.getDay());
      }
      const planDate = parseFlexibleDate(planDateKey);
      return (
        plan.dayOfWeek ??
        (planDate instanceof Date && !Number.isNaN(planDate.getTime())
          ? planDate.getDay()
          : -1)
      ) === targetDate.getDay();
    }

    if (repeat === "monthly") {
      const planDate = parseFlexibleDate(planDateKey);
      return (
        plan.dayOfMonth ??
        (planDate instanceof Date && !Number.isNaN(planDate.getTime())
          ? planDate.getDate()
          : 0)
      ) === targetDate.getDate();
    }

    return false;
  }

  function buildTimeRecord(record, sourceIndex) {
    if (!record?.name || !record?.spendtime) {
      return null;
    }

    const explicitStartTime = record.startTime ? new Date(record.startTime) : null;
    const explicitEndTime = record.endTime ? new Date(record.endTime) : null;
    const fallbackAnchor = record.timestamp ? new Date(record.timestamp) : null;
    const durationMs = Math.max(
      0,
      Math.round(parseSpendTimeToHours(record.spendtime) * 60 * 60 * 1000),
    );

    let startTime = explicitStartTime;
    let endTime = explicitEndTime;

    if (!(startTime instanceof Date) || Number.isNaN(startTime.getTime())) {
      if (
        fallbackAnchor instanceof Date &&
        !Number.isNaN(fallbackAnchor.getTime())
      ) {
        if (
          endTime instanceof Date &&
          !Number.isNaN(endTime.getTime()) &&
          durationMs > 0
        ) {
          startTime = new Date(endTime.getTime() - durationMs);
        } else {
          startTime = new Date(fallbackAnchor);
        }
      }
    }

    if (!(endTime instanceof Date) || Number.isNaN(endTime.getTime())) {
      if (
        startTime instanceof Date &&
        !Number.isNaN(startTime.getTime()) &&
        durationMs > 0
      ) {
        endTime = new Date(startTime.getTime() + durationMs);
      } else if (
        fallbackAnchor instanceof Date &&
        !Number.isNaN(fallbackAnchor.getTime())
      ) {
        endTime = new Date(fallbackAnchor.getTime() + durationMs);
      }
    }

    if (
      !(startTime instanceof Date) ||
      Number.isNaN(startTime.getTime()) ||
      !(endTime instanceof Date) ||
      Number.isNaN(endTime.getTime()) ||
      endTime.getTime() <= startTime.getTime()
    ) {
      return null;
    }

    const dateText = formatDateKey(startTime);
    if (!dateText) {
      return null;
    }

    return {
      ...record,
      sourceIndex,
      startTime,
      endTime,
      dateText,
      durationHours: clampNumber(parseSpendTimeToHours(record.spendtime), 0),
    };
  }

  function createStore(initialState = {}) {
    const state = {
      projects: [],
      records: [],
      plans: [],
      diaryEntries: [],
      ...initialState,
    };
    const dirty = new Set(["projects", "records", "plans", "diaryEntries"]);
    const cache = {
      projectById: new Map(),
      projectByName: new Map(),
      projectHierarchyIndex: null,
      recordsByDate: new Map(),
      recordsByDateHour: new Map(),
      timeRecords: [],
      diaryEntriesByMonth: new Map(),
      plansByDate: new Map(),
      planMatcher: null,
    };

    function invalidate(fields = []) {
      fields.forEach((fieldName) => {
        dirty.add(fieldName);
        if (fieldName === "projects") {
          cache.projectById.clear();
          cache.projectByName.clear();
          cache.projectHierarchyIndex = null;
        } else if (fieldName === "records") {
          cache.recordsByDate.clear();
          cache.recordsByDateHour.clear();
          cache.timeRecords = [];
        } else if (fieldName === "plans") {
          cache.plansByDate.clear();
          cache.planMatcher = null;
        } else if (fieldName === "diaryEntries") {
          cache.diaryEntriesByMonth.clear();
        }
      });
    }

    function replaceState(nextState = {}) {
      const changedFields = [];
      ["projects", "records", "plans", "diaryEntries"].forEach((fieldName) => {
        if (Object.prototype.hasOwnProperty.call(nextState, fieldName)) {
          state[fieldName] = Array.isArray(nextState[fieldName])
            ? nextState[fieldName]
            : [];
          changedFields.push(fieldName);
        }
      });
      invalidate(changedFields);
      return state;
    }

    function setField(fieldName, value) {
      state[fieldName] = Array.isArray(value) ? value : [];
      invalidate([fieldName]);
      return state[fieldName];
    }

    function markDirty(...fieldNames) {
      invalidate(fieldNames.flat().filter(Boolean));
    }

    function ensureProjectCache() {
      if (!dirty.has("projects") && cache.projectHierarchyIndex) {
        return;
      }

      const hierarchy =
        typeof projectStatsApi?.buildProjectHierarchyIndex === "function"
          ? projectStatsApi.buildProjectHierarchyIndex(state.projects)
          : buildFallbackProjectHierarchyIndex(state.projects);

      cache.projectHierarchyIndex = hierarchy;
      cache.projectById = hierarchy.byId ? new Map(hierarchy.byId) : new Map();
      cache.projectByName = hierarchy.byName
        ? new Map(hierarchy.byName)
        : new Map(
            (Array.isArray(state.projects) ? state.projects : [])
              .filter((project) => project?.name)
              .map((project) => [String(project.name), project]),
          );
      dirty.delete("projects");
    }

    function getProjectHierarchyIndex() {
      ensureProjectCache();
      return cache.projectHierarchyIndex;
    }

    function getProjectByIdMap() {
      ensureProjectCache();
      return cache.projectById;
    }

    function getProjectByNameMap() {
      ensureProjectCache();
      return cache.projectByName;
    }

    function getProjectForRecord(record) {
      ensureProjectCache();
      if (record?.projectId) {
        const byId = cache.projectById.get(String(record.projectId).trim());
        if (byId) {
          return byId;
        }
      }
      if (record?.name) {
        const normalizedName = String(record.name).trim();
        if (cache.projectByName.has(normalizedName)) {
          return cache.projectByName.get(normalizedName);
        }
        const leafName = normalizedName
          .split("/")
          .map((part) => part.trim())
          .filter(Boolean)
          .pop();
        if (leafName && cache.projectByName.has(leafName)) {
          return cache.projectByName.get(leafName);
        }
      }
      return null;
    }

    function ensureRecordCache() {
      if (!dirty.has("records") && cache.recordsByDate.size > 0) {
        return;
      }

      cache.recordsByDate = new Map();
      cache.recordsByDateHour = new Map();
      cache.timeRecords = [];

      (Array.isArray(state.records) ? state.records : []).forEach(
        (record, sourceIndex) => {
          const timeRecord = buildTimeRecord(record, sourceIndex);
          const dateText =
            timeRecord?.dateText ||
            formatDateKey(record?.timestamp || record?.startTime || record?.endTime);

          if (dateText) {
            if (!cache.recordsByDate.has(dateText)) {
              cache.recordsByDate.set(dateText, []);
            }
            cache.recordsByDate.get(dateText).push(record);
          }

          if (!timeRecord) {
            return;
          }

          cache.timeRecords.push(timeRecord);
          if (!cache.recordsByDateHour.has(timeRecord.dateText)) {
            cache.recordsByDateHour.set(timeRecord.dateText, new Map());
          }
          const hourKey = timeRecord.startTime.getHours();
          const hourBucket = cache.recordsByDateHour.get(timeRecord.dateText);
          if (!hourBucket.has(hourKey)) {
            hourBucket.set(hourKey, []);
          }
          hourBucket.get(hourKey).push(timeRecord);
        },
      );

      dirty.delete("records");
    }

    function getRecordsByDateMap() {
      ensureRecordCache();
      return cache.recordsByDate;
    }

    function getRecordsForDate(dateLike) {
      const dateKey = formatDateKey(dateLike);
      if (!dateKey) {
        return [];
      }
      ensureRecordCache();
      return cache.recordsByDate.get(dateKey) || [];
    }

    function getRecordsByDateHourMap() {
      ensureRecordCache();
      return cache.recordsByDateHour;
    }

    function getRecordsForDateHour(dateLike, hour) {
      const dateKey = formatDateKey(dateLike);
      if (!dateKey) {
        return [];
      }
      ensureRecordCache();
      return cache.recordsByDateHour.get(dateKey)?.get(Number(hour)) || [];
    }

    function getTimeRecords() {
      ensureRecordCache();
      return cache.timeRecords;
    }

    function ensureDiaryCache() {
      if (!dirty.has("diaryEntries") && cache.diaryEntriesByMonth.size > 0) {
        return;
      }

      cache.diaryEntriesByMonth = new Map();
      (Array.isArray(state.diaryEntries) ? state.diaryEntries : []).forEach(
        (entry) => {
          const monthKey = formatMonthKey(entry?.date);
          if (!monthKey) {
            return;
          }
          if (!cache.diaryEntriesByMonth.has(monthKey)) {
            cache.diaryEntriesByMonth.set(monthKey, []);
          }
          cache.diaryEntriesByMonth.get(monthKey).push(entry);
        },
      );

      cache.diaryEntriesByMonth.forEach((entries) => {
        entries.sort((left, right) => {
          const leftDate = String(left?.date || "");
          const rightDate = String(right?.date || "");
          if (leftDate === rightDate) {
            return String(right?.updatedAt || "").localeCompare(
              String(left?.updatedAt || ""),
            );
          }
          return leftDate < rightDate ? 1 : -1;
        });
      });

      dirty.delete("diaryEntries");
    }

    function getDiaryEntriesByMonthMap() {
      ensureDiaryCache();
      return cache.diaryEntriesByMonth;
    }

    function getDiaryEntriesForMonth(dateLike) {
      const monthKey = formatMonthKey(dateLike);
      if (!monthKey) {
        return [];
      }
      ensureDiaryCache();
      return cache.diaryEntriesByMonth.get(monthKey) || [];
    }

    function getPlansForDate(dateLike, matcher = defaultPlanMatcher) {
      const dateKey = formatDateKey(dateLike) || String(dateLike || "").trim();
      if (!dateKey) {
        return [];
      }
      if (dirty.has("plans") || cache.planMatcher !== matcher) {
        cache.plansByDate.clear();
        cache.planMatcher = matcher;
        dirty.delete("plans");
      }
      if (!cache.plansByDate.has(dateKey)) {
        cache.plansByDate.set(
          dateKey,
          (Array.isArray(state.plans) ? state.plans : []).filter((plan) =>
            matcher(plan, dateKey),
          ),
        );
      }
      return cache.plansByDate.get(dateKey) || [];
    }

    replaceState(initialState);

    return {
      replaceState,
      setField,
      markDirty,
      getState: () => state,
      getProjectHierarchyIndex,
      getProjectByIdMap,
      getProjectByNameMap,
      getProjectForRecord,
      getRecordsByDateMap,
      getRecordsForDate,
      getRecordsByDateHourMap,
      getRecordsForDateHour,
      getTimeRecords,
      getDiaryEntriesByMonthMap,
      getDiaryEntriesForMonth,
      getPlansForDate,
      formatDateKey,
      formatMonthKey,
      defaultPlanMatcher,
      parseFlexibleDate,
      parseSpendTimeToHours,
    };
  }

  window.ControlerDataIndex = {
    createStore,
    formatDateKey,
    formatMonthKey,
    defaultPlanMatcher,
    parseFlexibleDate,
    parseSpendTimeToHours,
  };
})();


;/* pages/index.js */
const uiTools = window.ControlerUI || null;
const storageBundleApi = window.ControlerStorageBundle || null;
let indexChartRuntimeLoader = null;
const INDEX_CHART_RUNTIME_URL = "offline-assets/chart.runtime.js";

function ensureIndexChartRuntimeLoaded() {
  if (typeof window.Chart !== "undefined") {
    return Promise.resolve();
  }
  if (indexChartRuntimeLoader) {
    return indexChartRuntimeLoader;
  }
  const loader =
    typeof uiTools?.loadScriptOnce === "function"
      ? uiTools.loadScriptOnce(INDEX_CHART_RUNTIME_URL)
      : Promise.reject(new Error("缺少动态图表脚本加载能力"));
  indexChartRuntimeLoader = loader.catch((error) => {
    indexChartRuntimeLoader = null;
    throw error;
  });
  return indexChartRuntimeLoader;
}
function localizeIndexUiText(value) {
  return window.ControlerI18n?.translateUiText?.(String(value ?? "")) || String(value ?? "");
}

function waitForIndexStorageReady() {
  if (typeof window.ControlerStorage?.whenReady !== "function") {
    return Promise.resolve(true);
  }
  return window.ControlerStorage.whenReady().catch((error) => {
    console.error("等待记录页原生存储就绪失败，继续使用当前快照:", error);
    return false;
  });
}

async function requestIndexConfirmation(message, options = {}) {
  if (uiTools?.confirmDialog) {
    return uiTools.confirmDialog({
      title: localizeIndexUiText(options.title || "请确认操作"),
      message: localizeIndexUiText(message),
      confirmText: localizeIndexUiText(options.confirmText || "确定"),
      cancelText: localizeIndexUiText(options.cancelText || "取消"),
      danger: !!options.danger,
    });
  }
  return confirm(localizeIndexUiText(message));
}

async function showIndexAlert(message, options = {}) {
  if (uiTools?.alertDialog) {
    await uiTools.alertDialog({
      title: localizeIndexUiText(options.title || "提示"),
      message: localizeIndexUiText(message),
      confirmText: localizeIndexUiText(options.confirmText || "知道了"),
      danger: !!options.danger,
    });
    return;
  }
  alert(localizeIndexUiText(message));
}

let fpt = null; // 第一次点击时间
let spt = null; // 第二次点击时间
let lastspt = null; // 上一次点击时间
let ptn = 0; // 点击次数
let diffMs = null; // 时间差（毫秒）
let records = []; // 存储时间间隔记录
let result = "";
let projects = []; // 存储项目对象的数组（新结构）
let selectedProject = ""; // 当前选中的项目ID
let isModalOpen = false; // 弹窗是否打开
let dragItem = null; // 拖拽的项目元素
let nextProject = ""; // 下一个项目（用于缩短时间功能）
let lastEnteredProjectName = ""; // 上一次输入的项目名称
let activeRecordId = null; // 当前展开删除按钮的记录ID
let editingRecordId = null; // 当前正在编辑名称的记录ID
let pendingRecordNameFocusId = ""; // 下一次重绘后需要聚焦的记录ID
let modalDurationTimer = null; // 配置计时弹窗中的动态时长计时器
let spendModalClickLocked = false;
let lastSpendButtonAcceptedAt = 0;
let modalProjectInputTarget = "project-name-input";
let modalProjectInputTargetManual = false;
let pendingSpendModalState = null;
let pendingRecordRollbackState = null;
let pendingDurationCarryoverState = null;
let indexLoadedRecordPeriodIds = [];
let indexDirtyRecordPeriodIds = new Set();
const TIMER_STATE_STORAGE_KEY = "timerSessionState";
const TIMER_STATE_STORAGE_VERSION = 2;
const SPEND_BUTTON_MULTI_CLICK_GUARD_MS = 1200;
const TABLE_SIZE_STORAGE_KEY = "uiTableScaleSettings";
const TABLE_SIZE_UPDATED_AT_KEY = "uiTableScaleSettingsUpdatedAt";
const TABLE_SIZE_EVENT_NAME = "ui:table-scale-settings-changed";
const INDEX_LOADING_OVERLAY_DELAY_MS = 150;
const INDEX_WIDGET_LAUNCH_CONFIRM_MAX_WAIT_MS = 1200;
const MOBILE_TABLE_SCALE_RATIO = 0.82;
const MOBILE_TABLE_EXTRA_SHRINK_RATIO = 2 / 3;
const PROJECT_HIERARCHY_EXPANSION_STORAGE_KEY =
  "projectHierarchyExpansionState";
const PROJECT_HIERARCHY_EXPANSION_STATE_VERSION = 1;
const PROJECT_TABLE_HEADER_DOUBLE_CLICK_DELAY_MS = 240;
let projectHierarchyExpansionState = createEmptyProjectHierarchyExpansionState();
let projectTotalsExpansionState = createEmptyProjectHierarchyExpansionState();
const indexWorkspaceRefreshScheduler = uiTools?.createFrameScheduler?.(() => {
  renderProjectsTable();
  updateProjectTotals();
  updateDisplay();
});
const INDEX_WIDGET_CONTEXT = (() => {
  let params = null;
  try {
    params = new URLSearchParams(window.location.search);
  } catch (error) {
    params = null;
  }

  return {
    enabled: params?.get("widgetMode") === "desktop-widget",
    kind: params?.get("widgetKind") || "",
    section: params?.get("widgetSection") || "",
    launchAction: params?.get("widgetAction") || "",
    launchSource: params?.get("widgetSource") || "",
  };
})();

function applyIndexDesktopWidgetMode() {
  if (!INDEX_WIDGET_CONTEXT.enabled) {
    return;
  }

  document.body.classList.add("desktop-widget-page", "desktop-widget-index-page");
  document.body.dataset.widgetKind = INDEX_WIDGET_CONTEXT.kind || "start-timer";
  document.body.dataset.widgetSection = INDEX_WIDGET_CONTEXT.section || "timer";
  document.title = localizeIndexUiText("开始计时 小组件");

  if (!document.getElementById("desktop-widget-index-style")) {
    const style = document.createElement("style");
    style.id = "desktop-widget-index-style";
    style.textContent = `
      body.desktop-widget-index-page {
        overflow: hidden;
      }

      body.desktop-widget-index-page .app-sidebar,
      body.desktop-widget-index-page .record-topbar,
      body.desktop-widget-index-page #project-container {
        display: none !important;
      }

      body.desktop-widget-index-page .record-main {
        margin: 0 !important;
        padding: 12px !important;
        display: flex;
        flex-direction: column;
        align-items: stretch;
        min-height: 0 !important;
        height: 100vh !important;
        box-sizing: border-box;
        overflow: hidden !important;
        gap: 12px;
      }

      body.desktop-widget-index-page #output {
        height: auto !important;
        min-height: 240px;
        flex: 1 1 auto;
        margin: 0 !important;
      }

      body.desktop-widget-index-page .record-action-bar {
        height: auto !important;
        margin: 0 !important;
        padding: 12px;
        justify-content: center;
      }

      body.desktop-widget-index-page .modal-overlay {
        padding: 12px;
        box-sizing: border-box;
        align-items: flex-start;
        overflow: auto;
      }

      body.desktop-widget-index-page .modal-content {
        max-width: min(100%, 680px) !important;
        width: min(100%, 680px) !important;
        max-height: calc(100vh - 24px);
        overflow: auto;
      }
    `;
    document.head.appendChild(style);
  }

  const widgetMain = document.querySelector(".record-main");
  window.ControlerUI?.mountDesktopWidgetScale?.(widgetMain, {
    minBaseWidth: 520,
    minBaseHeight: 360,
  });
}

function isIndexWidgetTimerFastPath() {
  return (
    INDEX_WIDGET_CONTEXT.enabled &&
    String(INDEX_WIDGET_CONTEXT.launchAction || "").trim() === "start-timer"
  );
}

function refreshIndexWorkspace({ immediate = false } = {}) {
  if (immediate || !indexWorkspaceRefreshScheduler) {
    renderProjectsTable();
    updateProjectTotals();
    updateDisplay();
    return;
  }
  indexWorkspaceRefreshScheduler.schedule();
}

let indexExternalStorageRefreshQueued = false;
let indexExternalStorageRefreshForceTimerSessionSync = false;
let recordInitialRevealQueued = false;
let indexDeferredRuntimePromise = null;
let indexInitialDataLoaded = false;
let indexLoadingOverlayTimer = 0;
let indexLoadingOverlayController = null;
let indexNativeBusyLockActive = false;
let indexPrimaryBindingsInitialized = false;
let indexModalBindingsInitialized = false;
let indexSecondaryBindingsInitialized = false;
let indexWidgetLaunchActionInitialized = false;
let indexPendingDurationCachePersist = false;
let indexExternalStorageRefreshBound = false;
let indexExternalStorageRefreshChangedSections = new Set();
let indexDeferredWorkspaceHydrationPromise = null;
let indexShellPageActive = uiTools?.isShellPageActive?.() !== false;
let indexWidgetLaunchCoreReady = false;
let indexPendingWidgetLaunchAction = null;
let indexDeferredHydrationPendingResume = false;
let indexDeferredRuntimePendingResume = false;
let indexExternalRefreshPendingResume = false;
let indexShellVisibilityBound = false;
const indexExternalStorageRefreshCoordinator =
  uiTools?.createDeferredRefreshController?.({
    run: async () => {
      await refreshIndexFromExternalStorageChange();
    },
  }) || null;

function bindIndexShellVisibilityGate() {
  if (indexShellVisibilityBound) {
    return;
  }
  indexShellVisibilityBound = true;
  const eventName =
    uiTools?.shellVisibilityEventName || "controler:shell-visibility-changed";
  window.addEventListener(eventName, (event) => {
    const detail =
      event && typeof event.detail === "object" && event.detail
        ? event.detail
        : {};
    const nextActive = detail.active !== false;
    if (indexShellPageActive === nextActive) {
      return;
    }

    indexShellPageActive = nextActive;
    if (!indexShellPageActive) {
      return;
    }

    if (indexExternalRefreshPendingResume) {
      indexExternalRefreshPendingResume = false;
      void refreshIndexFromExternalStorageChange();
    }
    if (indexDeferredHydrationPendingResume) {
      indexDeferredHydrationPendingResume = false;
      if (!indexInitialDataLoaded) {
        void hydrateIndexInitialForegroundWorkspace().catch((error) => {
          console.error("恢复记录页首屏工作区失败:", error);
        });
      } else {
        void scheduleIndexDeferredWorkspaceHydration();
      }
    }
    if (indexDeferredRuntimePendingResume) {
      indexDeferredRuntimePendingResume = false;
      void ensureIndexDeferredRuntimeLoaded();
    }
  });
}

function getIndexNormalizedChangedSections(changedSections = []) {
  if (typeof uiTools?.normalizeChangedSections === "function") {
    return uiTools.normalizeChangedSections(changedSections);
  }
  return Array.from(
    new Set(
      (Array.isArray(changedSections) ? changedSections : [])
        .map((section) => String(section || "").trim())
        .filter(Boolean),
    ),
  );
}

function hasIndexChangedPeriodOverlap(changedPeriodIds = [], currentPeriodIds = []) {
  if (typeof uiTools?.hasPeriodOverlap === "function") {
    return uiTools.hasPeriodOverlap(changedPeriodIds, currentPeriodIds);
  }
  const normalizedChanged = Array.isArray(changedPeriodIds)
    ? changedPeriodIds.map((periodId) => String(periodId || "").trim()).filter(Boolean)
    : [];
  const normalizedCurrent = Array.isArray(currentPeriodIds)
    ? currentPeriodIds.map((periodId) => String(periodId || "").trim()).filter(Boolean)
    : [];
  if (!normalizedChanged.length || !normalizedCurrent.length) {
    return true;
  }
  const currentSet = new Set(normalizedCurrent);
  return normalizedChanged.some((periodId) => currentSet.has(periodId));
}

function isIndexSerializableEqual(left, right) {
  if (typeof uiTools?.isSerializableEqual === "function") {
    return uiTools.isSerializableEqual(left, right);
  }
  try {
    return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
  } catch (error) {
    return false;
  }
}

function shouldRefreshIndexCoreData(nextData = null) {
  if (!nextData || typeof nextData !== "object") {
    return true;
  }
  return !isIndexSerializableEqual(nextData.projects || [], projects || []);
}

function shouldRefreshIndexForExternalChange(detail = {}) {
  const changedSections = getIndexNormalizedChangedSections(detail?.changedSections);
  if (!changedSections.length) {
    return true;
  }
  const recordsChanged = changedSections.includes("records");
  const projectsChanged =
    changedSections.includes("projects") || changedSections.includes("core");
  if (!recordsChanged && !projectsChanged) {
    return false;
  }
  if (
    recordsChanged &&
    hasIndexChangedPeriodOverlap(
      detail?.changedPeriods?.records || [],
      indexLoadedRecordPeriodIds,
    )
  ) {
    return true;
  }
  if (projectsChanged && shouldRefreshIndexCoreData(detail?.data)) {
    return true;
  }
  return false;
}

function ensureIndexDeferredRuntimeLoaded() {
  if (!indexShellPageActive) {
    indexDeferredRuntimePendingResume = true;
    return Promise.resolve();
  }
  if (indexDeferredRuntimePromise) {
    return indexDeferredRuntimePromise;
  }
  if (typeof uiTools?.loadScriptOnce !== "function") {
    indexDeferredRuntimePromise = Promise.resolve();
    return indexDeferredRuntimePromise;
  }

  indexDeferredRuntimePromise = Promise.allSettled([
    uiTools.loadScriptOnce("guide-bundle.js"),
    uiTools.loadScriptOnce("guide-ui.js"),
  ]).then((results) => {
    results.forEach((result) => {
      if (result.status === "rejected") {
        console.error("加载记录页延后脚本失败:", result.reason);
      }
    });
    renderRecordGuideCard();
  });
  return indexDeferredRuntimePromise;
}

function renderRecordGuideCard() {
  const container = document.getElementById("record-guide-card");
  const guideCard = window.ControlerGuideBundle?.getGuideCard?.("record");
  if (!(container instanceof HTMLElement)) {
    return;
  }
  if (INDEX_WIDGET_CONTEXT.enabled) {
    container.hidden = true;
    return;
  }
  if (!guideCard || typeof window.ControlerGuideUI?.renderCard !== "function") {
    container.hidden = true;
    return;
  }
  container.hidden = false;
  window.ControlerGuideUI.renderCard(container, guideCard);
}

function queueRecordInitialReveal() {
  const body = document.body;
  if (!(body instanceof HTMLElement)) {
    return;
  }
  if (!body.classList.contains("record-bootstrap-pending")) {
    uiTools?.markNativePageReady?.();
    return;
  }
  if (recordInitialRevealQueued) {
    return;
  }

  recordInitialRevealQueued = true;
  const schedule =
    typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : (callback) => window.setTimeout(callback, 16);
  schedule(() => {
    schedule(() => {
      recordInitialRevealQueued = false;
      body.classList.remove("record-bootstrap-pending");
      body.classList.add("record-bootstrap-ready");
      uiTools?.markPerfStage?.("first-render-done");
      uiTools?.markNativePageReady?.();
    });
  });
}

function getIndexLoadingOverlayElement() {
  return document.getElementById("record-loading-overlay");
}

function getIndexLoadingOverlayController() {
  if (indexLoadingOverlayController) {
    return indexLoadingOverlayController;
  }
  const overlay = getIndexLoadingOverlayElement();
  if (!(overlay instanceof HTMLElement)) {
    return null;
  }
  indexLoadingOverlayController = uiTools?.createPageLoadingOverlayController?.({
    overlay,
    inlineHost: ".record-main",
  }) || null;
  return indexLoadingOverlayController;
}

function syncIndexNativeBusyLock(active) {
  const nextActive = !!active;
  if (indexNativeBusyLockActive === nextActive) {
    return;
  }
  indexNativeBusyLockActive = nextActive;
  window.ControlerNativeBridge?.emitEvent?.("ui.busy-state", {
    href: window.location.href,
    isBusy: nextActive,
  });
}

function setIndexLoadingState(options = {}) {
  const overlay = getIndexLoadingOverlayElement();
  if (!(overlay instanceof HTMLElement)) {
    syncIndexNativeBusyLock(false);
    return;
  }

  const {
    active = false,
    mode = "inline",
    title = "正在加载数据中",
    delayMs = 0,
    lockNativeExit = false,
    message =
      mode === "fullscreen"
        ? "正在读取记录与项目，请稍候"
        : "正在刷新当前内容，请稍候",
  } = options;
  const loadingController = getIndexLoadingOverlayController();
  syncIndexNativeBusyLock(active && lockNativeExit);

  if (!loadingController) {
    syncIndexNativeBusyLock(false);
    return;
  }

  loadingController.setState({
    active,
    mode,
    title,
    message,
    delayMs,
  });
}

const indexRefreshController = uiTools?.createAtomicRefreshController?.({
  defaultDelayMs: INDEX_LOADING_OVERLAY_DELAY_MS,
  showLoading: (loadingOptions = {}) => {
    setIndexLoadingState({
      active: true,
      ...loadingOptions,
    });
  },
  hideLoading: () => {
    setIndexLoadingState({
      active: false,
    });
  },
});

function scheduleIndexUiCommit(callback) {
  const schedule =
    typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : (task) => window.setTimeout(task, 16);
  schedule(() => {
    callback();
  });
}

function scheduleSilentIndexProjectDurationCachePersist() {
  if (indexPendingDurationCachePersist) {
    return;
  }
  if (!Array.isArray(projects) || projects.length === 0) {
    return;
  }
  indexPendingDurationCachePersist = true;
  const persist = () => {
    indexPendingDurationCachePersist = false;
    if (typeof window.ControlerStorage?.replaceCoreState === "function") {
      window.ControlerStorage
        .replaceCoreState(
          {
            projects,
          },
          {
            emitChange: false,
            reason: "duration-cache-repair",
          },
        )
        .catch((error) => {
          console.error("静默持久化项目时长缓存失败:", error);
        });
      return;
    }
    try {
      localStorage.setItem("projects", JSON.stringify(projects));
    } catch (error) {
      console.error("本地持久化项目时长缓存失败:", error);
    }
  };

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(
      () => {
        persist();
      },
      {
        timeout: 1200,
      },
    );
    return;
  }

  window.setTimeout(persist, 240);
}

async function hydrateIndexWorkspace(options = {}) {
  const includeProjects = options.includeProjects !== false;
  const includeRecords = options.includeRecords !== false;
  await Promise.all([
    includeProjects
      ? loadProjectsFromStorage({
          applyUi: false,
        })
      : Promise.resolve(projects),
    includeRecords ? loadRecordsFromStorage() : Promise.resolve(records),
  ]);
  return {
    includeProjects,
    includeRecords,
    projectCount: Array.isArray(projects) ? projects.length : 0,
    recordCount: Array.isArray(records) ? records.length : 0,
    periodIds: indexLoadedRecordPeriodIds.slice(),
  };
}

function commitIndexWorkspaceSnapshot(options = {}) {
  const forceTimerSessionSync = options.forceTimerSessionSync === true;
  const markFirstCommit = options.markFirstCommit === true;
  const repairedDurationCache = ensureIndexProjectDurationCaches({
    persist: false,
  });
  loadTimerSessionState({
    forceLatestRecord: forceTimerSessionSync,
  });
  updateProjectsList();
  updateExistingProjectsList();
  updateParentProjectSelect(1);
  uiTools?.refreshEnhancedSelect?.(document.getElementById("parent-project-select"));
  renderRecordGuideCard();

  return new Promise((resolve) => {
    scheduleIndexUiCommit(() => {
      refreshIndexWorkspace({
        immediate: true,
      });
      indexInitialDataLoaded = true;
      queueRecordInitialReveal();
      if (markFirstCommit) {
        uiTools?.markPerfStage?.("first-data-commit", {
          projectCount: projects.length,
          recordCount: records.length,
          periodIds: indexLoadedRecordPeriodIds.slice(),
        });
      }
      if (repairedDurationCache) {
        scheduleSilentIndexProjectDurationCachePersist();
      }
      resolve({
        repairedDurationCache,
      });
    });
  });
}

async function refreshIndexFromExternalStorageChange() {
  if (!indexShellPageActive) {
    indexExternalRefreshPendingResume = true;
    indexExternalStorageRefreshQueued = false;
    return;
  }
  const forceTimerSessionSync = indexExternalStorageRefreshForceTimerSessionSync;
  const changedSections = Array.from(indexExternalStorageRefreshChangedSections);
  indexExternalStorageRefreshQueued = false;
  indexExternalStorageRefreshForceTimerSessionSync = false;
  indexExternalStorageRefreshChangedSections = new Set();
  hideAllProjectSuggestions();
  const includeProjects =
    changedSections.length === 0 || changedSections.includes("core");
  const includeRecords =
    changedSections.length === 0 || changedSections.includes("records");

  try {
    if (!indexRefreshController) {
      await hydrateIndexWorkspace({
        includeProjects,
        includeRecords,
      });
      await commitIndexWorkspaceSnapshot({
        forceTimerSessionSync,
      });
      return;
    }

    const refreshResult = await indexRefreshController.run(
      async () =>
        hydrateIndexWorkspace({
          includeProjects,
          includeRecords,
        }),
      {
        delayMs: INDEX_LOADING_OVERLAY_DELAY_MS,
        loadingOptions: {
          mode: indexInitialDataLoaded ? "inline" : "fullscreen",
          message: "正在同步最新记录与项目，请稍候",
        },
        commit: async () => {
          await commitIndexWorkspaceSnapshot({
            forceTimerSessionSync,
          });
        },
      },
    );
    if (refreshResult?.stale) {
      uiTools?.markPerfStage?.("refresh-skipped", {
        reason: "index-refresh-stale",
      });
    }
  } catch (error) {
    console.error("刷新记录页外部存储失败:", error);
  }
}

function bindIndexExternalStorageRefresh() {
  if (indexExternalStorageRefreshBound) {
    return;
  }
  indexExternalStorageRefreshBound = true;
  window.addEventListener("controler:storage-data-changed", (event) => {
    const detail = event?.detail || {};
    const changedSections = getIndexNormalizedChangedSections(detail.changedSections);
    if (changedSections.includes("guideState")) {
      renderRecordGuideCard();
    }
    if (
      !shouldRefreshIndexForExternalChange(detail)
    ) {
      uiTools?.markPerfStage?.("refresh-skipped", {
        reason: "index-storage-change-irrelevant",
      });
      return;
    }
    const shouldForceTimerSessionSync =
      detail.reason === "import" ||
      String(detail.source || "")
        .toLowerCase()
        .includes("import");
    if (shouldForceTimerSessionSync) {
      indexExternalStorageRefreshForceTimerSessionSync = true;
    }
    changedSections.forEach((section) => {
      const normalizedSection = String(section || "").trim();
      if (normalizedSection) {
        indexExternalStorageRefreshChangedSections.add(normalizedSection);
      }
    });
    if (indexExternalStorageRefreshQueued) {
      return;
    }
    indexExternalStorageRefreshQueued = true;
    if (indexExternalStorageRefreshCoordinator) {
      indexExternalStorageRefreshCoordinator.enqueue(detail);
      return;
    }
    const schedule =
      typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame.bind(window)
        : (callback) => window.setTimeout(callback, 16);
    schedule(refreshIndexFromExternalStorageChange);
  });
}

function readTableScaleSettings() {
  try {
    return JSON.parse(localStorage.getItem(TABLE_SIZE_STORAGE_KEY) || "{}");
  } catch (error) {
    console.error("读取表格尺寸设置失败:", error);
    return {};
  }
}

function getMobileResponsiveScaleFactor() {
  return isMobileViewport()
    ? MOBILE_TABLE_SCALE_RATIO * MOBILE_TABLE_EXTRA_SHRINK_RATIO
    : 1;
}

function getTableScaleSetting(tableKey, fallback = 1) {
  const settings = readTableScaleSettings();
  const perScale = parseFloat(settings?.per?.[tableKey]);
  const oldProjectScale = parseFloat(
    localStorage.getItem("projectTableScale") || "",
  );

  const safePer = Number.isFinite(perScale)
    ? Math.min(Math.max(perScale, 0.1), 2.2)
    : Number.isFinite(oldProjectScale)
      ? Math.min(Math.max(oldProjectScale, 0.1), 2.2)
      : fallback;

  return Math.min(
    Math.max(safePer * getMobileResponsiveScaleFactor(), 0.1),
    2.2,
  );
}

function clampValue(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function getRecordSurfaceScale(container, baseScale = null) {
  const resolvedBaseScale = Number.isFinite(baseScale)
    ? baseScale
    : getTableScaleSetting("indexProjectTable", 1);
  const viewportHeight =
    window.innerHeight || document.documentElement.clientHeight || 0;
  const containerWidth = container?.clientWidth || window.innerWidth || 0;
  const widthBaseline = isMobileViewport() ? 300 : 360;
  const widthScale = clampValue(containerWidth / widthBaseline, 0.66, 1);
  const heightScale = clampValue(viewportHeight / 820, 0.72, 1);
  return clampValue(
    resolvedBaseScale * Math.min(widthScale, heightScale),
    0.55,
    2.2,
  );
}

function createEmptyProjectHierarchyExpansionState() {
  return {
    version: PROJECT_HIERARCHY_EXPANSION_STATE_VERSION,
    level1: {},
    level2: {},
  };
}

function getProjectHierarchyExpansionLevelKey(projectOrLevel) {
  const resolvedLevel =
    typeof projectOrLevel === "number"
      ? normalizeProjectLevel(projectOrLevel)
      : normalizeProjectLevel(projectOrLevel?.level);
  if (resolvedLevel === 1) {
    return "level1";
  }
  if (resolvedLevel === 2) {
    return "level2";
  }
  return "";
}

function normalizeProjectHierarchyExpansionState(
  rawState = null,
  projectList = projects,
) {
  const normalized = createEmptyProjectHierarchyExpansionState();
  const level1Ids = new Set();
  const level2Ids = new Set();

  (Array.isArray(projectList) ? projectList : []).forEach((project) => {
    const projectId = String(project?.id || "").trim();
    if (!projectId) {
      return;
    }

    const projectLevel = normalizeProjectLevel(project.level);
    if (projectLevel === 1) {
      level1Ids.add(projectId);
      return;
    }
    if (projectLevel === 2) {
      level2Ids.add(projectId);
    }
  });

  const applyEntries = (levelKey, allowedIds) => {
    const source =
      rawState && typeof rawState === "object" && rawState[levelKey]
        ? rawState[levelKey]
        : {};
    if (!source || typeof source !== "object") {
      return;
    }

    Object.keys(source).forEach((projectId) => {
      const normalizedProjectId = String(projectId || "").trim();
      if (!normalizedProjectId || !allowedIds.has(normalizedProjectId)) {
        return;
      }
      if (source[projectId] === true) {
        normalized[levelKey][normalizedProjectId] = true;
      }
    });
  };

  applyEntries("level1", level1Ids);
  applyEntries("level2", level2Ids);

  return normalized;
}

function loadProjectHierarchyExpansionStateFromStorage() {
  let rawSerialized = "";
  let parsedState = null;

  try {
    rawSerialized =
      localStorage.getItem(PROJECT_HIERARCHY_EXPANSION_STORAGE_KEY) || "";
    parsedState = rawSerialized ? JSON.parse(rawSerialized) : null;
  } catch (error) {
    console.error("读取项目表格展开状态失败:", error);
  }

  const normalized = normalizeProjectHierarchyExpansionState(
    parsedState,
    projects,
  );
  projectHierarchyExpansionState = normalized;

  const normalizedSerialized = JSON.stringify(normalized);
  if (rawSerialized === normalizedSerialized) {
    return;
  }

  try {
    localStorage.setItem(
      PROJECT_HIERARCHY_EXPANSION_STORAGE_KEY,
      normalizedSerialized,
    );
  } catch (error) {
    console.error("写回项目表格展开状态失败:", error);
  }
}

function saveProjectHierarchyExpansionState() {
  const normalized = normalizeProjectHierarchyExpansionState(
    projectHierarchyExpansionState,
    projects,
  );
  const serialized = JSON.stringify(normalized);
  projectHierarchyExpansionState = normalized;

  try {
    const previousSerialized =
      localStorage.getItem(PROJECT_HIERARCHY_EXPANSION_STORAGE_KEY) || "";
    if (previousSerialized !== serialized) {
      localStorage.setItem(PROJECT_HIERARCHY_EXPANSION_STORAGE_KEY, serialized);
    }
  } catch (error) {
    console.error("保存项目表格展开状态失败:", error);
  }
}

function isProjectHierarchyExpanded(project) {
  const levelKey = getProjectHierarchyExpansionLevelKey(project);
  const projectId = String(project?.id || "").trim();
  if (!levelKey || !projectId) {
    return false;
  }
  return !!projectHierarchyExpansionState[levelKey]?.[projectId];
}

function setProjectHierarchyExpanded(project, expanded) {
  const levelKey = getProjectHierarchyExpansionLevelKey(project);
  const projectId = String(project?.id || "").trim();
  if (!levelKey || !projectId) {
    return false;
  }

  const nextLevelState = {
    ...(projectHierarchyExpansionState[levelKey] || {}),
  };
  if (expanded) {
    nextLevelState[projectId] = true;
  } else {
    delete nextLevelState[projectId];
  }

  const previousSerialized = JSON.stringify(
    normalizeProjectHierarchyExpansionState(projectHierarchyExpansionState, projects),
  );
  projectHierarchyExpansionState = {
    ...createEmptyProjectHierarchyExpansionState(),
    ...projectHierarchyExpansionState,
    [levelKey]: nextLevelState,
  };

  const nextSerialized = JSON.stringify(
    normalizeProjectHierarchyExpansionState(projectHierarchyExpansionState, projects),
  );
  if (previousSerialized === nextSerialized) {
    return false;
  }

  saveProjectHierarchyExpansionState();
  return true;
}

function isProjectTotalsExpanded(project) {
  const levelKey = getProjectHierarchyExpansionLevelKey(project);
  const projectId = String(project?.id || "").trim();
  if (!levelKey || !projectId) {
    return false;
  }
  return !!projectTotalsExpansionState[levelKey]?.[projectId];
}

function setProjectTotalsExpanded(project, expanded) {
  const levelKey = getProjectHierarchyExpansionLevelKey(project);
  const projectId = String(project?.id || "").trim();
  if (!levelKey || !projectId) {
    return false;
  }

  const previousSerialized = JSON.stringify(
    normalizeProjectHierarchyExpansionState(projectTotalsExpansionState, projects),
  );
  const nextLevelState = {
    ...(projectTotalsExpansionState[levelKey] || {}),
  };
  if (expanded) {
    nextLevelState[projectId] = true;
  } else {
    delete nextLevelState[projectId];
  }

  projectTotalsExpansionState = normalizeProjectHierarchyExpansionState(
    {
      ...createEmptyProjectHierarchyExpansionState(),
      ...projectTotalsExpansionState,
      [levelKey]: nextLevelState,
    },
    projects,
  );

  return (
    previousSerialized !==
    JSON.stringify(
      normalizeProjectHierarchyExpansionState(projectTotalsExpansionState, projects),
    )
  );
}

function createProjectTablePlaceholder(text, padding = "10px") {
  const placeholder = document.createElement("div");
  placeholder.style.color = "var(--muted-text-color)";
  placeholder.style.fontSize = "12px";
  placeholder.style.fontStyle = "italic";
  placeholder.style.padding = padding;
  return Object.assign(placeholder, { textContent: text });
}

function applyProjectTableHeaderContent(
  header,
  project,
  {
    expanded = false,
    fontSize = 14,
    align = "left",
  } = {},
) {
  if (!(header instanceof HTMLElement)) {
    return;
  }

  const projectName =
    typeof project?.name === "string" && project.name.trim()
      ? project.name.trim()
      : "未命名项目";

  header.textContent = "";
  header.dataset.dragLabel = projectName;
  header.dataset.projectId = String(project?.id || "").trim();
  header.style.display = "block";

  const name = document.createElement("span");
  name.textContent = projectName;
  name.style.display = "block";
  name.style.minWidth = "0";
  name.style.overflow = "hidden";
  name.style.textOverflow = "ellipsis";
  name.style.whiteSpace = "nowrap";
  name.style.textAlign = align;

  header.appendChild(name);
  header.setAttribute("role", "button");
  header.setAttribute("aria-expanded", expanded ? "true" : "false");
  header.setAttribute(
    "title",
    expanded ? "单击编辑，双击收起子项目" : "单击编辑，双击展开子项目",
  );
}

function bindProjectTableHeaderClickActions(header, project, toggleExpanded) {
  let clickTimer = null;

  const clearClickTimer = () => {
    if (clickTimer !== null) {
      window.clearTimeout(clickTimer);
      clickTimer = null;
    }
  };

  header.addEventListener("click", (event) => {
    if (event.defaultPrevented) {
      clearClickTimer();
      return;
    }

    event.stopPropagation();
    if (clickTimer !== null) {
      clearClickTimer();
      toggleExpanded();
      return;
    }

    clickTimer = window.setTimeout(() => {
      clickTimer = null;
      showProjectEditModal(project);
    }, PROJECT_TABLE_HEADER_DOUBLE_CLICK_DELAY_MS);
  });

  header.addEventListener("dblclick", (event) => {
    event.preventDefault();
    event.stopPropagation();
    clearClickTimer();
  });
}

function renderProjectTotalTreeNode(
  projectNode,
  statsContext,
  {
    summaryScale = 1,
    depth = 1,
  } = {},
) {
  if (!projectNode || !statsContext?.getStat) {
    return null;
  }

  const projectLevel = normalizeProjectLevel(projectNode.level);
  const stat = statsContext.getStat(projectNode.id);
  const totalMs =
    Number.isFinite(stat?.totalMs) && stat.totalMs >= 0 ? stat.totalMs : 0;
  const childNodes =
    typeof statsContext.getOrderedChildren === "function"
      ? statsContext.getOrderedChildren(projectNode.id)
      : statsContext.getChildren(projectNode.id) || [];
  const children = childNodes.filter(
    (child) =>
      normalizeProjectLevel(child.level) === Math.min(projectLevel + 1, 3),
  );
  const expandable = projectLevel < 3 && children.length > 0;
  const expanded = expandable ? isProjectTotalsExpanded(projectNode) : false;
  const compactProjectTotals = isCompactAndroidProjectTotalsLayout();
  const levelColor =
    normalizeProjectColorToHex(
      projectNode.color || projectNode.raw?.color || "",
      getThemeProjectColor(projectLevel),
    ) || getThemeProjectColor(projectLevel);

  if (compactProjectTotals) {
    const gap = Math.max(5, Math.round(6 * summaryScale));
    const leadingGap = Math.max(6, Math.round(7 * summaryScale));
    const dotSize = Math.max(
      projectLevel === 1 ? 8 : 7,
      Math.round((projectLevel === 1 ? 9 : 8) * summaryScale),
    );
    const labelStartPadding = dotSize + leadingGap;
    const card = document.createElement("div");
    card.style.display = "flex";
    card.style.flexDirection = "column";
    card.style.gap = `${gap}px`;
    card.style.padding = `${Math.max(8, Math.round(10 * summaryScale))}px`;
    card.style.borderRadius = `${Math.max(10, Math.round(12 * summaryScale))}px`;
    card.style.background =
      depth === 1
        ? "color-mix(in srgb, var(--bg-tertiary) 88%, transparent)"
        : "color-mix(in srgb, var(--bg-quaternary) 92%, transparent)";
    card.style.border = `1px solid ${getProjectColorShadow(levelColor, 0.24)}`;
    card.style.boxSizing = "border-box";
    card.style.minWidth = "0";
    if (depth > 1) {
      card.style.marginLeft = `${Math.max(5, Math.round(6 * summaryScale))}px`;
    }

    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.flexDirection = "column";
    header.style.gap = `${Math.max(4, Math.round(5 * summaryScale))}px`;
    header.style.minWidth = "0";
    header.style.cursor = expandable ? "pointer" : "default";
    header.setAttribute(
      "title",
      expandable
        ? expanded
          ? "单击收起子项目"
          : "单击展开子项目"
        : projectNode.name,
    );
    if (expandable) {
      header.tabIndex = 0;
      header.setAttribute("role", "button");
    }

    const topRow = document.createElement("div");
    topRow.style.display = "flex";
    topRow.style.alignItems = "flex-start";
    topRow.style.justifyContent = "flex-start";
    topRow.style.gap = `${gap}px`;
    topRow.style.minWidth = "0";

    const leading = document.createElement("div");
    leading.style.display = "flex";
    leading.style.alignItems = "flex-start";
    leading.style.gap = `${leadingGap}px`;
    leading.style.minWidth = "0";
    leading.style.flex = "1 1 auto";

    const colorDot = document.createElement("span");
    colorDot.style.display = "inline-block";
    colorDot.style.width = `${dotSize}px`;
    colorDot.style.height = `${dotSize}px`;
    colorDot.style.borderRadius = "999px";
    colorDot.style.backgroundColor = levelColor;
    colorDot.style.flex = "0 0 auto";
    colorDot.style.marginTop = `${Math.max(3, Math.round(3 * summaryScale))}px`;

    const label = document.createElement("span");
    label.style.color = "var(--text-color)";
    label.style.fontWeight = projectLevel === 3 ? "500" : "600";
    label.style.fontSize = `${Math.max(
      projectLevel === 1 ? 10 : 9,
      Math.round(
        (projectLevel === 1 ? 13 : projectLevel === 2 ? 12 : 11) *
          summaryScale,
      ) - 1,
    )}px`;
    label.style.lineHeight = "1.28";
    label.style.minWidth = "0";
    label.style.flex = "1 1 auto";
    label.style.whiteSpace = "normal";
    label.style.overflowWrap = "anywhere";
    label.textContent = projectNode.name;

    leading.appendChild(colorDot);
    leading.appendChild(label);
    topRow.appendChild(leading);

    const value = document.createElement("div");
    value.style.color =
      totalMs > 0 ? "var(--text-color)" : "var(--muted-text-color)";
    value.style.fontSize = `${Math.max(9, Math.round(11 * summaryScale) - 1)}px`;
    value.style.fontWeight = totalMs > 0 ? "600" : "500";
    value.style.lineHeight = "1.3";
    value.style.paddingLeft = `${labelStartPadding}px`;
    value.style.minWidth = "0";
    value.style.whiteSpace = "normal";
    value.style.overflowWrap = "anywhere";
    value.textContent = `总时长：${
      totalMs > 0
        ? formatProjectTotalDurationForCard(totalMs, { compact: true })
        : "暂无"
    }`;

    header.appendChild(topRow);
    header.appendChild(value);
    card.appendChild(header);

    if (expandable) {
      const toggleExpanded = () => {
        setProjectTotalsExpanded(projectNode, !isProjectTotalsExpanded(projectNode));
        updateProjectTotals();
      };
      header.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleExpanded();
      });
      header.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        toggleExpanded();
      });
    }

    if (expanded) {
      const childrenContainer = document.createElement("div");
      childrenContainer.style.display = "flex";
      childrenContainer.style.flexDirection = "column";
      childrenContainer.style.gap = `${gap}px`;
      childrenContainer.style.minWidth = "0";
      childrenContainer.style.paddingLeft = `${Math.max(4, Math.round(6 * summaryScale))}px`;
      childrenContainer.style.borderLeft = `1px solid ${getProjectColorShadow(levelColor, 0.28)}`;

      children.forEach((childNode) => {
        const childElement = renderProjectTotalTreeNode(childNode, statsContext, {
          summaryScale,
          depth: depth + 1,
        });
        if (childElement) {
          childrenContainer.appendChild(childElement);
        }
      });

      card.appendChild(childrenContainer);
    }

    return card;
  }

  const cardPadding = Math.max(6, Math.round(8 * summaryScale));
  const gap = Math.max(4, Math.round(6 * summaryScale));
  const borderRadius = Math.max(9, Math.round(11 * summaryScale));
  const card = document.createElement("div");
  card.style.display = "flex";
  card.style.flexDirection = "column";
  card.style.gap = `${gap}px`;
  card.style.padding = `${cardPadding}px`;
  card.style.borderRadius = `${borderRadius}px`;
  card.style.background =
    projectLevel === 1 ? "var(--bg-tertiary)" : "var(--bg-quaternary)";
  card.style.border = `1px solid ${getProjectColorShadow(levelColor, 0.24)}`;
  card.style.boxSizing = "border-box";
  card.style.minWidth = "0";
  if (depth > 1) {
    card.style.marginLeft = `${Math.max(8, Math.round(10 * summaryScale))}px`;
  }

  const header = document.createElement("div");
  header.style.display = "grid";
  header.style.gridTemplateColumns = "minmax(0, 1fr) auto";
  header.style.alignItems = "start";
  header.style.columnGap = `${gap}px`;
  header.style.rowGap = `${Math.max(2, Math.round(4 * summaryScale))}px`;
  header.style.cursor = expandable ? "pointer" : "default";
  header.setAttribute(
    "title",
    expandable
      ? expanded
        ? "单击收起子项目"
        : "单击展开子项目"
      : projectNode.name,
  );

  const leading = document.createElement("div");
  leading.style.display = "flex";
  leading.style.alignItems = "flex-start";
  leading.style.gap = `${Math.max(5, Math.round(6 * summaryScale))}px`;
  leading.style.minWidth = "0";
  leading.style.flex = "1 1 auto";

  const colorDot = document.createElement("span");
  colorDot.style.display = "inline-block";
  colorDot.style.width = `${Math.max(8, Math.round(10 * summaryScale))}px`;
  colorDot.style.height = `${Math.max(8, Math.round(10 * summaryScale))}px`;
  colorDot.style.borderRadius = "999px";
  colorDot.style.backgroundColor = levelColor;
  colorDot.style.flex = "0 0 auto";
  colorDot.style.marginTop = `${Math.max(2, Math.round(2 * summaryScale))}px`;

  const label = document.createElement("span");
  label.style.color = "var(--text-color)";
  label.style.fontWeight = projectLevel === 3 ? "500" : "600";
  label.style.fontSize = `${Math.max(
    11,
    Math.round((projectLevel === 1 ? 14 : 13) * summaryScale),
  )}px`;
  label.style.lineHeight = "1.28";
  label.style.minWidth = "0";
  label.style.overflow = "hidden";
  label.style.textOverflow = "ellipsis";
  label.style.whiteSpace = "normal";
  label.style.overflowWrap = "anywhere";
  label.style.flex = "1 1 auto";
  label.textContent = projectNode.name;

  leading.appendChild(colorDot);
  leading.appendChild(label);

  const value = document.createElement("span");
  value.style.color =
    totalMs > 0 ? "var(--text-color)" : "var(--muted-text-color)";
  value.style.fontSize = `${Math.max(10, Math.round(12 * summaryScale))}px`;
  value.style.fontWeight = totalMs > 0 ? "600" : "400";
  value.style.lineHeight = "1.25";
  value.style.textAlign = "right";
  value.style.maxWidth = "100%";
  value.style.justifySelf = "end";
  value.style.whiteSpace = "nowrap";
  value.textContent =
    totalMs > 0
      ? formatProjectTotalDurationForCard(totalMs)
      : "暂无用时记录";

  header.appendChild(leading);
  header.appendChild(value);
  card.appendChild(header);

  if (expandable) {
    header.addEventListener("click", (event) => {
      event.stopPropagation();
      setProjectTotalsExpanded(projectNode, !isProjectTotalsExpanded(projectNode));
      updateProjectTotals();
    });
  }

  if (expanded) {
    const childrenContainer = document.createElement("div");
    childrenContainer.style.display = "flex";
    childrenContainer.style.flexDirection = "column";
    childrenContainer.style.gap = `${gap}px`;
    childrenContainer.style.minWidth = "0";
    childrenContainer.style.paddingLeft = `${Math.max(6, Math.round(8 * summaryScale))}px`;
    childrenContainer.style.borderLeft = `1px solid ${getProjectColorShadow(levelColor, 0.28)}`;

    children.forEach((childNode) => {
      const childElement = renderProjectTotalTreeNode(childNode, statsContext, {
        summaryScale,
        depth: depth + 1,
      });
      if (childElement) {
        childrenContainer.appendChild(childElement);
      }
    });

    card.appendChild(childrenContainer);
  }

  return card;
}

function formatRecordCardTime(recordDate, compact = false) {
  const resolvedDate = recordDate instanceof Date ? recordDate : new Date(recordDate);
  if (Number.isNaN(resolvedDate.getTime())) {
    return "";
  }
  if (!compact) {
    return resolvedDate.toLocaleString();
  }
  const month = resolvedDate.getMonth() + 1;
  const day = resolvedDate.getDate();
  const hours = String(resolvedDate.getHours()).padStart(2, "0");
  const minutes = String(resolvedDate.getMinutes()).padStart(2, "0");
  return `${month}/${day} ${hours}:${minutes}`;
}

function isSameCalendarDay(leftDate, rightDate) {
  if (!(leftDate instanceof Date) || !(rightDate instanceof Date)) {
    return false;
  }
  return (
    leftDate.getFullYear() === rightDate.getFullYear() &&
    leftDate.getMonth() === rightDate.getMonth() &&
    leftDate.getDate() === rightDate.getDate()
  );
}

function formatRecordDayHeading(targetDate, referenceDate = new Date()) {
  if (!(targetDate instanceof Date) || Number.isNaN(targetDate.getTime())) {
    return "";
  }

  const today = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
  );
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (isSameCalendarDay(targetDate, today)) {
    return "今天";
  }
  if (isSameCalendarDay(targetDate, yesterday)) {
    return "昨天";
  }
  return `${targetDate.getMonth() + 1}月${targetDate.getDate()}日`;
}

function bindTableScaleLiveRefresh() {
  const rerender = () => {
    refreshIndexWorkspace();
  };
  const rerenderForResize = () => {
    const isInlineRecordEditActive = !!editingRecordId;
    const isRecordNameInputFocused = document.activeElement?.classList?.contains(
      "record-name-input",
    );
    const keyboardOpen = document.body?.classList.contains(
      "controler-keyboard-open",
    );
    if (
      document.body?.classList.contains("controler-mobile-runtime") &&
      isInlineRecordEditActive &&
      (isRecordNameInputFocused || keyboardOpen)
    ) {
      return;
    }
    refreshIndexWorkspace();
  };

  window.addEventListener(TABLE_SIZE_EVENT_NAME, rerender);
  window.addEventListener("resize", rerenderForResize);
  window.addEventListener("storage", (event) => {
    if (
      event.key === TABLE_SIZE_STORAGE_KEY ||
      event.key === TABLE_SIZE_UPDATED_AT_KEY
    ) {
      rerender();
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) rerender();
  });
}

function formatMinutesToSpendtime(totalMinutes) {
  const safeMinutes = Math.max(1, Math.round(totalMinutes));
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  if (hours > 0) {
    return `${hours}小时${minutes}分钟`;
  }
  return `${minutes}分钟`;
}

function parseSpendtimeToMs(spendtime) {
  const text = typeof spendtime === "string" ? spendtime : "";
  if (!text) return 0;

  const dayMatch = text.match(/(\d+)天/);
  const hourMatch = text.match(/(\d+)小时/);
  const minuteMatch = text.match(/(\d+)分钟/);
  const lessThanMinute =
    text.includes("小于1分钟") || text.includes("小于1min");

  let totalMs = 0;
  if (dayMatch) totalMs += parseInt(dayMatch[1], 10) * 24 * 60 * 60 * 1000;
  if (hourMatch) totalMs += parseInt(hourMatch[1], 10) * 60 * 60 * 1000;
  if (minuteMatch) totalMs += parseInt(minuteMatch[1], 10) * 60 * 1000;
  if (lessThanMinute) totalMs += 30 * 1000;

  return Math.max(0, totalMs);
}

function serializeTimerDate(value) {
  return value instanceof Date && !Number.isNaN(value.getTime())
    ? value.toISOString()
    : null;
}

function deserializeTimerDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeDurationCarryoverState(rawState) {
  if (!rawState || typeof rawState !== "object") return null;

  const carryoverMs =
    Number.isFinite(rawState.carryoverMs) && rawState.carryoverMs > 0
      ? Math.max(1, Math.floor(rawState.carryoverMs))
      : null;
  if (!carryoverMs) return null;

  return {
    carryoverMs,
    sourceRecordId:
      typeof rawState.sourceRecordId === "string" ? rawState.sourceRecordId : "",
    sourceProject:
      typeof rawState.sourceProject === "string"
        ? rawState.sourceProject.trim()
        : "",
    targetProject:
      typeof rawState.targetProject === "string"
        ? rawState.targetProject.trim()
        : "",
    createdAt: typeof rawState.createdAt === "string" ? rawState.createdAt : "",
  };
}

function normalizeRecordDurationMeta(rawMeta) {
  if (!rawMeta || typeof rawMeta !== "object") return null;

  const toSafeMs = (value) =>
    Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
  const originalMs = toSafeMs(rawMeta.originalMs);
  const recordedMs = toSafeMs(rawMeta.recordedMs);
  const returnedMs = toSafeMs(rawMeta.returnedMs);
  const returnTargetProject =
    typeof rawMeta.returnTargetProject === "string"
      ? rawMeta.returnTargetProject.trim()
      : "";
  const appliedCarryover = normalizeDurationCarryoverState(
    rawMeta.appliedCarryover,
  );

  if (
    !Number.isFinite(originalMs) &&
    !Number.isFinite(recordedMs) &&
    !Number.isFinite(returnedMs) &&
    !returnTargetProject &&
    !appliedCarryover
  ) {
    return null;
  }

  return {
    originalMs,
    recordedMs,
    returnedMs,
    returnTargetProject,
    appliedCarryover,
  };
}

function normalizeClickCount(value) {
  return Number.isFinite(value) && value > 0
    ? Math.max(1, Math.floor(value))
    : 0;
}

function resetTimerCoreState() {
  ptn = 0;
  fpt = null;
  spt = null;
  lastspt = null;
  diffMs = null;
  pendingRecordRollbackState = null;
  pendingDurationCarryoverState = null;
}

function getLatestRecordedClickCount() {
  return records.reduce((highestClickCount, record) => {
    return Math.max(highestClickCount, normalizeClickCount(record?.clickCount));
  }, 0);
}

function findLatestRecordByClickCount(clickCount) {
  const targetClickCount = normalizeClickCount(clickCount);
  if (!targetClickCount) return null;
  return (
    [...records]
      .reverse()
      .find(
        (record) => normalizeClickCount(record?.clickCount) === targetClickCount,
      ) || null
  );
}

function resolveRecordDurationMs(record) {
  if (Number.isFinite(record?.durationMs) && record.durationMs >= 0) {
    return Math.round(record.durationMs);
  }
  if (
    Number.isFinite(record?.durationMeta?.recordedMs) &&
    record.durationMeta.recordedMs >= 0
  ) {
    return Math.round(record.durationMeta.recordedMs);
  }
  return parseSpendtimeToMs(record?.spendtime);
}

function resolveCarryoverAnchorFromRecord(record) {
  if (
    !record ||
    !pendingDurationCarryoverState ||
    pendingDurationCarryoverState.sourceRecordId !== record.id ||
    !Number.isFinite(pendingDurationCarryoverState.carryoverMs) ||
    pendingDurationCarryoverState.carryoverMs <= 0
  ) {
    return null;
  }

  const rawEndTime =
    deserializeTimerDate(record.rawEndTime) || resolveRecordTime(record);
  if (!(rawEndTime instanceof Date) || Number.isNaN(rawEndTime.getTime())) {
    return null;
  }

  return new Date(
    rawEndTime.getTime() - Math.round(pendingDurationCarryoverState.carryoverMs),
  );
}

function restoreTimerCoreStateFromRecord(record, clickCount) {
  const normalizedClickCount = normalizeClickCount(clickCount);
  if (!record || normalizedClickCount < 2) {
    return false;
  }

  const carryoverAnchor = resolveCarryoverAnchorFromRecord(record);
  if (carryoverAnchor) {
    ptn = normalizedClickCount;
    fpt = new Date(carryoverAnchor);
    spt = new Date(carryoverAnchor);
    lastspt = new Date(carryoverAnchor);
    diffMs = null;
    pendingRecordRollbackState = null;
    return true;
  }

  const endTime = resolveRecordTime(record);
  if (!(endTime instanceof Date) || Number.isNaN(endTime.getTime())) {
    return false;
  }

  const durationMs = Math.max(resolveRecordDurationMs(record), 0);
  const startTime =
    deserializeTimerDate(record?.startTime) ||
    new Date(Math.max(endTime.getTime() - durationMs, 0));

  ptn = normalizedClickCount;
  fpt = startTime instanceof Date ? new Date(startTime) : null;
  spt = new Date(endTime);
  lastspt = new Date(endTime);
  diffMs = Math.max(durationMs, 0);
  pendingRecordRollbackState = null;
  return true;
}

function capturePendingSpendModalState(clickTime = new Date()) {
  const resolvedClickTime =
    clickTime instanceof Date && !Number.isNaN(clickTime.getTime())
      ? new Date(clickTime)
      : new Date();
  pendingSpendModalState = {
    clickTime:
      serializeTimerDate(resolvedClickTime) || resolvedClickTime.toISOString(),
    baseState: captureTimerCoreState(),
    createdAt: new Date().toISOString(),
  };
  return pendingSpendModalState;
}

function clearPendingSpendModalState() {
  pendingSpendModalState = null;
}

function getPendingSpendModalClickTime() {
  return deserializeTimerDate(pendingSpendModalState?.clickTime);
}

function getPendingSpendModalBaseState() {
  return normalizeTimerRollbackState(pendingSpendModalState?.baseState);
}

function captureTimerCoreState() {
  return {
    ptn:
      Number.isFinite(ptn) && ptn >= 0 ? Math.max(0, Math.floor(ptn)) : 0,
    fpt: serializeTimerDate(fpt),
    spt: serializeTimerDate(spt),
    lastspt: serializeTimerDate(lastspt),
    diffMs: Number.isFinite(diffMs) ? Math.max(diffMs, 0) : null,
    pendingDurationCarryoverState: pendingDurationCarryoverState
      ? { ...pendingDurationCarryoverState }
      : null,
  };
}

function normalizeTimerRollbackState(rawState) {
  if (!rawState || typeof rawState !== "object") return null;

  const normalizedPtn =
    Number.isFinite(rawState.ptn) && rawState.ptn >= 0
      ? Math.max(0, Math.floor(rawState.ptn))
      : 0;

  return {
    ptn: normalizedPtn,
    fpt: typeof rawState.fpt === "string" ? rawState.fpt : null,
    spt: typeof rawState.spt === "string" ? rawState.spt : null,
    lastspt: typeof rawState.lastspt === "string" ? rawState.lastspt : null,
    diffMs:
      Number.isFinite(rawState.diffMs) && rawState.diffMs >= 0
        ? rawState.diffMs
        : null,
    pendingDurationCarryoverState: normalizeDurationCarryoverState(
      rawState.pendingDurationCarryoverState,
    ),
  };
}

function restoreTimerCoreState(rawState) {
  const state = normalizeTimerRollbackState(rawState);
  if (!state) return false;

  ptn = state.ptn;
  fpt = deserializeTimerDate(state.fpt);
  spt = deserializeTimerDate(state.spt);
  lastspt = deserializeTimerDate(state.lastspt);
  diffMs = state.diffMs;
  pendingDurationCarryoverState = state.pendingDurationCarryoverState
    ? { ...state.pendingDurationCarryoverState }
    : null;
  pendingRecordRollbackState = null;
  return true;
}

function generateRecordId() {
  return `${Date.now()}${Math.random().toString(36).slice(2, 11)}`;
}

function resolveRecordTime(record) {
  const endDate = deserializeTimerDate(record?.endTime);
  if (endDate) return endDate;
  const sptDate = deserializeTimerDate(record?.sptTime);
  if (sptDate) return sptDate;
  return deserializeTimerDate(record?.timestamp);
}

function createRecordEntry(name, spendtime, options = {}) {
  const normalizedName = String(name || "").trim() || "未命名项目";
  const durationMeta = normalizeRecordDurationMeta(options.durationMeta);
  const resolveDateOption = (value) => {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return new Date(value);
    }
    if (typeof value === "string") {
      const parsed = deserializeTimerDate(value);
      if (parsed) return parsed;
    }
    return null;
  };

  const recordStartTime =
    resolveDateOption(options.startTime) ||
    (fpt instanceof Date && !Number.isNaN(fpt.getTime()) ? new Date(fpt) : null);
  const rawEndTime =
    resolveDateOption(options.rawEndTime) ||
    (spt instanceof Date && !Number.isNaN(spt.getTime()) ? new Date(spt) : null) ||
    new Date();
  const recordEndTime = resolveDateOption(options.endTime) || new Date(rawEndTime);

  const boundedDurationMs =
    recordStartTime instanceof Date && !Number.isNaN(recordStartTime.getTime())
      ? Math.max(recordEndTime.getTime() - recordStartTime.getTime(), 0)
      : null;
  const recordedDurationMs =
    Number.isFinite(boundedDurationMs)
      ? Math.round(boundedDurationMs)
      : Number.isFinite(options.durationMs) && options.durationMs >= 0
        ? Math.round(options.durationMs)
        : Number.isFinite(durationMeta?.recordedMs) && durationMeta.recordedMs >= 0
          ? Math.round(durationMeta.recordedMs)
          : parseSpendtimeToMs(spendtime);
  const normalizedSpendtime = formatDurationFromMs(recordedDurationMs);

  const recordTime = serializeTimerDate(recordEndTime) || new Date().toISOString();
  const recordStartTimeText = serializeTimerDate(recordStartTime);
  const rawEndTimeText = serializeTimerDate(rawEndTime) || recordTime;
  const normalizedNextProjectName = resolveRecordNextProjectName(
    {
      name: normalizedName,
      nextProjectName: options.nextProjectName,
      nextProjectId: options.nextProjectId,
    },
    projects,
  );
  const normalizedNextProjectId =
    typeof options.nextProjectId === "string" && options.nextProjectId.trim()
      ? options.nextProjectId.trim()
      : projects.find((project) => project.name === normalizedNextProjectName)?.id ||
        null;
  return {
    id: generateRecordId(),
    timestamp: recordTime,
    sptTime: recordTime,
    name: normalizedName,
    spendtime: normalizedSpendtime,
    projectId: projects.find((project) => project.name === normalizedName)?.id || null,
    nextProjectName: normalizedNextProjectName,
    nextProjectId: normalizedNextProjectId,
    startTime: recordStartTimeText,
    endTime: recordTime,
    rawEndTime: rawEndTimeText,
    durationMs: Number.isFinite(recordedDurationMs) ? recordedDurationMs : null,
    clickCount:
      Number.isFinite(ptn) && ptn > 0 ? Math.max(1, Math.floor(ptn)) : null,
    timerRollbackState: pendingRecordRollbackState
      ? { ...pendingRecordRollbackState }
      : null,
    durationMeta,
  };
}

function formatDurationHoursOnlyFromMs(ms) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return "小于1min";
  }

  const totalMinutes = Math.floor(ms / 60000);
  if (totalMinutes <= 0) return "小于1min";

  return formatMinutesToSpendtime(totalMinutes);
}

function formatProjectTotalDurationForCard(ms, options = {}) {
  const { compact = false } = options;
  if (!compact) {
    return formatDurationHoursOnlyFromMs(ms);
  }

  if (!Number.isFinite(ms) || ms <= 0) {
    return "小于1分";
  }

  const totalMinutes = Math.floor(ms / 60000);
  if (totalMinutes <= 0) {
    return "小于1分";
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) {
    return `${hours}小时${minutes}分`;
  }
  if (hours > 0) {
    return `${hours}小时`;
  }
  return `${minutes}分`;
}

function getLatestRecordForTimerSession(recordsList = records) {
  if (!Array.isArray(recordsList) || recordsList.length === 0) {
    return null;
  }

  let latestRecord = null;
  let latestTimeMs = -1;
  let latestClickCount = -1;

  recordsList.forEach((record) => {
    const recordTime = resolveRecordTime(record);
    if (!(recordTime instanceof Date) || Number.isNaN(recordTime.getTime())) {
      return;
    }

    const recordTimeMs = recordTime.getTime();
    const recordClickCount = normalizeClickCount(record?.clickCount);
    const shouldReplace =
      recordTimeMs > latestTimeMs ||
      (recordTimeMs === latestTimeMs && recordClickCount >= latestClickCount);

    if (shouldReplace) {
      latestRecord = record;
      latestTimeMs = recordTimeMs;
      latestClickCount = recordClickCount;
    }
  });

  return latestRecord;
}

function resolveRecordNextProjectName(record, projectList = projects) {
  const nextProjectId = String(record?.nextProjectId || "").trim();
  if (nextProjectId) {
    const matchedProject = (Array.isArray(projectList) ? projectList : []).find(
      (project) => String(project?.id || "").trim() === nextProjectId,
    );
    const matchedProjectName = String(matchedProject?.name || "").trim();
    if (matchedProjectName) {
      return matchedProjectName;
    }
  }

  const explicitNextProjectName = String(record?.nextProjectName || "").trim();
  if (explicitNextProjectName) {
    return explicitNextProjectName;
  }

  const currentProjectName = String(record?.name || "").trim();
  return currentProjectName || "未命名项目";
}

function syncTimerSessionStateWithLatestRecord(options = {}) {
  const { force = false, persist = false } = options;
  const latestRecord = getLatestRecordForTimerSession(records);
  if (!latestRecord) {
    return false;
  }

  const latestEndTime = resolveRecordTime(latestRecord);
  if (!(latestEndTime instanceof Date) || Number.isNaN(latestEndTime.getTime())) {
    return false;
  }

  const currentAnchor = [lastspt, spt, fpt]
    .filter((value) => value instanceof Date && !Number.isNaN(value.getTime()))
    .sort((left, right) => right.getTime() - left.getTime())[0] || null;
  const hasProjectContext = [selectedProject, nextProject, lastEnteredProjectName].some(
    (value) => typeof value === "string" && value.trim(),
  );
  const latestProjectName = resolveRecordNextProjectName(latestRecord, projects);
  const shouldRestore =
    force ||
    !currentAnchor ||
    normalizeClickCount(ptn) <= 0 ||
    currentAnchor.getTime() + 1000 < latestEndTime.getTime() ||
    !hasProjectContext;

  if (!shouldRestore) {
    return false;
  }

  const restoredClickCount = Math.max(
    normalizeClickCount(latestRecord?.clickCount),
    getLatestRecordedClickCount(),
    2,
  );
  const restoredAnchor = new Date(latestEndTime);

  ptn = restoredClickCount;
  fpt = new Date(restoredAnchor);
  spt = new Date(restoredAnchor);
  lastspt = new Date(restoredAnchor);
  diffMs = null;
  pendingRecordRollbackState = null;
  pendingDurationCarryoverState = null;
  selectedProject = latestProjectName;
  nextProject = latestProjectName;
  lastEnteredProjectName = latestProjectName;

  if (persist) {
    persistTimerSessionState();
  }
  return true;
}

function resetShortenTimeInputs(shouldRefreshDisplay = false) {
  const shortenHoursInput = document.getElementById("shorten-hours");
  const shortenMinutesInput = document.getElementById("shorten-minutes");
  const errorEl = document.getElementById("shorten-error");

  if (shortenHoursInput) {
    shortenHoursInput.value = "";
  }
  if (shortenMinutesInput) {
    shortenMinutesInput.value = "";
  }
  if (errorEl) {
    errorEl.style.display = "none";
  }

  if (shouldRefreshDisplay) {
    updateRemainingTimeDisplay();
  }
}

function persistTimerSessionState() {
  try {
    localStorage.setItem(
      TIMER_STATE_STORAGE_KEY,
      JSON.stringify({
        sessionVersion: TIMER_STATE_STORAGE_VERSION,
        ptn:
          Number.isFinite(ptn) && ptn >= 0 ? Math.max(0, Math.floor(ptn)) : 0,
        fpt: serializeTimerDate(fpt),
        spt: serializeTimerDate(spt),
        lastspt: serializeTimerDate(lastspt),
        diffMs: Number.isFinite(diffMs) ? Math.max(diffMs, 0) : null,
        selectedProject,
        nextProject,
        lastEnteredProjectName,
        pendingDurationCarryoverState: pendingDurationCarryoverState
          ? { ...pendingDurationCarryoverState }
          : null,
        savedAt: new Date().toISOString(),
      }),
    );
  } catch (error) {
    console.error("保存计时状态失败:", error);
  }
}

function repairLegacyTimerSessionState(rawState) {
  const sessionVersion =
    Number.isFinite(rawState?.sessionVersion) && rawState.sessionVersion > 0
      ? Math.floor(rawState.sessionVersion)
      : 0;
  if (sessionVersion >= TIMER_STATE_STORAGE_VERSION) {
    return false;
  }

  const hasProjectContext = [selectedProject, nextProject, lastEnteredProjectName].some(
    (value) => typeof value === "string" && value.trim(),
  );
  const latestRecordedClickCount = getLatestRecordedClickCount();

  if (ptn >= 2) {
    if (findLatestRecordByClickCount(ptn)) {
      return false;
    }

    if (latestRecordedClickCount >= 2) {
      const latestConfirmedRecord = findLatestRecordByClickCount(
        latestRecordedClickCount,
      );
      if (
        latestConfirmedRecord &&
        restoreTimerCoreStateFromRecord(
          latestConfirmedRecord,
          latestRecordedClickCount,
        )
      ) {
        return true;
      }
    }

    if (hasProjectContext) {
      const fallbackAnchor =
        [fpt, spt, lastspt]
          .filter((value) => value instanceof Date && !Number.isNaN(value.getTime()))
          .sort((left, right) => left.getTime() - right.getTime())[0] || null;
      if (fallbackAnchor) {
        ptn = 1;
        fpt = new Date(fallbackAnchor);
        spt = null;
        lastspt = null;
        diffMs = null;
        pendingRecordRollbackState = null;
        pendingDurationCarryoverState = null;
        return true;
      }
    }

    resetTimerCoreState();
    return true;
  }

  if (ptn === 1 && !hasProjectContext) {
    resetTimerCoreState();
    return true;
  }

  return false;
}

function loadTimerSessionState(options = {}) {
  const { forceLatestRecord = false } = options;
  try {
    const raw = localStorage.getItem(TIMER_STATE_STORAGE_KEY);
    if (!raw) {
      const restored = syncTimerSessionStateWithLatestRecord({
        force: true,
        persist: true,
      });
      if (!restored) {
        resetTimerCoreState();
        persistTimerSessionState();
      }
      return;
    }

    const parsed = JSON.parse(raw);
    const hasStoredDiffKey =
      parsed &&
      typeof parsed === "object" &&
      Object.prototype.hasOwnProperty.call(parsed, "diffMs");
    ptn =
      Number.isFinite(parsed?.ptn) && parsed.ptn >= 0
        ? Math.max(0, Math.floor(parsed.ptn))
        : 0;
    fpt = deserializeTimerDate(parsed?.fpt);
    spt = deserializeTimerDate(parsed?.spt);
    lastspt = deserializeTimerDate(parsed?.lastspt);
    diffMs =
      Number.isFinite(parsed?.diffMs) && parsed.diffMs >= 0
        ? parsed.diffMs
        : null;
    selectedProject =
      typeof parsed?.selectedProject === "string" ? parsed.selectedProject : "";
    nextProject =
      typeof parsed?.nextProject === "string" ? parsed.nextProject : "";
    lastEnteredProjectName =
      typeof parsed?.lastEnteredProjectName === "string"
        ? parsed.lastEnteredProjectName
        : "";
    pendingDurationCarryoverState = normalizeDurationCarryoverState(
      parsed?.pendingDurationCarryoverState,
    );

    if (ptn >= 2 && fpt instanceof Date && spt instanceof Date) {
      if (hasStoredDiffKey) {
        diffMs =
          Number.isFinite(parsed?.diffMs) && parsed.diffMs >= 0
            ? Math.max(parsed.diffMs, 0)
            : null;
      } else {
        // 兼容旧数据：历史状态没有 diffMs 字段时才回退到重算
        diffMs = Math.max(spt.getTime() - fpt.getTime(), 0);
      }
    } else if (ptn < 2) {
      diffMs = null;
      spt = ptn >= 1 ? null : spt;
    }

    if (repairLegacyTimerSessionState(parsed)) {
      persistTimerSessionState();
    }

    syncTimerSessionStateWithLatestRecord({
      force: forceLatestRecord,
      persist: true,
    });
  } catch (error) {
    console.error("读取计时状态失败:", error);
    const restored = syncTimerSessionStateWithLatestRecord({
      force: true,
      persist: true,
    });
    if (!restored) {
      resetTimerCoreState();
      persistTimerSessionState();
    }
  }
}

function seedFeatureTestDataIfMissing() {
  return;
}

const PROJECT_COLOR_TONE_PROFILES = {
  1: [
    {
      name: "松雾绿",
      hue: 146,
      hueVariance: 7,
      baseSaturation: 48,
      baseLightness: 44,
      saturationRange: [38, 60],
      lightnessRange: [36, 58],
    },
    {
      name: "冰川青",
      hue: 170,
      hueVariance: 6,
      baseSaturation: 42,
      baseLightness: 48,
      saturationRange: [34, 54],
      lightnessRange: [40, 60],
    },
    {
      name: "深海蓝",
      hue: 206,
      hueVariance: 8,
      baseSaturation: 46,
      baseLightness: 45,
      saturationRange: [38, 58],
      lightnessRange: [37, 57],
    },
  ],
  2: [
    {
      name: "琥珀砂",
      hue: 34,
      hueVariance: 7,
      baseSaturation: 58,
      baseLightness: 49,
      saturationRange: [46, 72],
      lightnessRange: [40, 62],
    },
    {
      name: "茶金棕",
      hue: 22,
      hueVariance: 6,
      baseSaturation: 46,
      baseLightness: 47,
      saturationRange: [36, 58],
      lightnessRange: [38, 60],
    },
    {
      name: "岩雾蓝",
      hue: 214,
      hueVariance: 8,
      baseSaturation: 38,
      baseLightness: 50,
      saturationRange: [30, 52],
      lightnessRange: [42, 62],
    },
  ],
  3: [
    {
      name: "莓果酒红",
      hue: 336,
      hueVariance: 8,
      baseSaturation: 44,
      baseLightness: 45,
      saturationRange: [34, 58],
      lightnessRange: [36, 58],
    },
    {
      name: "靛夜蓝",
      hue: 230,
      hueVariance: 9,
      baseSaturation: 44,
      baseLightness: 44,
      saturationRange: [34, 58],
      lightnessRange: [35, 56],
    },
    {
      name: "陶土赤",
      hue: 14,
      hueVariance: 7,
      baseSaturation: 54,
      baseLightness: 48,
      saturationRange: [42, 68],
      lightnessRange: [40, 60],
    },
  ],
};

const PROJECT_COLOR_PRESET_VARIANTS = [
  { name: "深调", saturationDelta: -8, lightnessDelta: -12 },
  { name: "柔和", saturationDelta: -4, lightnessDelta: -4 },
  { name: "标准", saturationDelta: 2, lightnessDelta: 4 },
  { name: "明亮", saturationDelta: 8, lightnessDelta: 12 },
];

const PROJECT_COLOR_DESCENDANT_TONE_RULES = {
  2: {
    name: "一级同调",
    hueVariance: 4,
    saturationOffset: -4,
    lightnessOffset: 10,
    saturationSpread: 10,
    lightnessSpread: 10,
    saturationMin: 24,
    saturationMax: 78,
    lightnessMin: 32,
    lightnessMax: 82,
  },
  3: {
    name: "一级同调",
    hueVariance: 3,
    saturationOffset: -10,
    lightnessOffset: -2,
    saturationSpread: 8,
    lightnessSpread: 10,
    saturationMin: 18,
    saturationMax: 68,
    lightnessMin: 24,
    lightnessMax: 70,
  },
};

let activeCreateProjectColorController = null;
let projectColorCanvasContext = null;

function getProjectColorProfiles(level = 1, options = {}) {
  const normalizedLevel = normalizeProjectLevel(level);
  const dynamicProfiles = buildDynamicProjectColorProfiles(
    normalizedLevel,
    options,
  );
  if (dynamicProfiles.length > 0) {
    return dynamicProfiles;
  }
  return (
    PROJECT_COLOR_TONE_PROFILES[normalizedLevel] ||
    PROJECT_COLOR_TONE_PROFILES[1]
  );
}

function clampProjectColorNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function normalizeProjectHue(hue) {
  const normalizedHue = Math.round(hue) % 360;
  return normalizedHue < 0 ? normalizedHue + 360 : normalizedHue;
}

function randomProjectColorInt(min, max) {
  const safeMin = Math.ceil(Math.min(min, max));
  const safeMax = Math.floor(Math.max(min, max));
  return Math.floor(Math.random() * (safeMax - safeMin + 1)) + safeMin;
}

function hslColorToHex(hue, saturation, lightness) {
  const safeHue = normalizeProjectHue(hue);
  const safeSaturation = clampProjectColorNumber(saturation, 0, 100) / 100;
  const safeLightness = clampProjectColorNumber(lightness, 0, 100) / 100;
  const chroma =
    (1 - Math.abs(2 * safeLightness - 1)) * safeSaturation;
  const huePrime = safeHue / 60;
  const secondary = chroma * (1 - Math.abs((huePrime % 2) - 1));
  let red = 0;
  let green = 0;
  let blue = 0;

  if (huePrime >= 0 && huePrime < 1) {
    red = chroma;
    green = secondary;
  } else if (huePrime < 2) {
    red = secondary;
    green = chroma;
  } else if (huePrime < 3) {
    green = chroma;
    blue = secondary;
  } else if (huePrime < 4) {
    green = secondary;
    blue = chroma;
  } else if (huePrime < 5) {
    red = secondary;
    blue = chroma;
  } else {
    red = chroma;
    blue = secondary;
  }

  const matchValue = safeLightness - chroma / 2;
  const toHex = (value) =>
    Math.round((value + matchValue) * 255)
      .toString(16)
      .padStart(2, "0");

  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

function hexColorToRgb(color) {
  const normalized = String(color || "").trim().toLowerCase();
  const hexMatch = normalized.match(/^#([0-9a-f]{6})$/i);
  if (!hexMatch) return null;
  return {
    r: parseInt(hexMatch[1].slice(0, 2), 16),
    g: parseInt(hexMatch[1].slice(2, 4), 16),
    b: parseInt(hexMatch[1].slice(4, 6), 16),
  };
}

function rgbStringToHexColor(color) {
  const rgbMatch = String(color || "")
    .trim()
    .match(
      /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*[\d.]+)?\s*\)$/i,
    );
  if (!rgbMatch) return "";
  const toHex = (value) =>
    clampProjectColorNumber(parseInt(value, 10), 0, 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(rgbMatch[1])}${toHex(rgbMatch[2])}${toHex(rgbMatch[3])}`;
}

function getProjectColorCanvasContext() {
  if (projectColorCanvasContext) {
    return projectColorCanvasContext;
  }

  if (typeof document === "undefined") {
    return null;
  }

  const canvas = document.createElement("canvas");
  projectColorCanvasContext = canvas.getContext("2d");
  return projectColorCanvasContext;
}

function normalizeProjectColorToHex(color, fallback = "") {
  const rawColor = String(color || "").trim();
  if (!rawColor) return fallback;

  if (/^#([0-9a-f]{6})$/i.test(rawColor)) {
    return rawColor.toLowerCase();
  }

  if (/^#([0-9a-f]{3})$/i.test(rawColor)) {
    return `#${rawColor
      .slice(1)
      .split("")
      .map((char) => char + char)
      .join("")}`.toLowerCase();
  }

  const canvasContext = getProjectColorCanvasContext();
  if (!canvasContext) {
    const rgbHex = rgbStringToHexColor(rawColor);
    return rgbHex || fallback;
  }

  try {
    canvasContext.fillStyle = "#000000";
    canvasContext.fillStyle = rawColor;
    const normalized = canvasContext.fillStyle;
    if (/^#([0-9a-f]{6})$/i.test(normalized)) {
      return normalized.toLowerCase();
    }
    const rgbHex = rgbStringToHexColor(normalized);
    return rgbHex || fallback;
  } catch (error) {
    return fallback;
  }
}

function hexColorToHsl(color) {
  const rgb = hexColorToRgb(normalizeProjectColorToHex(color, ""));
  if (!rgb) {
    return null;
  }

  const red = rgb.r / 255;
  const green = rgb.g / 255;
  const blue = rgb.b / 255;
  const maxChannel = Math.max(red, green, blue);
  const minChannel = Math.min(red, green, blue);
  const delta = maxChannel - minChannel;
  const lightness = (maxChannel + minChannel) / 2;

  if (delta === 0) {
    return {
      hue: 0,
      saturation: 0,
      lightness: Math.round(lightness * 100),
    };
  }

  const saturation =
    delta / (1 - Math.abs(2 * lightness - 1));
  let hue = 0;

  if (maxChannel === red) {
    hue = ((green - blue) / delta) % 6;
  } else if (maxChannel === green) {
    hue = (blue - red) / delta + 2;
  } else {
    hue = (red - green) / delta + 4;
  }

  return {
    hue: normalizeProjectHue(hue * 60),
    saturation: Math.round(saturation * 100),
    lightness: Math.round(lightness * 100),
  };
}

function normalizeProjectColorMode(mode, fallback = "auto") {
  const normalizedMode = String(mode || "").trim().toLowerCase();
  if (normalizedMode === "manual") {
    return "manual";
  }
  if (normalizedMode === "auto") {
    return "auto";
  }
  return fallback === "manual" ? "manual" : "auto";
}

function findProjectByIdInList(projectId, projectList = projects) {
  const normalizedId = String(projectId || "").trim();
  if (!normalizedId) {
    return null;
  }
  return (
    (Array.isArray(projectList) ? projectList : []).find(
      (project) => String(project?.id || "").trim() === normalizedId,
    ) || null
  );
}

function getProjectRootAncestorFromContext(
  level = 1,
  {
    parentId = null,
    projectId = null,
    projectList = projects,
  } = {},
) {
  const normalizedLevel = normalizeProjectLevel(level);
  if (normalizedLevel === 1) {
    return findProjectByIdInList(projectId, projectList);
  }

  let currentProject =
    findProjectByIdInList(parentId, projectList) ||
    findProjectByIdInList(projectId, projectList);
  let safety = 0;

  while (currentProject && safety < 8) {
    if (normalizeProjectLevel(currentProject.level) === 1) {
      return currentProject;
    }
    if (!currentProject.parentId) {
      break;
    }
    currentProject = findProjectByIdInList(currentProject.parentId, projectList);
    safety += 1;
  }

  return null;
}

function createProjectColorProfileFromAnchor(
  level = 1,
  anchorColor,
  profileName = "当前色调",
) {
  const normalizedLevel = normalizeProjectLevel(level);
  const anchorHsl =
    hexColorToHsl(anchorColor) ||
    hexColorToHsl(getDefaultProjectColorByLevel(1)) || {
      hue: 146,
      saturation: 48,
      lightness: 44,
    };

  if (normalizedLevel === 1) {
    const baseSaturation = clampProjectColorNumber(anchorHsl.saturation, 24, 78);
    const baseLightness = clampProjectColorNumber(anchorHsl.lightness, 24, 74);
    return {
      name: profileName,
      hue: anchorHsl.hue,
      hueVariance: 5,
      baseSaturation,
      baseLightness,
      saturationRange: [
        clampProjectColorNumber(baseSaturation - 10, 18, 84),
        clampProjectColorNumber(baseSaturation + 10, 18, 84),
      ],
      lightnessRange: [
        clampProjectColorNumber(baseLightness - 10, 20, 80),
        clampProjectColorNumber(baseLightness + 12, 20, 80),
      ],
    };
  }

  const toneRule =
    PROJECT_COLOR_DESCENDANT_TONE_RULES[normalizedLevel] ||
    PROJECT_COLOR_DESCENDANT_TONE_RULES[2];
  const baseSaturation = clampProjectColorNumber(
    anchorHsl.saturation + toneRule.saturationOffset,
    toneRule.saturationMin,
    toneRule.saturationMax,
  );
  const baseLightness = clampProjectColorNumber(
    anchorHsl.lightness + toneRule.lightnessOffset,
    toneRule.lightnessMin,
    toneRule.lightnessMax,
  );

  return {
    name: profileName,
    hue: anchorHsl.hue,
    hueVariance: toneRule.hueVariance,
    baseSaturation,
    baseLightness,
    saturationRange: [
      clampProjectColorNumber(
        baseSaturation - toneRule.saturationSpread,
        toneRule.saturationMin,
        toneRule.saturationMax,
      ),
      clampProjectColorNumber(
        baseSaturation + toneRule.saturationSpread,
        toneRule.saturationMin,
        toneRule.saturationMax,
      ),
    ],
    lightnessRange: [
      clampProjectColorNumber(
        baseLightness - toneRule.lightnessSpread,
        toneRule.lightnessMin,
        toneRule.lightnessMax,
      ),
      clampProjectColorNumber(
        baseLightness + toneRule.lightnessSpread,
        toneRule.lightnessMin,
        toneRule.lightnessMax,
      ),
    ],
  };
}

function buildDynamicProjectColorProfiles(level = 1, options = {}) {
  const normalizedLevel = normalizeProjectLevel(level);
  const projectList = Array.isArray(options.projectList)
    ? options.projectList
    : projects;
  const currentColor = normalizeProjectColorToHex(options.currentColor, "");

  if (normalizedLevel === 1) {
    if (options.preferCurrentHueForLevel1 && currentColor) {
      return [
        createProjectColorProfileFromAnchor(
          1,
          currentColor,
          "当前一级色调",
        ),
      ];
    }
    return [];
  }

  const rootProject = getProjectRootAncestorFromContext(normalizedLevel, {
    parentId: options.parentId,
    projectId: options.projectId,
    projectList,
  });
  const rootColor = normalizeProjectColorToHex(rootProject?.color, "");
  if (!rootColor) {
    return [];
  }

  const rootLabel =
    typeof rootProject?.name === "string" && rootProject.name.trim()
      ? `${rootProject.name} 同调`
      : "一级同调";
  return [
    createProjectColorProfileFromAnchor(
      normalizedLevel,
      rootColor,
      rootLabel,
    ),
  ];
}

function createProjectColorFromProfile(profile, options = {}) {
  const baseProfile = profile || getProjectColorProfiles(1)[0];
  const hue =
    normalizeProjectHue(
      baseProfile.hue +
        (Number.isFinite(options.hueShift) ? options.hueShift : 0),
    ) || baseProfile.hue;
  const saturation = clampProjectColorNumber(
    Number.isFinite(options.saturation)
      ? options.saturation
      : baseProfile.baseSaturation,
    16,
    86,
  );
  const lightness = clampProjectColorNumber(
    Number.isFinite(options.lightness)
      ? options.lightness
      : baseProfile.baseLightness,
    22,
    78,
  );
  return hslColorToHex(hue, saturation, lightness);
}

function getDefaultProjectColorByLevel(level = 1) {
  const profile = getProjectColorProfiles(level)[0];
  return createProjectColorFromProfile(profile);
}

function getAutoProjectColor(level = 1, options = {}) {
  const profiles = getProjectColorProfiles(level, options);
  const profile =
    profiles[randomProjectColorInt(0, Math.max(profiles.length - 1, 0))] ||
    getProjectColorProfiles(1)[0];
  return createProjectColorFromProfile(profile, {
    hueShift: randomProjectColorInt(
      -(profile.hueVariance || 0),
      profile.hueVariance || 0,
    ),
    saturation: randomProjectColorInt(
      profile.saturationRange?.[0] ?? profile.baseSaturation,
      profile.saturationRange?.[1] ?? profile.baseSaturation,
    ),
    lightness: randomProjectColorInt(
      profile.lightnessRange?.[0] ?? profile.baseLightness,
      profile.lightnessRange?.[1] ?? profile.baseLightness,
    ),
  });
}

function buildProjectColorPresetOptions(level = 1, options = {}) {
  return getProjectColorProfiles(level, options).flatMap(
    (profile, profileIndex) =>
      PROJECT_COLOR_PRESET_VARIANTS.map((variant, variantIndex) => ({
        id: `${normalizeProjectLevel(level)}-${profileIndex}-${variantIndex}`,
        label: `${profile.name} ${variant.name}`,
        color: createProjectColorFromProfile(profile, {
          saturation: profile.baseSaturation + variant.saturationDelta,
          lightness: profile.baseLightness + variant.lightnessDelta,
        }),
      })),
  );
}

function readProjectColorInputMode(input) {
  if (!(input instanceof HTMLInputElement)) {
    return "auto";
  }
  return normalizeProjectColorMode(
    input.dataset.colorMode,
    input.dataset.userSelected === "1" ? "manual" : "auto",
  );
}

function writeProjectColorInputMode(input, mode = "auto") {
  if (!(input instanceof HTMLInputElement)) {
    return;
  }
  const normalizedMode = normalizeProjectColorMode(mode, "auto");
  input.dataset.colorMode = normalizedMode;
  input.dataset.userSelected = normalizedMode === "manual" ? "1" : "0";
}

function getProjectColorControllerContext({
  level = 1,
  parentId = null,
  projectId = null,
  currentColor = "",
  preferCurrentHueForLevel1 = false,
  projectList = projects,
} = {}) {
  return {
    level: normalizeProjectLevel(level),
    parentId: parentId || null,
    projectId: projectId || null,
    currentColor: normalizeProjectColorToHex(currentColor, ""),
    preferCurrentHueForLevel1: !!preferCurrentHueForLevel1,
    projectList: Array.isArray(projectList) ? projectList : projects,
  };
}

function getResolvedProjectColorProfiles(context = {}) {
  return getProjectColorProfiles(context.level, {
    parentId: context.parentId,
    projectId: context.projectId,
    currentColor: context.currentColor,
    preferCurrentHueForLevel1: context.preferCurrentHueForLevel1,
    projectList: context.projectList,
  });
}

function getResolvedAutoProjectColor(context = {}) {
  return getAutoProjectColor(context.level, {
    parentId: context.parentId,
    projectId: context.projectId,
    currentColor: context.currentColor,
    preferCurrentHueForLevel1: context.preferCurrentHueForLevel1,
    projectList: context.projectList,
  });
}

function buildResolvedProjectColorPresetOptions(context = {}) {
  return buildProjectColorPresetOptions(context.level, {
    parentId: context.parentId,
    projectId: context.projectId,
    currentColor: context.currentColor,
    preferCurrentHueForLevel1: context.preferCurrentHueForLevel1,
    projectList: context.projectList,
  });
}

function getProjectColorTextColor(color, fallback = "var(--text-color)") {
  const rgb = hexColorToRgb(normalizeProjectColorToHex(color, ""));
  if (!rgb) return fallback;
  const luminance =
    (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  return luminance >= 0.62 ? "#17212b" : "#f7fbff";
}

function getProjectColorShadow(color, alpha = 0.22) {
  const rgb = hexColorToRgb(normalizeProjectColorToHex(color, ""));
  if (!rgb) return `rgba(0, 0, 0, ${alpha})`;
  const safeAlpha = clampProjectColorNumber(alpha, 0, 1);
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${safeAlpha})`;
}

function syncProjectColorValueText(labelElement, colorValue, fallbackColor = "") {
  if (!(labelElement instanceof HTMLElement)) {
    return;
  }
  const resolvedColor =
    normalizeProjectColorToHex(colorValue, fallbackColor) ||
    normalizeProjectColorToHex(fallbackColor, "") ||
    "#79af85";
  labelElement.textContent = resolvedColor.toUpperCase();
}

function syncProjectColorSwatchSelection(container, selectedColor) {
  if (!(container instanceof HTMLElement)) {
    return;
  }
  const normalizedSelected = normalizeProjectColorToHex(selectedColor, "");
  container
    .querySelectorAll(".project-color-swatch")
    .forEach((swatch) => {
      const swatchColor = normalizeProjectColorToHex(
        swatch.dataset.color || "",
        "",
      );
      swatch.classList.toggle(
        "is-selected",
        !!normalizedSelected &&
          !!swatchColor &&
          normalizedSelected === swatchColor,
      );
    });
}

function renderProjectColorSwatches(
  container,
  {
    level = 1,
    selectedColor = "",
    onSelect = null,
    parentId = null,
    projectId = null,
    currentColor = "",
    preferCurrentHueForLevel1 = false,
    projectList = projects,
  } = {},
) {
  if (!(container instanceof HTMLElement)) {
    return;
  }

  container.innerHTML = "";
  const context = getProjectColorControllerContext({
    level,
    parentId,
    projectId,
    currentColor,
    preferCurrentHueForLevel1,
    projectList,
  });
  buildResolvedProjectColorPresetOptions(context).forEach((preset) => {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "project-color-swatch";
    swatch.dataset.color = preset.color;
    swatch.title = preset.label;
    swatch.setAttribute("aria-label", preset.label);
    swatch.style.background = preset.color;
    swatch.addEventListener("click", () => {
      if (typeof onSelect === "function") {
        onSelect(preset.color);
      }
    });
    container.appendChild(swatch);
  });

  syncProjectColorSwatchSelection(container, selectedColor);
}

function createProjectColorController({
  input,
  paletteContainer,
  valueLabel = null,
  randomButton = null,
  getLevel = () => 1,
  getParentId = () => null,
  getProjectId = () => null,
  getProjectList = () => projects,
  getCurrentColor = () => input?.value || "",
  preferCurrentHueForLevel1 = false,
} = {}) {
  if (
    !(input instanceof HTMLInputElement) ||
    !(paletteContainer instanceof HTMLElement)
  ) {
    return {
      refresh() {},
      setColor() {},
    };
  }

  const resolveContext = () =>
    getProjectColorControllerContext({
      level: getLevel(),
      parentId: getParentId(),
      projectId: getProjectId(),
      currentColor: getCurrentColor(),
      preferCurrentHueForLevel1,
      projectList: getProjectList(),
    });

  const applyColor = (nextColor, options = {}) => {
    const mode =
      options.manual === true
        ? "manual"
        : options.manual === false
          ? "auto"
          : options.mode || "manual";
    const normalizedColor = normalizeProjectColorToHex(
      nextColor,
      getDefaultProjectColorByLevel(getLevel()),
    );
    input.value = normalizedColor;
    writeProjectColorInputMode(input, mode);
    syncProjectColorSwatchSelection(paletteContainer, normalizedColor);
    syncProjectColorValueText(
      valueLabel,
      normalizedColor,
      getDefaultProjectColorByLevel(getLevel()),
    );
  };

  const refresh = ({ forceSuggestion = false, recomputeAuto = false } = {}) => {
    const level = normalizeProjectLevel(getLevel());
    const context = resolveContext();
    renderProjectColorSwatches(paletteContainer, {
      level,
      selectedColor: input.value,
      parentId: context.parentId,
      projectId: context.projectId,
      currentColor: context.currentColor,
      preferCurrentHueForLevel1: context.preferCurrentHueForLevel1,
      projectList: context.projectList,
      onSelect(color) {
        applyColor(color, { mode: "manual" });
      },
    });

    const normalizedCurrent = normalizeProjectColorToHex(input.value, "");
    const currentMode = readProjectColorInputMode(input);
    if (forceSuggestion || !normalizedCurrent) {
      applyColor(getResolvedAutoProjectColor(context), {
        mode: "auto",
      });
      return;
    }

    if (currentMode === "auto" && recomputeAuto) {
      applyColor(getResolvedAutoProjectColor(context), {
        mode: "auto",
      });
      return;
    }

    input.value = normalizedCurrent;
    writeProjectColorInputMode(input, currentMode);
    syncProjectColorSwatchSelection(paletteContainer, normalizedCurrent);
    syncProjectColorValueText(
      valueLabel,
      normalizedCurrent,
      getDefaultProjectColorByLevel(level),
    );
  };

  const handleInput = () => {
    applyColor(input.value, { mode: "manual" });
  };

  input.addEventListener("input", handleInput);
  randomButton?.addEventListener("click", (event) => {
    event.preventDefault();
    applyColor(getResolvedAutoProjectColor(resolveContext()), {
      mode: "manual",
    });
  });

  return {
    refresh,
    setColor(nextColor, options = {}) {
      applyColor(nextColor, options);
    },
  };
}

function getSelectedCreateProjectLevel() {
  return parseInt(
    document.querySelector('input[name="project-level"]:checked')?.value || "1",
    10,
  );
}

function refreshCreateProjectColorPalette(options = {}) {
  activeCreateProjectColorController?.refresh?.(options);
}

// 项目数据结构
class Project {
  constructor(
    name,
    level = 1,
    parentId = null,
    color = null,
    description = "",
    colorMode = "auto",
  ) {
    this.id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    this.name = name;
    this.level = level; // 1, 2, 3
    this.parentId = parentId; // 父级项目ID（如果是2级或3级）
    this.color =
      normalizeProjectColorToHex(color, "") ||
      this.generateColor();
    this.description = description; // 项目描述
    this.colorMode = normalizeProjectColorMode(colorMode, "auto");
    this.createdAt = new Date().toISOString();
  }

  generateColor() {
    return getAutoProjectColor(this.level, { parentId: this.parentId });
  }
}

function normalizeProjectLevel(level) {
  const numericLevel = parseInt(level, 10);
  if ([1, 2, 3].includes(numericLevel)) {
    return numericLevel;
  }

  if (typeof level === "string") {
    if (level.includes("一级")) return 1;
    if (level.includes("二级")) return 2;
    if (level.includes("三级")) return 3;
  }

  return 1;
}

function isMobileViewport() {
  return window.innerWidth <= 690;
}

function isCompactAndroidProjectTotalsLayout() {
  return (
    isMobileViewport() &&
    window.ControlerNativeBridge?.platform === "android"
  );
}

function createProjectId(prefix = "project") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeStoredProjects(rawProjects = []) {
  if (!Array.isArray(rawProjects)) {
    return [];
  }

  const usedIds = new Set();
  const idMap = new Map();
  const normalizedProjects = rawProjects.map((rawProject, index) => {
    const source =
      rawProject && typeof rawProject === "object" ? { ...rawProject } : {};
    const fallbackName = `未命名项目-${index + 1}`;
    let normalizedId =
      typeof source.id === "string"
        ? source.id.trim()
        : String(source.id || "");

    if (!normalizedId || usedIds.has(normalizedId)) {
      do {
        normalizedId = createProjectId(`project-${index + 1}`);
      } while (usedIds.has(normalizedId));
    }

    usedIds.add(normalizedId);

    if (
      source.id !== undefined &&
      source.id !== null &&
      String(source.id).trim()
    ) {
      idMap.set(String(source.id), normalizedId);
    }

    return {
      ...source,
      id: normalizedId,
      name:
        typeof source.name === "string" && source.name.trim()
          ? source.name.trim()
          : fallbackName,
      level: normalizeProjectLevel(source.level),
      parentId: source.parentId ?? null,
      color:
        typeof source.color === "string" && source.color.trim()
          ? normalizeProjectColorToHex(source.color, "") || source.color.trim()
          : null,
      colorMode: normalizeProjectColorMode(source.colorMode, "auto"),
      description:
        typeof source.description === "string" ? source.description : "",
      createdAt:
        typeof source.createdAt === "string" && source.createdAt.trim()
          ? source.createdAt
          : new Date().toISOString(),
    };
  });

  normalizedProjects.forEach((project) => {
    if (
      project.parentId === null ||
      project.parentId === undefined ||
      project.parentId === ""
    ) {
      project.parentId = null;
      return;
    }

    const remappedParentId =
      idMap.get(String(project.parentId)) ||
      (usedIds.has(String(project.parentId)) ? String(project.parentId) : null);

    project.parentId =
      remappedParentId && remappedParentId !== project.id
        ? remappedParentId
        : null;
  });

  return normalizedProjects;
}

function cloneProjectDurationSnapshot(projectList = projects) {
  if (typeof storageBundleApi?.cloneValue === "function") {
    return storageBundleApi.cloneValue(projectList) || [];
  }
  return Array.isArray(projectList)
    ? projectList.map((project) => ({ ...project }))
    : [];
}

function applyIndexProjectRecordDurationChanges(changes = {}) {
  if (typeof storageBundleApi?.applyProjectRecordDurationChanges !== "function") {
    return false;
  }
  projects = normalizeStoredProjects(
    storageBundleApi.applyProjectRecordDurationChanges(projects, changes),
  );
  return true;
}

function reconcileIndexProjectDurationCaches(previousProjects = []) {
  if (typeof storageBundleApi?.reconcileProjectDurationCaches !== "function") {
    return false;
  }
  projects = normalizeStoredProjects(
    storageBundleApi.reconcileProjectDurationCaches(projects, previousProjects),
  );
  return true;
}

function ensureIndexProjectDurationCaches(options = {}) {
  const { persist = false } = options;
  if (typeof storageBundleApi?.rebuildProjectDurationCaches !== "function") {
    return false;
  }
  if (
    typeof storageBundleApi?.projectsHaveValidDurationCache === "function" &&
    storageBundleApi.projectsHaveValidDurationCache(projects)
  ) {
    return false;
  }
  projects = normalizeStoredProjects(
    storageBundleApi.rebuildProjectDurationCaches(projects, records),
  );
  if (persist) {
    saveProjectsToStorage();
  }
  return true;
}

function getProjectColorInputValue(project) {
  const level = normalizeProjectLevel(project?.level);
  return normalizeProjectColorToHex(
    typeof project?.color === "string" ? project.color.trim() : "",
    getDefaultProjectColorByLevel(level),
  );
}

function getProjectStoredColorMode(project) {
  return normalizeProjectColorMode(project?.colorMode, "auto");
}

function resolveAutoProjectColorForProject(project, projectList = projects) {
  if (!project || typeof project !== "object") {
    return getDefaultProjectColorByLevel(1);
  }

  const projectLevel = normalizeProjectLevel(project.level);
  return getAutoProjectColor(projectLevel, {
    parentId: project.parentId || null,
    projectId: project.id || null,
    currentColor:
      projectLevel === 1 ? getProjectColorInputValue(project) : "",
    preferCurrentHueForLevel1: projectLevel === 1,
    projectList,
  });
}

function collectProjectDescendantIds(projectId, projectList = projects) {
  const normalizedProjectId = String(projectId || "").trim();
  if (!normalizedProjectId) {
    return [];
  }

  const descendants = [];
  const queue = [normalizedProjectId];
  const seenIds = new Set(queue);

  while (queue.length > 0) {
    const currentId = queue.shift();
    (Array.isArray(projectList) ? projectList : []).forEach((project) => {
      const parentId = String(project?.parentId || "").trim();
      const childId = String(project?.id || "").trim();
      if (!childId || parentId !== currentId || seenIds.has(childId)) {
        return;
      }
      seenIds.add(childId);
      descendants.push(childId);
      queue.push(childId);
    });
  }

  return descendants;
}

function syncAutoProjectColorsInSubtree(
  projectId,
  {
    includeSelf = false,
    projectList = projects,
  } = {},
) {
  const normalizedProjectId = String(projectId || "").trim();
  if (!normalizedProjectId || !Array.isArray(projectList)) {
    return;
  }

  const targetIds = includeSelf
    ? [normalizedProjectId, ...collectProjectDescendantIds(normalizedProjectId, projectList)]
    : collectProjectDescendantIds(normalizedProjectId, projectList);

  targetIds.forEach((targetId) => {
    const targetProject = findProjectByIdInList(targetId, projectList);
    if (!targetProject || getProjectStoredColorMode(targetProject) !== "auto") {
      return;
    }
    targetProject.color = resolveAutoProjectColorForProject(targetProject, projectList);
  });
}

function escapeHtmlAttribute(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    if (char === '"') return "&quot;";
    return "&#39;";
  });
}

function getThemeProjectColor(level = 1) {
  const projectLevel = normalizeProjectLevel(level);
  if (projectLevel === 2) return "var(--project-level-2)";
  if (projectLevel === 3) return "var(--project-level-3)";
  return "var(--project-level-1)";
}

function getProjectStatsColor(project, fallbackLevel = 1) {
  const projectLevel = normalizeProjectLevel(project?.level || fallbackLevel);
  return normalizeProjectColorToHex(
    typeof project?.color === "string" ? project.color.trim() : "",
    getDefaultProjectColorByLevel(projectLevel),
  );
}

function getProjectById(projectId) {
  return projects.find((project) => project.id === projectId) || null;
}

function findAnotherProjectWithName(
  projectName,
  excludedProjectId = "",
  projectList = projects,
) {
  const normalizedName = String(projectName || "").trim();
  const normalizedExcludedId = String(excludedProjectId || "").trim();
  if (!normalizedName || !Array.isArray(projectList)) {
    return null;
  }

  return (
    projectList.find((project) => {
      const normalizedProjectId = String(project?.id || "").trim();
      return (
        normalizedProjectId &&
        normalizedProjectId !== normalizedExcludedId &&
        String(project?.name || "").trim() === normalizedName
      );
    }) || null
  );
}

function getProjectPath(project) {
  if (!project) return "";
  const names = [project.name];
  let current = project;
  let safety = 0;

  while (current.parentId && safety < 5) {
    const parent = getProjectById(current.parentId);
    if (!parent) break;
    names.unshift(parent.name);
    current = parent;
    safety += 1;
  }

  return names.join("/");
}

function resolveProjectNameFromInput(rawInput) {
  const normalized = (rawInput || "").trim();
  if (!normalized) return "";

  const exactPathMatch = projects.find(
    (project) => getProjectPath(project) === normalized,
  );
  if (exactPathMatch) return exactPathMatch.name;

  if (normalized.includes("/")) {
    return normalized
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean)
      .pop();
  }

  return normalized;
}

function getSortedProjectPathEntries() {
  return projects
    .map((project) => ({
      id: project.id,
      name: project.name,
      path: getProjectPath(project),
    }))
    .sort((a, b) => a.path.localeCompare(b.path, "zh-CN"));
}

function setProjectInputValue(inputId, projectName) {
  const input = document.getElementById(inputId);
  if (!input) return;

  if (!projectName) {
    input.value = "";
    return;
  }

  const matched = projects.find((project) => project.name === projectName);
  input.value = matched ? getProjectPath(matched) : projectName;
}

function commitPrimaryModalProjectInput(options = {}) {
  const projectNameInput = document.getElementById("project-name-input");
  if (!(projectNameInput instanceof HTMLInputElement)) {
    return false;
  }

  const resolvedName = resolveProjectNameFromInput(projectNameInput.value.trim());
  if (!resolvedName) {
    if (options.canonicalizeEmpty === true) {
      projectNameInput.value = "";
    }
    return false;
  }

  if (!ensureProjectExists(resolvedName)) {
    return false;
  }

  selectedProject = resolvedName;
  lastEnteredProjectName = resolvedName;
  setProjectInputValue("project-name-input", resolvedName);
  updateProjectsList();
  updateExistingProjectsList();
  renderProjectSuggestionsForInput(
    "project-name-input",
    projectNameInput.value,
    false,
  );
  persistTimerSessionState();
  return true;
}

function getProjectSuggestionPopoverId(inputId) {
  if (inputId === "project-name-input") return "project-name-suggestions";
  if (inputId === "next-project-input") return "next-project-suggestions";
  return "";
}

function hideProjectSuggestions(inputId) {
  const popoverId = getProjectSuggestionPopoverId(inputId);
  if (!popoverId) return;
  const popover = document.getElementById(popoverId);
  popover?.classList.remove("visible");
}

function hideAllProjectSuggestions() {
  hideProjectSuggestions("project-name-input");
  hideProjectSuggestions("next-project-input");
}

function renderProjectSuggestionsForInput(
  inputId,
  keyword = "",
  forceShow = false,
) {
  const input = document.getElementById(inputId);
  const popoverId = getProjectSuggestionPopoverId(inputId);
  const popover = popoverId ? document.getElementById(popoverId) : null;
  if (!input || !popover) return;

  const normalizedKeyword = (keyword || "").trim().toLowerCase();
  const entries = getSortedProjectPathEntries();
  const filtered = normalizedKeyword
    ? entries.filter(
        (entry) =>
          entry.path.toLowerCase().includes(normalizedKeyword) ||
          entry.name.toLowerCase().includes(normalizedKeyword),
      )
    : entries;

  popover.innerHTML = "";

  if (filtered.length === 0) {
    popover.classList.remove("visible");
    return;
  }

  filtered.slice(0, 24).forEach((entry) => {
    const option = document.createElement("div");
    option.className = "suggestion-item";
    option.textContent = entry.path;
    option.dataset.path = entry.path;
    option.addEventListener("mousedown", (event) => {
      event.preventDefault();
      input.value = entry.path;
      popover.classList.remove("visible");
      input.dispatchEvent(new Event("change"));
    });
    popover.appendChild(option);
  });

  const shouldShow = forceShow || document.activeElement === input;
  if (shouldShow) {
    popover.classList.add("visible");
  } else {
    popover.classList.remove("visible");
  }
}

function renderNextProjectSuggestions(keyword = "", forceShow = false) {
  renderProjectSuggestionsForInput("next-project-input", keyword, forceShow);
}

function getFirstEmptyModalProjectInputTarget() {
  const currentInput = document.getElementById("project-name-input");
  const nextInput = document.getElementById("next-project-input");
  if (currentInput && !currentInput.value.trim()) return "project-name-input";
  if (nextInput && !nextInput.value.trim()) return "next-project-input";
  return "";
}

function getDefaultModalProjectInputTarget() {
  if (
    modalProjectInputTargetManual &&
    (modalProjectInputTarget === "project-name-input" ||
      modalProjectInputTarget === "next-project-input")
  ) {
    return modalProjectInputTarget;
  }

  const firstEmpty = getFirstEmptyModalProjectInputTarget();
  if (firstEmpty) return firstEmpty;

  if (
    modalProjectInputTarget === "project-name-input" ||
    modalProjectInputTarget === "next-project-input"
  ) {
    return modalProjectInputTarget;
  }

  return "project-name-input";
}

function setModalProjectInputTarget(targetInputId, options = {}) {
  const { focus = false, showSuggestions = false, manual = false } = options;
  if (
    targetInputId !== "project-name-input" &&
    targetInputId !== "next-project-input"
  ) {
    return;
  }

  modalProjectInputTarget = targetInputId;
  modalProjectInputTargetManual = !!manual;
  const targetInput = document.getElementById(targetInputId);
  if (!targetInput) return;

  if (focus) {
    targetInput.focus();
  }

  if (showSuggestions) {
    renderProjectSuggestionsForInput(targetInputId, targetInput.value, true);
  }
}

function formatDurationFromMs(ms) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return "小于1min";
  }

  const totalMinutes = Math.floor(ms / 60000);
  if (totalMinutes <= 0) return "小于1min";

  const days = Math.floor(totalMinutes / (24 * 60));
  const remainingAfterDays = totalMinutes - days * 24 * 60;
  const hours = Math.floor(remainingAfterDays / 60);
  const minutes = remainingAfterDays % 60;

  if (days > 0) {
    return `${days}天${hours}小时${minutes}分钟`;
  }
  if (hours > 0) {
    return `${hours}小时${minutes}分钟`;
  }
  return `${minutes}分钟`;
}

function getPendingSpendPreviewDurationMs() {
  if (!pendingSpendModalState) {
    return null;
  }

  const clickTime = getPendingSpendModalClickTime();
  const baseState = getPendingSpendModalBaseState();
  if (!clickTime || !baseState) {
    return null;
  }

  if (baseState.ptn <= 0) {
    return 0;
  }

  const previewStartTime =
    baseState.ptn === 1
      ? deserializeTimerDate(baseState.fpt)
      : deserializeTimerDate(baseState.lastspt) ||
        deserializeTimerDate(baseState.spt) ||
        deserializeTimerDate(baseState.fpt);

  if (!(previewStartTime instanceof Date) || Number.isNaN(previewStartTime.getTime())) {
    return 0;
  }

  return Math.max(clickTime.getTime() - previewStartTime.getTime(), 0);
}

function getLatestDurationMs() {
  const pendingPreviewDurationMs = getPendingSpendPreviewDurationMs();
  if (Number.isFinite(pendingPreviewDurationMs)) {
    return Math.max(pendingPreviewDurationMs, 0);
  }
  if (ptn >= 2 && Number.isFinite(diffMs)) {
    return Math.max(diffMs, 0);
  }
  if (fpt instanceof Date) {
    return Math.max(Date.now() - fpt.getTime(), 0);
  }
  return 0;
}

function dismissTransientModalOverlays(options = {}) {
  const { except = null } = options;
  document.querySelectorAll(".modal-overlay").forEach((modal) => {
    if (!(modal instanceof HTMLElement) || modal === except) {
      return;
    }
    if (modal.dataset.controlerModalPersistent === "true") {
      return;
    }
    modal.remove();
  });
}

function getTopVisibleModalOverlayZIndex(fallbackZIndex = 1000) {
  return Array.from(document.querySelectorAll(".modal-overlay")).reduce(
    (maxZIndex, modal) => {
      if (!(modal instanceof HTMLElement)) {
        return maxZIndex;
      }

      const computedStyle = window.getComputedStyle(modal);
      if (
        computedStyle.display === "none" ||
        computedStyle.visibility === "hidden" ||
        modal.hasAttribute("hidden")
      ) {
        return maxZIndex;
      }

      const modalZIndex = Number.parseInt(
        modal.style.zIndex || computedStyle.zIndex,
        10,
      );
      return Number.isFinite(modalZIndex)
        ? Math.max(maxZIndex, modalZIndex)
        : maxZIndex;
    },
    Math.max(0, Number.parseInt(fallbackZIndex, 10) || 0),
  );
}

function focusAdvancedProjectNameInput() {
  const input = document.getElementById("advanced-project-name");
  if (!(input instanceof HTMLInputElement)) {
    return;
  }

  requestAnimationFrame(() => {
    input.focus();
    input.select();
  });
}

// 显示创建项目弹窗
function showProjectCreateModal() {
  const modal = document.getElementById("advanced-modal-overlay");
  if (!modal) return;

  dismissTransientModalOverlays({ except: modal });

  // 重置表单
  document.getElementById("advanced-project-name").value = "";
  document.querySelector('input[name="project-level"][value="1"]').checked =
    true;
  document.getElementById("parent-project-select").value = "";
  const colorPicker = document.getElementById("project-color-picker");
  if (colorPicker) {
    writeProjectColorInputMode(colorPicker, "auto");
  }

  // 更新父级项目选择器
  updateParentProjectSelect(1);
  refreshCreateProjectColorPalette({ forceSuggestion: true });

  // 显示弹窗
  modal.hidden = false;
  modal.style.display = "flex";
  modal.style.zIndex = "2100";
  modal.style.pointerEvents = "auto";

  // 添加点击外部关闭事件（确保每次都会工作）
  const handleOutsideClick = function (e) {
    if (e.target === this) {
      closeAdvancedModal();
      this.removeEventListener("click", handleOutsideClick);
    }
  };

  // 移除旧的监听器并添加新的
  modal.removeEventListener("click", modal._handleOutsideClick);
  modal._handleOutsideClick = handleOutsideClick;
  modal.addEventListener("click", handleOutsideClick);
  focusAdvancedProjectNameInput();
}

// 处理创建项目确认
async function handleCreateProjectConfirm() {
  const projectNameInput = document.getElementById("advanced-project-name");
  const name = projectNameInput?.value.trim();
  if (!name) {
    await showIndexAlert("请输入项目名称", {
      title: "无法创建项目",
      danger: true,
    });
    focusAdvancedProjectNameInput();
    return;
  }

  // 检查是否已存在同名项目
  if (projects.some((p) => p.name === name)) {
    await showIndexAlert("项目名称已存在，请使用其他名称", {
      title: "无法创建项目",
      danger: true,
    });
    focusAdvancedProjectNameInput();
    return;
  }

  const level = parseInt(
    document.querySelector('input[name="project-level"]:checked')?.value || "1",
  );
  const parentId =
    document.getElementById("parent-project-select").value || null;
  const color = normalizeProjectColorToHex(
    document.getElementById("project-color-picker").value,
    getDefaultProjectColorByLevel(level),
  );
  const colorMode = readProjectColorInputMode(
    document.getElementById("project-color-picker"),
  );

  // 验证层级关系
  if (level === 2 || level === 3) {
    if (!parentId) {
      await showIndexAlert(`请为${level}级项目选择父级项目`, {
        title: "缺少父级项目",
        danger: true,
      });
      uiTools?.refreshEnhancedSelect?.(document.getElementById("parent-project-select"));
      return;
    }

    // 检查父级项目是否存在
    const parentProject = projects.find((p) => p.id === parentId);
    if (!parentProject) {
      await showIndexAlert("选择的父级项目不存在", {
        title: "父级项目无效",
        danger: true,
      });
      uiTools?.refreshEnhancedSelect?.(document.getElementById("parent-project-select"));
      return;
    }

    // 验证层级关系：2级项目的父级必须是1级，3级项目的父级必须是2级
    const parentLevel = normalizeProjectLevel(parentProject.level);
    if (level === 2 && parentLevel !== 1) {
      await showIndexAlert("二级项目的父级必须是一级项目", {
        title: "层级关系错误",
        danger: true,
      });
      uiTools?.refreshEnhancedSelect?.(document.getElementById("parent-project-select"));
      return;
    }
    if (level === 3 && parentLevel !== 2) {
      await showIndexAlert("三级项目的父级必须是二级项目", {
        title: "层级关系错误",
        danger: true,
      });
      uiTools?.refreshEnhancedSelect?.(document.getElementById("parent-project-select"));
      return;
    }
  }

  const newProject = new Project(
    name,
    level,
    parentId || null,
    color,
    "",
    colorMode,
  );
  const previousProjectsForDurationCache = cloneProjectDurationSnapshot(projects);
  projects = [...projects, newProject];
  reconcileIndexProjectDurationCaches(previousProjectsForDurationCache);

  // 保存到localStorage
  saveProjectsToStorage();

  // 更新UI
  updateProjectsList();
  updateExistingProjectsList();
  updateParentProjectSelect(1);
  refreshIndexWorkspace({ immediate: true });

  // 关闭弹窗
  closeAdvancedModal();
}

// 添加项目（普通）
function addProject(projectName) {
  if (!projectName || projectName.trim() === "") {
    alert("请输入项目名称");
    return false;
  }

  // 检查是否已存在同名项目
  if (projects.some((p) => p.name === projectName)) {
    alert("项目名称已存在，请使用其他名称");
    return false;
  }

  const newProject = new Project(projectName);
  projects.push(newProject);

  // 更新UI
  updateProjectsList();
  updateExistingProjectsList();
  updateParentProjectSelect(1); // 更新父级项目选择器

  // 保存到localStorage
  saveProjectsToStorage();

  return true;
}

// 确保项目存在（存在则复用，不存在则创建）
function ensureProjectExists(projectName) {
  const normalizedName = projectName?.trim();
  if (!normalizedName) return false;

  if (projects.some((p) => p.name === normalizedName)) {
    return true;
  }

  return addProject(normalizedName);
}

// 添加项目（高级，带层级）
function addProjectAdvanced(
  name,
  level,
  parentId,
  color,
  colorMode = "auto",
) {
  if (!name || name.trim() === "") {
    alert("请输入项目名称");
    return false;
  }

  // 检查是否已存在同名项目
  if (projects.some((p) => p.name === name)) {
    alert("项目名称已存在，请使用其他名称");
    return false;
  }

  // 验证层级关系
  if (level === 2 || level === 3) {
    if (!parentId) {
      alert(`请为${level}级项目选择父级项目`);
      return false;
    }

    // 检查父级项目是否存在
    const parentProject = projects.find((p) => p.id === parentId);
    if (!parentProject) {
      alert("选择的父级项目不存在");
      return false;
    }

    // 验证层级关系：2级项目的父级必须是1级，3级项目的父级必须是2级
    if (level === 2 && parentProject.level !== 1) {
      alert("二级项目的父级必须是一级项目");
      return false;
    }
    if (level === 3 && parentProject.level !== 2) {
      alert("三级项目的父级必须是二级项目");
      return false;
    }
  }

  const newProject = new Project(
    name,
    level,
    parentId || null,
    color,
    "",
    colorMode,
  );
  projects.push(newProject);

  // 更新UI
  updateProjectsList();
  updateExistingProjectsList();
  updateParentProjectSelect(1); // 更新父级项目选择器

  // 保存到localStorage
  saveProjectsToStorage();

  return true;
}

// 保存记录
function save(options = {}) {
  if (!result || !selectedProject) return null;

  const record = createRecordEntry(selectedProject, result, options);

  records.push(record);
  markIndexRecordPeriodsDirty([record]);
  applyIndexProjectRecordDurationChanges({
    addedRecords: [record],
  });
  saveRecordsToStorage();
  updateProjectTotals();
  return record;
}

function getRecordNameInputElement(recordId) {
  const normalizedRecordId = String(recordId || "").trim();
  if (!normalizedRecordId) {
    return null;
  }

  return document.querySelector(
    `.record-item[data-record-id="${normalizedRecordId}"] .record-name-input`,
  );
}

function syncRecordInlineEditingState() {
  document.body?.classList.toggle("record-inline-editing", !!editingRecordId);
}

function queueRecordNameFocus(recordId) {
  pendingRecordNameFocusId = String(recordId || "").trim();
}

function setRecordNameFocus(recordId) {
  requestAnimationFrame(() => {
    const input = getRecordNameInputElement(recordId);
    if (!input) return;
    const recordElement = input.closest(".record-item");
    recordElement?.scrollIntoView?.({
      block: "nearest",
      inline: "nearest",
    });
    try {
      input.focus({ preventScroll: true });
    } catch (error) {
      input.focus();
    }
    input.select();
  });
}

function cancelRecordNameEdit(options = {}) {
  const { keepRecordExpanded = true } = options;
  const currentEditingRecordId = String(editingRecordId || "").trim();
  if (!currentEditingRecordId) {
    return false;
  }

  pendingRecordNameFocusId = "";
  getRecordNameInputElement(currentEditingRecordId)?.blur?.();

  editingRecordId = null;
  activeRecordId = keepRecordExpanded ? currentEditingRecordId : null;
  syncRecordInlineEditingState();
  updateDisplay();
  return true;
}

async function saveRecordNameEdit(recordId) {
  const recordIndex = records.findIndex((record) => record.id === recordId);
  if (recordIndex === -1) return false;

  const recordElement = document.querySelector(
    `.record-item[data-record-id="${recordId}"]`,
  );
  const input = recordElement?.querySelector(".record-name-input");
  const rawValue = input?.value?.trim() || "";
  const resolvedName = resolveProjectNameFromInput(rawValue);
  const nextName = resolvedName || rawValue;

  if (!nextName) {
    await showIndexAlert("请输入项目名称", {
      title: "无法保存记录",
      danger: true,
    });
    setRecordNameFocus(recordId);
    return false;
  }

  if (!ensureProjectExists(nextName)) {
    return false;
  }

  const nextProjectId = projects.find((project) => project.name === nextName)?.id || null;
  const previousRecord = {
    ...records[recordIndex],
  };
  records[recordIndex] = {
    ...previousRecord,
    name: nextName,
    projectId: nextProjectId,
  };
  markIndexRecordPeriodsDirty([previousRecord, records[recordIndex]]);
  applyIndexProjectRecordDurationChanges({
    removedRecords: [previousRecord],
    addedRecords: [records[recordIndex]],
  });

  pendingRecordNameFocusId = "";
  input?.blur?.();
  activeRecordId = recordId;
  editingRecordId = null;
  syncRecordInlineEditingState();
  await saveRecordsToStorage();
  refreshIndexWorkspace({ immediate: true });
  return true;
}

function rollbackTimerAfterDeletingLastRecord(deletedRecord, remainingRecords) {
  if (!deletedRecord) return;

  const deletedClickCount =
    Number.isFinite(deletedRecord.clickCount) && deletedRecord.clickCount > 0
      ? Math.max(1, Math.floor(deletedRecord.clickCount))
      : null;

  if (
    deletedClickCount &&
    remainingRecords.some(
      (record) =>
        Number.isFinite(record?.clickCount) &&
        Math.max(1, Math.floor(record.clickCount)) === deletedClickCount,
    )
  ) {
    return;
  }

  const restored = restoreTimerCoreState(deletedRecord.timerRollbackState);

  if (!restored && deletedClickCount) {
    ptn = Math.max(0, deletedClickCount - 1);
    pendingRecordRollbackState = null;
    pendingDurationCarryoverState = null;
    const previousClickCount = ptn > 0 ? ptn : null;
    const previousRecord =
      previousClickCount && Array.isArray(remainingRecords)
        ? [...remainingRecords]
            .reverse()
            .find((record) => {
              if (!Number.isFinite(record?.clickCount) || record.clickCount <= 0) {
                return false;
              }
              return Math.max(1, Math.floor(record.clickCount)) === previousClickCount;
            })
        : null;
    const fallbackClickTime =
      resolveRecordTime(previousRecord) || resolveRecordTime(deletedRecord);

    if (ptn <= 0) {
      fpt = null;
      spt = null;
      lastspt = null;
      diffMs = null;
    } else if (ptn === 1) {
      fpt = fallbackClickTime ? new Date(fallbackClickTime) : fpt;
      spt = null;
      lastspt = null;
      diffMs = null;
    } else {
      const previousClickTime =
        fallbackClickTime instanceof Date &&
        !Number.isNaN(fallbackClickTime.getTime())
          ? new Date(fallbackClickTime)
          : null;
      fpt = previousClickTime ? new Date(previousClickTime) : fpt;
      spt = previousClickTime ? new Date(previousClickTime) : null;
      lastspt = previousClickTime ? new Date(previousClickTime) : null;
      diffMs = null;
    }
  }

  if (!restored && !deletedClickCount) {
    return;
  }

  const deletedProjectName =
    typeof deletedRecord?.name === "string" ? deletedRecord.name.trim() : "";

  selectedProject = deletedProjectName;
  nextProject = "";
  lastEnteredProjectName = deletedProjectName;
  persistTimerSessionState();
}

function applyShortenCarryoverToNextInterval(shortenMs) {
  if (!Number.isFinite(shortenMs) || shortenMs <= 0) return;
  const anchorTime =
    spt instanceof Date && !Number.isNaN(spt.getTime())
      ? spt
      : lastspt instanceof Date && !Number.isNaN(lastspt.getTime())
        ? lastspt
        : null;
  if (!anchorTime) return;

  const shiftedStart = new Date(anchorTime.getTime() - shortenMs);
  lastspt = shiftedStart;
  fpt = new Date(shiftedStart);
  spt = new Date(shiftedStart);
  diffMs = null;
}

// 更新显示
function updateDisplay() {
  const output = document.getElementById("output");
  if (!output) return;
  syncRecordInlineEditingState();

  output.innerHTML = "";
  const fragment = document.createDocumentFragment();
  const recordScale = getRecordSurfaceScale(output);
  const compactMeta = recordScale < 0.8 || isMobileViewport();
  const gridGap = Math.max(6, Math.round(10 * recordScale));
  const gridMinWidth = Math.max(132, Math.round(180 * Math.min(recordScale, 1)));
  const cardPadding = Math.max(6, Math.round(10 * recordScale));
  const cardRadius = Math.max(8, Math.round(10 * recordScale));
  const titleFontSize = Math.max(12, Math.round(17 * recordScale));
  const bodyFontSize = Math.max(10, Math.round(14 * recordScale));
  const metaFontSize = Math.max(9, Math.round(12 * recordScale));
  const buttonFontSize = Math.max(9, Math.round(12 * recordScale));
  const buttonPaddingY = Math.max(4, Math.round(6 * recordScale));
  const buttonPaddingX = Math.max(8, Math.round(10 * recordScale));
  const cardMinHeight = Math.max(56, Math.round(88 * recordScale));

  output.style.display = "grid";
  output.style.gridTemplateColumns = `repeat(auto-fit, minmax(${gridMinWidth}px, 1fr))`;
  output.style.gap = `${gridGap}px`;
  output.style.alignContent = "start";
  output.style.padding = `${Math.max(4, Math.round(8 * recordScale))}px`;
  output.style.overflowX = "hidden";

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const recentRecords = records
    .filter((record) => {
      const recordDate = resolveRecordTime(record);
      if (!recordDate) {
        return false;
      }

      return (
        isSameCalendarDay(recordDate, today) ||
        isSameCalendarDay(recordDate, yesterday)
      );
    })
    .sort((left, right) => {
      const leftTime = resolveRecordTime(left)?.getTime() || 0;
      const rightTime = resolveRecordTime(right)?.getTime() || 0;
      return rightTime - leftTime;
    });

  const recordGroups = [
    {
      key: "today",
      label: "今天",
      records: recentRecords.filter((record) =>
        isSameCalendarDay(resolveRecordTime(record) || new Date(0), today),
      ),
    },
    {
      key: "yesterday",
      label: "昨天",
      records: recentRecords.filter((record) =>
        isSameCalendarDay(resolveRecordTime(record) || new Date(0), yesterday),
      ),
    },
  ].filter((group) => group.records.length > 0);

  if (recentRecords.length === 0) {
    const emptyState = document.createElement("div");
    emptyState.className = "record-item";
    emptyState.style.display = "flex";
    emptyState.style.alignItems = "center";
    emptyState.style.justifyContent = "center";
    emptyState.style.minHeight = `${Math.max(72, Math.round(96 * recordScale))}px`;
    emptyState.style.color = "var(--muted-text-color)";
    emptyState.style.fontSize = `${bodyFontSize}px`;
    emptyState.textContent = "今天和昨天还没有时间记录";
    output.appendChild(emptyState);
    return;
  }

  recordGroups.forEach((group) => {
    const groupHeader = document.createElement("div");
    groupHeader.style.gridColumn = "1 / -1";
    groupHeader.style.display = "flex";
    groupHeader.style.alignItems = "center";
    groupHeader.style.justifyContent = "space-between";
    groupHeader.style.gap = "10px";
    groupHeader.style.padding = `${Math.max(2, Math.round(4 * recordScale))}px ${Math.max(4, Math.round(6 * recordScale))}px 0`;

    const groupTitle = document.createElement("div");
    groupTitle.style.color = "var(--text-color)";
    groupTitle.style.fontSize = `${Math.max(11, Math.round(13 * recordScale))}px`;
    groupTitle.style.fontWeight = "700";
    groupTitle.textContent = group.label;

    const groupCount = document.createElement("div");
    groupCount.style.color = "var(--muted-text-color)";
    groupCount.style.fontSize = `${Math.max(10, Math.round(12 * recordScale))}px`;
    groupCount.textContent = `${group.records.length} 条`;

    groupHeader.appendChild(groupTitle);
    groupHeader.appendChild(groupCount);
    fragment.appendChild(groupHeader);

    group.records.forEach((record) => {
    const recordElement = document.createElement("div");
    recordElement.className = "record-item";
    recordElement.dataset.recordId = record.id;
    recordElement.style.padding = `${cardPadding}px`;
    recordElement.style.borderRadius = `${cardRadius}px`;
    recordElement.style.fontSize = `${bodyFontSize}px`;
    recordElement.style.minHeight = `${cardMinHeight}px`;
    recordElement.style.height = "100%";
    recordElement.style.boxSizing = "border-box";
    if (record.id === activeRecordId) {
      recordElement.classList.add("active");
    }
    if (record.id === editingRecordId) {
      recordElement.classList.add("editing");
    }

    const row = document.createElement("div");
    row.className = "record-item-row";
    row.style.gap = `${Math.max(6, Math.round(10 * recordScale))}px`;
    row.style.minWidth = "0";

    const main = document.createElement("div");
    main.className = "record-main";
    main.style.minWidth = "0";

    const projectName = document.createElement("div");
    projectName.className = "project-name record-name-text";
    projectName.textContent = record.name;
    projectName.title = "双击可编辑";
    projectName.style.fontSize = `${titleFontSize}px`;
    projectName.addEventListener("dblclick", (event) => {
      event.stopPropagation();
      activeRecordId = record.id;
      editingRecordId = record.id;
      queueRecordNameFocus(record.id);
      updateDisplay();
    });

    const recordNameEditor = document.createElement("div");
    recordNameEditor.className = "record-name-editor";

    const recordNameInput = document.createElement("input");
    recordNameInput.type = "text";
    recordNameInput.className = "record-name-input";
    recordNameInput.value = record.name;
    recordNameInput.placeholder = "输入项目名称";
    recordNameInput.style.fontSize = `${bodyFontSize}px`;
    recordNameInput.style.padding = `${Math.max(6, Math.round(8 * recordScale))}px ${Math.max(8, Math.round(10 * recordScale))}px`;
    recordNameInput.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    recordNameInput.addEventListener("keydown", async (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        await saveRecordNameEdit(record.id);
      } else if (event.key === "Escape") {
        event.preventDefault();
        cancelRecordNameEdit();
      }
    });
    recordNameEditor.appendChild(recordNameInput);

    const spendtimeElement = document.createElement("div");
    spendtimeElement.className = "record-spendtime";
    spendtimeElement.textContent = `用时: ${record.spendtime}`;
    spendtimeElement.style.fontSize = `${bodyFontSize}px`;
    spendtimeElement.style.lineHeight = "1.35";

    const recordTime = document.createElement("div");
    recordTime.className = "record-time";
    const recordDate = resolveRecordTime(record) || new Date();
    recordTime.textContent = formatRecordCardTime(recordDate, compactMeta);
    recordTime.style.fontSize = `${metaFontSize}px`;
    recordTime.style.lineHeight = "1.35";

    main.appendChild(projectName);
    main.appendChild(recordNameEditor);
    main.appendChild(spendtimeElement);
    main.appendChild(recordTime);

    const actions = document.createElement("div");
    actions.className = "record-item-actions";
    actions.style.gap = `${Math.max(4, Math.round(6 * recordScale))}px`;

    const editBtn = document.createElement("button");
    editBtn.className = "record-action-btn record-edit-btn";
    editBtn.type = "button";
    editBtn.textContent = "编辑";
    editBtn.style.minWidth = `${Math.max(46, Math.round(58 * recordScale))}px`;
    editBtn.style.padding = `${buttonPaddingY}px ${buttonPaddingX}px`;
    editBtn.style.fontSize = `${buttonFontSize}px`;
    editBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      activeRecordId = record.id;
      editingRecordId = record.id;
      queueRecordNameFocus(record.id);
      updateDisplay();
    });

    const saveBtn = document.createElement("button");
    saveBtn.className = "record-action-btn record-save-btn";
    saveBtn.type = "button";
    saveBtn.textContent = "保存";
    saveBtn.style.minWidth = `${Math.max(46, Math.round(58 * recordScale))}px`;
    saveBtn.style.padding = `${buttonPaddingY}px ${buttonPaddingX}px`;
    saveBtn.style.fontSize = `${buttonFontSize}px`;
    saveBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      await saveRecordNameEdit(record.id);
    });

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "record-action-btn record-cancel-btn";
    cancelBtn.type = "button";
    cancelBtn.textContent = "取消";
    cancelBtn.style.minWidth = `${Math.max(46, Math.round(58 * recordScale))}px`;
    cancelBtn.style.padding = `${buttonPaddingY}px ${buttonPaddingX}px`;
    cancelBtn.style.fontSize = `${buttonFontSize}px`;
    cancelBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      cancelRecordNameEdit();
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-btn record-action-btn";
    deleteBtn.type = "button";
    deleteBtn.dataset.recordId = record.id;
    deleteBtn.textContent = "删除";
    deleteBtn.style.minWidth = `${Math.max(46, Math.round(58 * recordScale))}px`;
    deleteBtn.style.padding = `${buttonPaddingY}px ${buttonPaddingX}px`;
    deleteBtn.style.fontSize = `${buttonFontSize}px`;
    deleteBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const confirmed = await requestIndexConfirmation(
        "确定要删除这条记录吗？此操作不可撤销！",
        {
          title: "删除记录",
          confirmText: "删除",
          cancelText: "取消",
          danger: true,
        },
      );
      if (!confirmed) {
        return;
      }
      deleteRecord(record.id);
      activeRecordId = null;
      editingRecordId = null;
    });

    actions.appendChild(editBtn);
    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);
    actions.appendChild(deleteBtn);

    row.appendChild(main);
    row.appendChild(actions);
    recordElement.appendChild(row);

    recordElement.addEventListener("click", function (event) {
      if (
        event.target.closest("button") ||
        event.target.closest("input") ||
        editingRecordId === record.id
      ) {
        return;
      }

      const isActive = activeRecordId === record.id;
      activeRecordId = isActive ? null : record.id;
      if (editingRecordId && editingRecordId !== record.id) {
        editingRecordId = null;
      }
      updateDisplay();
    });

      fragment.appendChild(recordElement);
    });
  });

  output.appendChild(fragment);

  syncRecordInlineEditingState();

  if (
    editingRecordId &&
    pendingRecordNameFocusId &&
    String(editingRecordId) === String(pendingRecordNameFocusId)
  ) {
    const focusRecordId = pendingRecordNameFocusId;
    pendingRecordNameFocusId = "";
    setRecordNameFocus(focusRecordId);
  }
}

function bindOutsideRecordEditCancellation() {
  document.addEventListener(
    "pointerdown",
    (event) => {
      const currentEditingRecordId = String(editingRecordId || "").trim();
      if (!currentEditingRecordId) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (target.closest(".modal-overlay")) {
        return;
      }

      const currentRecordElement = document.querySelector(
        `.record-item[data-record-id="${currentEditingRecordId}"]`,
      );
      if (currentRecordElement?.contains(target)) {
        return;
      }

      if (cancelRecordNameEdit()) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    true,
  );
}

// “开始计时” 打开弹窗
function openModal() {
  const modal = document.getElementById("modal-overlay");
  if (!modal) {
    spendModalClickLocked = false;
    clearPendingSpendModalState();
    return false;
  }

  isModalOpen = true;
  modal.hidden = false;
  modal.style.display = "flex";
  modal.style.zIndex = indexInitialDataLoaded ? "1000" : "2600";

  // 更新现有项目列表
  updateExistingProjectsList();
  const projectToPrefill =
    selectedProject || nextProject || lastEnteredProjectName || "";
  setProjectInputValue("project-name-input", projectToPrefill);
  renderProjectSuggestionsForInput(
    "project-name-input",
    projectToPrefill,
    false,
  );

  const nextProjectInput = document.getElementById("next-project-input");
  if (nextProjectInput) {
    const nextToPrefill =
      nextProject && nextProject !== projectToPrefill ? nextProject : "";
    setProjectInputValue("next-project-input", nextToPrefill);
    renderNextProjectSuggestions(nextProjectInput.value, false);
  }
  const currentInput = document.getElementById("project-name-input");
  const defaultTarget =
    currentInput && !currentInput.value.trim()
      ? "project-name-input"
      : "next-project-input";
  setModalProjectInputTarget(defaultTarget);

  resetShortenTimeInputs(false);
  updateRemainingTimeDisplay();

  if (modalDurationTimer) {
    clearInterval(modalDurationTimer);
  }
  modalDurationTimer = setInterval(updateRemainingTimeDisplay, 1000);

  // 添加点击外部关闭事件
  const handleModalOutsideClick = function (e) {
    if (e.target === this) {
      closeModal();
      this.removeEventListener("click", handleModalOutsideClick);
    }
  };

  modal.removeEventListener("click", modal._handleModalOutsideClick);
  modal._handleModalOutsideClick = handleModalOutsideClick;
  modal.addEventListener("click", handleModalOutsideClick);
  return true;
}

// 关闭弹窗
function closeModal() {
  spendModalClickLocked = false;
  clearPendingSpendModalState();
  commitPrimaryModalProjectInput({
    canonicalizeEmpty: true,
  });
  const modal = document.getElementById("modal-overlay");
  isModalOpen = false;
  if (modal) {
    modal.hidden = true;
    modal.style.display = "none";
  }
  modalProjectInputTargetManual = false;
  hideAllProjectSuggestions();
  if (modalDurationTimer) {
    clearInterval(modalDurationTimer);
    modalDurationTimer = null;
  }
}

// 更新现有项目列表
function updateExistingProjectsList() {
  const container = document.getElementById("existing-projects");
  if (!container) return;

  container.innerHTML = "";

  const level1Projects = projects.filter(
    (project) => normalizeProjectLevel(project.level) === 1,
  );
  const level1Sorted = level1Projects.sort((a, b) =>
    a.name.localeCompare(b.name, "zh-CN"),
  );

  level1Sorted.forEach((project) => {
    const option = document.createElement("div");
    option.className = `project-option ${project.name === selectedProject ? "selected" : ""}`;
    option.dataset.project = project.name;
    option.textContent = project.name;

    option.addEventListener("click", function () {
      selectedProject = this.dataset.project;

      // 更新选中状态
      document.querySelectorAll(".project-option").forEach((el) => {
        el.classList.remove("selected");
      });
      this.classList.add("selected");

      const targetInputId = getDefaultModalProjectInputTarget();
      const targetInput = document.getElementById(targetInputId);
      setProjectInputValue(targetInputId, selectedProject);

      if (targetInput) {
        renderProjectSuggestionsForInput(
          targetInputId,
          targetInput.value,
          true,
        );
      }

      if (
        !modalProjectInputTargetManual &&
        targetInputId === "project-name-input"
      ) {
        const nextInput = document.getElementById("next-project-input");
        if (nextInput && !nextInput.value.trim()) {
          setModalProjectInputTarget("next-project-input", {
            focus: true,
            showSuggestions: true,
            manual: false,
          });
          return;
        }
      }
      const nextProjectInput = document.getElementById("next-project-input");
      if (nextProjectInput && targetInputId === "next-project-input") {
        setModalProjectInputTarget("next-project-input", {
          focus: true,
          showSuggestions: true,
          manual: modalProjectInputTargetManual,
        });
      } else {
        setModalProjectInputTarget(targetInputId, {
          focus: true,
          showSuggestions: true,
          manual: modalProjectInputTargetManual,
        });
      }
    });

    container.appendChild(option);
  });

  // 列表刷新时同步刷新自动提示源
  renderProjectSuggestionsForInput(
    "project-name-input",
    document.getElementById("project-name-input")?.value || "",
  );
  renderNextProjectSuggestions(
    document.getElementById("next-project-input")?.value || "",
  );
}

// 应用缩短时间
function applyShortenTime() {
  const currentMs = getLatestDurationMs();
  const shortenHours =
    parseInt(document.getElementById("shorten-hours")?.value || "0", 10) || 0;
  const shortenMinutes =
    parseInt(document.getElementById("shorten-minutes")?.value || "0", 10) || 0;

  const shortenMs = (shortenHours * 60 + shortenMinutes) * 60000;
  const errorEl = document.getElementById("shorten-error");

  if (shortenMs <= 0) {
    if (errorEl) errorEl.style.display = "none";
    return {
      valid: true,
      shortenMs: 0,
      remainingMs: currentMs,
    };
  }

  if (shortenMs >= currentMs || currentMs < 60000) {
    if (errorEl) errorEl.style.display = "block";
    return {
      valid: false,
      shortenMs,
      remainingMs: currentMs,
    };
  }

  if (errorEl) errorEl.style.display = "none";
  return {
    valid: true,
    shortenMs,
    remainingMs: currentMs - shortenMs,
  };
}

// 更新剩余时间显示
function updateRemainingTimeDisplay() {
  const spendDisplay = document.getElementById("spendtime-display");
  const remainingDisplay = document.getElementById("remaining-time");
  if (!spendDisplay || !remainingDisplay) return;

  const currentMs = getLatestDurationMs();
  spendDisplay.textContent = formatDurationFromMs(currentMs);

  const shortenResult = applyShortenTime();
  if (!shortenResult.valid) {
    remainingDisplay.textContent = "无效";
    return;
  }

  remainingDisplay.textContent = formatDurationFromMs(
    shortenResult.remainingMs,
  );
}

// 点击计算循环
function spend(options = {}) {
  const resolvedClickTime =
    options.clickTime instanceof Date && !Number.isNaN(options.clickTime.getTime())
      ? new Date(options.clickTime)
      : deserializeTimerDate(options.clickTime) || new Date();
  const baseState = normalizeTimerRollbackState(options.baseState);
  if (baseState) {
    restoreTimerCoreState(baseState);
  }

  pendingRecordRollbackState = captureTimerCoreState();
  ptn += 1;
  if (ptn === 1) {
    fpt = new Date(resolvedClickTime);
    diffMs = null;
    spt = null;
    lastspt = null;
    return true;
  }

  const previousAnchor =
    ptn === 2
      ? fpt instanceof Date && !Number.isNaN(fpt.getTime())
        ? new Date(fpt)
        : new Date(resolvedClickTime)
      : lastspt instanceof Date && !Number.isNaN(lastspt.getTime())
        ? new Date(lastspt)
        : spt instanceof Date && !Number.isNaN(spt.getTime())
          ? new Date(spt)
          : fpt instanceof Date && !Number.isNaN(fpt.getTime())
            ? new Date(fpt)
            : new Date(resolvedClickTime);

  fpt = previousAnchor;
  spt = new Date(resolvedClickTime);
  diffMs = Math.max(spt.getTime() - fpt.getTime(), 0);
  lastspt = new Date(spt);
  return true;
}

function requestSpendModalOpen(requestedClickTime = new Date()) {
  const now = Date.now();
  const clickTime =
    requestedClickTime instanceof Date &&
    !Number.isNaN(requestedClickTime.getTime())
      ? requestedClickTime
      : new Date(now);
  if (
    spendModalClickLocked ||
    isModalOpen ||
    pendingSpendModalState ||
    now - lastSpendButtonAcceptedAt < SPEND_BUTTON_MULTI_CLICK_GUARD_MS
  ) {
    return false;
  }

  lastSpendButtonAcceptedAt = now;
  spendModalClickLocked = true;
  capturePendingSpendModalState(clickTime);

  if (openModal()) {
    return true;
  }

  void showIndexAlert("计时弹窗初始化失败，请重新进入记录页后重试。", {
    title: "无法打开计时弹窗",
    danger: true,
  });
  return false;
}

function initIndexModalBindings() {
  if (indexModalBindingsInitialized) {
    return;
  }
  indexModalBindingsInitialized = true;

  const nextProjectInput = document.getElementById("next-project-input");
  const projectNameInput = document.getElementById("project-name-input");
  const currentSuggestionPopover = document.getElementById(
    "project-name-suggestions",
  );
  const nextSuggestionPopover = document.getElementById(
    "next-project-suggestions",
  );

  const bindProjectInputEvents = (input, inputId) => {
    if (!input) return;
    const applyPathHint = () => {
      const entered = input.value.trim();
      if (!entered) return;
      const projectName = resolveProjectNameFromInput(entered);
      const matched = projects.find((project) => project.name === projectName);
      if (matched) {
        input.value = getProjectPath(matched);
      }
    };

    input.addEventListener("focus", () => {
      setModalProjectInputTarget(inputId, {
        manual: true,
        showSuggestions: true,
      });
    });
    input.addEventListener("input", () => {
      setModalProjectInputTarget(inputId, { manual: true });
      renderProjectSuggestionsForInput(inputId, input.value, true);
    });
    input.addEventListener("change", applyPathHint);
    input.addEventListener("blur", () => {
      applyPathHint();
      if (inputId === "project-name-input") {
        commitPrimaryModalProjectInput({
          canonicalizeEmpty: true,
        });
      }
      setTimeout(() => {
        hideProjectSuggestions(inputId);
      }, 120);
    });
  };

  bindProjectInputEvents(projectNameInput, "project-name-input");
  bindProjectInputEvents(nextProjectInput, "next-project-input");

  document.addEventListener("click", (event) => {
    const target = event.target;
    const existingProjects = document.getElementById("existing-projects");
    const isInputArea =
      target === projectNameInput ||
      target === nextProjectInput ||
      currentSuggestionPopover?.contains(target) ||
      nextSuggestionPopover?.contains(target) ||
      existingProjects?.contains(target);

    if (isInputArea) {
      return;
    }

    hideAllProjectSuggestions();
  });
}

async function handleIndexModalConfirmClick() {
  if (!indexInitialDataLoaded) {
    await showIndexAlert("记录数据仍在加载，请稍候再保存。", {
      title: "正在准备记录页",
    });
    return;
  }

  const projectNameInput = document.getElementById("project-name-input");
  const nextProjectInput = document.getElementById("next-project-input");

  const currentProjectName = resolveProjectNameFromInput(
    projectNameInput?.value?.trim() || selectedProject || "",
  );
  const nextProjectName = resolveProjectNameFromInput(
    nextProjectInput?.value?.trim() || "",
  );

  if (!currentProjectName) {
    await showIndexAlert("请输入当前项目名称", {
      title: "无法保存记录",
      danger: true,
    });
    return;
  }

  if (!ensureProjectExists(currentProjectName)) {
    return;
  }

  selectedProject = currentProjectName;
  lastEnteredProjectName = currentProjectName;
  const resolvedNextProjectName = nextProjectName || currentProjectName;

  const shortenResult = applyShortenTime();
  if (!shortenResult.valid) {
    return;
  }

  const pendingClickTime = getPendingSpendModalClickTime() || new Date();
  const pendingBaseState =
    getPendingSpendModalBaseState() || captureTimerCoreState();
  const spendAccepted = spend({
    clickTime: pendingClickTime,
    baseState: pendingBaseState,
  });
  if (!spendAccepted) {
    await showIndexAlert("计时状态已失效，请重新点击开始计时。", {
      title: "无法保存记录",
      danger: true,
    });
    closeModal();
    return;
  }

  if (ptn >= 2) {
    const rawEndTime =
      spt instanceof Date && !Number.isNaN(spt.getTime()) ? new Date(spt) : new Date();
    const startTime =
      fpt instanceof Date && !Number.isNaN(fpt.getTime()) ? new Date(fpt) : null;
    const adjustedEndTime = new Date(
      rawEndTime.getTime() - shortenResult.shortenMs,
    );
    const targetProject =
      shortenResult.shortenMs > 0 ? resolvedNextProjectName : "";
    const appliedCarryover = pendingDurationCarryoverState
      ? { ...pendingDurationCarryoverState }
      : null;
    result = formatDurationFromMs(shortenResult.remainingMs);
    const savedRecord = save({
      startTime,
      endTime: adjustedEndTime,
      rawEndTime,
      durationMs: shortenResult.remainingMs,
      durationMeta: {
        originalMs: shortenResult.remainingMs + shortenResult.shortenMs,
        recordedMs: shortenResult.remainingMs,
        returnedMs: shortenResult.shortenMs,
        returnTargetProject: targetProject,
        appliedCarryover,
      },
      nextProjectName: resolvedNextProjectName,
      nextProjectId: projects.find(
        (project) => project.name === resolvedNextProjectName,
      )?.id || null,
    });
    pendingDurationCarryoverState = null;

    if (shortenResult.shortenMs > 0) {
      ensureProjectExists(targetProject);
      pendingDurationCarryoverState = normalizeDurationCarryoverState({
        carryoverMs: shortenResult.shortenMs,
        sourceRecordId: savedRecord?.id || "",
        sourceProject: currentProjectName,
        targetProject,
        createdAt: new Date().toISOString(),
      });
      applyShortenCarryoverToNextInterval(shortenResult.shortenMs);
    }

    updateDisplay();
  }

  if (nextProjectName) {
    ensureProjectExists(nextProjectName);
  }
  nextProject = resolvedNextProjectName;

  selectedProject = nextProject;
  setProjectInputValue("project-name-input", nextProject);
  setProjectInputValue("next-project-input", "");
  resetShortenTimeInputs(false);
  setModalProjectInputTarget("next-project-input", { manual: false });
  persistTimerSessionState();

  closeModal({ discardUnsavedClick: false });
  lastSpendButtonAcceptedAt = Date.now();
  updateRemainingTimeDisplay();
  updateProjectsList();
  updateExistingProjectsList();
  refreshIndexWorkspace({ immediate: true });
}

function initIndexPrimaryBindings() {
  if (indexPrimaryBindingsInitialized) {
    return;
  }
  indexPrimaryBindingsInitialized = true;

  const timerModal = document.getElementById("modal-overlay");
  if (timerModal) {
    timerModal.__controlerCloseModal = () => closeModal();
    timerModal.hidden = timerModal.style.display === "none";
    uiTools?.prepareModalOverlay?.(timerModal, {
      append: false,
      persistent: true,
      visible: !timerModal.hidden,
      close: () => closeModal(),
    });
  }

  const advancedModalRoot = document.getElementById("advanced-modal-overlay");
  if (advancedModalRoot) {
    advancedModalRoot.__controlerCloseModal = () => closeAdvancedModal();
    advancedModalRoot.hidden = advancedModalRoot.style.display === "none";
    uiTools?.prepareModalOverlay?.(advancedModalRoot, {
      append: false,
      persistent: true,
      visible: !advancedModalRoot.hidden,
      close: () => closeAdvancedModal(),
    });
  }

  const spendBtn = document.getElementById("spend");
  if (spendBtn) {
    spendBtn.addEventListener("click", function () {
      requestSpendModalOpen();
    });
  }

  const modalCancelBtn = document.getElementById("modal-cancel");
  if (modalCancelBtn) {
    modalCancelBtn.addEventListener("click", function () {
      closeModal();
    });
  }

  const modalConfirmBtn = document.getElementById("modal-confirm");
  if (modalConfirmBtn) {
    modalConfirmBtn.addEventListener("click", function () {
      void handleIndexModalConfirmClick();
    });
  }

  const shortenHoursInput = document.getElementById("shorten-hours");
  const shortenMinutesInput = document.getElementById("shorten-minutes");
  if (shortenHoursInput) {
    shortenHoursInput.addEventListener("input", updateRemainingTimeDisplay);
  }
  if (shortenMinutesInput) {
    shortenMinutesInput.addEventListener("input", updateRemainingTimeDisplay);
  }

  document
    .getElementById("modal-overlay")
    ?.addEventListener("click", function (e) {
      if (e.target === this) {
        closeModal();
      }
    });
}

// 格式化时间差为"X小时Y分钟"的格式
function geshi() {
  const diffm = Math.floor(diffMs / (1000 * 60));
  const days = Math.floor(diffm / (60 * 24));
  const hours = Math.floor(diffm / 60);
  const minutes = diffm % 60;

  if (days > 0) {
    result = `${days}天${hours % 24}小时${minutes}分钟`;
  } else if (days === 0 && hours > 0) {
    result = `${hours}小时${minutes}分钟`;
  } else if (hours === 0 && minutes > 0) {
    result = `${minutes}分钟`;
  } else if (hours === 0 && minutes === 0) {
    result = "小于1分钟";
  }
}

// 高级选项切换函数
function toggleAdvancedOptions() {
  const advancedOptions = document.getElementById("advanced-options");
  const toggleBtn = document.getElementById("toggle-advanced-btn");

  if (
    advancedOptions.style.display === "none" ||
    !advancedOptions.style.display
  ) {
    advancedOptions.style.display = "block";
    toggleBtn.textContent = "隐藏高级选项";
  } else {
    advancedOptions.style.display = "none";
    toggleBtn.textContent = "显示高级选项";
  }
}

// 统计视图函数
function showStatistics(viewType) {
  const container = document.getElementById("stats-container");
  if (!container) return;

  // 清除容器
  container.innerHTML = "";

  // 根据视图类型显示不同的统计
  switch (viewType) {
    case "daily":
      container.innerHTML = `
        <div style="color: var(--text-color); padding: 20px; text-align: center">
          <h4>日统计视图</h4>
          <p>今天的总用时: ${calculateTotalTimeForPeriod("daily")}</p>
          <p>项目数量: ${countProjectsForPeriod("daily")}</p>
          <p style="margin-top: 20px; font-size: 14px; color: var(--muted-text-color)">
            详细统计图表功能正在开发中...
          </p>
        </div>
      `;
      break;

    case "weekly":
      container.innerHTML = `
        <div style="color: var(--text-color); padding: 20px; text-align: center">
          <h4>周统计视图</h4>
          <p>本周的总用时: ${calculateTotalTimeForPeriod("weekly")}</p>
          <p>项目数量: ${countProjectsForPeriod("weekly")}</p>
          <p style="margin-top: 20px; font-size: 14px; color: var(--muted-text-color)">
            详细统计图表功能正在开发中...
          </p>
        </div>
      `;
      break;

    case "monthly":
      container.innerHTML = `
        <div style="color: var(--text-color); padding: 20px; text-align: center">
          <h4>月统计视图</h4>
          <p>本月的总用时: ${calculateTotalTimeForPeriod("monthly")}</p>
          <p>项目数量: ${countProjectsForPeriod("monthly")}</p>
          <p style="margin-top: 20px; font-size: 14px; color: var(--muted-text-color)">
            详细统计图表功能正在开发中...
          </p>
        </div>
      `;
      break;

    case "yearly":
      container.innerHTML = `
        <div style="color: var(--text-color); padding: 20px; text-align: center">
          <h4>年统计视图</h4>
          <p>今年的总用时: ${calculateTotalTimeForPeriod("yearly")}</p>
          <p>项目数量: ${countProjectsForPeriod("yearly")}</p>
          <p style="margin-top: 20px; font-size: 14px; color: var(--muted-text-color)">
            详细统计图表功能正在开发中...
          </p>
        </div>
      `;
      break;

    default:
      container.innerHTML = `
        <div style="color: var(--text-color); padding: 20px; text-align: center">
          请选择时间视图
        </div>
      `;
  }

  // 添加点击外部关闭事件
  const modal = document.getElementById("advanced-modal-overlay");
  if (modal) {
    modal.addEventListener("click", function (e) {
      if (e.target === this) {
        closeAdvancedModal();
      }
    });
  }
}

// 显示时间选择器
function showTimeSelector() {
  const container = document.getElementById("time-selector-container");
  if (container) {
    container.style.display = "block";

    // 设置默认日期
    const today = new Date();
    const startDateInput = document.getElementById("start-date-select");
    const endDateInput = document.getElementById("end-date-select");

    if (startDateInput) {
      startDateInput.value = today.toISOString().split("T")[0];
    }
    if (endDateInput) {
      endDateInput.value = today.toISOString().split("T")[0];
    }

    // 设置默认时间
    const customTimeStart = document.getElementById("custom-time-start");
    const customTimeEnd = document.getElementById("custom-time-end");

    if (customTimeStart) {
      customTimeStart.value = "00:00";
    }
    if (customTimeEnd) {
      customTimeEnd.value = "23:59";
    }

    // 更新当前时间范围显示
    updateCurrentTimeRangeDisplay();
  }
}

// 更新时间范围显示
function updateCurrentTimeRangeDisplay() {
  const rangeElement = document.getElementById("current-time-range");
  if (!rangeElement) return;

  const unitSelect = document.getElementById("time-unit-select");
  const startDate = document.getElementById("start-date-select");
  const endDate = document.getElementById("end-date-select");
  const customTimeStart = document.getElementById("custom-time-start");
  const customTimeEnd = document.getElementById("custom-time-end");

  if (!unitSelect || !startDate || !endDate) return;

  const unit = unitSelect.value;
  const start = startDate.value;
  const end = endDate.value;

  let displayText = "";

  if (unit === "day") {
    displayText = `显示: ${start}`;
  } else if (unit === "week") {
    displayText = `显示: 第${getWeekNumber(new Date(start))}周`;
  } else if (unit === "month") {
    const date = new Date(start);
    displayText = `显示: ${date.getFullYear()}年${date.getMonth() + 1}月`;
  } else if (unit === "year") {
    const date = new Date(start);
    displayText = `显示: ${date.getFullYear()}年`;
  }

  // 如果有自定义时间
  if (
    customTimeStart &&
    customTimeEnd &&
    customTimeStart.value &&
    customTimeEnd.value
  ) {
    displayText += ` (${customTimeStart.value} - ${customTimeEnd.value})`;
  }

  rangeElement.textContent = displayText;
}

// 获取周数
function getWeekNumber(date) {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

// 初始化时间选择器
function initTimeSelector() {
  const applyBtn = document.getElementById("apply-time-range");
  const resetBtn = document.getElementById("reset-time-range");
  const unitSelect = document.getElementById("time-unit-select");
  const startDate = document.getElementById("start-date-select");
  const endDate = document.getElementById("end-date-select");
  const customTimeStart = document.getElementById("custom-time-start");
  const customTimeEnd = document.getElementById("custom-time-end");
  const quickBtns = document.querySelectorAll(".time-quick-btn");

  if (applyBtn) {
    applyBtn.addEventListener("click", function () {
      updateCurrentTimeRangeDisplay();
      // 触发统计更新
      const activeBtn =
        document.querySelector(".bts[id$='-stats-btn']:active") ||
        document.querySelector(".bts[id$='-stats-btn'].active");
      if (activeBtn) {
        const viewType = activeBtn.id.replace("-stats-btn", "");
        showStatistics(viewType);
      }
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", function () {
      const today = new Date();
      if (unitSelect) unitSelect.value = "day";
      if (startDate) startDate.value = today.toISOString().split("T")[0];
      if (endDate) endDate.value = today.toISOString().split("T")[0];
      if (customTimeStart) customTimeStart.value = "00:00";
      if (customTimeEnd) customTimeEnd.value = "23:59";
      updateCurrentTimeRangeDisplay();
    });
  }

  if (unitSelect) {
    unitSelect.addEventListener("change", function () {
      const today = new Date();
      if (this.value === "week") {
        // 设置本周的开始（周一）和结束（周日）
        const monday = getMonday(today);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);

        if (startDate) startDate.value = monday.toISOString().split("T")[0];
        if (endDate) endDate.value = sunday.toISOString().split("T")[0];
      } else if (this.value === "month") {
        // 设置本月的开始和结束
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

        if (startDate) startDate.value = firstDay.toISOString().split("T")[0];
        if (endDate) endDate.value = lastDay.toISOString().split("T")[0];
      } else if (this.value === "year") {
        // 设置本年的开始和结束
        const firstDay = new Date(today.getFullYear(), 0, 1);
        const lastDay = new Date(today.getFullYear(), 11, 31);

        if (startDate) startDate.value = firstDay.toISOString().split("T")[0];
        if (endDate) endDate.value = lastDay.toISOString().split("T")[0];
      }
      updateCurrentTimeRangeDisplay();
    });
  }

  if (startDate && endDate) {
    startDate.addEventListener("change", updateCurrentTimeRangeDisplay);
    endDate.addEventListener("change", updateCurrentTimeRangeDisplay);
  }

  if (customTimeStart && customTimeEnd) {
    customTimeStart.addEventListener("change", updateCurrentTimeRangeDisplay);
    customTimeEnd.addEventListener("change", updateCurrentTimeRangeDisplay);
  }

  // 快速按钮事件
  quickBtns.forEach((btn) => {
    btn.addEventListener("click", function () {
      const days = parseInt(this.getAttribute("data-days"));
      const today = new Date();
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() + days);

      const dateStr = targetDate.toISOString().split("T")[0];

      if (startDate) startDate.value = dateStr;
      if (endDate) endDate.value = dateStr;

      // 更新按钮激活状态
      quickBtns.forEach((b) => {
        b.style.backgroundColor = "";
        b.style.color = "";
      });
      this.style.backgroundColor = "var(--accent-color)";
      this.style.color = "var(--on-accent-text)";

      updateCurrentTimeRangeDisplay();

      // 如果是今天，更新单位选择器为天
      if (days === 0 && unitSelect) {
        unitSelect.value = "day";
      }
    });
  });
}

// 获取周一
function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // 如果周日，调整为周一
  return new Date(d.setDate(diff));
}

// 计算时间段内的总用时
function calculateTotalTimeForPeriod(period) {
  // 简化实现：实际应该根据记录的时间戳计算
  let totalMs = 0;

  records.forEach((record) => {
    // 这里应该检查记录是否在指定时间段内
    // 暂时返回所有记录的总和
    const timeStr = record.spendtime;

    // 解析时间字符串
    const dayMatch = timeStr.match(/(\d+)天/);
    const hourMatch = timeStr.match(/(\d+)小时/);
    const minMatch = timeStr.match(/(\d+)分钟/);
    const lessMinMatch = timeStr.includes("小于1分钟");

    if (dayMatch) totalMs += parseInt(dayMatch[1]) * 24 * 60 * 60 * 1000;
    if (hourMatch) totalMs += parseInt(hourMatch[1]) * 60 * 60 * 1000;
    if (minMatch) totalMs += parseInt(minMatch[1]) * 60 * 1000;
    if (lessMinMatch) totalMs += 30 * 1000;
  });

  // 转换为小时和分钟
  const totalMinutes = Math.floor(totalMs / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours}小时${minutes > 0 ? minutes + "分钟" : ""}`;
  } else if (minutes > 0) {
    return `${minutes}分钟`;
  } else {
    return "小于1分钟";
  }
}

// 计算时间段内的项目数量
function countProjectsForPeriod(period) {
  // 简化实现：返回去重后的项目名称数量
  const uniqueProjects = new Set();
  records.forEach((record) => {
    if (record.name) {
      uniqueProjects.add(record.name);
    }
  });
  return uniqueProjects.size;
}

// 扩展记录模型 - 添加时间范围支持
class TimeRecord {
  constructor(recordData) {
    this.id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    this.name = recordData.name || "未命名项目";
    this.startTime = recordData.startTime || new Date();
    this.endTime = recordData.endTime || new Date();
    this.durationMs = recordData.durationMs || 0;
    this.color = recordData.color || getThemeProjectColor(1);
    this.projectId = recordData.projectId || null;
  }

  // 获取记录跨越的天数
  getSpannedDays() {
    const start = new Date(this.startTime);
    const end = new Date(this.endTime);

    // 重置为0:00:00
    const startDate = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate(),
    );
    const endDate = new Date(end.getFullYear(), end.getMonth(), end.getDate());

    const days = [];
    let currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      days.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return days;
  }

  // 获取特定日期的持续时间（毫秒）
  getDurationForDate(date) {
    const targetDate = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
    );
    const startDate = new Date(
      this.startTime.getFullYear(),
      this.startTime.getMonth(),
      this.startTime.getDate(),
    );
    const endDate = new Date(
      this.endTime.getFullYear(),
      this.endTime.getMonth(),
      this.endTime.getDate(),
    );

    if (targetDate < startDate || targetDate > endDate) {
      return 0;
    }

    if (startDate.getTime() === endDate.getTime()) {
      // 同一天
      return this.durationMs;
    } else if (targetDate.getTime() === startDate.getTime()) {
      // 第一天
      const endOfDay = new Date(startDate);
      endOfDay.setHours(23, 59, 59, 999);
      return endOfDay.getTime() - this.startTime.getTime();
    } else if (targetDate.getTime() === endDate.getTime()) {
      // 最后一天
      const startOfDay = new Date(endDate);
      startOfDay.setHours(0, 0, 0, 0);
      return this.endTime.getTime() - startOfDay.getTime();
    } else {
      // 中间的天 - 完整24小时
      return 24 * 60 * 60 * 1000;
    }
  }
}

// 动态时间表格（周视图）
function renderWeeklyTimeGrid() {
  const container = document.getElementById("stats-container");
  if (!container) return;

  // 清空容器
  container.innerHTML = "";

  // 创建周视图标题
  const header = document.createElement("div");
  header.style.padding = "15px";
  header.style.borderBottom = "1px solid var(--bg-tertiary)";
  header.innerHTML = `
    <h4 style="margin: 0; color: var(--text-color)">周时间表格</h4>
    <p style="margin: 5px 0 0 0; color: var(--muted-text-color); font-size: 14px">
      显示本周的时间分配情况
    </p>
  `;
  container.appendChild(header);

  // 创建时间表格
  const gridContainer = document.createElement("div");
  gridContainer.style.padding = "15px";
  gridContainer.style.overflowX = "auto";

  // 创建表格
  const table = document.createElement("table");
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";
  table.style.fontSize = "12px";

  // 创建表头 - 星期几
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");

  // 时间列标题
  const timeHeader = document.createElement("th");
  timeHeader.textContent = "时间";
  timeHeader.style.padding = "8px";
  timeHeader.style.border = "1px solid var(--bg-tertiary)";
  timeHeader.style.backgroundColor = "var(--bg-secondary)";
  timeHeader.style.color = "var(--text-color)";
  timeHeader.style.textAlign = "left";
  timeHeader.style.minWidth = "60px";
  headerRow.appendChild(timeHeader);

  // 星期几标题
  const daysOfWeek = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  const currentWeekDates = getCurrentWeekDates();

  daysOfWeek.forEach((day, index) => {
    const th = document.createElement("th");
    const date = currentWeekDates[index];
    th.textContent = `${day}\n${date.getMonth() + 1}/${date.getDate()}`;
    th.style.padding = "8px";
    th.style.border = "1px solid var(--bg-tertiary)";
    th.style.backgroundColor = "var(--bg-secondary)";
    th.style.color = "var(--text-color)";
    th.style.textAlign = "center";
    th.style.minWidth = "80px";
    th.style.whiteSpace = "pre-line";
    headerRow.appendChild(th);
  });

  thead.appendChild(headerRow);
  table.appendChild(thead);

  // 创建表格主体 - 时间行
  const tbody = document.createElement("tbody");

  // 每小时一行，从0点到24点
  for (let hour = 0; hour < 24; hour++) {
    const row = document.createElement("tr");

    // 时间单元格
    const timeCell = document.createElement("td");
    timeCell.textContent = `${hour.toString().padStart(2, "0")}:00`;
    timeCell.style.padding = "4px";
    timeCell.style.border = "1px solid var(--bg-tertiary)";
    timeCell.style.backgroundColor = "var(--bg-secondary)";
    timeCell.style.color = "var(--text-color)";
    timeCell.style.textAlign = "center";
    row.appendChild(timeCell);

    // 每一天的单元格
    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      const cell = document.createElement("td");
      cell.style.padding = "0";
      cell.style.border = "1px solid var(--bg-tertiary)";
      cell.style.position = "relative";
      cell.style.height = "40px";
      cell.style.backgroundColor = "var(--bg-primary)";

      // 在这个单元格中查找对应时间段的记录
      const dayDate = currentWeekDates[dayIndex];
      const recordsForCell = getRecordsForTimeSlot(dayDate, hour);

      // 如果有记录，创建时间区块
      if (recordsForCell.length > 0) {
        recordsForCell.forEach((record) => {
          const timeBlock = document.createElement("div");
          timeBlock.style.position = "absolute";
          timeBlock.style.left = "0";
          timeBlock.style.right = "0";
          timeBlock.style.backgroundColor =
            record.color || getThemeProjectColor(1);
          timeBlock.style.borderRadius = "2px";
          timeBlock.style.cursor = "pointer";
          timeBlock.style.transition = "all 0.2s ease";
          timeBlock.style.overflow = "hidden";

          // 设置区块高度和位置
          const startHour = record.startTime.getHours();
          const startMinute = record.startTime.getMinutes();
          const endHour = record.endTime.getHours();
          const endMinute = record.endTime.getMinutes();

          // 计算相对于整点的位置
          let top = 0;
          let height = 40; // 默认1小时的高度

          if (startHour === hour) {
            // 从这个小时开始
            top = (startMinute / 60) * 40;
          }

          if (endHour === hour) {
            // 在这个小时结束
            height = (endMinute / 60) * 40 - top;
          } else if (startHour === hour && endHour > hour) {
            // 跨小时，这个小时内的部分高度为60分钟减去开始分钟
            height = 40 - top;
          }

          timeBlock.style.top = `${top}px`;
          timeBlock.style.height = `${height}px`;

          // 悬停效果
          timeBlock.addEventListener("mouseenter", function () {
            this.style.transform = "scale(1.02)";
            this.style.zIndex = "10";
            this.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)";

            // 显示工具提示
            const tooltip = document.createElement("div");
            tooltip.textContent = `${record.name}\n${formatTime(record.startTime)} - ${formatTime(record.endTime)}`;
            tooltip.style.position = "absolute";
            tooltip.style.top = "-40px";
            tooltip.style.left = "50%";
            tooltip.style.transform = "translateX(-50%)";
            tooltip.style.backgroundColor = "var(--bg-secondary)";
            tooltip.style.color = "var(--text-color)";
            tooltip.style.padding = "5px 10px";
            tooltip.style.borderRadius = "4px";
            tooltip.style.fontSize = "11px";
            tooltip.style.whiteSpace = "pre-line";
            tooltip.style.zIndex = "100";
            tooltip.style.border = "1px solid var(--bg-tertiary)";
            this.appendChild(tooltip);
            this.tooltip = tooltip;
          });

          timeBlock.addEventListener("mouseleave", function () {
            this.style.transform = "scale(1)";
            this.style.boxShadow = "none";
            if (this.tooltip) {
              this.removeChild(this.tooltip);
              this.tooltip = null;
            }
          });

          cell.appendChild(timeBlock);
        });
      }

      row.appendChild(cell);
    }

    tbody.appendChild(row);
  }

  table.appendChild(tbody);
  gridContainer.appendChild(table);
  container.appendChild(gridContainer);

  // 添加图例
  const legend = document.createElement("div");
  legend.style.padding = "15px";
  legend.style.borderTop = "1px solid var(--bg-tertiary)";
  legend.innerHTML = `
    <p style="margin: 0 0 10px 0; color: var(--text-color); font-size: 14px">
      <strong>图例：</strong> 每个色块代表一个时间段，鼠标悬停可查看详情
    </p>
    <div style="display: flex; gap: 10px; flex-wrap: wrap">
      ${getProjectColorsLegend()}
    </div>
  `;
  container.appendChild(legend);
}

// 获取本周的日期
function getCurrentWeekDates() {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = 周日, 1 = 周一, ..., 6 = 周六
  const dates = [];

  // 计算本周一的日期
  const monday = new Date(now);
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // 如果是周日，周一是6天前；否则是(1-dayOfWeek)天前
  monday.setDate(now.getDate() + diff);

  // 生成一周的日期
  for (let i = 0; i < 7; i++) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    dates.push(date);
  }

  return dates;
}

// 获取特定日期和小时的记录
function getRecordsForTimeSlot(date, hour) {
  const recordsForSlot = [];
  const targetDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );

  // 将现有records转换为TimeRecord对象
  const timeRecords = convertToTimeRecords();

  timeRecords.forEach((record) => {
    const recordDate = new Date(
      record.startTime.getFullYear(),
      record.startTime.getMonth(),
      record.startTime.getDate(),
    );

    if (recordDate.getTime() === targetDate.getTime()) {
      const startHour = record.startTime.getHours();
      const endHour = record.endTime.getHours();

      if (hour >= startHour && hour <= endHour) {
        recordsForSlot.push(record);
      }
    }
  });

  return recordsForSlot;
}

// 将现有记录转换为TimeRecord对象
function convertToTimeRecords() {
  const timeRecords = [];

  // 这里简化处理，实际应该从现有records转换
  // 由于现有记录没有精确的起止时间，这里模拟一些数据用于演示
  const today = new Date();

  // 为演示创建一些模拟记录
  if (records.length === 0) {
    // 如果没有记录，创建一些演示数据
    const demoProjects = ["项目A", "项目B", "项目C", "项目D"];
    const colors = [
      getThemeProjectColor(1),
      getThemeProjectColor(2),
      getThemeProjectColor(3),
      "var(--accent-color)",
    ];

    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);

      for (let j = 0; j < 2; j++) {
        const projectIndex = Math.floor(Math.random() * demoProjects.length);
        const startHour = 8 + Math.floor(Math.random() * 8);
        const durationHours = 1 + Math.random() * 3;

        const record = new TimeRecord({
          name: demoProjects[projectIndex],
          startTime: new Date(
            date.getFullYear(),
            date.getMonth(),
            date.getDate(),
            startHour,
            0,
            0,
          ),
          endTime: new Date(
            date.getFullYear(),
            date.getMonth(),
            date.getDate(),
            startHour + durationHours,
            0,
            0,
          ),
          durationMs: durationHours * 60 * 60 * 1000,
          color: colors[projectIndex],
        });

        timeRecords.push(record);
      }
    }
  } else {
    // 如果有现有记录，尝试转换
    records.forEach((record) => {
      if (record.name && record.spendtime) {
        const endTime = resolveRecordTime(record);
        if (!endTime) return;

        const durationMs =
          Number.isFinite(record?.durationMs) && record.durationMs >= 0
            ? Math.round(record.durationMs)
            : Number.isFinite(record?.durationMeta?.recordedMs) &&
                record.durationMeta.recordedMs >= 0
              ? Math.round(record.durationMeta.recordedMs)
              : parseSpendtimeToMs(record.spendtime);
        const explicitStartTime = deserializeTimerDate(record?.startTime);
        const startTime =
          explicitStartTime ||
          new Date(Math.max(endTime.getTime() - Math.max(durationMs, 0), 0));
        const safeDurationMs = Math.max(
          endTime.getTime() - startTime.getTime(),
          0,
        );

        const project =
          getProjectById(record?.projectId) ||
          projects.find((p) => p.name === record.name || p === record.name);

        const timeRecord = new TimeRecord({
          name: record.name,
          startTime: startTime,
          endTime: endTime,
          durationMs: safeDurationMs,
          color: getProjectStatsColor(project, project?.level || 1),
        });

        timeRecords.push(timeRecord);
      }
    });
  }

  return timeRecords;
}

// 格式化时间
function formatTime(date) {
  if (!(date instanceof Date)) date = new Date(date);
  return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
}

// 获取项目颜色图例
function getProjectColorsLegend() {
  let legendHTML = "";

  projects.forEach((project) => {
    const color = getProjectStatsColor(project, project.level);
    const name = project.name || project;
    legendHTML += `
      <div style="display: flex; align-items: center; gap: 5px">
        <div style="width: 16px; height: 16px; background-color: ${color}; border-radius: 3px"></div>
        <span style="color: var(--text-color); font-size: 12px">${name}</span>
      </div>
    `;
  });

  return legendHTML;
}

// 更新统计视图函数，添加完整的图表选项
function updateShowStatistics() {
  const container = document.getElementById("stats-container");
  if (!container) return;

  container.innerHTML = "";

  // 创建视图选择器
  const viewSelector = document.createElement("div");
  viewSelector.style.display = "flex";
  viewSelector.style.gap = "10px";
  viewSelector.style.marginBottom = "15px";
  viewSelector.style.padding = "0 15px";
  viewSelector.style.paddingTop = "15px";
  viewSelector.style.flexWrap = "wrap";

  const viewOptions = [
    { id: "pie", name: "饼状图" },
    { id: "weekly-grid", name: "周时间表格" },
    { id: "line", name: "折线图" },
  ];

  viewOptions.forEach((option) => {
    const btn = document.createElement("button");
    btn.className = "bts";
    btn.textContent = option.name;
    btn.dataset.view = option.id;
    btn.style.fontSize = "14px";
    btn.style.padding = "8px 12px";

    btn.addEventListener("click", function () {
      // 移除所有按钮的激活状态
      viewSelector.querySelectorAll("button").forEach((b) => {
        b.style.backgroundColor = "";
        b.style.color = "";
      });

      // 设置当前按钮激活状态
      this.style.backgroundColor = "var(--accent-color)";
      this.style.color = "var(--on-accent-text)";

      // 显示对应视图
      switch (option.id) {
        case "weekly-grid":
          renderWeeklyTimeGrid();
          break;
        case "pie":
          renderPieChart();
          break;
        case "line":
          renderLineChart();
          break;
      }
    });

    viewSelector.appendChild(btn);
  });

  container.appendChild(viewSelector);

  // 默认显示周时间表格
  renderWeeklyTimeGrid();
}

// 饼状图视图（完整实现）
function renderPieChart() {
  const container = document.getElementById("stats-container");
  if (!container) return;

  // 清空容器
  const content = container.querySelector(".stats-content");
  if (content) content.remove();

  // 创建统计内容容器
  const statsContent = document.createElement("div");
  statsContent.className = "stats-content";
  statsContent.style.padding = "15px";

  // 检查Chart.js是否可用
  if (typeof Chart === "undefined") {
    void ensureIndexChartRuntimeLoaded()
      .then(() => {
        renderPieChart();
      })
      .catch((error) => {
        console.error("加载记录页图表资源失败:", error);
      });
    statsContent.innerHTML = `
      <div style="color: var(--text-color); padding: 20px; text-align: center">
        <h4>饼状图统计</h4>
        <p>正在加载图表资源...</p>
      </div>
    `;
    container.appendChild(statsContent);
    return;
  }

  // 获取当前选择的视图类型
  const activeBtn =
    document.querySelector(".bts[id$='-stats-btn'].active") ||
    document.querySelector(".bts[id$='-stats-btn']:active");
  let viewType = "daily";
  if (activeBtn) {
    viewType = activeBtn.id.replace("-stats-btn", "");
  }

  // 获取时间范围
  const startDate = document.getElementById("start-date-select")?.value;
  const endDate = document.getElementById("end-date-select")?.value;
  const timeUnit = document.getElementById("time-unit-select")?.value || "day";

  // 获取数据
  const chartData = getPieChartData(viewType, timeUnit, startDate, endDate);

  // 创建排序选项
  const sortOptions = document.createElement("div");
  sortOptions.style.display = "flex";
  sortOptions.style.gap = "10px";
  sortOptions.style.marginBottom = "15px";
  sortOptions.style.alignItems = "center";

  const sortLabel = document.createElement("span");
  sortLabel.textContent = "排序方式: ";
  sortLabel.style.color = "var(--text-color)";
  sortOptions.appendChild(sortLabel);

  const ascBtn = document.createElement("button");
  ascBtn.className = "bts";
  ascBtn.textContent = "从小到大";
  ascBtn.style.fontSize = "12px";
  ascBtn.style.padding = "5px 10px";
  ascBtn.addEventListener("click", () => renderPieChartWithSort("asc"));

  const descBtn = document.createElement("button");
  descBtn.className = "bts";
  descBtn.textContent = "从大到小";
  descBtn.style.fontSize = "12px";
  descBtn.style.padding = "5px 10px";
  descBtn.addEventListener("click", () => renderPieChartWithSort("desc"));

  sortOptions.appendChild(ascBtn);
  sortOptions.appendChild(descBtn);

  // 创建分类视图选择器
  const categoryOptions = document.createElement("div");
  categoryOptions.style.display = "flex";
  categoryOptions.style.gap = "10px";
  categoryOptions.style.marginBottom = "15px";
  categoryOptions.style.alignItems = "center";

  const categoryLabel = document.createElement("span");
  categoryLabel.textContent = "分类层级: ";
  categoryLabel.style.color = "var(--text-color)";
  categoryOptions.appendChild(categoryLabel);

  const level1Btn = document.createElement("button");
  level1Btn.className = "bts";
  level1Btn.textContent = "一级分类";
  level1Btn.style.fontSize = "12px";
  level1Btn.style.padding = "5px 10px";
  level1Btn.addEventListener("click", () => renderPieChartWithCategory(1));

  const level2Btn = document.createElement("button");
  level2Btn.className = "bts";
  level2Btn.textContent = "二级分类";
  level2Btn.style.fontSize = "12px";
  level2Btn.style.padding = "5px 10px";
  level2Btn.addEventListener("click", () => renderPieChartWithCategory(2));

  const level3Btn = document.createElement("button");
  level3Btn.className = "bts";
  level3Btn.textContent = "三级分类";
  level3Btn.style.fontSize = "12px";
  level3Btn.style.padding = "5px 10px";
  level3Btn.addEventListener("click", () => renderPieChartWithCategory(3));

  categoryOptions.appendChild(level1Btn);
  categoryOptions.appendChild(level2Btn);
  categoryOptions.appendChild(level3Btn);

  // 创建图表容器
  const chartContainer = document.createElement("div");
  chartContainer.style.position = "relative";
  chartContainer.style.height = "400px";

  // 添加控制面板
  statsContent.appendChild(sortOptions);
  statsContent.appendChild(categoryOptions);
  statsContent.appendChild(chartContainer);

  container.appendChild(statsContent);

  // 初始渲染图表
  renderPieChartWithSort("desc");
}

// 获取饼状图数据
function getPieChartData(viewType, timeUnit, startDate, endDate) {
  // 根据视图类型和时间范围获取数据
  const data = {
    labels: [],
    datasets: [
      {
        data: [],
        backgroundColor: [],
        borderColor: "var(--bg-primary)",
        borderWidth: 1,
      },
    ],
  };

  // 计算每个项目的时间
  const projectTimes = {};

  // 过滤记录
  const filteredRecords = filterRecordsByTimeRange(
    records,
    viewType,
    timeUnit,
    startDate,
    endDate,
  );

  // 计算每个项目的总时间
  filteredRecords.forEach((record) => {
    if (record.name && record.spendtime) {
      const timeStr = record.spendtime;
      let totalMs = 0;

      // 解析时间字符串
      const dayMatch = timeStr.match(/(\d+)天/);
      const hourMatch = timeStr.match(/(\d+)小时/);
      const minMatch = timeStr.match(/(\d+)分钟/);
      const lessMinMatch = timeStr.includes("小于1分钟");

      if (dayMatch) totalMs += parseInt(dayMatch[1]) * 24 * 60 * 60 * 1000;
      if (hourMatch) totalMs += parseInt(hourMatch[1]) * 60 * 60 * 1000;
      if (minMatch) totalMs += parseInt(minMatch[1]) * 60 * 1000;
      if (lessMinMatch) totalMs += 30 * 1000;

      projectTimes[record.name] = (projectTimes[record.name] || 0) + totalMs;
    }
  });

  // 转换为小时
  Object.keys(projectTimes).forEach((projectName) => {
    const hours = projectTimes[projectName] / (1000 * 60 * 60);
    if (hours > 0) {
      data.labels.push(projectName);
      data.datasets[0].data.push(hours);

      // 获取项目颜色
      const project = projects.find((p) => p.name === projectName);
      if (project && project.color) {
        data.datasets[0].backgroundColor.push(project.color);
      } else {
        // 生成随机颜色
        const hue = Math.floor(Math.random() * 360);
        data.datasets[0].backgroundColor.push(`hsl(${hue}, 70%, 60%)`);
      }
    }
  });

  return data;
}

// 过滤记录
function filterRecordsByTimeRange(
  records,
  viewType,
  timeUnit,
  startDate,
  endDate,
) {
  if (!records || records.length === 0) return [];

  // 简化实现：返回所有记录
  // 实际应该根据时间范围过滤
  return records;
}

// 按排序方式渲染饼状图
function renderPieChartWithSort(sortOrder) {
  const chartContainer = document.querySelector(
    "#stats-container .stats-content > div:last-child",
  );
  if (!chartContainer) return;

  // 获取当前图表数据
  const chartData = getPieChartDataForCurrentView();

  // 排序数据
  const sortedData = sortChartData(chartData, sortOrder);

  // 销毁现有图表
  if (window.pieChart) {
    window.pieChart.destroy();
  }

  // 创建新图表
  const ctx = document.createElement("canvas");
  ctx.style.width = "100%";
  ctx.style.height = "100%";
  chartContainer.innerHTML = "";
  chartContainer.appendChild(ctx);

  window.pieChart = new Chart(ctx, {
    type: "pie",
    data: sortedData,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "right",
          labels: {
            color: "var(--text-color)",
            font: {
              size: 12,
            },
          },
        },
        tooltip: {
          callbacks: {
            label: function (context) {
              const label = context.label || "";
              const value = context.raw || 0;
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage = Math.round((value / total) * 100);
              return `${label}: ${value.toFixed(2)}小时 (${percentage}%)`;
            },
          },
          backgroundColor: "var(--bg-secondary)",
          titleColor: "var(--text-color)",
          bodyColor: "var(--text-color)",
          borderColor: "var(--accent-color)",
        },
      },
      animation: false,
    },
  });
}

// 按分类层级渲染饼状图
function renderPieChartWithCategory(level) {
  // 这里可以根据项目层级过滤数据
  // 简化实现：先使用所有数据
  renderPieChartWithSort("desc");
}

// 获取当前视图的饼状图数据
function getPieChartDataForCurrentView() {
  // 获取当前选择的视图类型
  const activeBtn =
    document.querySelector(".bts[id$='-stats-btn'].active") ||
    document.querySelector(".bts[id$='-stats-btn']:active");
  let viewType = "daily";
  if (activeBtn) {
    viewType = activeBtn.id.replace("-stats-btn", "");
  }

  // 获取时间范围
  const startDate = document.getElementById("start-date-select")?.value;
  const endDate = document.getElementById("end-date-select")?.value;
  const timeUnit = document.getElementById("time-unit-select")?.value || "day";

  return getPieChartData(viewType, timeUnit, startDate, endDate);
}

// 排序图表数据
function sortChartData(chartData, sortOrder) {
  const labels = [...chartData.labels];
  const data = [...chartData.datasets[0].data];
  const colors = [...chartData.datasets[0].backgroundColor];

  // 创建索引数组并排序
  const indices = labels.map((_, index) => index);
  indices.sort((a, b) => {
    if (sortOrder === "asc") {
      return data[a] - data[b];
    } else {
      return data[b] - data[a];
    }
  });

  // 重新排序数组
  const sortedLabels = indices.map((i) => labels[i]);
  const sortedData = indices.map((i) => data[i]);
  const sortedColors = indices.map((i) => colors[i]);

  return {
    labels: sortedLabels,
    datasets: [
      {
        data: sortedData,
        backgroundColor: sortedColors,
        borderColor: "var(--bg-primary)",
        borderWidth: 1,
      },
    ],
  };
}

// ============================================
// 完善折线图功能
// ============================================

// 折线图视图（完整实现）
function renderLineChart() {
  const container = document.getElementById("stats-container");
  if (!container) return;

  // 清空容器
  const content = container.querySelector(".stats-content");
  if (content) content.remove();

  // 创建统计内容容器
  const statsContent = document.createElement("div");
  statsContent.className = "stats-content";
  statsContent.style.padding = "15px";

  // 检查Chart.js是否可用
  if (typeof Chart === "undefined") {
    void ensureIndexChartRuntimeLoaded()
      .then(() => {
        renderLineChart();
      })
      .catch((error) => {
        console.error("加载记录页折线图资源失败:", error);
      });
    statsContent.innerHTML = `
      <div style="color: var(--text-color); padding: 20px; text-align: center">
        <h4>折线图统计</h4>
        <p>正在加载图表资源...</p>
      </div>
    `;
    container.appendChild(statsContent);
    return;
  }

  // 创建数据选择器
  const dataOptions = document.createElement("div");
  dataOptions.style.display = "flex";
  dataOptions.style.gap = "10px";
  dataOptions.style.marginBottom = "15px";
  dataOptions.style.alignItems = "center";
  dataOptions.style.flexWrap = "wrap";

  const dataLabel = document.createElement("span");
  dataLabel.textContent = "数据显示: ";
  dataLabel.style.color = "var(--text-color)";
  dataOptions.appendChild(dataLabel);

  const projectDataBtn = document.createElement("button");
  projectDataBtn.className = "bts";
  projectDataBtn.textContent = "项目数据";
  projectDataBtn.style.fontSize = "12px";
  projectDataBtn.style.padding = "5px 10px";
  projectDataBtn.addEventListener("click", () =>
    renderLineChartWithData("project"),
  );

  const level1DataBtn = document.createElement("button");
  level1DataBtn.className = "bts";
  level1DataBtn.textContent = "一级分类";
  level1DataBtn.style.fontSize = "12px";
  level1DataBtn.style.padding = "5px 10px";
  level1DataBtn.addEventListener("click", () =>
    renderLineChartWithData("level1"),
  );

  const level2DataBtn = document.createElement("button");
  level2DataBtn.className = "bts";
  level2DataBtn.textContent = "二级分类";
  level2DataBtn.style.fontSize = "12px";
  level2DataBtn.style.padding = "5px 10px";
  level2DataBtn.addEventListener("click", () =>
    renderLineChartWithData("level2"),
  );

  const level3DataBtn = document.createElement("button");
  level3DataBtn.className = "bts";
  level3DataBtn.textContent = "三级分类";
  level3DataBtn.style.fontSize = "12px";
  level3DataBtn.style.padding = "5px 10px";
  level3DataBtn.addEventListener("click", () =>
    renderLineChartWithData("level3"),
  );

  dataOptions.appendChild(projectDataBtn);
  dataOptions.appendChild(level1DataBtn);
  dataOptions.appendChild(level2DataBtn);
  dataOptions.appendChild(level3DataBtn);

  // 创建图表容器
  const chartContainer = document.createElement("div");
  chartContainer.style.position = "relative";
  chartContainer.style.height = "400px";

  // 添加控制面板
  statsContent.appendChild(dataOptions);
  statsContent.appendChild(chartContainer);

  container.appendChild(statsContent);

  // 初始渲染图表
  renderLineChartWithData("project");
}

// 按数据类型渲染折线图
function renderLineChartWithData(dataType) {
  const chartContainer = document.querySelector(
    "#stats-container .stats-content > div:last-child",
  );
  if (!chartContainer) return;

  // 获取图表数据
  const chartData = getLineChartData(dataType);

  // 销毁现有图表
  if (window.lineChart) {
    window.lineChart.destroy();
  }

  // 创建新图表
  const ctx = document.createElement("canvas");
  ctx.style.width = "100%";
  ctx.style.height = "100%";
  chartContainer.innerHTML = "";
  chartContainer.appendChild(ctx);

  window.lineChart = new Chart(ctx, {
    type: "line",
    data: chartData,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "top",
          labels: {
            color: "var(--text-color)",
            font: {
              size: 12,
            },
          },
        },
        tooltip: {
          mode: "index",
          intersect: false,
          callbacks: {
            label: function (context) {
              const label = context.dataset.label || "";
              const value = context.parsed.y || 0;
              return `${label}: ${value.toFixed(2)}小时`;
            },
          },
          backgroundColor: "var(--bg-secondary)",
          titleColor: "var(--text-color)",
          bodyColor: "var(--text-color)",
          borderColor: "var(--accent-color)",
        },
      },
      scales: {
        x: {
          grid: {
            color: "rgba(255, 255, 255, 0.1)",
          },
          ticks: {
            color: "var(--text-color)",
          },
        },
        y: {
          beginAtZero: true,
          grid: {
            color: "rgba(255, 255, 255, 0.1)",
          },
          ticks: {
            color: "var(--text-color)",
            callback: function (value) {
              return value + "h";
            },
          },
        },
      },
      interaction: {
        intersect: false,
        mode: "index",
      },
      animation: false,
    },
  });
}

// 获取折线图数据
function getLineChartData(dataType) {
  // 根据当前时间范围和视图类型获取数据
  const activeBtn =
    document.querySelector(".bts[id$='-stats-btn'].active") ||
    document.querySelector(".bts[id$='-stats-btn']:active");
  let viewType = "weekly";
  if (activeBtn) {
    viewType = activeBtn.id.replace("-stats-btn", "");
  }

  // 获取时间范围
  const startDate = document.getElementById("start-date-select")?.value;
  const endDate = document.getElementById("end-date-select")?.value;
  const timeUnit = document.getElementById("time-unit-select")?.value || "week";

  // 根据数据类型和视图类型生成数据
  const data = {
    labels: [],
    datasets: [],
  };

  // 生成时间标签
  if (viewType === "weekly") {
    data.labels = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  } else if (viewType === "monthly") {
    data.labels = [];
    for (let i = 1; i <= 31; i++) {
      data.labels.push(`第${i}天`);
    }
  } else if (viewType === "yearly") {
    data.labels = [
      "1月",
      "2月",
      "3月",
      "4月",
      "5月",
      "6月",
      "7月",
      "8月",
      "9月",
      "10月",
      "11月",
      "12月",
    ];
  } else {
    // daily
    data.labels = ["0-4", "4-8", "8-12", "12-16", "16-20", "20-24"];
  }

  // 根据数据类型生成数据集
  if (dataType === "project") {
    // 显示每个项目的数据
    const topProjects = projects.slice(0, 5); // 只显示前5个项目
    const colors = ["#79af85", "#4299e1", "#ed8936", "#9f7aea", "#f56565"];

    topProjects.forEach((project, index) => {
      const dataset = {
        label: project.name,
        data: generateChartDataFromRecords(data.labels, "project", viewType),
        borderColor: colors[index % colors.length],
        backgroundColor: colors[index % colors.length] + "20",
        tension: 0.3,
        fill: false,
      };
      data.datasets.push(dataset);
    });
  } else {
    // 显示分类数据
    const level = parseInt(dataType.replace("level", ""));
    const categories = getCategoriesByLevel(level);
    const colors = ["#79af85", "#4299e1", "#ed8936", "#9f7aea"];

    categories.forEach((category, index) => {
      const dataset = {
        label: category,
        data: generateChartDataFromRecords(data.labels, dataType, viewType),
        borderColor: colors[index % colors.length],
        backgroundColor: colors[index % colors.length] + "20",
        tension: 0.3,
        fill: false,
      };
      data.datasets.push(dataset);
    });
  }

  return data;
}

// 获取按层级分类的项目
function getCategoriesByLevel(level) {
  if (level === 1) {
    return projects
      .filter((p) => p.level === 1)
      .map((p) => p.name)
      .slice(0, 4);
  } else if (level === 2) {
    return projects
      .filter((p) => p.level === 2)
      .map((p) => p.name)
      .slice(0, 4);
  } else if (level === 3) {
    return projects
      .filter((p) => p.level === 3)
      .map((p) => p.name)
      .slice(0, 4);
  }
  return [];
}

// 根据实际记录生成数据
function generateChartDataFromRecords(labels, dataType, viewType) {
  const data = [];

  // 根据视图类型获取时间范围
  let startDate, endDate;
  const today = new Date();

  if (viewType === "weekly") {
    // 本周数据
    startDate = new Date(today);
    startDate.setDate(today.getDate() - today.getDay() + 1); // 周一
    endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6); // 周日
  } else if (viewType === "monthly") {
    // 本月数据
    startDate = new Date(today.getFullYear(), today.getMonth(), 1);
    endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  } else if (viewType === "yearly") {
    // 本年数据
    startDate = new Date(today.getFullYear(), 0, 1);
    endDate = new Date(today.getFullYear(), 11, 31);
  } else {
    // 今天数据
    startDate = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );
    endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 1);
  }

  // 计算每个时间段的数据
  for (let i = 0; i < labels.length; i++) {
    let totalHours = 0;

    // 过滤记录
    const filteredRecords = records.filter((record) => {
      if (!record.timestamp || !record.spendtime) return false;

      const recordDate = new Date(record.timestamp);
      return recordDate >= startDate && recordDate <= endDate;
    });

    // 根据数据类型聚合数据
    if (dataType === "project") {
      // 项目数据 - 计算每个时间段的总时间
      filteredRecords.forEach((record) => {
        const timeStr = record.spendtime;
        let hours = 0;

        // 解析时间字符串
        const dayMatch = timeStr.match(/(\d+)天/);
        const hourMatch = timeStr.match(/(\d+)小时/);
        const minMatch = timeStr.match(/(\d+)分钟/);
        const lessMinMatch = timeStr.includes("小于1分钟");

        if (dayMatch) hours += parseInt(dayMatch[1]) * 24;
        if (hourMatch) hours += parseInt(hourMatch[1]);
        if (minMatch) hours += parseInt(minMatch[1]) / 60;
        if (lessMinMatch) hours += 0.5; // 小于1分钟按0.5小时算

        totalHours += hours;
      });
    } else {
      // 分类数据 - 根据层级过滤
      const level = parseInt(dataType.replace("level", ""));
      const levelProjects = projects.filter((p) => p.level === level);
      const levelProjectNames = levelProjects.map((p) => p.name);

      filteredRecords.forEach((record) => {
        if (levelProjectNames.includes(record.name)) {
          const timeStr = record.spendtime;
          let hours = 0;

          const dayMatch = timeStr.match(/(\d+)天/);
          const hourMatch = timeStr.match(/(\d+)小时/);
          const minMatch = timeStr.match(/(\d+)分钟/);
          const lessMinMatch = timeStr.includes("小于1分钟");

          if (dayMatch) hours += parseInt(dayMatch[1]) * 24;
          if (hourMatch) hours += parseInt(hourMatch[1]);
          if (minMatch) hours += parseInt(minMatch[1]) / 60;
          if (lessMinMatch) hours += 0.5;

          totalHours += hours;
        }
      });
    }

    data.push(totalHours || 0.1); // 确保最小值为0.1，避免图表显示问题
  }

  return data;
}

// ============================================
// 三级分类系统相关函数
// ============================================

// 更新父级项目选择器
function updateParentProjectSelect(selectedLevel) {
  const select = document.getElementById("parent-project-select");
  if (!select) return;

  // 清空选项
  select.innerHTML = '<option value="">请选择父级项目</option>';

  if (selectedLevel === 2) {
    // 二级项目只能选择一级项目作为父级
    const level1Projects = projects.filter(
      (p) => normalizeProjectLevel(p.level) === 1,
    );
    if (level1Projects.length === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "请先创建一级项目";
      option.disabled = true;
      select.appendChild(option);
    } else {
      level1Projects.forEach((project) => {
        const option = document.createElement("option");
        option.value = project.id;
        option.textContent = `${project.name} [一级]`;
        select.appendChild(option);
      });
    }
  } else if (selectedLevel === 3) {
    // 三级项目只能选择二级项目作为父级
    const level2Projects = projects.filter(
      (p) => normalizeProjectLevel(p.level) === 2,
    );
    if (level2Projects.length === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "请先创建二级项目";
      option.disabled = true;
      select.appendChild(option);
    } else {
      level2Projects.forEach((project) => {
        const option = document.createElement("option");
        option.value = project.id;
        option.textContent = `${project.name} [二级]`;
        select.appendChild(option);
      });
    }
  }

  uiTools?.refreshEnhancedSelect?.(select);
}

function updateProjectsList() {
  const container = document.getElementById("projects-list");
  if (!container) return;

  if (
    container.style.display === "none" ||
    container.getAttribute("hidden") !== null
  ) {
    container.textContent = "";
    return;
  }

  container.innerHTML = "";
  const fragment = document.createDocumentFragment();

  projects.forEach((project, index) => {
    const projectElement = document.createElement("div");
    projectElement.className = "project-item";
    const projectLevel = normalizeProjectLevel(project.level);
    const projectColor = normalizeProjectColorToHex(
      project.color,
      getDefaultProjectColorByLevel(projectLevel),
    );

    // 显示项目名称和层级
    const levelLabel =
      projectLevel === 1 ? "[1级]" : projectLevel === 2 ? "[2级]" : "[3级]";
    projectElement.textContent = `${project.name} ${levelLabel}`;

    projectElement.draggable = true;
    projectElement.dataset.index = index;
    projectElement.dataset.project = project.name;
    projectElement.dataset.projectId = project.id;
    projectElement.dataset.color = projectColor;

    // 根据内容调整大小
    projectElement.style.minWidth = "auto";
    projectElement.style.padding = "8px 12px";
    projectElement.style.width = "fit-content";
    projectElement.style.maxWidth = "200px";
    projectElement.style.whiteSpace = "nowrap";
    projectElement.style.overflow = "hidden";
    projectElement.style.textOverflow = "ellipsis";
    projectElement.style.background = getThemeProjectColor(projectLevel);
    projectElement.style.color = "var(--on-accent-text)";

    // 点击项目显示编辑弹窗
    projectElement.addEventListener("click", function (e) {
      e.stopPropagation();
      selectedProject = this.dataset.project;

      // 显示项目编辑弹窗
      showProjectEditModal(project);

      // 更新弹窗中的选中状态
      document.querySelectorAll(".project-option").forEach((el) => {
        el.classList.remove("selected");
        if (el.dataset.project === selectedProject) {
          el.classList.add("selected");
        }
      });
    });

    // 拖拽事件
    projectElement.addEventListener("dragstart", handleDragStart);
    projectElement.addEventListener("dragover", handleDragOver);
    projectElement.addEventListener("drop", handleDrop);
    projectElement.addEventListener("dragend", handleDragEnd);

    fragment.appendChild(projectElement);
  });

  container.appendChild(fragment);
}

// 显示项目编辑弹窗
function showProjectEditModal(project) {
  const projectLevel = normalizeProjectLevel(project.level);
  const safeProjectName = escapeHtmlAttribute(project.name);
  const safeProjectColor = getProjectColorInputValue(project);
  const modalBaseZIndex = 2000;
  const modalZIndex = Math.max(
    modalBaseZIndex,
    getTopVisibleModalOverlayZIndex(modalBaseZIndex - 20) + 20,
  );

  dismissTransientModalOverlays();

  // 创建编辑弹窗
  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.style.display = "flex";
  modal.style.zIndex = String(modalZIndex);

  modal.innerHTML = `
      <div class="modal-content ms" style="padding: 20px; border-radius: 15px; max-width: 480px; width: 90%">
        <h2 style="margin-top: 0; color: var(--text-color)">编辑项目</h2>
        
        <div class="form-group" style="margin-bottom: 15px">
          <label style="color: var(--text-color); display: block; margin-bottom: 5px">项目名称</label>
          <input type="text" id="edit-project-name" value="${safeProjectName}" style="
            width: 100%;
            padding: 10px;
            border-radius: 8px;
            border: 1px solid var(--input-border-color);
            background-color: var(--bg-quaternary);
            color: var(--text-color);
            font-size: 16px;
          ">
        </div>
        
        <div class="form-group" style="margin-bottom: 15px">
          <label style="color: var(--text-color); display: block; margin-bottom: 5px">项目层级</label>
          <div style="display: flex; gap: 10px">
            <label style="display: flex; align-items: center; color: var(--text-color)">
              <input type="radio" name="edit-project-level" value="1" ${projectLevel === 1 ? "checked" : ""}>
              <span style="margin-left: 5px">一级项目</span>
            </label>
            <label style="display: flex; align-items: center; color: var(--text-color)">
              <input type="radio" name="edit-project-level" value="2" ${projectLevel === 2 ? "checked" : ""}>
              <span style="margin-left: 5px">二级项目</span>
            </label>
            <label style="display: flex; align-items: center; color: var(--text-color)">
              <input type="radio" name="edit-project-level" value="3" ${projectLevel === 3 ? "checked" : ""}>
              <span style="margin-left: 5px">三级项目</span>
            </label>
          </div>
        </div>

        <div class="form-group" id="edit-parent-project-group" style="margin-bottom: 15px; display: none">
          <label style="color: var(--text-color); display: block; margin-bottom: 5px">父级项目（仅二级/三级项目）</label>
          <select id="edit-parent-project-select" style="
            width: 100%;
            padding: 10px;
            border-radius: 8px;
            border: 1px solid var(--input-border-color);
            background-color: var(--bg-quaternary);
            color: var(--text-color);
            font-size: 16px;
          "></select>
        </div>
        
        <div class="form-group project-color-panel" style="margin-bottom: 15px">
          <label style="color: var(--text-color); display: block; margin-bottom: 5px">项目颜色</label>
          <div class="project-color-picker-row">
            <input type="color" id="edit-project-color" class="project-color-input" value="${safeProjectColor}" style="width: 50px; height: 50px; cursor: pointer">
            <button class="bts project-color-random-btn" id="edit-project-color-random" type="button">随机色</button>
            <div class="project-color-picker-copy">
              <div style="color: var(--text-color); font-size: 14px">可手动挑色，也可直接点推荐色板</div>
              <div id="edit-project-color-current" class="project-color-current-value">${safeProjectColor.toUpperCase()}</div>
            </div>
          </div>
          <div class="project-color-palette" id="edit-project-color-presets" role="list" aria-label="编辑项目颜色推荐色板"></div>
          <div class="project-color-note">颜色仅用于统计图表；一级项目改色时，只会联动仍处于自动色模式的子级。</div>
        </div>
        
        <div style="display: flex; justify-content: space-between; margin-top: 20px">
          <button class="bts" id="delete-project-btn" style="background-color: var(--delete-btn)">删除项目</button>
          <div style="display: flex; gap: 10px">
            <button class="bts" id="cancel-edit-btn">取消</button>
            <button class="bts" id="save-edit-btn">保存</button>
          </div>
        </div>
      </div>
    `;

  document.body.appendChild(modal);
  uiTools?.stopModalContentPropagation?.(modal);

  const closeEditModal = () => {
    if (modal.parentNode) {
      modal.parentNode.removeChild(modal);
    }
  };

  const setEditModalMergePending = (pending) => {
    modal.style.visibility = pending ? "hidden" : "visible";
    modal.style.pointerEvents = pending ? "none" : "auto";
    modal.setAttribute("aria-hidden", pending ? "true" : "false");
  };

  const parentGroup = modal.querySelector("#edit-parent-project-group");
  const parentSelect = modal.querySelector("#edit-parent-project-select");
  const editColorInput = modal.querySelector("#edit-project-color");
  const editColorPresets = modal.querySelector("#edit-project-color-presets");
  const editColorCurrent = modal.querySelector("#edit-project-color-current");
  const editColorRandomBtn = modal.querySelector("#edit-project-color-random");

  const updateParentEditOptions = (level) => {
    if (!parentGroup || !parentSelect) return;

    parentSelect.innerHTML = "";

    if (level === 1) {
      parentGroup.style.display = "none";
      return;
    }

    parentGroup.style.display = "block";
    const candidateLevel = level === 2 ? 1 : 2;
    const candidates = projects.filter((p) => {
      const pLevel = normalizeProjectLevel(p.level);
      return p.id !== project.id && pLevel === candidateLevel;
    });

    if (candidates.length === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent =
        level === 2 ? "请先创建一级项目" : "请先创建二级项目";
      option.disabled = true;
      option.selected = true;
      parentSelect.appendChild(option);
      return;
    }

    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "请选择父级项目";
    parentSelect.appendChild(defaultOption);

    candidates.forEach((candidate) => {
      const option = document.createElement("option");
      option.value = candidate.id;
      option.textContent = candidate.name;
      parentSelect.appendChild(option);
    });

    if (project.parentId && candidates.some((p) => p.id === project.parentId)) {
      parentSelect.value = project.parentId;
    } else {
      parentSelect.value = "";
    }
  };

  if (editColorInput) {
    writeProjectColorInputMode(
      editColorInput,
      getProjectStoredColorMode(project),
    );
  }

  const editProjectColorController = createProjectColorController({
    input: editColorInput,
    paletteContainer: editColorPresets,
    valueLabel: editColorCurrent,
    randomButton: editColorRandomBtn,
    getLevel: () =>
      parseInt(
        modal.querySelector('input[name="edit-project-level"]:checked')?.value ||
          String(projectLevel),
        10,
      ),
    getParentId: () => parentSelect?.value || null,
    getProjectId: () => project.id,
    getCurrentColor: () => editColorInput?.value || safeProjectColor,
    getProjectList: () => projects,
    preferCurrentHueForLevel1: true,
  });

  updateParentEditOptions(projectLevel);
  editProjectColorController.refresh();
  uiTools?.enhanceNativeSelect?.(parentSelect, {
    fullWidth: true,
    minWidth: 240,
  });

  modal
    .querySelectorAll('input[name="edit-project-level"]')
    .forEach((radio) => {
      radio.addEventListener("change", function () {
        updateParentEditOptions(parseInt(this.value, 10));
        editProjectColorController.refresh({ recomputeAuto: true });
      });
    });
  parentSelect?.addEventListener("change", () => {
    editProjectColorController.refresh({ recomputeAuto: true });
  });

  // 绑定事件
  modal.querySelector("#cancel-edit-btn").addEventListener("click", () => {
    closeEditModal();
  });

  modal.querySelector("#save-edit-btn").addEventListener("click", async () => {
    const newName = modal.querySelector("#edit-project-name").value.trim();
    const newLevel = parseInt(
      modal.querySelector('input[name="edit-project-level"]:checked').value,
    );
    const newColor = normalizeProjectColorToHex(
      modal.querySelector("#edit-project-color").value,
      getDefaultProjectColorByLevel(newLevel),
    );
    const newColorMode = readProjectColorInputMode(
      modal.querySelector("#edit-project-color"),
    );
    const newParentId = parentSelect?.value || null;

    if (!newName) {
      await showIndexAlert("项目名称不能为空", {
        title: "无法保存项目",
        danger: true,
      });
      return;
    }

    const liveProjectIndex = projects.findIndex((p) => p.id === project.id);
    if (liveProjectIndex === -1) {
      await showIndexAlert("未找到当前项目，请刷新后重试。", {
        title: "保存失败",
        danger: true,
      });
      return;
    }

    const liveProject = projects[liveProjectIndex];
    const previousProjectsForDurationCache = cloneProjectDurationSnapshot(projects);
    const oldName = liveProject.name;
    const mergeTargetProject =
      oldName !== newName
        ? findAnotherProjectWithName(newName, liveProject.id, projects)
        : null;

    if (mergeTargetProject) {
      const hasDescendants =
        collectProjectDescendantIds(liveProject.id, projects).length > 0;
      if (hasDescendants) {
        await showIndexAlert(
          "当前项目下仍有子项目，只有叶子项目才能通过重命名合并。",
          {
            title: "无法合并项目",
            danger: true,
          },
        );
        return;
      }

      const confirmed = await requestIndexConfirmation(
        `确定将项目“${oldName}”的记录合并到现有项目“${mergeTargetProject.name}”吗？\n合并后当前项目会消失，目标项目的层级、父级和颜色保持不变。`,
        {
          title: "合并项目",
          confirmText: "合并",
          cancelText: "取消",
          danger: true,
        },
      );
      if (!confirmed) {
        return;
      }

      let mergedRecordCount = 0;
      let mergeError = null;
      setEditModalMergePending(true);
      setIndexLoadingState({
        active: true,
        mode: "fullscreen",
        title: "正在合并项目",
        message: "正在合并记录并写入数据，请稍候。完成前请不要离开当前页面。",
        lockNativeExit: true,
      });
      try {
        const sourceRecordsBeforeMerge = records
          .filter((record) => {
            const recordProjectId = String(record?.projectId || "").trim();
            return (
              (liveProject.id && recordProjectId === liveProject.id) ||
              (!recordProjectId && oldName && record.name === oldName)
            );
          })
          .map((record) => ({
            ...record,
          }));
        mergedRecordCount = mergeProjectRecordsIntoTarget(
          liveProject,
          mergeTargetProject,
        );
        applyIndexProjectRecordDurationChanges({
          removedRecords: sourceRecordsBeforeMerge,
          addedRecords: sourceRecordsBeforeMerge.map((record) => ({
            ...record,
            name: mergeTargetProject.name,
            projectId: mergeTargetProject.id,
          })),
        });
        const mergedDurationBaseProjects = cloneProjectDurationSnapshot(projects);
        projects = projects.filter((p) => p.id !== liveProject.id);
        updateProjectNameReferences(oldName, mergeTargetProject.name, liveProject.id);

        projects = normalizeStoredProjects(projects);
        reconcileIndexProjectDurationCaches(mergedDurationBaseProjects);
        updateProjectsList();
        updateExistingProjectsList();
        updateParentProjectSelect(1);
        markAllLoadedRecordPeriodsDirty();
        await Promise.all([saveRecordsToStorage(), saveProjectsToStorage()]);
        await window.ControlerStorage?.flush?.();
        refreshIndexWorkspace({ immediate: true });
      } catch (error) {
        mergeError = error;
      } finally {
        setIndexLoadingState({
          active: false,
        });
        if (mergeError) {
          setEditModalMergePending(false);
        }
      }

      if (mergeError) {
        console.error("合并项目失败:", mergeError);
        await showIndexAlert("项目合并失败，请稍后重试。", {
          title: "合并失败",
          danger: true,
        });
        return;
      }

      closeEditModal();
      await showIndexAlert(
        `已将项目“${oldName}”的 ${mergedRecordCount} 条记录合并到“${mergeTargetProject.name}”。\n原项目已删除。`,
        {
          title: "合并完成",
        },
      );
      return;
    }

    if (newLevel === 2 || newLevel === 3) {
      if (!newParentId) {
        await showIndexAlert("请为当前项目选择父级项目", {
          title: "无法保存项目",
          danger: true,
        });
        return;
      }

      const parentProject = projects.find((p) => p.id === newParentId);
      if (!parentProject) {
        await showIndexAlert("父级项目不存在，请重新选择", {
          title: "父级项目无效",
          danger: true,
        });
        return;
      }

      const parentLevel = normalizeProjectLevel(parentProject.level);
      if (newLevel === 2 && parentLevel !== 1) {
        await showIndexAlert("二级项目的父级必须是一级项目", {
          title: "层级关系错误",
          danger: true,
        });
        return;
      }
      if (newLevel === 3 && parentLevel !== 2) {
        await showIndexAlert("三级项目的父级必须是二级项目", {
          title: "层级关系错误",
          danger: true,
        });
        return;
      }
    }

    // 保存旧名称用于更新记录
    const previousLevel = normalizeProjectLevel(liveProject.level);
    const previousParentId = liveProject.parentId || null;
    const previousColor = normalizeProjectColorToHex(liveProject.color, "");
    const previousColorMode = getProjectStoredColorMode(liveProject);
    const liveProjectDescendantIds = new Set(
      collectProjectDescendantIds(liveProject.id, projects),
    );
    const directLevel2Children = projects.filter(
      (candidate) =>
        String(candidate?.parentId || "").trim() ===
          String(liveProject.id || "").trim() &&
        normalizeProjectLevel(candidate.level) === 2,
    );
    const hasLevel3Descendants = projects.some(
      (candidate) =>
        liveProjectDescendantIds.has(String(candidate?.id || "").trim()) &&
        normalizeProjectLevel(candidate.level) === 3,
    );

    if (
      previousLevel === 1 &&
      newLevel === 2 &&
      directLevel2Children.length > 0 &&
      hasLevel3Descendants
    ) {
      await showIndexAlert(
        "当前一级项目下已经存在三级项目，暂不支持直接改成二级项目。请先调整子项目层级后再重试。",
        {
          title: "无法保存项目",
          danger: true,
        },
      );
      return;
    }

    // 更新项目
    projects[liveProjectIndex] = {
      ...liveProject,
      name: newName,
      level: newLevel,
      color: newColor,
      colorMode: newColorMode,
      parentId: newLevel === 1 ? null : newParentId,
    };
    const updatedProject = projects[liveProjectIndex];
    if (
      previousLevel === 1 &&
      newLevel === 2 &&
      directLevel2Children.length > 0 &&
      !hasLevel3Descendants
    ) {
      directLevel2Children.forEach((childProject) => {
        childProject.level = 3;
        childProject.parentId = updatedProject.id;
      });
    }
    const didLevelChange = previousLevel !== newLevel;
    const didParentChange =
      String(previousParentId || "") !== String(updatedProject.parentId || "");
    const didColorChange =
      previousColor !== normalizeProjectColorToHex(updatedProject.color, "");
    const didColorModeChange =
      previousColorMode !== getProjectStoredColorMode(updatedProject);

    if (
      getProjectStoredColorMode(updatedProject) === "auto" &&
      (didLevelChange || didParentChange)
    ) {
      updatedProject.color = resolveAutoProjectColorForProject(
        updatedProject,
        projects,
      );
    }

    if (
      didLevelChange ||
      didParentChange ||
      (newLevel === 1 && (didColorChange || didColorModeChange))
    ) {
      syncAutoProjectColorsInSubtree(updatedProject.id, {
        includeSelf: false,
        projectList: projects,
      });
    }

    // 如果项目名称改变，更新所有相关记录
    if (oldName !== newName) {
      await updateRecordsProjectName(oldName, newName, liveProject.id);
      updateProjectNameReferences(oldName, newName, liveProject.id);
    }

    // 更新UI和存储
    projects = normalizeStoredProjects(projects);
    reconcileIndexProjectDurationCaches(previousProjectsForDurationCache);
    updateProjectsList();
    updateExistingProjectsList();
    updateParentProjectSelect(1);
    saveProjectsToStorage();
    refreshIndexWorkspace({ immediate: true });

    closeEditModal();
  });

  modal
    .querySelector("#delete-project-btn")
    .addEventListener("click", async () => {
      projects = normalizeStoredProjects(projects);
      const liveProject =
        (project.id ? projects.find((p) => p.id === project.id) : null) ||
        projects.find(
          (p) =>
            p.name === project.name &&
            normalizeProjectLevel(p.level) === projectLevel,
        );

      if (!liveProject) {
        saveProjectsToStorage();
        updateProjectsList();
        updateExistingProjectsList();
        refreshIndexWorkspace({ immediate: true });
        closeEditModal();
        return;
      }

      const confirmed = await requestIndexConfirmation(
        `确定要删除项目 "${liveProject.name}" 吗？此操作不可撤销！将删除该项目及其所有记录数据！`,
        {
          title: "删除项目",
          confirmText: "删除",
          cancelText: "取消",
          danger: true,
        },
      );
      if (!confirmed) {
        return;
      }

      const projectIdsToDelete = new Set([liveProject.id]);
      let hasNewChild = true;
      while (hasNewChild) {
        hasNewChild = false;
        projects.forEach((p) => {
          if (p.parentId && projectIdsToDelete.has(p.parentId)) {
            if (!projectIdsToDelete.has(p.id)) {
              projectIdsToDelete.add(p.id);
              hasNewChild = true;
            }
          }
        });
      }

      const projectsToDelete = projects.filter((p) =>
        projectIdsToDelete.has(p.id),
      );
      const projectNameSet = new Set(projectsToDelete.map((p) => p.name));
      const deletedProjectsCount = projectsToDelete.length;
      const totalRecordsBeforeDelete = records.length;
      const removedRecords = records
        .filter((record) => {
          const recordProjectId = String(record?.projectId || "").trim();
          return (
            (recordProjectId && projectIdsToDelete.has(recordProjectId)) ||
            projectNameSet.has(record.name)
          );
        })
        .map((record) => ({
          ...record,
        }));

      applyIndexProjectRecordDurationChanges({
        removedRecords,
      });
      const deletedDurationBaseProjects = cloneProjectDurationSnapshot(projects);

      projects = projects.filter((p) => !projectIdsToDelete.has(p.id));
      records = records
        .filter((record) => {
          const matchByProjectId =
            record.projectId && projectIdsToDelete.has(record.projectId);
          const matchByProjectName = projectNameSet.has(record.name);
          return !matchByProjectId && !matchByProjectName;
        })
        .map((record) => {
          const recordNextProjectId = String(record?.nextProjectId || "").trim();
          const recordNextProjectName = resolveRecordNextProjectName(record, projects);
          const nextProjectDeleted =
            (recordNextProjectId && projectIdsToDelete.has(recordNextProjectId)) ||
            (recordNextProjectName && projectNameSet.has(recordNextProjectName));
          if (!nextProjectDeleted) {
            return record;
          }
          return {
            ...record,
            nextProjectName: String(record?.name || "").trim() || "未命名项目",
            nextProjectId: String(record?.projectId || "").trim() || null,
          };
        });

      if (projectNameSet.has(selectedProject)) {
        selectedProject = "";
      }

      const deletedRecordsCount = totalRecordsBeforeDelete - records.length;
      closeEditModal();

      projects = normalizeStoredProjects(projects);
      reconcileIndexProjectDurationCaches(deletedDurationBaseProjects);
      updateProjectsList();
      updateExistingProjectsList();
      updateParentProjectSelect(1);
      markAllLoadedRecordPeriodsDirty();
      await saveRecordsToStorage();
      saveProjectsToStorage();
      refreshIndexWorkspace({ immediate: true });

      await showIndexAlert(
        `已删除 ${deletedProjectsCount} 个项目（含子项目）及其 ${deletedRecordsCount} 条记录`,
        {
          title: "删除完成",
        },
      );
    });

  // 点击外部关闭
  modal.addEventListener("click", function (e) {
    if (e.target === this) {
      closeEditModal();
    }
  });
}

// 拖拽功能
function handleDragStart(e) {
  dragItem = this;
  this.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", this.dataset.index);
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
}

function handleDrop(e) {
  e.preventDefault();
  if (dragItem !== this) {
    const fromIndex = parseInt(dragItem.dataset.index);
    const toIndex = parseInt(this.dataset.index);

    // 交换项目位置
    [projects[fromIndex], projects[toIndex]] = [
      projects[toIndex],
      projects[fromIndex],
    ];

    // 更新UI
    updateProjectsList();

    // 保存到localStorage
    saveProjectsToStorage();
  }
}

function handleDragEnd(e) {
  document.querySelectorAll(".project-item").forEach((el) => {
    el.classList.remove("dragging");
  });
  dragItem = null;
}

// 计算项目总用时
function updateProjectTotals() {
  const container = document.getElementById("project-totals");
  if (!container) return;
  container.innerHTML = "";
  const summaryScale = getRecordSurfaceScale(container);
  const compactProjectTotals = isCompactAndroidProjectTotalsLayout();
  const listGap = Math.max(
    compactProjectTotals ? 6 : 7,
    Math.round((compactProjectTotals ? 8 : 9) * summaryScale),
  );
  const containerFontSize = Math.max(
    compactProjectTotals ? 8 : 10,
    Math.round(13 * summaryScale) - (compactProjectTotals ? 2 : 0),
  );
  const cardMinWidth = compactProjectTotals
    ? Math.max(132, Math.round(164 * summaryScale))
    : Math.max(148, Math.round(220 * summaryScale));

  const stylePriority = compactProjectTotals ? "important" : "";
  container.style.setProperty("display", "grid");
  container.style.setProperty(
    "grid-template-columns",
    compactProjectTotals
      ? `repeat(auto-fit, minmax(${cardMinWidth}px, 1fr))`
      : `repeat(auto-fit, minmax(${cardMinWidth}px, 1fr))`,
    stylePriority,
  );
  container.style.setProperty("gap", `${listGap}px`, stylePriority);
  container.style.setProperty(
    "min-height",
    compactProjectTotals
      ? "0"
      : `${Math.max(124, Math.round(220 * summaryScale))}px`,
    stylePriority,
  );
  container.style.setProperty(
    "max-height",
    compactProjectTotals
      ? "none"
      : `min(${Math.max(30, Math.round(42 * Math.min(summaryScale, 1)))}dvh, ${Math.max(
          180,
          Math.round(420 * summaryScale),
        )}px)`,
    stylePriority,
  );
  container.style.setProperty(
    "overflow-y",
    compactProjectTotals ? "visible" : "auto",
    stylePriority,
  );
  container.style.setProperty(
    "overflow-x",
    compactProjectTotals ? "visible" : "hidden",
    stylePriority,
  );
  container.style.setProperty("align-content", "start", stylePriority);
  container.style.setProperty(
    "align-items",
    compactProjectTotals ? "stretch" : "start",
    stylePriority,
  );
  container.style.setProperty(
    "padding-right",
    compactProjectTotals
      ? "0"
      : `${Math.max(1, Math.round(2 * summaryScale))}px`,
    stylePriority,
  );
  container.style.setProperty("font-size", `${containerFontSize}px`, stylePriority);

  if (projects.length === 0) {
    container.innerHTML = "<div>暂无项目数据</div>";
    return;
  }

  const statsApi = window.ControlerProjectStats;
  if (!statsApi?.createStatsContext) {
    container.innerHTML = "<div>统计工具未加载</div>";
    return;
  }

  const statsContext = statsApi.createStatsContext(projects, records, {
    useStoredDurations: true,
  });
  projectTotalsExpansionState = normalizeProjectHierarchyExpansionState(
    projectTotalsExpansionState,
    projects,
  );
  const rootNodes =
    typeof statsContext.getOrderedRoots === "function"
      ? statsContext.getOrderedRoots()
      : Array.isArray(statsContext.hierarchy?.roots)
        ? statsContext.hierarchy.roots
        : [];

  if (rootNodes.length === 0) {
    container.innerHTML = "<div>暂无项目数据</div>";
    return;
  }

  const fragment = document.createDocumentFragment();
  rootNodes.forEach((rootNode) => {
    const rootElement = renderProjectTotalTreeNode(rootNode, statsContext, {
      summaryScale,
    });
    if (rootElement) {
      fragment.appendChild(rootElement);
    }
  });

  container.appendChild(fragment);
}

// 存储功能
function saveProjectsToStorage() {
  try {
    projects = normalizeStoredProjects(projects);
    projectHierarchyExpansionState = normalizeProjectHierarchyExpansionState(
      projectHierarchyExpansionState,
      projects,
    );
    projectTotalsExpansionState = normalizeProjectHierarchyExpansionState(
      projectTotalsExpansionState,
      projects,
    );
    localStorage.setItem("projects", JSON.stringify(projects));
    if (typeof window.ControlerStorage?.replaceCoreState === "function") {
      saveProjectHierarchyExpansionState();
      return window.ControlerStorage.replaceCoreState({
        projects,
      }).catch((error) => {
        console.error("保存项目到存储失败:", error);
      });
    }
    localStorage.setItem("projects", JSON.stringify(projects));
    saveProjectHierarchyExpansionState();
    return Promise.resolve();
  } catch (e) {
    console.error("保存项目到localStorage失败:", e);
    return Promise.resolve();
  }
}

function getIndexRecordPeriodId(record) {
  if (typeof window.ControlerStorageBundle?.getPeriodIdForSectionItem === "function") {
    return (
      window.ControlerStorageBundle.getPeriodIdForSectionItem("records", record) ||
      "undated"
    );
  }
  const anchor =
    record?.endTime || record?.timestamp || record?.startTime || "";
  return /^\d{4}-\d{2}/.test(anchor) ? anchor.slice(0, 7) : "undated";
}

function getIndexRecordPeriodIds(items = []) {
  return [
    ...new Set(
      (Array.isArray(items) ? items : []).map((record) => getIndexRecordPeriodId(record)),
    ),
  ];
}

function markIndexRecordPeriodsDirty(items = []) {
  getIndexRecordPeriodIds(items).forEach((periodId) => {
    indexDirtyRecordPeriodIds.add(periodId);
  });
}

function markAllLoadedRecordPeriodsDirty() {
  getIndexRecordPeriodIds(records).forEach((periodId) => {
    indexDirtyRecordPeriodIds.add(periodId);
  });
}

function mergeIndexRecordsByPeriods(
  existingItems = [],
  incomingItems = [],
  periodIds = [],
) {
  const targetPeriods = new Set(
    (Array.isArray(periodIds) ? periodIds : [])
      .map((periodId) => String(periodId || "").trim())
      .filter(Boolean),
  );
  if (!targetPeriods.size) {
    return Array.isArray(incomingItems) ? incomingItems.slice() : [];
  }
  const preserved = (Array.isArray(existingItems) ? existingItems : []).filter(
    (record) => !targetPeriods.has(getIndexRecordPeriodId(record)),
  );
  return [...preserved, ...(Array.isArray(incomingItems) ? incomingItems : [])];
}

function readIndexLocalRecordSnapshot() {
  try {
    const raw = localStorage.getItem("records");
    if (!raw) {
      return {
        items: [],
        hasMirror: false,
      };
    }
    const parsed = JSON.parse(raw);
    return {
      items: Array.isArray(parsed) ? parsed : [],
      hasMirror: true,
    };
  } catch (error) {
    console.error("读取记录本地镜像失败:", error);
    return {
      items: [],
      hasMirror: false,
    };
  }
}

function readIndexManagedRecordSnapshot() {
  try {
    const snapshot =
      typeof window.ControlerStorage?.dump === "function"
        ? window.ControlerStorage.dump()
        : null;
    return Array.isArray(snapshot?.records) ? snapshot.records : [];
  } catch (error) {
    console.error("读取记录受管快照失败:", error);
    return [];
  }
}

function readIndexProjectMirrorState() {
  try {
    const raw = localStorage.getItem("projects");
    if (!raw) {
      return {
        items: [],
        hasMirror: false,
      };
    }
    const parsed = JSON.parse(raw);
    return {
      items: Array.isArray(parsed) ? parsed : [],
      hasMirror: true,
    };
  } catch (error) {
    console.error("读取项目本地镜像失败:", error);
    return {
      items: [],
      hasMirror: false,
    };
  }
}

function getIndexDefaultRecordScope() {
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - 1);
  return {
    startDate: `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}-${String(startDate.getDate()).padStart(2, "0")}`,
    endDate: `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`,
  };
}

async function loadProjectsFromStorage(options = {}) {
  const applyUi = options?.applyUi !== false;
  try {
    const localProjectMirror = readIndexProjectMirrorState();
    if (localProjectMirror.hasMirror) {
      projects = normalizeStoredProjects(localProjectMirror.items);
    } else if (typeof window.ControlerStorage?.getCoreState === "function") {
      const coreState = await window.ControlerStorage.getCoreState();
      projects = normalizeStoredProjects(coreState?.projects || []);
    } else {
      const saved = localStorage.getItem("projects");
      if (saved) {
        projects = normalizeStoredProjects(JSON.parse(saved));
        const normalizedSerialized = JSON.stringify(projects);
        if (normalizedSerialized !== saved) {
          if (typeof window.ControlerStorage?.replaceCoreState === "function") {
            void window.ControlerStorage.replaceCoreState({
              projects,
            });
          } else {
            localStorage.setItem("projects", normalizedSerialized);
          }
        }
      }
    }
    loadProjectHierarchyExpansionStateFromStorage();
    projectTotalsExpansionState = normalizeProjectHierarchyExpansionState(
      projectTotalsExpansionState,
      projects,
    );
    if (applyUi) {
      updateProjectsList();
      updateExistingProjectsList();
      updateParentProjectSelect(1);
    }
    return projects;
  } catch (e) {
    console.error("从localStorage加载项目失败:", e);
    return projects;
  }
}

// 存储记录到localStorage
function saveRecordsToStorage() {
  try {
    persistTimerSessionState();
    indexLoadedRecordPeriodIds = getIndexRecordPeriodIds(records);
    localStorage.setItem("records", JSON.stringify(records));
    localStorage.setItem("projects", JSON.stringify(projects));
    if (typeof window.ControlerStorage?.saveSectionRange === "function") {
      const periodIds = indexDirtyRecordPeriodIds.size
        ? [...indexDirtyRecordPeriodIds]
        : indexLoadedRecordPeriodIds.length
        ? indexLoadedRecordPeriodIds.slice()
        : [...new Set(records.map((record) => getIndexRecordPeriodId(record)))];
      return Promise.all(
        periodIds.map((periodId) =>
          window.ControlerStorage.saveSectionRange("records", {
            periodId,
            items: records.filter(
              (record) => getIndexRecordPeriodId(record) === periodId,
            ),
            mode: "replace",
          }),
        ),
      )
        .then(() => {
          periodIds.forEach((periodId) => {
            indexDirtyRecordPeriodIds.delete(periodId);
          });
        })
        .catch((error) => {
          console.error("保存分片记录失败:", error);
        });
    }
    return Promise.resolve();
  } catch (e) {
    console.error("保存记录到localStorage失败:", e);
    return Promise.resolve();
  }
}

// 删除记录
function deleteRecord(recordId) {
  try {
    const index = records.findIndex((record) => record.id === recordId);
    if (index !== -1) {
      const deletedRecord = records[index];
      const isLastRecord = index === records.length - 1;
      records.splice(index, 1);
      if (activeRecordId === recordId) {
        activeRecordId = null;
      }
      if (editingRecordId === recordId) {
        editingRecordId = null;
      }
      if (isLastRecord) {
        rollbackTimerAfterDeletingLastRecord(deletedRecord, records);
      }
      markIndexRecordPeriodsDirty([deletedRecord]);
      applyIndexProjectRecordDurationChanges({
        removedRecords: [deletedRecord],
      });
      saveRecordsToStorage();
      updateDisplay();
      updateProjectTotals();
      console.log(`已删除记录 ${recordId}`);
      return true;
    }
    return false;
  } catch (e) {
    console.error("删除记录失败:", e);
    return false;
  }
}

// 更新记录中的项目名称（当项目名称改变时）
async function updateRecordsProjectName(oldName, newName, projectId = "") {
  try {
    let updated = false;
    const normalizedProjectId = String(projectId || "").trim();
    const nextProjectId =
      normalizedProjectId ||
      projects.find((project) => project.name === newName)?.id ||
      null;
    records = records.map((record) => {
      const matchesByProjectId =
        normalizedProjectId &&
        String(record?.projectId || "").trim() === normalizedProjectId;
      const matchesByProjectName = record.name === oldName;
      const matchesNextProjectById =
        normalizedProjectId &&
        String(record?.nextProjectId || "").trim() === normalizedProjectId;
      const matchesNextProjectByName =
        resolveRecordNextProjectName(record, projects) === oldName;
      if (
        matchesByProjectId ||
        matchesByProjectName ||
        matchesNextProjectById ||
        matchesNextProjectByName
      ) {
        updated = true;
        return {
          ...record,
          name:
            matchesByProjectId || matchesByProjectName ? newName : record.name,
          projectId:
            matchesByProjectId || matchesByProjectName
              ? nextProjectId
              : record.projectId || null,
          nextProjectName:
            matchesNextProjectById || matchesNextProjectByName
              ? newName
              : resolveRecordNextProjectName(record, projects),
          nextProjectId:
            matchesNextProjectById || matchesNextProjectByName
              ? nextProjectId
              : String(record?.nextProjectId || "").trim() || null,
        };
      }
      return record;
    });

    if (updated) {
      markAllLoadedRecordPeriodsDirty();
      await saveRecordsToStorage();
      console.log(`已更新 ${oldName} 到 ${newName} 的记录`);
    }
    return updated;
  } catch (e) {
    console.error("更新记录项目名称失败:", e);
    return false;
  }
}

function mergeProjectRecordsIntoTarget(sourceProject, targetProject) {
  const sourceProjectId = String(sourceProject?.id || "").trim();
  const sourceProjectName = String(sourceProject?.name || "").trim();
  const targetProjectId = String(targetProject?.id || "").trim();
  const targetProjectName =
    String(targetProject?.name || "").trim() || "未命名项目";

  if ((!sourceProjectId && !sourceProjectName) || !targetProjectId) {
    return 0;
  }

  let mergedCount = 0;
  records = records.map((record) => {
    const recordProjectId = String(record?.projectId || "").trim();
    const matchesByProjectId =
      sourceProjectId && recordProjectId === sourceProjectId;
    const matchesLegacyName =
      !recordProjectId && sourceProjectName && record.name === sourceProjectName;
    const recordNextProjectId = String(record?.nextProjectId || "").trim();
    const matchesNextProjectById =
      sourceProjectId && recordNextProjectId === sourceProjectId;
    const matchesNextProjectByName =
      resolveRecordNextProjectName(record, projects) === sourceProjectName;

    if (
      !matchesByProjectId &&
      !matchesLegacyName &&
      !matchesNextProjectById &&
      !matchesNextProjectByName
    ) {
      return record;
    }

    const shouldMergeCurrentProject = matchesByProjectId || matchesLegacyName;
    if (shouldMergeCurrentProject) {
      mergedCount += 1;
    }
    return {
      ...record,
      name: shouldMergeCurrentProject ? targetProjectName : record.name,
      projectId: shouldMergeCurrentProject ? targetProjectId : record.projectId || null,
      nextProjectName:
        matchesNextProjectById || matchesNextProjectByName
          ? targetProjectName
          : resolveRecordNextProjectName(record, projects),
      nextProjectId:
        matchesNextProjectById || matchesNextProjectByName
          ? targetProjectId
          : recordNextProjectId || null,
    };
  });

  return mergedCount;
}

function updateProjectNameReferences(oldName, newName, projectId = "") {
  if (!oldName || !newName || oldName === newName) {
    return;
  }

  if (selectedProject === oldName) {
    selectedProject = newName;
  }
  if (nextProject === oldName) {
    nextProject = newName;
  }
  if (lastEnteredProjectName === oldName) {
    lastEnteredProjectName = newName;
  }

  if (pendingDurationCarryoverState?.sourceProject === oldName) {
    pendingDurationCarryoverState.sourceProject = newName;
  }
  if (pendingDurationCarryoverState?.targetProject === oldName) {
    pendingDurationCarryoverState.targetProject = newName;
  }

  persistTimerSessionState();
}

// 从localStorage加载记录
async function loadRecordsFromStorage() {
  try {
    const localRecordMirror = readIndexLocalRecordSnapshot();
    const mirrorItems = localRecordMirror.hasMirror
      ? localRecordMirror.items
      : readIndexManagedRecordSnapshot();
    records = Array.isArray(mirrorItems) ? mirrorItems.slice() : [];
    indexLoadedRecordPeriodIds = getIndexRecordPeriodIds(records);

    if (typeof window.ControlerStorage?.loadSectionRange === "function") {
      const result = await window.ControlerStorage.loadSectionRange(
        "records",
        getIndexDefaultRecordScope(),
      );
      const rangeItems = Array.isArray(result?.items) ? result.items : [];
      const rangePeriodIds =
        Array.isArray(result?.periodIds) && result.periodIds.length
          ? result.periodIds.slice()
          : getIndexRecordPeriodIds(rangeItems);
      if (rangeItems.length || rangePeriodIds.length) {
        records = localRecordMirror.hasMirror
          ? mergeIndexRecordsByPeriods(records, rangeItems, rangePeriodIds)
          : rangeItems;
      }
    }
    if (Array.isArray(records) && records.length > 0) {
      // 确保每条记录都有必要的字段
      records = records.map((record) => {
        const canonicalEndDate =
          deserializeTimerDate(record?.endTime) ||
          deserializeTimerDate(record?.sptTime) ||
          deserializeTimerDate(record?.timestamp) ||
          new Date();
        const canonicalEndText = canonicalEndDate.toISOString();
        const normalizedDurationMeta = normalizeRecordDurationMeta(
          record.durationMeta,
        );
        const explicitStartDate = deserializeTimerDate(record?.startTime);
        const boundedDurationMs =
          explicitStartDate instanceof Date &&
          !Number.isNaN(explicitStartDate.getTime())
            ? Math.max(canonicalEndDate.getTime() - explicitStartDate.getTime(), 0)
            : null;
        const normalizedDurationMs =
          Number.isFinite(boundedDurationMs)
            ? Math.round(boundedDurationMs)
            : Number.isFinite(record?.durationMs) && record.durationMs >= 0
              ? Math.round(record.durationMs)
              : Number.isFinite(normalizedDurationMeta?.recordedMs) &&
                  normalizedDurationMeta.recordedMs >= 0
                ? Math.round(normalizedDurationMeta.recordedMs)
                : parseSpendtimeToMs(record?.spendtime);
        const startDate =
          explicitStartDate ||
          (normalizedDurationMs > 0
            ? new Date(canonicalEndDate.getTime() - normalizedDurationMs)
            : null);
        const rawEndDate =
          deserializeTimerDate(record?.rawEndTime) || canonicalEndDate;
        const normalizedSpendtime = formatDurationFromMs(normalizedDurationMs);
        const normalizedNextProjectName = resolveRecordNextProjectName(
          record,
          projects,
        );
        return {
          ...record,
          timestamp: canonicalEndText,
          sptTime: canonicalEndText,
          endTime: canonicalEndText,
          rawEndTime: rawEndDate.toISOString(),
          startTime: serializeTimerDate(startDate),
          durationMs: Number.isFinite(normalizedDurationMs)
            ? normalizedDurationMs
            : null,
          spendtime: normalizedSpendtime,
          name: record.name || "未命名项目",
          nextProjectName: normalizedNextProjectName,
          nextProjectId: String(record?.nextProjectId || "").trim() || null,
          clickCount:
            Number.isFinite(record.clickCount) && record.clickCount > 0
              ? Math.max(1, Math.floor(record.clickCount))
              : null,
          timerRollbackState: normalizeTimerRollbackState(
            record.timerRollbackState,
          ),
          durationMeta: normalizedDurationMeta,
        };
      });
    } else {
      records = [];
    }
    indexLoadedRecordPeriodIds = getIndexRecordPeriodIds(records);
    indexDirtyRecordPeriodIds = new Set();
  } catch (e) {
    console.error("从localStorage加载记录失败:", e);
  }
}

// 打开高级创建项目弹窗
function openAdvancedProjectModal() {
  const modal = document.getElementById("advanced-modal-overlay");
  if (!modal) return;

  // 获取输入框的值
  const input = document.getElementById("new-project-input");
  const projectName = input ? input.value.trim() : "";

  // 设置弹窗中的项目名称
  const advancedNameInput = document.getElementById("advanced-project-name");
  if (advancedNameInput) {
    advancedNameInput.value = projectName;
  }

  // 重置其他选项为默认值
  const levelRadios = document.querySelectorAll('input[name="project-level"]');
  if (levelRadios.length > 0) {
    levelRadios[0].checked = true; // 默认选择一级项目
  }

  const parentSelect = document.getElementById("parent-project-select");
  if (parentSelect) {
    parentSelect.selectedIndex = 0; // 重置为默认选项
  }

  const colorPicker = document.getElementById("project-color-picker");
  if (colorPicker) {
    writeProjectColorInputMode(colorPicker, "auto");
  }

  // 更新父级项目选择器
  updateParentProjectSelect(1);
  refreshCreateProjectColorPalette({ forceSuggestion: true });

  // 显示弹窗
  modal.style.display = "flex";
}

// 关闭高级创建项目弹窗
function closeAdvancedModal() {
  const modal = document.getElementById("advanced-modal-overlay");
  if (modal) {
    dismissTransientModalOverlays({ except: modal });
    modal.hidden = true;
    modal.style.display = "none";
    modal.style.pointerEvents = "none";
  }
}

function initIndexSecondaryBindings() {
  if (indexSecondaryBindingsInitialized) {
    return;
  }
  indexSecondaryBindingsInitialized = true;

  uiTools?.enhanceNativeSelect?.(
    document.getElementById("parent-project-select"),
    {
      fullWidth: true,
      minWidth: 240,
    },
  );

  activeCreateProjectColorController = createProjectColorController({
    input: document.getElementById("project-color-picker"),
    paletteContainer: document.getElementById("project-color-presets"),
    valueLabel: document.getElementById("project-color-current"),
    randomButton: document.getElementById("project-color-random-btn"),
    getLevel: getSelectedCreateProjectLevel,
    getParentId: () =>
      document.getElementById("parent-project-select")?.value || null,
    preferCurrentHueForLevel1: false,
  });
  refreshCreateProjectColorPalette({ forceSuggestion: true });

  const openCreateProjectBtn = document.getElementById(
    "open-create-project-modal-btn",
  );
  if (openCreateProjectBtn) {
    openCreateProjectBtn.addEventListener("click", function () {
      showProjectCreateModal();
    });
  }

  const createProjectConfirmBtn = document.getElementById(
    "advanced-modal-confirm",
  );
  if (createProjectConfirmBtn) {
    createProjectConfirmBtn.addEventListener(
      "click",
      handleCreateProjectConfirm,
    );
  }

  const newProjectInput = document.getElementById("new-project-input");
  const createProjectBtn = document.getElementById("create-project-btn");
  if (newProjectInput && createProjectBtn) {
    newProjectInput.addEventListener("keypress", function (e) {
      if (e.key === "Enter") {
        createProjectBtn.click();
      }
    });
  }

  const advancedCancelBtn = document.getElementById("advanced-modal-cancel");
  if (advancedCancelBtn) {
    advancedCancelBtn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      closeAdvancedModal();
    });
  }

  const advancedModal = document.getElementById("advanced-modal-overlay");
  if (advancedModal) {
    advancedModal.addEventListener("click", function (e) {
      if (e.target === this) {
        closeAdvancedModal();
      }
    });
  }

  const toggleAdvancedBtn = document.getElementById("toggle-advanced-btn");
  if (toggleAdvancedBtn) {
    toggleAdvancedBtn.addEventListener("click", toggleAdvancedOptions);
  }

  const levelRadios = document.querySelectorAll('input[name="project-level"]');
  levelRadios.forEach((radio) => {
    radio.addEventListener("change", function () {
      updateParentProjectSelect(parseInt(this.value));
      refreshCreateProjectColorPalette({ recomputeAuto: true });
    });
  });
  document
    .getElementById("parent-project-select")
    ?.addEventListener("change", () => {
      refreshCreateProjectColorPalette({ recomputeAuto: true });
    });

  const dailyStatsBtn = document.getElementById("daily-stats-btn");
  const weeklyStatsBtn = document.getElementById("weekly-stats-btn");
  const monthlyStatsBtn = document.getElementById("monthly-stats-btn");
  const yearlyStatsBtn = document.getElementById("yearly-stats-btn");

  if (dailyStatsBtn) {
    dailyStatsBtn.addEventListener("click", function () {
      showTimeSelector();
      showStatistics("daily");
    });
  }
  if (weeklyStatsBtn) {
    weeklyStatsBtn.addEventListener("click", function () {
      showTimeSelector();
      showStatistics("weekly");
    });
  }
  if (monthlyStatsBtn) {
    monthlyStatsBtn.addEventListener("click", function () {
      showTimeSelector();
      showStatistics("monthly");
    });
  }
  if (yearlyStatsBtn) {
    yearlyStatsBtn.addEventListener("click", function () {
      showTimeSelector();
      showStatistics("yearly");
    });
  }

  initTimeSelector();
  bindTableScaleLiveRefresh();
  bindOutsideRecordEditCancellation();
}

function finalizeIndexInitialHydration(options = {}) {
  const { scheduleDeferredRuntime = true } = options;
  initIndexModalBindings();
  bindIndexExternalStorageRefresh();
  initIndexSecondaryBindings();
  persistTimerSessionState();
  initIndexWidgetLaunchAction();
  markIndexWidgetLaunchCoreReady();
  setIndexLoadingState({
    active: false,
  });
  queueRecordInitialReveal();
  if (scheduleDeferredRuntime) {
    if (!indexShellPageActive) {
      indexDeferredRuntimePendingResume = true;
      return;
    }
    void ensureIndexDeferredRuntimeLoaded();
  }
}

async function hydrateIndexInitialForegroundWorkspace() {
  setIndexLoadingState({
    active: true,
    mode: indexInitialDataLoaded ? "inline" : "fullscreen",
  });
  try {
    await hydrateIndexWorkspace({
      includeProjects: true,
      includeRecords: true,
    });
    uiTools?.markPerfStage?.("first-data-ready", {
      projectCount: projects.length,
      recordCount: records.length,
      periodIds: indexLoadedRecordPeriodIds.slice(),
    });
    await commitIndexWorkspaceSnapshot({
      markFirstCommit: true,
    });
    finalizeIndexInitialHydration();
  } finally {
    setIndexLoadingState({
      active: false,
    });
  }
}

function scheduleIndexDeferredWorkspaceHydration() {
  if (!indexShellPageActive) {
    indexDeferredHydrationPendingResume = true;
    return Promise.resolve();
  }
  if (indexDeferredWorkspaceHydrationPromise) {
    return indexDeferredWorkspaceHydrationPromise;
  }

  indexDeferredWorkspaceHydrationPromise = new Promise((resolve, reject) => {
    const startHydration = () => {
      if (!indexShellPageActive) {
        indexDeferredWorkspaceHydrationPromise = null;
        indexDeferredHydrationPendingResume = true;
        resolve();
        return;
      }
      Promise.resolve()
        .then(async () => {
          await hydrateIndexWorkspace({
            includeProjects: false,
            includeRecords: true,
          });
          uiTools?.markPerfStage?.("first-data-ready", {
            projectCount: projects.length,
            recordCount: records.length,
            periodIds: indexLoadedRecordPeriodIds.slice(),
            fastPath: true,
          });
          await commitIndexWorkspaceSnapshot({
            markFirstCommit: true,
          });
          finalizeIndexInitialHydration();
          resolve();
        })
        .catch((error) => {
          indexDeferredWorkspaceHydrationPromise = null;
          console.error("后台补全记录页工作区失败:", error);
          reject(error);
        });
    };

    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(startHydration, {
        timeout: 160,
      });
      return;
    }

    window.setTimeout(startHydration, 40);
  });

  return indexDeferredWorkspaceHydrationPromise;
}

// 初始化
async function init() {
  setIndexLoadingState({
    active: true,
    mode: "fullscreen",
  });
  try {
    applyIndexDesktopWidgetMode();
    bindIndexShellVisibilityGate();
    initIndexPrimaryBindings();
    initIndexModalBindings();
    initIndexWidgetLaunchAction();
    await waitForIndexStorageReady();
    uiTools?.markPerfStage?.("shell-ready", {
      widgetMode: INDEX_WIDGET_CONTEXT.enabled,
    });

    if (isIndexWidgetTimerFastPath()) {
      if (!indexShellPageActive) {
        indexDeferredHydrationPendingResume = true;
        return;
      }
      await hydrateIndexInitialForegroundWorkspace();
      return;
    }

    queueRecordInitialReveal();
    if (!indexShellPageActive) {
      indexDeferredHydrationPendingResume = true;
      return;
    }
    await hydrateIndexInitialForegroundWorkspace();
  } finally {
    setIndexLoadingState({
      active: false,
    });
  }
}

function attachTableLongPressDrag(element) {
  let desktopPressTimer = null;
  let dragArmed = false;
  let suppressNextClick = false;
  let touchIdentifier = null;
  let touchReorderActive = false;
  let touchStartX = 0;
  let touchStartY = 0;
  let touchTargetItem = null;
  let touchGhost = null;
  let touchHoldTimer = null;
  const LONG_PRESS_DELAY_MS = 280;

  const clearDesktopPressTimer = () => {
    if (desktopPressTimer) {
      clearTimeout(desktopPressTimer);
      desktopPressTimer = null;
    }
  };

  const updateCursor = () => {
    if (touchReorderActive || draggedTableItem === element) {
      element.style.cursor = "grabbing";
      return;
    }
    if (dragArmed) {
      element.style.cursor = "grab";
      return;
    }
    element.style.cursor = "pointer";
  };

  const clearTouchTarget = () => {
    touchTargetItem?.classList.remove("table-touch-reorder-target");
    touchTargetItem = null;
  };

  const clearTouchHoldTimer = () => {
    if (touchHoldTimer !== null) {
      window.clearTimeout(touchHoldTimer);
      touchHoldTimer = null;
    }
  };

  const updateTouchTarget = (clientX, clientY) => {
    const hoveredElement = document.elementFromPoint(clientX, clientY);
    const nextTarget =
      hoveredElement instanceof Element
        ? hoveredElement.closest(TABLE_TOUCH_REORDER_SELECTOR)
        : null;
    const resolvedTarget =
      nextTarget instanceof HTMLElement &&
      nextTarget !== element &&
      canPerformTableReorderFromElements(element, nextTarget)
        ? nextTarget
        : null;
    if (touchTargetItem === resolvedTarget) {
      return;
    }
    clearTouchTarget();
    touchTargetItem = resolvedTarget;
    touchTargetItem?.classList.add("table-touch-reorder-target");
  };

  const resetDesktopDrag = () => {
    clearDesktopPressTimer();
    dragArmed = false;
    element.classList.remove("table-drag-armed");
    if (!draggedTableItem && !touchReorderActive) {
      element.draggable = false;
    }
    updateCursor();
  };

  const cleanupTouchReorder = ({ suppressClick = false } = {}) => {
    clearTouchHoldTimer();
    clearTouchTarget();
    removeTableTouchDragGhost(touchGhost);
    touchGhost = null;
    element.classList.remove("table-drag-armed", "table-touch-reorder-source");
    document.body.classList.remove("table-touch-reordering");
    window.removeEventListener("touchmove", handleTouchMove, true);
    window.removeEventListener("touchend", handleTouchEnd, true);
    window.removeEventListener("touchcancel", handleTouchCancel, true);
    touchIdentifier = null;
    touchReorderActive = false;
    if (suppressClick) {
      suppressNextClick = true;
      window.setTimeout(() => {
        suppressNextClick = false;
      }, 260);
    }
    updateCursor();
  };

  element.draggable = false;
  element.style.cursor = "pointer";
  element.style.userSelect = "none";
  element.style.webkitUserSelect = "none";
  element.style.webkitTouchCallout = "none";
  element.style.touchAction = "manipulation";

  const armDrag = () => {
    resetDesktopDrag();
    desktopPressTimer = setTimeout(() => {
      dragArmed = true;
      element.draggable = true;
      element.classList.add("table-drag-armed");
      updateCursor();
    }, LONG_PRESS_DELAY_MS);
  };

  const beginTouchReorder = (clientX, clientY) => {
    touchReorderActive = true;
    document.body.classList.add("table-touch-reordering");
    element.classList.add("table-drag-armed", "table-touch-reorder-source");
    touchGhost = createTableTouchDragGhost(element, clientX, clientY);
    positionTableTouchDragGhost(touchGhost, clientX, clientY);
    updateTouchTarget(clientX, clientY);
    window.navigator?.vibrate?.(12);
    updateCursor();
  };

  function handleTouchMove(event) {
    const touch =
      findTouchByIdentifier(event.touches, touchIdentifier) ||
      findTouchByIdentifier(event.changedTouches, touchIdentifier);
    if (!touch) {
      return;
    }

    if (!touchReorderActive) {
      if (
        Math.abs(touch.clientX - touchStartX) > TABLE_TOUCH_REORDER_CANCEL_DISTANCE_PX ||
        Math.abs(touch.clientY - touchStartY) > TABLE_TOUCH_REORDER_CANCEL_DISTANCE_PX
      ) {
        cleanupTouchReorder();
      }
      return;
    }

    positionTableTouchDragGhost(touchGhost, touch.clientX, touch.clientY);
    updateTouchTarget(touch.clientX, touch.clientY);
    if (event.cancelable) {
      event.preventDefault();
    }
  }

  function handleTouchEnd(event) {
    const touch = findTouchByIdentifier(event.changedTouches, touchIdentifier);
    if (!touch) {
      return;
    }

    const wasActive = touchReorderActive;
    if (wasActive) {
      positionTableTouchDragGhost(touchGhost, touch.clientX, touch.clientY);
      updateTouchTarget(touch.clientX, touch.clientY);
    }
    const targetElement = touchTargetItem;
    cleanupTouchReorder({ suppressClick: wasActive });
    if (wasActive && targetElement) {
      performTableReorderFromElements(element, targetElement);
    }
  }

  function handleTouchCancel() {
    if (touchIdentifier === null) {
      return;
    }
    cleanupTouchReorder({ suppressClick: touchReorderActive });
  }

  element.addEventListener("pointerdown", (event) => {
    if (event.isPrimary === false) return;
    if (event.pointerType && event.pointerType !== "mouse") {
      return;
    }
    if (event.button !== 0) return;
    armDrag();
  });

  element.addEventListener(
    "touchstart",
    (event) => {
      if (event.touches.length !== 1 || touchIdentifier !== null) {
        cleanupTouchReorder();
        return;
      }

      const touch = event.changedTouches[0];
      if (!touch) {
        return;
      }

      touchIdentifier = touch.identifier;
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      clearTouchTarget();
      clearTouchHoldTimer();
      window.removeEventListener("touchmove", handleTouchMove, true);
      window.removeEventListener("touchend", handleTouchEnd, true);
      window.removeEventListener("touchcancel", handleTouchCancel, true);
      window.addEventListener("touchmove", handleTouchMove, {
        capture: true,
        passive: false,
      });
      window.addEventListener("touchend", handleTouchEnd, true);
      window.addEventListener("touchcancel", handleTouchCancel, true);
      touchHoldTimer = window.setTimeout(() => {
        if (touchIdentifier !== touch.identifier || touchReorderActive) {
          return;
        }
        touchHoldTimer = null;
        beginTouchReorder(touchStartX, touchStartY);
      }, TABLE_TOUCH_REORDER_HOLD_MS);
    },
    { passive: true },
  );

  element.addEventListener("pointerup", (event) => {
    if (event.pointerType && event.pointerType !== "mouse") {
      return;
    }
    resetDesktopDrag();
  });
  element.addEventListener("pointercancel", (event) => {
    if (event.pointerType && event.pointerType !== "mouse") {
      return;
    }
    resetDesktopDrag();
  });
  element.addEventListener("lostpointercapture", resetDesktopDrag);
  element.addEventListener("mouseleave", resetDesktopDrag);
  element.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });
  element.addEventListener("dragstart", (event) => {
    if (!dragArmed) {
      event.preventDefault();
      return;
    }
    element.style.cursor = "grabbing";
  });
  element.addEventListener("dragend", resetDesktopDrag);
  element.addEventListener(
    "click",
    (event) => {
      if (!suppressNextClick) {
        return;
      }
      suppressNextClick = false;
      event.preventDefault();
      event.stopPropagation();
    },
    true,
  );
}

// 渲染项目表格视图
function renderProjectsTable() {
  const tableContainer = document.getElementById("projects-table");
  if (!tableContainer) return;

  tableContainer.innerHTML = "";
  tableContainer.style.display = "block";
  tableContainer.style.overflowX = "auto";
  const isMobileLayout = isMobileViewport();
  const tableScale = Math.min(
    Math.max(getTableScaleSetting("indexProjectTable", 1), 0.1),
    2.2,
  );
  const baseGap = Math.max(1, Math.round(12 * tableScale));
  const minColumnWidth = Math.max(24, Math.round(200 * tableScale));
  const preferredColumnWidth = Math.max(
    minColumnWidth,
    Math.round(240 * tableScale),
  );
  const level1Padding = Math.max(2, Math.round(8 * tableScale));
  const level2Padding = Math.max(2, Math.round(10 * tableScale));
  const level3Padding = Math.max(2, Math.round(8 * tableScale));
  const headerFontSize = Math.max(7, Math.round(14 * tableScale));
  const bodyFontSize = Math.max(7, Math.round(13 * tableScale));
  const desktopLevel3MinHeight = isMobileLayout
    ? 0
    : Math.max(96, Math.round(36 * tableScale) * 3);

  // 获取按层级分组的项目
  const level1Projects = projects.filter(
    (p) => normalizeProjectLevel(p.level) === 1,
  );
  const level2Projects = projects.filter(
    (p) => normalizeProjectLevel(p.level) === 2,
  );
  const level3Projects = projects.filter(
    (p) => normalizeProjectLevel(p.level) === 3,
  );

  // 创建表格结构
  const table = document.createElement("div");
  const columnCount = Math.max(level1Projects.length, 1);
  table.className = "projects-table-grid";
  table.style.display = "grid";
  table.style.gridColumn = "1 / -1";
  table.style.gridTemplateColumns = `repeat(${columnCount}, minmax(${minColumnWidth}px, ${preferredColumnWidth}px))`;
  table.style.gap = `${baseGap}px`;
  table.style.marginBottom = "15px";
  table.style.width = "fit-content";
  table.style.maxWidth = "100%";

  // 按父级分组二级和三级项目
  const level2ByParent = {};
  const level3ByParent = {};

  level2Projects.forEach((project) => {
    const parentId = project.parentId || "none";
    if (!level2ByParent[parentId]) {
      level2ByParent[parentId] = [];
    }
    level2ByParent[parentId].push(project);
  });

  level3Projects.forEach((project) => {
    const parentId = project.parentId || "none";
    if (!level3ByParent[parentId]) {
      level3ByParent[parentId] = [];
    }
    level3ByParent[parentId].push(project);
  });

  // 渲染一级项目（作为列）
  level1Projects.forEach((level1Project) => {
    const column = document.createElement("div");
    column.className = "table-column";
    column.dataset.projectId = level1Project.id;
    column.style.background = "var(--bg-tertiary)";
    column.style.borderRadius = "10px";
    column.style.padding = `${level2Padding}px`;
    column.style.display = "flex";
    column.style.flexDirection = "column";
    column.style.gap = `${Math.max(4, Math.round(8 * tableScale))}px`;

    const level1Expanded = isProjectHierarchyExpanded(level1Project);

    // 一级项目标题
    const level1Header = document.createElement("div");
    level1Header.className = "level1-header";
    level1Header.style.background = getThemeProjectColor(1);
    level1Header.style.color = "var(--on-accent-text)";
    level1Header.style.padding = `${level1Padding}px`;
    level1Header.style.borderRadius = "8px";
    level1Header.style.fontWeight = "bold";
    level1Header.style.fontSize = `${headerFontSize}px`;
    level1Header.style.cursor = "pointer";
    level1Header.style.minWidth = "0";
    level1Header.draggable = false;
    applyProjectTableHeaderContent(level1Header, level1Project, {
      expanded: level1Expanded,
      fontSize: headerFontSize,
      align: "center",
    });
    attachTableLongPressDrag(level1Header);

    // 始终添加拖动事件
    level1Header.addEventListener("dragstart", handleTableDragStart);
    level1Header.addEventListener("dragover", handleTableDragOver);
    level1Header.addEventListener("drop", handleTableDrop);
    level1Header.addEventListener("dragend", handleTableDragEnd);
    bindProjectTableHeaderClickActions(level1Header, level1Project, () => {
      setProjectHierarchyExpanded(
        level1Project,
        !isProjectHierarchyExpanded(level1Project),
      );
      renderProjectsTable();
    });

    column.appendChild(level1Header);

    const columnBody = document.createElement("div");
    columnBody.className = "level1-column-body";
    columnBody.style.display = level1Expanded ? "flex" : "none";
    columnBody.style.flexDirection = "column";
    columnBody.style.gap = `${Math.max(4, Math.round(8 * tableScale))}px`;

    // 获取属于此一级项目的二级项目
    const level2Children = level2ByParent[level1Project.id] || [];

    if (level1Expanded) {
      // 将二级项目分组，每组最多两个并排放置
      for (let i = 0; i < level2Children.length; i += 2) {
        const level2Group = level2Children.slice(i, i + 2);
        const groupContainer = document.createElement("div");
        groupContainer.className = "level2-group-container";
        groupContainer.style.display = "flex";
        groupContainer.style.gap = `${Math.max(4, Math.round(10 * tableScale))}px`;
        groupContainer.style.marginBottom = `${Math.max(4, Math.round(10 * tableScale))}px`;

        level2Group.forEach((level2Project) => {
          const level2Section = document.createElement("div");
          level2Section.className = "level2-section";
          level2Section.dataset.projectId = level2Project.id;
          level2Section.dataset.parentId = level2Project.parentId;
          level2Section.style.background = "var(--bg-quaternary)";
          level2Section.style.borderRadius = "6px";
          level2Section.style.padding = `${level2Padding}px`;
          level2Section.style.flex = "1";
          level2Section.style.display = "flex";
          level2Section.style.flexDirection = "column";
          level2Section.style.gap = `${Math.max(4, Math.round(8 * tableScale))}px`;
          level2Section.style.minWidth = "0";

          const level2Expanded = isProjectHierarchyExpanded(level2Project);

          // 二级项目标题
          const level2Header = document.createElement("div");
          level2Header.className = "level2-header";
          level2Header.style.background = getThemeProjectColor(2);
          level2Header.style.color = "var(--on-accent-text)";
          level2Header.style.padding = `${level2Padding}px`;
          level2Header.style.borderRadius = "6px";
          level2Header.style.fontWeight = "bold";
          level2Header.style.fontSize = `${bodyFontSize}px`;
          level2Header.style.cursor = "pointer";
          level2Header.style.minWidth = "0";
          level2Header.draggable = false;
          applyProjectTableHeaderContent(level2Header, level2Project, {
            expanded: level2Expanded,
            fontSize: bodyFontSize,
          });
          attachTableLongPressDrag(level2Header);

          // 始终添加拖动事件
          level2Header.addEventListener("dragstart", handleTableDragStart);
          level2Header.addEventListener("dragover", handleTableDragOver);
          level2Header.addEventListener("drop", handleTableDrop);
          level2Header.addEventListener("dragend", handleTableDragEnd);
          bindProjectTableHeaderClickActions(level2Header, level2Project, () => {
            setProjectHierarchyExpanded(
              level2Project,
              !isProjectHierarchyExpanded(level2Project),
            );
            renderProjectsTable();
          });

          level2Section.appendChild(level2Header);

          const level2Body = document.createElement("div");
          level2Body.className = "level2-body";
          level2Body.style.display = level2Expanded ? "flex" : "none";
          level2Body.style.flexDirection = "column";
          level2Body.style.flex = isMobileLayout ? "0 0 auto" : "1 1 auto";
          level2Body.style.gap = `${Math.max(2, Math.round(5 * tableScale))}px`;
          if (!isMobileLayout && level2Expanded) {
            level2Body.style.minHeight = `${desktopLevel3MinHeight}px`;
          }

          if (level2Expanded) {
            const level3Children = level3ByParent[level2Project.id] || [];

            level3Children.forEach((level3Project) => {
              const level3Item = document.createElement("div");
              level3Item.className = "level3-item";
              level3Item.dataset.projectId = level3Project.id;
              level3Item.dataset.parentId = level3Project.parentId;
              level3Item.style.background = getThemeProjectColor(3);
              level3Item.style.color = "var(--on-accent-text)";
              level3Item.style.padding = `${level3Padding}px`;
              level3Item.style.borderRadius = "4px";
              level3Item.style.fontSize = `${bodyFontSize}px`;
              level3Item.style.cursor = "pointer";
              level3Item.style.overflow = "hidden";
              level3Item.style.textOverflow = "ellipsis";
              level3Item.style.whiteSpace = "nowrap";
              level3Item.textContent = level3Project.name;
              level3Item.draggable = false;
              attachTableLongPressDrag(level3Item);

              level3Item.addEventListener("dragstart", handleTableDragStart);
              level3Item.addEventListener("dragover", handleTableDragOver);
              level3Item.addEventListener("drop", handleTableDrop);
              level3Item.addEventListener("dragend", handleTableDragEnd);
              level3Item.addEventListener("click", function (e) {
                e.stopPropagation();
                showProjectEditModal(level3Project);
              });

              level2Body.appendChild(level3Item);
            });

            if (level3Children.length === 0) {
              level2Body.appendChild(
                createProjectTablePlaceholder("暂无三级项目", "5px"),
              );
            }
          }

          level2Section.appendChild(level2Body);
          groupContainer.appendChild(level2Section);
        });

        columnBody.appendChild(groupContainer);
      }

      if (level2Children.length === 0) {
        const placeholder = createProjectTablePlaceholder("暂无二级项目");
        placeholder.style.textAlign = "center";
        columnBody.appendChild(placeholder);
      }
    }

    column.appendChild(columnBody);
    table.appendChild(column);
  });

  // 如果没有一级项目，显示提示
  if (level1Projects.length === 0) {
    const emptyMessage = document.createElement("div");
    emptyMessage.style.gridColumn = "1 / -1";
    emptyMessage.style.color = "var(--text-color)";
    emptyMessage.style.textAlign = "center";
    emptyMessage.style.padding = "30px";
    emptyMessage.innerHTML = `
      <p>暂无一级项目，请先创建一级项目</p>
      <p style="font-size: 12px; color: var(--muted-text-color); margin-top: 10px">
        表格视图将根据项目层级自动组织
      </p>
    `;
    table.appendChild(emptyMessage);
  }

  tableContainer.appendChild(table);
  requestAnimationFrame(() => {
    const scaledHeight = Math.max(
      260,
      Math.round(table.getBoundingClientRect().height),
    );
    tableContainer.style.minHeight = `${scaledHeight + 20}px`;
  });
}

// 表格拖拽相关函数
let draggedTableItem = null;
let dragType = null; // "level1", "level2", "level3"
const TABLE_TOUCH_REORDER_SELECTOR = ".level1-header, .level2-header, .level3-item";
const TABLE_TOUCH_REORDER_CANCEL_DISTANCE_PX = 18;
const TABLE_TOUCH_REORDER_HOLD_MS = 380;

function getTableReorderKey(element) {
  const reorderType = getTableReorderType(element);
  const projectId = getTableReorderProjectId(element);
  if (!reorderType || !projectId) {
    return "";
  }
  return `${reorderType}:${projectId}`;
}

function findTouchByIdentifier(touchList, identifier) {
  if (!touchList || identifier === null || identifier === undefined) {
    return null;
  }

  for (let index = 0; index < touchList.length; index += 1) {
    const touch = touchList[index];
    if (touch?.identifier === identifier) {
      return touch;
    }
  }

  return null;
}

function canPerformTableReorderFromElements(sourceElement, targetElement) {
  const sourceType = getTableReorderType(sourceElement);
  const targetType = getTableReorderType(targetElement);

  if (!sourceType || !targetType || sourceElement === targetElement) {
    return false;
  }

  if (sourceType === "level1") {
    return targetType === "level1";
  }
  if (sourceType === "level2") {
    return targetType === "level1" || targetType === "level2";
  }
  if (sourceType === "level3") {
    return targetType === "level2" || targetType === "level3";
  }

  return false;
}

function captureProjectTableLayout() {
  const tableContainer = document.getElementById("projects-table");
  if (!(tableContainer instanceof HTMLElement)) {
    return null;
  }

  const layout = new Map();
  tableContainer.querySelectorAll(TABLE_TOUCH_REORDER_SELECTOR).forEach((element) => {
    const key = getTableReorderKey(element);
    if (!key) {
      return;
    }
    layout.set(key, element.getBoundingClientRect());
  });
  return layout;
}

function animateProjectTableReorder(previousLayout) {
  return;
}

function createTableTouchDragGhost(sourceElement, clientX = null, clientY = null) {
  if (!(sourceElement instanceof HTMLElement)) {
    return null;
  }

  const sourceRect = sourceElement.getBoundingClientRect();
  const computed = window.getComputedStyle(sourceElement);
  const ghost = document.createElement("div");
  ghost.className = "table-touch-drag-ghost";
  ghost.textContent =
    sourceElement.dataset.dragLabel ||
    sourceElement.textContent?.trim() ||
    "项目";
  ghost.dataset.level = getTableReorderType(sourceElement) || "";
  ghost.style.background = computed.background;
  ghost.style.color = computed.color;
  ghost.style.borderRadius = computed.borderRadius;
  ghost.style.padding = computed.padding;
  ghost.style.fontSize = computed.fontSize;
  ghost.style.fontWeight = computed.fontWeight;
  ghost.style.lineHeight = computed.lineHeight;
  ghost.style.letterSpacing = computed.letterSpacing;
  ghost.style.minWidth = `${Math.max(120, Math.round(sourceRect.width * 0.92))}px`;
  ghost.style.maxWidth = `${Math.max(160, Math.min(window.innerWidth - 28, 320))}px`;
  ghost.__touchAnchorX = Number.isFinite(clientX)
    ? Math.max(12, Math.round(clientX - sourceRect.left))
    : Math.max(12, Math.round(sourceRect.width / 2));
  ghost.__touchAnchorY = Number.isFinite(clientY)
    ? Math.max(12, Math.round(clientY - sourceRect.top))
    : Math.max(12, Math.round(sourceRect.height / 2));
  document.body.appendChild(ghost);
  requestAnimationFrame(() => {
    const ghostRect = ghost.getBoundingClientRect();
    const sourceWidth = Math.max(sourceRect.width, 1);
    const sourceHeight = Math.max(sourceRect.height, 1);
    ghost.__touchAnchorX = Math.max(
      12,
      Math.min(
        Math.round(ghostRect.width) - 12,
        Math.round((ghost.__touchAnchorX / sourceWidth) * ghostRect.width),
      ),
    );
    ghost.__touchAnchorY = Math.max(
      12,
      Math.min(
        Math.round(ghostRect.height) - 12,
        Math.round((ghost.__touchAnchorY / sourceHeight) * ghostRect.height),
      ),
    );
    if (Number.isFinite(clientX) && Number.isFinite(clientY)) {
      positionTableTouchDragGhost(ghost, clientX, clientY);
    }
    ghost.classList.add("is-visible");
  });
  return ghost;
}

function positionTableTouchDragGhost(ghost, clientX, clientY) {
  if (!(ghost instanceof HTMLElement)) {
    return;
  }
  const anchorX = Number.isFinite(ghost.__touchAnchorX)
    ? ghost.__touchAnchorX
    : 18;
  const anchorY = Number.isFinite(ghost.__touchAnchorY)
    ? ghost.__touchAnchorY
    : 18;
  ghost.style.setProperty("--touch-ghost-x", `${Math.round(clientX - anchorX)}px`);
  ghost.style.setProperty("--touch-ghost-y", `${Math.round(clientY - anchorY)}px`);
}

function removeTableTouchDragGhost(ghost) {
  if (!(ghost instanceof HTMLElement)) {
    return;
  }
  ghost.remove();
}

function getTableReorderType(element) {
  if (!(element instanceof Element)) {
    return "";
  }
  if (element.classList.contains("level1-header")) {
    return "level1";
  }
  if (element.classList.contains("level2-header")) {
    return "level2";
  }
  if (element.classList.contains("level3-item")) {
    return "level3";
  }
  return "";
}

function getTableReorderProjectId(element) {
  if (!(element instanceof Element)) {
    return "";
  }

  return String(
    element.dataset.projectId ||
      element.parentElement?.dataset?.projectId ||
      "",
  ).trim();
}

function refreshProjectHierarchyViews(options = {}) {
  const { animateFromLayout = null } = options;
  saveProjectsToStorage();
  updateProjectsList();
  updateExistingProjectsList();
  updateParentProjectSelect(1);
  renderProjectsTable();
  if (animateFromLayout instanceof Map && animateFromLayout.size > 0) {
    animateProjectTableReorder(animateFromLayout);
  }
}

function performTableReorderFromElements(sourceElement, targetElement) {
  if (!canPerformTableReorderFromElements(sourceElement, targetElement)) {
    return false;
  }

  const sourceType = getTableReorderType(sourceElement);
  const sourceProjectId = getTableReorderProjectId(sourceElement);
  const targetProjectId = getTableReorderProjectId(targetElement);

  if (
    !sourceType ||
    !sourceProjectId ||
    !targetProjectId ||
    sourceProjectId === targetProjectId
  ) {
    return false;
  }

  const draggedProject = projects.find((project) => project.id === sourceProjectId);
  const targetProject = projects.find((project) => project.id === targetProjectId);
  if (!draggedProject || !targetProject) {
    return false;
  }

  const previousLayout = captureProjectTableLayout();
  const originalParentId = draggedProject.parentId || null;
  let changed = false;

  if (sourceType === "level1") {
    const draggedIndex = projects.findIndex((project) => project.id === sourceProjectId);
    const targetIndex = projects.findIndex((project) => project.id === targetProjectId);
    if (
      draggedIndex !== -1 &&
      targetIndex !== -1 &&
      normalizeProjectLevel(targetProject.level) === 1
    ) {
      [projects[draggedIndex], projects[targetIndex]] = [
        projects[targetIndex],
        projects[draggedIndex],
      ];
      changed = true;
    }
  } else if (sourceType === "level2") {
    if (
      normalizeProjectLevel(targetProject.level) === 1 &&
      draggedProject.parentId !== targetProjectId
    ) {
      draggedProject.parentId = targetProjectId;
      changed = true;
    } else if (normalizeProjectLevel(targetProject.level) === 2) {
      if (draggedProject.parentId === targetProject.parentId) {
        const draggedIndex = projects.findIndex((project) => project.id === sourceProjectId);
        const targetIndex = projects.findIndex((project) => project.id === targetProjectId);
        if (draggedIndex !== -1 && targetIndex !== -1) {
          [projects[draggedIndex], projects[targetIndex]] = [
            projects[targetIndex],
            projects[draggedIndex],
          ];
          changed = true;
        }
      } else {
        draggedProject.parentId = targetProject.parentId;
        changed = true;
      }
    }
  } else if (sourceType === "level3") {
    if (
      normalizeProjectLevel(targetProject.level) === 2 &&
      draggedProject.parentId !== targetProjectId
    ) {
      draggedProject.parentId = targetProjectId;
      changed = true;
    } else if (normalizeProjectLevel(targetProject.level) === 3) {
      if (draggedProject.parentId === targetProject.parentId) {
        const draggedIndex = projects.findIndex((project) => project.id === sourceProjectId);
        const targetIndex = projects.findIndex((project) => project.id === targetProjectId);
        if (draggedIndex !== -1 && targetIndex !== -1) {
          [projects[draggedIndex], projects[targetIndex]] = [
            projects[targetIndex],
            projects[draggedIndex],
          ];
          changed = true;
        }
      } else {
        draggedProject.parentId = targetProject.parentId;
        changed = true;
      }
    }
  }

  if (!changed) {
    return false;
  }

  const didParentChange =
    String(originalParentId || "") !== String(draggedProject.parentId || "");
  if (didParentChange) {
    if (getProjectStoredColorMode(draggedProject) === "auto") {
      draggedProject.color = resolveAutoProjectColorForProject(
        draggedProject,
        projects,
      );
    }
    syncAutoProjectColorsInSubtree(draggedProject.id, {
      includeSelf: false,
      projectList: projects,
    });
  }

  refreshProjectHierarchyViews({ animateFromLayout: previousLayout });
  return true;
}

function handleTableDragStart(e) {
  draggedTableItem = this;
  dragType = getTableReorderType(this);
  if (!dragType || !e.dataTransfer) {
    draggedTableItem = null;
    dragType = null;
    return;
  }

  this.style.opacity = "0.7";
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData(
    "text/plain",
    getTableReorderProjectId(this),
  );
}

function handleTableDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
}

function handleTableDrop(e) {
  e.preventDefault();
  e.stopPropagation();

  if (!draggedTableItem || !dragType) return;

  const targetElement =
    e.target instanceof Element
      ? e.target.closest(TABLE_TOUCH_REORDER_SELECTOR)
      : null;
  if (!(targetElement instanceof HTMLElement)) {
    return;
  }

  performTableReorderFromElements(draggedTableItem, targetElement);
}

function handleTableDragEnd(e) {
  if (draggedTableItem) {
    draggedTableItem.style.opacity = "1";
  }
  draggedTableItem = null;
  dragType = null;
}

function isIndexWidgetTimerModalVisible() {
  const modal = document.getElementById("modal-overlay");
  return (
    modal instanceof HTMLElement &&
    !modal.hidden &&
    modal.style.display !== "none" &&
    isModalOpen
  );
}

function clearIndexWidgetLaunchQuery() {
  const params = new URLSearchParams(window.location.search);
  if (!params.get("widgetAction")) {
    return false;
  }
  params.delete("widgetAction");
  params.delete("widgetKind");
  params.delete("widgetSource");
  params.delete("widgetLaunchId");
  params.delete("widgetTargetId");
  params.delete("widgetCreatedAt");
  const queryText = params.toString();
  const nextUrl = `${window.location.pathname.split("/").pop()}${queryText ? `?${queryText}` : ""}${window.location.hash}`;
  window.history.replaceState({}, document.title, nextUrl);
  return true;
}

function scheduleIndexWidgetLaunchHandled(
  payload = {},
  isHandled = () => true,
  options = {},
) {
  const launchId =
    typeof payload?.launchId === "string" && payload.launchId.trim()
      ? payload.launchId.trim()
      : "";
  const action =
    typeof payload?.action === "string" && payload.action.trim()
      ? payload.action.trim()
      : "";
  const source =
    typeof payload?.source === "string" && payload.source.trim()
      ? payload.source.trim()
      : "widget";

  const finalizeHandled = () => {
    if (options.clearQuery === true) {
      clearIndexWidgetLaunchQuery();
    }
    if (!launchId || typeof window.ControlerNativeBridge?.emitEvent !== "function") {
      return true;
    }
    window.ControlerNativeBridge.emitEvent("widgets.launchHandled", {
      launchId,
      page: "index",
      action,
      handled: true,
      source,
    });
    return true;
  };

  if (isHandled()) {
    return finalizeHandled();
  }

  const startedAt = Date.now();
  const schedule =
    typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : (callback) => window.setTimeout(callback, 16);
  const waitForHandled = () => {
    if (isHandled()) {
      finalizeHandled();
      return;
    }
    if (Date.now() - startedAt >= INDEX_WIDGET_LAUNCH_CONFIRM_MAX_WAIT_MS) {
      return;
    }
    schedule(waitForHandled);
  };
  schedule(waitForHandled);
  return true;
}

function queueIndexWidgetLaunchAction(payload = {}, options = {}) {
  const requestedAt = Number(payload?.requestedAt);
  indexPendingWidgetLaunchAction = {
    payload: {
      ...payload,
      requestedAt:
        Number.isFinite(requestedAt) && requestedAt > 0
          ? Math.round(requestedAt)
          : Date.now(),
    },
    options: {
      ...options,
    },
  };
  return true;
}

function flushIndexPendingWidgetLaunchAction() {
  if (!indexWidgetLaunchCoreReady || !indexPendingWidgetLaunchAction) {
    return false;
  }
  const pendingAction = indexPendingWidgetLaunchAction;
  indexPendingWidgetLaunchAction = null;
  return handleIndexWidgetLaunchAction(
    pendingAction.payload,
    pendingAction.options,
  );
}

function markIndexWidgetLaunchCoreReady() {
  indexWidgetLaunchCoreReady = true;
  return flushIndexPendingWidgetLaunchAction();
}

function handleIndexWidgetLaunchAction(payload = {}, options = {}) {
  const action =
    typeof payload?.action === "string" && payload.action.trim()
      ? payload.action.trim()
      : "";
  if (action !== "start-timer") {
    return false;
  }
  if (!indexWidgetLaunchCoreReady) {
    return queueIndexWidgetLaunchAction(payload, options);
  }
  const requestedAt = Number(payload?.requestedAt);
  const clickTime =
    Number.isFinite(requestedAt) && requestedAt > 0
      ? new Date(requestedAt)
      : new Date();
  const accepted =
    requestSpendModalOpen(clickTime) ||
    isIndexWidgetTimerModalVisible() ||
    !!pendingSpendModalState;
  if (accepted) {
    scheduleIndexWidgetLaunchHandled(
      payload,
      isIndexWidgetTimerModalVisible,
      options,
    );
  }
  return accepted;
}

function initIndexWidgetLaunchAction() {
  if (indexWidgetLaunchActionInitialized) {
    return;
  }
  indexWidgetLaunchActionInitialized = true;
  const eventName =
    window.ControlerWidgetsBridge?.launchActionEventName ||
    "controler:launch-action";
  let consumedQuery = false;

  const consumeQueryAction = () => {
    if (consumedQuery) {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const action = params.get("widgetAction") || "";
    if (!action) {
      return;
    }
    consumedQuery = true;
    handleIndexWidgetLaunchAction({
      action,
      source: params.get("widgetSource") || "query",
      launchId: params.get("widgetLaunchId") || "",
    }, {
      clearQuery: true,
    });
  };

  window.addEventListener(eventName, (event) => {
    handleIndexWidgetLaunchAction(event.detail || {});
  });
  consumeQueryAction();
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}


