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
