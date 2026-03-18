const DEFAULT_LANGUAGE = "zh-CN";
const SUPPORTED_LANGUAGES = Object.freeze(["zh-CN", "en-US"]);

const NATIVE_UI_STRINGS = Object.freeze({
  "zh-CN": Object.freeze({
    menu: Object.freeze({
      file: "文件",
      exportData: "导出数据",
      importData: "导入数据",
      openStorageFolder: "打开存储文件夹",
      quit: "退出",
      edit: "编辑",
      undo: "撤销",
      redo: "重做",
      cut: "剪切",
      copy: "复制",
      paste: "粘贴",
      selectAll: "全选",
      view: "视图",
      reload: "重新加载",
      toggleDevTools: "切换开发者工具",
      actualSize: "实际大小",
      zoomIn: "放大",
      zoomOut: "缩小",
      window: "窗口",
      minimize: "最小化",
      close: "关闭",
      alwaysOnTop: "总在最前",
      help: "帮助",
      about: "关于",
      storageStatus: "查看存储状态",
      visitGithub: "访问 GitHub",
    }),
    dialog: Object.freeze({
      ok: "确定",
      exportFullTitle: "导出全部分片 ZIP",
      exportPartitionTitle: "导出单分区 JSON",
      exportSuccessTitle: "导出成功",
      exportSuccessMessage: "全部分片 ZIP 已成功导出到文件",
      exportFailureTitle: "导出失败",
      exportFailureMessage: "数据导出失败，请重试\n{detail}",
      importFileTitle: "选择要导入的数据文件",
      selectFolderTitle: "选择存储文件夹",
      selectStorageFileTitle: "选择同步 JSON 文件",
      selectDataFileTitle: "选择数据文件",
      emptyFilePath: "文件路径不能为空",
      aboutTitle: "关于 {appName}",
      storageStatusTitle: "存储状态",
      storageStatusMessage:
        "项目数量: {projects}\n记录数量: {records}\n文件大小: {sizeKb} KB\n存储路径: {storagePath}",
    }),
    filter: Object.freeze({
      zipFile: "ZIP 文件",
      jsonFile: "JSON 文件",
      dataFile: "数据文件",
      allFiles: "所有文件",
      supportedFiles: "支持的文件",
    }),
    backup: Object.freeze({
      noLatestBackup: "当前还没有可分享的备份文件。",
      revealLatestBackupSuccess: "已在资源管理器中定位最新备份文件。",
      revealLatestBackupFailure: "定位最新备份文件失败。",
    }),
    widget: Object.freeze({
      unknownType: "未知的小组件类型。",
    }),
    notification: Object.freeze({
      reminderTitle: "提醒",
    }),
  }),
  "en-US": Object.freeze({
    menu: Object.freeze({
      file: "File",
      exportData: "Export Data",
      importData: "Import Data",
      openStorageFolder: "Open Storage Folder",
      quit: "Quit",
      edit: "Edit",
      undo: "Undo",
      redo: "Redo",
      cut: "Cut",
      copy: "Copy",
      paste: "Paste",
      selectAll: "Select All",
      view: "View",
      reload: "Reload",
      toggleDevTools: "Toggle Developer Tools",
      actualSize: "Actual Size",
      zoomIn: "Zoom In",
      zoomOut: "Zoom Out",
      window: "Window",
      minimize: "Minimize",
      close: "Close",
      alwaysOnTop: "Always on Top",
      help: "Help",
      about: "About",
      storageStatus: "Storage Status",
      visitGithub: "Visit GitHub",
    }),
    dialog: Object.freeze({
      ok: "OK",
      exportFullTitle: "Export Full Bundle ZIP",
      exportPartitionTitle: "Export Partition JSON",
      exportSuccessTitle: "Export Complete",
      exportSuccessMessage: "The full bundle ZIP was exported successfully.",
      exportFailureTitle: "Export Failed",
      exportFailureMessage: "Data export failed. Please try again.\n{detail}",
      importFileTitle: "Choose a Data File to Import",
      selectFolderTitle: "Choose a Storage Folder",
      selectStorageFileTitle: "Choose the Synced JSON File",
      selectDataFileTitle: "Choose a Data File",
      emptyFilePath: "The file path cannot be empty.",
      aboutTitle: "About {appName}",
      storageStatusTitle: "Storage Status",
      storageStatusMessage:
        "Projects: {projects}\nRecords: {records}\nFile Size: {sizeKb} KB\nStorage Path: {storagePath}",
    }),
    filter: Object.freeze({
      zipFile: "ZIP Files",
      jsonFile: "JSON Files",
      dataFile: "Data Files",
      allFiles: "All Files",
      supportedFiles: "Supported Files",
    }),
    backup: Object.freeze({
      noLatestBackup: "There is no backup file to share yet.",
      revealLatestBackupSuccess: "The latest backup file was revealed in the file manager.",
      revealLatestBackupFailure: "Failed to reveal the latest backup file.",
    }),
    widget: Object.freeze({
      unknownType: "Unknown widget type.",
    }),
    notification: Object.freeze({
      reminderTitle: "Reminder",
    }),
  }),
});

const WIDGET_TITLES = Object.freeze({
  "start-timer": Object.freeze({
    "zh-CN": "开始计时",
    "en-US": "Start Timer",
  }),
  "write-diary": Object.freeze({
    "zh-CN": "写日记",
    "en-US": "Write Diary",
  }),
  "week-grid": Object.freeze({
    "zh-CN": "一周表格视图",
    "en-US": "Weekly Grid View",
  }),
  "day-pie": Object.freeze({
    "zh-CN": "一天的饼状图",
    "en-US": "Today's Pie Chart",
  }),
  todos: Object.freeze({
    "zh-CN": "待办事项",
    "en-US": "Todos",
  }),
  checkins: Object.freeze({
    "zh-CN": "打卡列表",
    "en-US": "Check-ins",
  }),
  "week-view": Object.freeze({
    "zh-CN": "周视图",
    "en-US": "Week View",
  }),
  "year-view": Object.freeze({
    "zh-CN": "年视图",
    "en-US": "Year View",
  }),
});

function normalizeLanguage(language) {
  const normalized = String(language || "").trim();
  if (!normalized) {
    return DEFAULT_LANGUAGE;
  }
  const lowerCased = normalized.toLowerCase();
  if (lowerCased === "en" || lowerCased === "en-us") {
    return "en-US";
  }
  if (lowerCased === "zh" || lowerCased === "zh-cn") {
    return "zh-CN";
  }
  return SUPPORTED_LANGUAGES.includes(normalized) ? normalized : DEFAULT_LANGUAGE;
}

function resolveKeyPath(source, keyPath) {
  return String(keyPath || "")
    .split(".")
    .filter(Boolean)
    .reduce((current, segment) => {
      if (!current || typeof current !== "object") {
        return undefined;
      }
      return current[segment];
    }, source);
}

function formatTemplate(template, params = {}) {
  return String(template || "").replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key) => {
    const value = params[key];
    return value === undefined || value === null ? "" : String(value);
  });
}

function t(language, keyPath, params = {}) {
  const normalizedLanguage = normalizeLanguage(language);
  const strings =
    NATIVE_UI_STRINGS[normalizedLanguage] || NATIVE_UI_STRINGS[DEFAULT_LANGUAGE];
  const template = resolveKeyPath(strings, keyPath);
  if (typeof template !== "string") {
    return "";
  }
  return formatTemplate(template, params);
}

function getWidgetTitle(kind, language, fallback = "") {
  const normalizedLanguage = normalizeLanguage(language);
  const localizedTitle = WIDGET_TITLES[String(kind || "").trim()];
  if (localizedTitle) {
    return localizedTitle[normalizedLanguage] || localizedTitle[DEFAULT_LANGUAGE];
  }
  return String(fallback || "").trim() || String(kind || "").trim();
}

module.exports = {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  normalizeLanguage,
  t,
  getWidgetTitle,
};
