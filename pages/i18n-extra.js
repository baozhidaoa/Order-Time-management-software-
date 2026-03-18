(() => {
  const LANGUAGE_EVENT = "controler:language-changed";
  const MONTH_NAMES = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const WEEKDAY_NAMES = {
    "周日": "Sun",
    "周一": "Mon",
    "周二": "Tue",
    "周三": "Wed",
    "周四": "Thu",
    "周五": "Fri",
    "周六": "Sat",
  };
  const EXTRA_MAP = {
    "桌面小组件": "Desktop Widget",
    "快速上手": "Quick Start",
    "删除引导": "Dismiss Guide",
    "搜索": "Search",
    "搜索结果": "Search Results",
    "清空": "Clear",
    "搜索标题或正文关键词": "Search title or content keywords",
    "先创建项目，再开始或结束计时。":
      "Create a project first, then start or stop the timer.",
    "一次计时结束后会自动形成记录。":
      "When a timer ends, a record is created automatically.",
    "统计页会直接读取这些记录。":
      "The stats page reads these records directly.",
    "日历计划放时间安排。":
      "Calendar plans are for scheduling your time.",
    "待办适合跟踪要做的事。":
      "Todos are for tracking things you need to do.",
    "打卡适合每天或每周重复的习惯。":
      "Check-ins are for daily or weekly recurring habits.",
    "点日期或已有条目都可以开始写。":
      "Tap a date or an existing entry to start writing.",
    "标题和正文至少写一项。":
      "Enter at least a title or the main content.",
    "分类可选，不分也能保存。":
      "Categories are optional. You can save without one.",
    "先选要放到桌面的组件类型。":
      "Choose the widget type you want on the home screen first.",
    "添加后可在桌面调整位置和大小。":
      "After adding it, you can adjust its position and size on the home screen.",
    "若是该处无法添加至桌面（安卓端），则通过手机系统的插件功能添加":
      "If adding from here does not work on Android, use the system widget picker to add it.",
    "若是该处无法添加至桌面（安卓端），则通过手机系统的插件功能添加。":
      "If adding from here does not work on Android, use the system widget picker to add it.",
    "数据导入与备份": "Data Import and Backup",
    "同步 JSON 文件怎么选": "How to Choose the Sync JSON File",
    "双端同步（需要时再看）": "Dual-Device Sync (Only If You Need It)",
    "导入数据是整包覆盖当前数据，不是合并。":
      "Import replaces your current data as a full package, not a merge.",
    "操作前先到 设置 -> 数据管理 -> 导出数据，留一份备份。":
      "Before doing this, go to Settings -> Data Management -> Export Data and keep a backup.",
    "选择已有有效 JSON：直接采用该文件中的数据。":
      "Choose an existing valid JSON: use the data already in that file directly.",
    "选择空白或新建 JSON：把当前数据写入该文件。":
      "Choose a blank or newly created JSON: write your current data into that file.",
    "选择目录：对目录中的 controler-data.json 应用同一规则。":
      "Choose a folder: apply the same rules to controler-data.json inside that folder.",
    "重置默认文件：切回应用默认 JSON，并按该文件内容重载。":
      "Reset to the default file: switch back to the app's default JSON and reload from that file.",
    "如果你不需要双端同步，可以忽略这一篇。":
      "If you do not need dual-device sync, you can ignore this entry.",
    "Syncthing 最简流程：两端安装并互相添加设备 -> 共享同一文件夹 -> 把 controler-data.json 放进该文件夹 -> 手机端在设置里选择同一份 JSON。":
      "Syncthing quick setup: install it on both devices and add each other -> share the same folder -> put controler-data.json in that folder -> choose the same JSON on the phone in Settings.",
    "一定先导出一份备份；若用 Syncthing，建议再开文件版本保留。":
      "Export a backup first. If you use Syncthing, also enable file versioning.",
    "可选云盘方案，通常是联网后自动回传，不如 Syncthing 稳定实时：Dropbox / Box / pCloud。":
      "Optional cloud drive choices usually upload changes after the network reconnects, so they are less stable and real-time than Syncthing: Dropbox / Box / pCloud.",
    "数据管理": "Data Management",
    "导出数据": "Export Data",
    "导入数据": "Import Data",
    "同步 JSON 文件": "Sync JSON File",
    "选择 JSON 文件": "Choose JSON File",
    "选择存储目录": "Choose Storage Folder",
    "重置为默认文件": "Reset to Default File",
    "显示文件位置": "Show File Location",
    "当前同步文件:": "Current sync file:",
    "文件类型:": "File type:",
    "选择已有 JSON / 目录时，如果其中已经有有效数据，会直接载入该数据；如果目标为空，则会把当前数据写入该目标。":
      "When you choose an existing JSON file or folder, valid data there is loaded directly; if the target is empty, your current data is written there.",
    "导入会整包覆盖当前数据，不是合并；操作前请先导出备份。":
      "Import replaces your current data as a full package, not a merge. Export a backup first.",
    "长按后拖动窗口": "Press and drag to move the window",
    "移动": "Move",
    "最小化": "Minimize",
    "打开计时": "Open Timer",
    "打开日记": "Open Diary",
    "查看记录": "View Records",
    "查看周表格": "View Weekly Grid",
    "查看饼图": "View Pie Chart",
    "查看热图": "View Heatmap",
    "查看折线图": "View Line Chart",
    "打开待办": "Open Todos",
    "打开打卡": "Open Check-ins",
    "打开周视图": "Open Week View",
    "打开月视图": "Open Month View",
    "打开年视图": "Open Year View",
    "打开应用": "Open App",
    "重新渲染": "Retry Render",
    "完整渲染未就绪，先显示可操作的兜底内容。":
      "The full render is not ready yet, so a usable fallback is shown first.",
    "这是兜底模式；你仍然可以在这里打开对应页面或重试完整渲染。":
      "Fallback mode is active. You can still open the related page or retry the full render here.",
    "完整小组件内容尚未就绪，先提供可操作的兜底内容。":
      "The full widget content is not ready yet, so a usable fallback is shown first.",
    "小组件内容会在后续刷新时自动同步":
      "Widget content will sync automatically on the next refresh.",
    "点击下方按钮打开对应视图":
      "Use the button below to open the related view.",
    "当前还没有可显示的数据。": "No data is available yet.",
    "实时同步": "Live Sync",
    "打开原页": "Open Original View",
    "刷新内容": "Refresh",
    "移除组件": "Remove Widget",
    "状态": "Status",
    "空闲": "Idle",
    "当前项目": "Current Project",
    "项目": "Project",
    "快速计时": "Quick Timer",
    "未开始计时，可直接在这里开始或结束一条记录。":
      "No timer is running. You can start or stop a record here.",
    "当前没有进行中的计时。": "No timer is currently running.",
    "结束并保存": "Stop and Save",
    "停止但不保存": "Stop Without Saving",
    "结束后会直接生成一条记录，无需打开主界面。":
      "Stopping will save a record immediately, without opening the main app.",
    "开始后计时会持续显示在这个小组件中。":
      "Once started, the timer will keep updating in this widget.",
    "今日日记": "Today's Diary",
    "已存在": "Exists",
    "未记录": "Not Started",
    "分类": "Category",
    "今天想记什么": "What do you want to capture today?",
    "标题": "Title",
    "正文": "Content",
    "更新今天的日记": "Update Today's Diary",
    "保存今天的日记": "Save Today's Diary",
    "保存日记失败。": "Failed to save the diary entry.",
    "请至少填写标题或正文。": "Enter at least a title or content.",
    "保存后会直接写入今天的日记，无需打开主界面。":
      "Saving writes directly into today's diary without opening the main app.",
    "内容会直接显示在小组件中，可拖动窗口边缘调整尺寸。":
      "Content is shown directly in the widget, and you can resize it by dragging the window edge.",
    "写下今天的记录...": "Write down today's notes...",
    "今日记录": "Today's Records",
    "今日总时长": "Today's Total",
    "最近更新": "Last Updated",
    "暂无": "None",
    "今日待办": "Today's Todos",
    "进度记录": "Progress Entries",
    "今日项目": "Today's Check-ins",
    "已打卡": "Checked In",
    "最高连击": "Best Streak",
    "未来 7 天": "Next 7 Days",
    "安排总数": "Total Plans",
    "最忙一天": "Busiest Day",
    "计划日": "Days with Plans",
    "活跃天数": "Active Days",
    "本月时长": "This Month",
    "全年时长": "This Year",
    "活跃月份": "Active Months",
    "年度目标": "Yearly Goals",
    "峰值投入": "Peak Time",
    "峰值日期": "Peak Date",
    "记录天数": "Recorded Days",
    "本周累计": "This Week",
    "项目数": "Projects",
    "峰值小时": "Peak Hour",
    "峰值时长": "Peak Duration",
    "今日投入": "Today's Time",
    "还没有时间记录。": "No time records yet.",
    "开始一次计时或手动记录后，这里会立即同步最近记录。":
      "Start a timer or add a record manually to sync recent entries here right away.",
    "今天没有待办卡片。": "No todo cards for today.",
    "新增待办或切换到主界面查看完整列表后，这里会自动同步。":
      "Add a todo or open the main view to see the full list, and this widget will sync automatically.",
    "今天没有需要打卡的项目。": "No check-ins scheduled for today.",
    "设置每日或每周打卡后，会以卡片形式出现在这里。":
      "Set up daily or weekly check-ins and they will appear here as cards.",
    "本周没有计划安排。": "No plans scheduled this week.",
    "创建计划后，这里会保留接下来几天最关键的安排。":
      "Once you add plans, the most important upcoming items will stay here.",
    "显示最近 20 周的活跃度，颜色越深表示当天投入越多。":
      "Shows activity across the last 20 weeks. Darker color means more time spent that day.",
    "导航按钮显示": "Navigation Buttons",
    "导航按钮显示设置": "Navigation button visibility settings",
    "显示时间记录入口。": "Show the time tracking entry.",
    "显示统计视图入口。": "Show the statistics entry.",
    "显示计划与待办入口。": "Show the planner and todos entry.",
    "显示日记页面入口。": "Show the diary entry.",
    "显示设置页面入口。": "Show the settings entry.",
    "固定": "Pinned",
    "显示中": "Visible",
    "已隐藏": "Hidden",
    "固定显示": "Always Visible",
    "隐藏": "Hide",
    "显示": "Show",
    "至少保留一个导航按钮，不能全部隐藏。":
      "Keep at least one navigation button visible.",
    "无法保存": "Could Not Save",
    "正在检测当前平台的小组件能力...":
      "Checking widget support on this device...",
    "开机自启应用": "Launch the app at startup",
    "启动时恢复已创建小组件": "Restore created widgets on launch",
    "小组件始终停留在桌面上方": "Keep widgets above the desktop",
    "创建桌面小组件": "Create Desktop Widget",
    "添加到桌面": "Pin to Home Screen",
    "手动添加": "Add Manually",
    "等待系统确认": "Awaiting System Confirmation",
    "已添加成功": "Added Successfully",
    "返回桌面查看": "Back to Home Screen",
    "长按桌面空白处": "Long-press an empty area on the home screen",
    "打开“小组件”或“插件”": 'Open "Widgets" or "Plugins"',
    "找到 Order 并选择需要的组件": "Find Order and choose the widget you need",
    "手动添加步骤": "Manual Add Steps",
    "系统可能会要求确认。": "The system may ask you to confirm placement.",
    "如果没有自动出现，请返回此页查看结果或改用手动添加。":
      "If nothing appears automatically, come back here to check the result or switch to manual add.",
    "已收到系统添加回执。": "The system has confirmed the widget was added.",
    "可以返回桌面查看该组件。":
      "You can go back to the home screen to view this widget.",
    "这个组件可通过系统小组件面板手动添加。":
      "This widget can be added manually from the system widget panel.",
    "当前系统未返回添加成功回执，请改用系统小组件面板手动添加。":
      "The system did not return a successful add callback. Please add it manually from the widget panel.",
    "已发起添加请求，请先完成系统确认。":
      "An add request is already in progress. Please finish the system confirmation first.",
    "已发起添加请求，请在桌面确认。":
      "The add request has been sent. Please confirm it on the home screen.",
    "当前系统支持应用内请求添加小组件。":
      "This device supports requesting widget placement from inside the app.",
    "当前桌面不支持应用内固定小组件，请从桌面小组件列表手动添加。":
      "This launcher does not support pinning widgets from inside the app. Please add it manually from the widget list.",
    "当前系统版本不支持应用内直接固定小组件，请从桌面手动添加。":
      "This Android version does not support pinning widgets from inside the app. Please add it manually from the home screen.",
    "桌面端支持创建独立小组件窗口；组件内容会直接显示在桌面中，无需强制跳转页面，也可设置开机自启并在启动时自动恢复。":
      "Desktop supports standalone widget windows. Widget content stays on the desktop, can launch at startup, and can be restored automatically.",
    "Android 端会沿用桌面端同一份数据与动作入口；点击后会先向系统发起添加请求，确认成功后才会出现在桌面。若系统未完成确认，请改用系统小组件面板手动添加。":
      "Android uses the same data and actions as desktop. Tapping the button sends a system add request first, and the widget appears on the home screen only after confirmation. If the system does not complete the confirmation, add it manually from the widget panel.",
    "Android 端会沿用桌面端同一份数据与动作入口；添加到桌面后，组件会直接读取当前同步 JSON 并刷新摘要，点击动作也会优先在组件内完成。":
      "Android uses the same data and actions as desktop. After adding a widget, it reads the synced JSON directly and refreshes its summary, with actions handled in-widget first.",
    "Android 端会沿用桌面端同一份数据与动作入口；添加到桌面后，组件会直接读取当前同步 JSON 并刷新摘要。若是该处无法添加至桌面（安卓端），则通过手机系统的插件功能添加。":
      "Android uses the same data and actions as desktop. After you add it to the home screen, the widget reads the current synced JSON and refreshes its summary. If adding from here does not work on Android, use the system widget picker to add it.",
    "当前 Android 系统不支持应用内直接固定组件，请长按桌面空白处 → 小组件 → Order，手动添加需要的小组件。":
      "This Android device does not support pinning widgets from inside the app. Long-press the home screen, open Widgets, then add the Order widget manually.",
    "当前 Android 系统不支持应用内直接固定组件。若是该处无法添加至桌面（安卓端），则通过手机系统的插件功能添加。":
      "This Android device cannot pin widgets from inside the app. If adding from here does not work on Android, use the system widget picker to add it.",
    "当前仅 Electron 桌面端与 Android 原生端支持桌面小组件；在浏览器环境中会自动隐藏相关动作。":
      "Desktop widgets are currently supported only in Electron desktop and Android native builds. Related actions stay hidden in the browser.",
    "当前环境暂不支持桌面小组件。请在 Electron 桌面端或 Android 原生端使用。":
      "Desktop widgets are not supported in the current environment. Use the Electron desktop app or the Android native app.",
    "当前环境不可用": "Unavailable Here",
    "创建成功": "Created",
    "创建失败": "Creation Failed",
    "已发起添加请求": "Add Request Sent",
    "请手动添加": "Add Manually",
    "添加失败": "Add Failed",
    "选择成功": "Selection Saved",
    "迁移成功": "Migration Complete",
    "重置成功": "Reset Complete",
    "重置失败": "Reset Failed",
    "选择失败": "Selection Failed",
    "重置同步文件": "Reset Sync Target",
    "重置": "Reset",
    "选择同步 JSON 文件失败，请重试。":
      "Failed to choose the synced JSON file. Please try again.",
    "选择同步目录失败，请重试。":
      "Failed to choose the sync directory. Please try again.",
    "重置同步 JSON 文件失败，请重试。":
      "Failed to reset the synced JSON file. Please try again.",
    "当前移动端版本暂不支持选择同步 JSON 文件。":
      "This mobile build does not support choosing a synced JSON file yet.",
    "当前移动端版本暂不支持选择同步目录。":
      "This mobile build does not support choosing a sync directory yet.",
    "当前移动端版本暂不支持重置同步 JSON 文件。":
      "This mobile build does not support resetting the synced JSON file yet.",
    "在浏览器环境中无法更改存储目录，此功能仅在桌面端或移动端应用中可用。":
      "The sync directory cannot be changed in the browser. This feature is available only in the desktop app or native mobile app.",
    "确定要重置为应用默认 JSON 文件吗？":
      "Reset to the app's default JSON file?",
    "当前环境不可用": "Unavailable Here",
    "年视图": "Year View",
    "月视图": "Month View",
    "周视图": "Week View",
    "添加目标": "Add Goal",
    "点击卡片添加本月目标": "Click a card to add this month's goals",
    "➕ 添加新计划": "➕ Add New Plan",
    "正在加载计划视图...": "Loading planning view...",
    "添加新计划": "Add New Plan",
    "创建新计划": "Create New Plan",
    "编辑计划": "Edit Plan",
    "创建计划": "Create Plan",
    "删除计划": "Delete Plan",
    "计划名称": "Plan Name",
    "日期": "Date",
    "开始时间": "Start Time",
    "结束时间": "End Time",
    "通知": "Notifications",
    "不通知": "No Notification",
    "开始前提醒": "Before Start",
    "自定义时间": "Custom Time",
    "提前多少分钟提醒": "Minutes Before Start",
    "自定义提醒时间": "Custom Reminder Time",
    "若计划开启重复，将按相同的相对提醒时间应用到自动重复的计划上。":
      "Recurring plans reuse the same relative reminder time.",
    "不重复": "No Repeat",
    "每天重复": "Repeats Daily",
    "每周重复": "Repeats Weekly",
    "每月重复": "Repeats Monthly",
    "每周重复设置:": "Weekly repeat settings:",
    "颜色": "Color",
    "点击选择颜色": "Click to choose a color",
    "标记为已完成": "Mark as completed",
    "标记为未完成": "Mark as incomplete",
    "日期:": "Date:",
    "时间:": "Time:",
    "重复:": "Repeat:",
    "状态:": "Status:",
    "创建时间:": "Created:",
    "关闭": "Close",
    "今日不在打卡周期": "Not scheduled today",
    "今日已打卡": "Checked in today",
    "今日未打卡": "Not checked in today",
    "无描述": "No description",
    "暂无进度，点右侧“＋”补一条":
      "No progress yet. Tap “＋” on the right to add one.",
    "暂无打卡项目": "No check-in items yet",
    '点击"添加项目"按钮创建打卡项目':
      'Click "Add Item" to create a check-in item',
    "打卡项目": "Check-in Item",
    "普通待办事项": "Regular Todo",
    "有截止日期、优先级、标签的待办事项":
      "A todo with due date, priority, and tags",
    "主题名称": "Theme Name",
    "选择您喜欢的主题配色，设置将自动保存并同步到底部导航样式。":
      "Choose your preferred theme palette. Changes save automatically and sync to the bottom navigation.",
    "文字颜色": "Text Color",
    "遮罩颜色": "Overlay Color",
    "底栏底色": "Bottom Nav Bar",
    "底栏按钮": "Bottom Nav Button",
    "底栏当前按钮": "Bottom Nav Active",
    "编辑自定义主题": "Edit Custom Theme",
    "自定义主题": "Custom Theme",
    "添加自定义主题": "Add Custom Theme",
    "恢复默认": "Reset",
    "支持输入 #RRGGBB 与 rgba(...)，保存后会立即应用到按钮、底部导航、面板、弹窗、下拉菜单、小组件与浮层边框等主题适配区域。":
      "Supports #RRGGBB and rgba(...). Saving applies the theme to buttons, bottom navigation, panels, dialogs, menus, widgets, and overlay borders immediately.",
    "支持输入": "Supports",
    "删除自定义主题": "Delete Custom Theme",
    "恢复默认主题": "Reset Built-in Theme",
    "石墨灰": "Graphite Mist",
    "极光青雾": "Aurora Mist",
    "酒红夜幕": "Velvet Bordeaux",
    "香槟砂岩": "Champagne Sandstone",
    "深海靛影": "Midnight Indigo",
    "自定义路径": "Custom Path",
    "浏览器内置存储": "Browser Built-in Storage",
    "在浏览器环境中无法重置存储路径，此功能仅在Electron应用中可用。":
      "The storage path cannot be reset in the browser. This feature is only available in Electron.",
    "确定要重置存储路径为默认值吗？":
      "Reset the storage path to the default value?",
    "存储路径已重置为默认值。\n\n注意：实际数据不会自动迁移，新数据将保存到默认位置。":
      "The storage path has been reset to default.\n\nNote: existing data is not migrated automatically. New data will be stored in the default location.",
    "颜色选择": "Color Picker",
    "待办事项统计": "Todo Stats",
    "打卡统计": "Check-in Stats",
    "编辑主题": "Edit Theme",
    "点击卡片应用": "Click a card to apply",
    "尺寸": "Size",
    "已保存缩放:": "Saved scale:",
    "时间记录 · 项目表格": "Time Record · Project Table",
    "一级/二级/三级项目表格整体尺寸":
      "Overall size of the Level 1/2/3 project table",
    "时间统计 · 时间表格": "Time Stats · Time Grid",
    "统计页周/多日时间网格大小":
      "Weekly / multi-day time grid size on the stats page",
    "时间统计 · 日历热图": "Time Stats · Calendar Heatmap",
    "热图单元格与间距显示尺度": "Heatmap cell and spacing scale",
    "时间计划 · 年视图": "Planning · Year View",
    "年视图月份卡片与目标列表大小":
      "Month cards and goal list size in year view",
    "时间计划 · 月视图": "Planning · Month View",
    "月视图日期格与计划标签大小":
      "Date cells and plan tag size in month view",
    "时间计划 · 周视图": "Planning · Week View",
    "周视图时间轴、列宽与事项块大小":
      "Timeline, column width, and block size in week view",
    "待办事项 · 列表视图": "Todos · List View",
    "待办列表卡片、记录与打卡列表尺寸":
      "Todo cards, progress records, and check-in list size",
    "待办事项 · 四象限视图": "Todos · Quadrant View",
    "四象限面板与事项卡片尺寸": "Quadrant panels and task card size",
    "重要且紧急": "Important & Urgent",
    "重要不紧急": "Important, Not Urgent",
    "紧急不重要": "Urgent, Not Important",
    "不紧急不重要": "Neither Urgent nor Important",
    "优先立即处理": "Handle first",
    "重点规划推进": "Plan and push forward",
    "尽量委托或限时处理": "Delegate or time-box when possible",
    "批量安排低优先级": "Batch low-priority tasks",
    "暂无事项": "No items",
    "添加项目": "Add Item",
    "添加进度记录": "Add Progress Record",
    "完成": "Complete",
    "取消完成": "Undo Complete",
    "合并": "Merge",
    "合并项目": "Merge Project",
    "无法合并项目": "Cannot Merge Project",
    "合并完成": "Merge Complete",
    "请确认操作": "Please Confirm",
    "知道了": "Got It",
    "提示": "Notice",
    "确定": "OK",
    "当前项目下仍有子项目，只有叶子项目才能通过重命名合并。":
      "This project still has child items. Only leaf projects can be merged by renaming.",
    "合并后当前项目会消失，目标项目的层级、父级和颜色保持不变。":
      "The current project will disappear after merging. The target project's level, parent, and color stay unchanged.",
    "原项目已删除。": "The original project has been removed.",
    "请输入目标名称": "Please enter a goal name",
    "请选择有效的开始日期和结束日期":
      "Please select a valid start and end date",
    "确定删除这个月目标吗？":
      "Are you sure you want to delete this month's goal?",
    "删除月目标": "Delete Monthly Goal",
    "删除重复计划": "Delete Recurring Plan",
    "仅删当天": "Only This Day",
    "删除全部": "Delete All",
    "删除待办事项": "Delete Todo",
    "确定要删除这个待办事项吗？此操作不可撤销！":
      "Delete this todo? This action cannot be undone.",
    "确定要删除这个打卡项目吗？此操作不可撤销！":
      "Delete this check-in item? This action cannot be undone.",
    "全部项目（汇总）": "All Projects (Summary)",
    "全部打卡项目": "All Check-in Items",
    "提醒时间": "Reminder Time",
    "若待办启用了重复或使用“开始日期 - 结束日期”模式，将按相同的相对提醒时间同步到后续重复日期。":
      'Repeating todos reuse the same relative reminder time across future dates.',
    "每天提醒时间": "Reminder Time of Day",
    "若打卡项目设置了每日或每周重复，将在对应重复日期的这个时间提醒。":
      "Check-ins remind at this time on each repeated day.",
    "计划提醒": "Plan Reminder",
    "待办提醒": "Todo Reminder",
    "打卡提醒": "Check-in Reminder",
    "日期范围": "Date Range",
    "时间分配": "Time Allocation",
    "项目分布": "Project Distribution",
    "平均每日时间": "Average Daily Time",
    "周数": "Week Count",
    "星期": "Weekday",
    "所选项目": "Selected Project",
    "项目筛选": "Project Filter",
    "占比": "Share",
    "总用时": "Total Time",
    "日均时长": "Average per Day",
    "实际日时长": "Average per Active Day",
    "折线图": "Line Chart",
    "饼状图": "Pie Chart",
    "进度条": "Progress Bar",
    "饼状图统计": "Pie Chart",
    "折线图统计": "Line Chart",
    "当前筛选周期汇总": "Current Filtered Period Summary",
    "Chart.js库未加载，请检查网络连接":
      "Chart.js is not loaded. Please check your connection.",
    "Chart.js 库未加载，请检查本地资源":
      "Chart.js is not loaded. Please check local assets.",
    "当前时间范围内暂无可绘制的数据":
      "No chart data is available in the selected time range.",
    "数据会在你下一次记录、计划或打卡后自动同步到这里。":
      "Data will sync here automatically after your next record, plan, or check-in.",
    "内容会在这里以主题卡片形式同步更新。":
      "Content will sync here as themed cards.",
    "当前没有需要处理的项目。":
      "Nothing needs action right now.",
    "这里会保留与你今天最相关的卡片与操作。":
      "The most relevant cards and actions for today stay here.",
    "操作": "Action",
    "无计划": "No Plans",
    "计划": "Plan",
    "无记录": "No Records",
    "未打卡": "Not checked in",
    "未命名项目": "Untitled Project",
    "未命名待办": "Untitled Todo",
    "未命名打卡": "Untitled Check-in",
    "未命名打卡项目": "Untitled Check-in Item",
    "上一月": "Previous Month",
    "下一月": "Next Month",
    "显示月份": "Months Shown",
    "数据类型": "Data Type",
    "项目时长": "Project Hours",
    "浅色 ≤": "Light ≤",
    "中色 ≤": "Medium ≤",
    "命中天数": "Active Days",
    "已打卡天数": "Checked-in Days",
    "当天有打卡记录": "Has check-ins that day",
    "统计工具未加载，无法渲染层级饼状图":
      "Stats tools are unavailable, so the hierarchy pie chart cannot be rendered.",
    "D3 未加载，无法渲染层级饼状图":
      "D3 is not loaded, so the hierarchy pie chart cannot be rendered.",
    "当前筛选条件下暂无可展示的项目时长":
      "No project hours are available for the current filter.",
    "未找到待办事项。": "Todo not found.",
    "未找到打卡项目。": "Check-in item not found.",
    "今日可开连击": "Streak starts today",
    "保留核心信息与完成操作，点击按钮即可直接同步状态。":
      "Keep the core context and finish the task directly from the widget.",
    "可直接在这里完成": "Complete it here",
    "已完成，可直接撤回": "Completed, tap to undo",
    "可直接在这里完成打卡": "Check in here",
    "从今天开始保持连击": "Start your streak today",
    "撤回": "Undo",
    "打卡": "Check In",
    "待安排": "To Be Scheduled",
    "已逾期": "Overdue",
    "今日优先": "Priority Today",
    "即将截止": "Due Soon",
    "待处理": "Pending",
    "今日待做": "Due Today",
    "未设置日期": "No Date",
    "今天截止": "Due Today",
    "明天截止": "Due Tomorrow",
    "已完成": "Completed",
    "待打卡": "Pending",
    "今日已完成": "Completed Today",
    "今日待完成": "Due Today",
    "每天": "Daily",
    "未设置": "Not Set",
    "高优先级": "High Priority",
    "中优先级": "Medium Priority",
    "低优先级": "Low Priority",
    "刚开始": "Just Started",
    "选择时间范围并使用上方折叠按钮查看统计":
      "Select a date range and use the controls above to view stats",
    "收起": "Close",
    "（无正文）": "(No content)",
    "分类：未设置": "Category: Not Set",
    "新分类名称": "New Category Name",
    "未找到要删除的内容": "Nothing to delete was found.",
    "未找到要删除的日记": "Diary entry not found.",
    "未找到要删除的分类": "Category not found.",
    "保存日记失败，已恢复修改前内容。":
      "Failed to save the diary entry. The previous content has been restored.",
    "保存失败": "Save Failed",
    "删除失败": "Delete Failed",
    "删除后保存失败，已恢复删除前内容。":
      "Failed to save after deletion. The content before deletion has been restored.",
    "删除分类失败，已恢复删除前内容。":
      "Failed to delete the category. The previous content has been restored.",
    "保存分类失败，已恢复修改前内容。":
      "Failed to save the category. The previous content has been restored.",
    "正在加载数据中": "Loading your data",
    "正在读取当前月份的日记与分类，请稍候":
      "Loading the current month's diary entries and categories. Please wait.",
    "正在更新当前月份的日记数据，请稍候":
      "Refreshing the current month's diary data. Please wait.",
    "正在加载所选月份的日记数据，请稍候":
      "Loading diary data for the selected month. Please wait.",
    "正在同步最新日记数据，请稍候":
      "Syncing the latest diary data. Please wait.",
    "已切换到同步目录：": "Switched to the sync directory:",
    "检测到目录里已有有效的 bundle 数据，应用将直接载入该目录中的内容。页面将刷新一次以重新载入内容。":
      "Valid bundle data was found in the selected directory. The app will load that content directly and refresh once.",
    "检测到旧单文件 JSON，已自动迁移为目录 bundle，并保留旧文件备份。页面将刷新一次以重新载入内容。":
      "A legacy single-file JSON was found and migrated to a directory bundle automatically. A backup of the old file was kept, and the page will refresh once.",
    "目标目录中没有可用的 bundle 数据，当前应用数据已写入该目录。页面将刷新一次以重新载入内容。":
      "No usable bundle data was found in the target directory. The current app data was written there and the page will refresh once.",
    "当前清除目标：": "Current clear target:",
    "当前数据目录：": "Current data directory:",
    "应用私有目录": "App Private Directory",
    "已授权外部目录": "Authorized External Directory",
    "位于应用私有目录，系统文件管理器通常不可直接访问。":
      "This location is inside the app's private directory and is usually not directly accessible from the system file manager.",
    "这是系统授权的外部目录入口，路径可能显示为内容 URI。":
      "This is a system-authorized external directory entry, so the path may appear as a content URI.",
    "当前 bundle 结构说明": "Current Bundle Structure",
    "最近备份/迁移记录": "Recent Backup / Migration Records",
    "当前还没有旧单文件迁移或旧单文件导入备份记录。":
      "There are no backup records from legacy single-file imports or migrations yet.",
    "固定文件：": "Fixed Files:",
    "按月分片：records / diaryEntries / dailyCheckins / checkins / plans（一次性计划）。":
      "Monthly partitions: records / diaryEntries / dailyCheckins / checkins / plans (one-time plans).",
    "当前还没有按月分片": "There are no monthly partitions yet.",
    "旧单文件导入备份": "Legacy Single-File Import Backup",
    "旧单文件自动迁移备份": "Legacy Single-File Auto-Migration Backup",
    "未知来源": "Unknown Source",
    "自动备份状态": "Auto Backup Status",
    "当前环境暂不支持自动本地 ZIP 备份。":
      "Automatic local ZIP backup is not supported in the current environment.",
    "暂无自动备份 ZIP": "No automatic backup ZIP yet",
    "最近执行正常": "The latest run completed successfully",
    "已启用": "Enabled",
    "未启用": "Disabled",
    "当前还没有创建任何桌面小组件，点击下方按钮即可生成。":
      "No desktop widgets have been created yet. Use the button below to create one.",
    "当前环境暂未声明可用的小组件能力。":
      "The current environment has not reported any available widget capability yet.",
    "当前环境不支持桌面小组件。":
      "Desktop widgets are not supported in the current environment.",
    "当前环境不支持返回桌面。":
      "Returning to the home screen is not supported in the current environment.",
    "当前环境不支持桌面小组件设置。":
      "Desktop widget settings are not supported in the current environment.",
    "当前环境不支持更新桌面小组件设置。":
      "The current environment does not support updating desktop widget settings.",
    "当前环境不支持 Android 小组件固定。":
      "The current environment does not support Android widget pinning.",
    "当前环境暂不支持桌面小组件。":
      "Desktop widgets are not available in the current environment yet.",
    "请通过系统小组件面板手动添加。":
      "Please add it manually from the system widget panel.",
    "检测到当前运行在 Electron 中，但预加载桥接未成功注入。桌面小组件与窗口按钮暂时不可用，请使用修复后的版本重新启动应用。":
      "Electron was detected, but the preload bridge was not injected correctly. Desktop widgets and window controls are temporarily unavailable. Restart with a fixed build.",
    "Electron 桥接已加载，但桌面小组件接口未完整暴露。请重新安装或使用修复后的版本。":
      "The Electron bridge loaded, but the desktop widget APIs were not exposed completely. Reinstall the app or use a fixed build.",
    "小组件脚本加载失败，请重启应用后重试。":
      "Failed to load the widget script. Restart the app and try again.",
    "当前系统不支持应用内直接固定组件。":
      "The current system does not support pinning widgets directly from inside the app.",
    "安卓端请通过系统小组件面板手动添加。":
      "On Android, please add the widget manually from the system widget panel.",
    "当前原生端支持由应用发起添加桌面小组件。":
      "This native build supports requesting desktop widget placement from inside the app.",
    "当前清除会同步写回已绑定的外部文件或目录。":
      "Clearing data here will also write the change back to the linked external file or directory.",
    "当前为移动端应用私有数据目录，清除后会立即同步到本机数据文件。":
      "The current target is the mobile app's private data directory. Clearing it will sync to the local data file immediately.",
    "当前环境缺少外部 JSON 导入能力。":
      "The current environment does not support external JSON import.",
    "当前环境缺少外部 JSON 映射能力。":
      "The current environment does not support external JSON mapping.",
    "分区": "Partition",
    "记录数组来源": "Record Array Source",
    "日期字段": "Date Field",
    "开始时间字段": "Start Time Field",
    "结束时间字段": "End Time Field",
    "请选择字段": "Please choose a field",
    "请选择要导出的分区和月份。":
      "Please choose the partition and month to export.",
    "读取 bundle manifest 失败，回退本地推导:":
      "Failed to read the bundle manifest. Falling back to local inference:",
    "读取桌面小组件状态失败:": "Failed to read desktop widget state:",
    "更新桌面小组件设置失败:": "Failed to update desktop widget settings:",
    "当前还没有按月分片": "There are no monthly partitions yet.",
    "开始导入": "Start Import",
    "获取失败": "Fetch Failed",
    "清除完成": "Clear Complete",
    "清除失败": "Clear Failed",
    "查看添加方式": "How to Add",
    "该组件": "This Widget",
    "手动添加步骤": "Manual Add Steps",
    "导入现在有“整包替换”和“差异导入”两种模式；高风险操作前先导出备份。":
      "Import now has two modes: full replacement and differential import. Export a backup before high-risk operations.",
    "导入和导出到底怎么选": "How to Choose Between Import and Export",
    "为什么现在是一个目录里的多份 JSON": "Why Storage Is Now Multiple JSON Files in One Directory",
    "换设备 / 合并数据 / 只补一个月数据时该怎么做":
      "How to Change Devices, Merge Data, or Restore Just One Month",
    "长按项目拖至目标项目可移动位置或改变分级。":
      "Long-press a project and drag it onto another project to reorder it or change its level.",
    "一级二级项目双击折叠收起；项目列表单击（饼状图和折线图处也是）。":
      "Double-click level 1 or level 2 projects to collapse them. Single-click also works in the project list, pie chart, and line chart.",
    "所有视图均可放大":
      "All views can be zoomed in.",
    "右滑可见计划页面。":
      "Swipe right to open the planning page.",
    "第一次计时时可以不输入下一个项目，一次计时结束后会自动形成记录。":
      "On your first timer run, you can leave the next project empty. A record is created automatically when the timer ends.",
    "创建项目不可同名,改变名称时同名是合并，所有记录合并至目标名称，并删除被改项目":
      "Projects cannot share the same name. Renaming a project to an existing name merges all records into the target project and removes the renamed project.",
    "改变创建项目名称，以前所有记录的名称都会跟着改变":
      "When you rename a project, all existing records using that project name are updated as well.",
    "单击记录编辑，仅最后一次记录的删除可以回滚时间（可重复）。":
      "Tap a record to edit it. Only deleting the latest record can roll time back, and that can be repeated.",
    "其余的只能于统计页面的表格视图中双击编辑名称或删除，不可改变时间。":
      "All other records can only be renamed or deleted from the stats table view by double-clicking, and their time cannot be changed.",
    "换电脑或换手机，想完整恢复：用“导入数据”选择整包文件，再选“整包替换当前数据”。这样当前设备会完全变成导入源那份数据。（是将其中的数据导入到该软件的存储处，而不是使用导入的那份文件！）":
      "When switching to a new computer or phone and restoring everything, use Import Data, choose the full package, then choose Replace Current Data. This turns the current device into the imported dataset. The data is imported into the app's storage; the imported file itself is not used as the live storage file.",
    "如果当前机器里已经有数据，不确定会不会覆盖掉：先导出一份整包 ZIP 备份，再决定导入模式。":
      "If the current device already has data and you are not sure whether it will be overwritten, export a full ZIP backup first, then decide which import mode to use.",
    "记住一句话：整包替换会清掉未导入内容；差异导入不会。":
      "Remember this: full replacement removes content that is not imported; differential import does not.",
    "如果你在单分区导出里只看到“记录”，通常不是功能没做完，而是当前只有记录这个 section 产生了月分片；核心数据和重复计划一直都在整包 ZIP 里。":
      "If a partition export only shows Records, it usually does not mean the feature is incomplete. It means only the records section currently has monthly partitions; core data and recurring plans are always included in the full ZIP.",
    "场景 1：我换设备了，只想完整搬家。做法：先在旧设备导出整包 ZIP，再到新设备导入，并选择“整包替换当前数据”。":
      "Scenario 1: you are switching devices and want a full move. Export a full ZIP on the old device, import it on the new device, then choose Replace Current Data.",
    "场景 2：我现在这台机器里已经有数据，只想把另一份数据补进来。做法：用整包“差异导入（只替换有差异的单位）”。它不会删除未导入内容。":
      "Scenario 2: this device already has data, and you only want to merge in another dataset. Use Differential Import for the full package. It does not delete content that is not imported.",
    "场景 3：我只想补 2026-03 的记录。做法：导出或拿到那个 section 对应月份的单分区 JSON，再导入时选择“替换该月份分区”或“合并该月份分区”。":
      "Scenario 3: you only want to restore records for 2026-03. Export or obtain the single-partition JSON for that month and section, then choose Replace This Month's Partition or Merge This Month's Partition when importing.",
    "场景 4：我误拿到一份不完整的数据，担心把现有内容冲掉。做法：不要用整包替换，先导出一份备份，再用差异导入。":
      "Scenario 4: you received an incomplete dataset and are worried about overwriting current content. Do not use full replacement. Export a backup first, then use differential import.",
    "差异导入的逻辑是：核心区按字段替换；重复计划和月分片只处理导入源里出现的内容，并按 ID 或自然键逐条覆盖(每条记录都有一个专属id)；未命中的旧条目会保留。它不是按整天或整月整块替换。":
      "Differential import replaces core fields by field, and only processes recurring plans and monthly partitions that appear in the imported source. Entries are overwritten one by one by ID or natural key, while unmatched existing items are kept. It does not replace whole days or whole months in bulk.",
    "当前小组件类型暂未定义。": "The current widget type is not defined yet.",
    "打开应用创建新的待办事项。":
      "Open the app to create a new todo item.",
    "打开应用创建新的打卡项目。":
      "Open the app to create a new check-in item.",
    "打开原页补充数据后会自动同步到这里。":
      "Open the original view to add more data, and it will sync here automatically.",
    "打开原页查看完整周计划。":
      "Open the original view to see the full weekly plan.",
    "当前没有待处理的待办。": "There are no pending todos right now.",
    "待处理待办": "Pending Todos",
    "今日打卡": "Today's Check-ins",
    "今日项目占比": "Today's Project Share",
    "本月目标": "This Month's Goals",
    "今年年度目标": "This Year's Goals",
    "近 7 天时间分布": "Time Distribution Over the Last 7 Days",
    "打开": "Open",
    "查看计划": "View Plans",
    "随机色": "Random Color",
    "父级项目（仅二级和三级项目需要）":
      "Parent Project (required only for level 2 and 3 projects)",
    "父级项目（仅二级/三级项目）":
      "Parent Project (level 2/3 only)",
    "确定创建": "Create",
    "可手动挑色，也可直接点推荐色板":
      "You can choose a color manually or tap a suggested palette below.",
    "颜色仅用于统计图表；一级项目改色时，只会联动仍处于自动色模式的子级。":
      "Colors are only used in charts. When a level 1 project color changes, only child projects still using automatic colors will update with it.",
    "标准": "Standard",
    "明亮": "Bright",
    "柔和": "Soft",
    "冰川青": "Glacier Cyan",
    "茶金棕": "Tea Gold Brown",
    "琥珀砂": "Amber Sand",
    "莓果酒红": "Berry Wine",
    "靛夜蓝": "Indigo Night",
    "待办与打卡": "Todos and Check-ins",
    "待办与打卡会在你打开侧栏或首屏空闲后载入":
      "Todos and check-ins load after you open the sidebar or when the first screen becomes idle.",
    "点击卡片添加年度总目标": "Click a card to add the yearly goal",
    "年度总目标": "Yearly Goal",
    "例如：完成季度复盘": "For example: finish the quarterly review",
    "周时间表格": "Weekly Time Grid",
    "显示本周的时间分配情况": "Shows the time allocation for this week",
    "项目名称": "Project Name",
    "双击记录可编辑": "Double-click a record to edit it",
    "当前时间范围内暂无记录": "No records are available in the selected time range",
    "显示名称:": "Display Name:",
    "原始路径:": "Raw Path:",
    "存储路径信息已在浏览器控制台中显示。":
      "Storage path information has been printed to the browser console.",
    "要查看实际存储数据，请在浏览器中打开开发者工具(F12)，然后查看":
      "To inspect the actual stored data, open the browser developer tools (F12) and check",
  };
  const EXTRA_PATTERNS = [
    [/^摘要\s+(\d+)$/, (_, index) => `Summary ${index}`],
    [/^(\d{4}-\d{2}-\d{2})\s+日记$/, (_, dateText) => `Diary for ${dateText}`],
    [/^渲染失败：(.+)$/, (_, detail) => `Render failed: ${detail}`],
    [/^(.+)超时$/, (_, label) => `${translateLine(label).trim()} timed out`],
    [/^进行中：(.+)$/, (_, value) => `In progress: ${value}`],
    [/^今日累计：(.+)$/, (_, value) => `Today's total: ${translateLine(value).trim()}`],
    [/^今日日记：(.+)$/, (_, value) => `Today's diary: ${value}`],
    [/^今日记录：(\d+)\s*条$/, (_, count) => `Today's records: ${count}`],
    [/^今日总时长：(.+)$/, (_, value) => `Today's total: ${translateLine(value).trim()}`],
    [/^待办总数：(\d+)\s*项$/, (_, count) => `Total todos: ${count}`],
    [/^进行中：(\d+)\s*项$/, (_, count) => `In progress: ${count} items`],
    [/^打卡项目：(\d+)\s*项$/, (_, count) => `Check-ins: ${count}`],
    [/^今日已打卡：(\d+)\s*项$/, (_, count) => `Checked in today: ${count}`],
    [/^计划总数：(\d+)\s*项$/, (_, count) => `Plans: ${count}`],
    [/^当前已保存\s+(\d+)\s+个桌面小组件配置；关闭应用后可在下次启动时自动恢复。$/, (_, count) => `Saved ${count} desktop widget configurations. They can be restored the next time the app starts.`],
    [/^(.+)\s+小组件已创建，可直接拖动边缘调整尺寸。$/, (_, name) => `${name} widget created. Drag the edges to resize it.`],
    [/^创建\s+(.+)\s+小组件失败，请重试。$/, (_, name) => `Failed to create the ${name} widget. Please try again.`],
    [/^(.+)\s+的添加请求已发出，请在桌面确认放置。添加后长按即可调整组件大小。$/, (_, name) => `The request to add ${name} has been sent. Confirm placement on the home screen, then long-press it to resize.`],
    [/^当前系统不支持应用内直接固定\s+(.+?)。$/, (_, name) => `This device cannot pin ${name} from inside the app.`],
    [/^当前系统不支持应用内直接固定\s+(.+)，请长按桌面空白处\s*→\s*小组件\s*→\s*Order，手动添加该组件。$/, (_, name) => `This device cannot pin ${name} from inside the app. Long-press the home screen, open Widgets, then add the Order widget manually.`],
    [/^添加\s+(.+)\s+小组件失败，请重试。$/, (_, name) => `Failed to add the ${name} widget. Please try again.`],
    [/^今天的记录已存在，最近更新于\s+(.+?)。$/, (_, time) => `Today's entry already exists. Last updated at ${time}.`],
    [/^确定将项目“(.+)”的记录合并到现有项目“(.+)”吗？$/, (_, source, target) => `Merge records from "${source}" into the existing project "${target}"?`],
    [/^已将项目“(.+)”的\s*(\d+)\s*条记录合并到“(.+)”。$/, (_, source, count, target) => `Merged ${count} records from "${source}" into "${target}".`],
    [/^连击\s+(\d+)\s*天$/, (_, days) => `Streak: ${days} days`],
    [/^连续\s+(\d+)\s*天$/, (_, days) => `${days}-day streak`],
    [/^打卡时间\s+(.+)$/, (_, value) => `Checked in at ${value}`],
    [/^最近进度：(.+)$/, (_, value) => `Latest progress: ${value}`],
    [/^最近记录\s+(.+)$/, (_, value) => `Latest entry ${translateLine(value).trim()}`],
    [/^日期\s+(.+)$/, (_, value) => `Date ${translateLine(value).trim()}`],
    [/^日期：(.+)$/, (_, value) => `Date: ${translateLine(value).trim()}`],
    [/^截止\s+(.+)$/, (_, value) => `Due ${translateLine(value).trim()}`],
    [/^原定\s+(.+)$/, (_, value) => `Originally due ${translateLine(value).trim()}`],
    [/^开始：(.+)$/, (_, value) => `Start: ${translateLine(value).trim()}`],
    [/^结束：(.+)$/, (_, value) => `End: ${translateLine(value).trim()}`],
    [/^显示名称:\s*(.+)$/, (_, value) => `Display Name: ${value}`],
    [/^原始路径:\s*(.+)$/, (_, value) => `Raw Path: ${value}`],
    [/^存储模式：(.+)$/, (_, value) => `Storage Mode: ${value}`],
    [/^manifest：(.+)$/, (_, value) => `Manifest: ${value}`],
    [/^根目录：(.+)$/, (_, value) => `Root Directory: ${value}`],
    [/^说明：(.+)$/, (_, value) => `Note: ${translateLine(value).trim()}`],
    [/^原始 manifest 路径：(.+)$/, (_, value) => `Raw Manifest Path: ${value}`],
    [/^原始根目录：(.+)$/, (_, value) => `Raw Root Directory: ${value}`],
    [/^来源：(.+)$/, (_, value) => `Source: ${translateLine(value).trim()}`],
    [/^时间：(.+)$/, (_, value) => `Time: ${translateLine(value).trim()}`],
    [/^当前有\s+(\d+)\s+个按月分片$/, (_, count) => `${count} monthly partitions currently exist`],
    [/^当前状态：(.+)$/, (_, value) => `Current Status: ${translateLine(value).trim()}`],
    [/^备份周期：每\s+(.+)$/, (_, value) => `Backup Interval: every ${translateLine(value).trim()}`],
    [/^保留份数：(.+)$/, (_, value) => `Backups Kept: ${translateLine(value).trim()}`],
    [/^备份目录：(.+)$/, (_, value) => `Backup Directory: ${value}`],
    [/^目录类型：(.+)$/, (_, value) => `Directory Type: ${translateLine(value).trim()}`],
    [/^现有备份：(.+)\s+份$/, (_, value) => `Existing Backups: ${value}`],
    [/^最近备份：(.+)$/, (_, value) => `Latest Backup: ${translateLine(value).trim()}`],
    [/^最近尝试：(.+)$/, (_, value) => `Latest Attempt: ${translateLine(value).trim()}`],
    [/^最近结果：(.+)$/, (_, value) => `Latest Result: ${translateLine(value).trim()}`],
    [/^当前已保存\s+(\d+)\s+个桌面小组件配置；当前未开启自动启动或自动恢复。$/, (_, count) => `${count} desktop widget configurations are saved. Auto-start and auto-restore are currently disabled.`],
    [/^当前已保存\s+(\d+)\s+个桌面小组件配置；手动启动应用时会恢复这些小组件。如需系统登录时恢复，请同时开启“开机自启应用”。$/, (_, count) => `${count} desktop widget configurations are saved. They will be restored when you open the app manually. To restore them after system login, also enable "Launch the app at startup".`],
    [/^当前已保存\s+(\d+)\s+个桌面小组件配置；系统登录后会自动启动应用，但不会恢复小组件。如需自动恢复，请同时开启“启动时恢复已创建小组件”。$/, (_, count) => `${count} desktop widget configurations are saved. The app will launch after system login, but widgets will not be restored automatically. Also enable "Restore created widgets on launch" if you want that behavior.`],
    [/^当前已保存\s+(\d+)\s+个桌面小组件配置；系统登录后会自动启动应用并恢复这些小组件。$/, (_, count) => `${count} desktop widget configurations are saved. The app will launch after system login and restore these widgets automatically.`],
    [/^进度\s+(\d+)$/, (_, count) => `Progress ${count}`],
    [/^(\d+)\s*条$/, (_, count) => `${count} records`],
    [/^(\d+)\s*个目标$/, (_, count) => `${count} goals`],
    [/^(\d+)\s*个月$/, (_, count) => `${count} months`],
    [/^(\d+)-(\d+)点$/, (_, start, end) => `${String(start).padStart(2, "0")}:00-${String(end).padStart(2, "0")}:00`],
    [/^(.+?)\s+(\d+)\s*项$/, (_, label, count) => `${translateLine(label).trim()} ${count}`],
    [/^(.+?)\s+(\d+)\s*天$/, (_, label, count) => `${translateLine(label).trim()} ${count} days`],
    [/^(.+?)\s+(\d+)\s*小时$/, (_, label, count) => `${translateLine(label).trim()} ${count} h`],
    [/^(.+?)\s+(\d+)\s*分钟$/, (_, label, count) => `${translateLine(label).trim()} ${count} min`],
    [/^(\d+)\s*秒$/, (_, count) => `${count}s`],
    [/^(\d+)月$/, (_, month) => MONTH_NAMES[Number(month) - 1] || month],
    [/^(\d+)年$/, (_, year) => `${year}`],
    [
      /^(\d+)年(\d+)月 列表$/,
      (_, year, month) => `${MONTH_NAMES[Number(month) - 1] || month} ${year} List`,
    ],
    [
      /^(\d+)年(\d+)月$/,
      (_, year, month) => `${MONTH_NAMES[Number(month) - 1] || month} ${year}`,
    ],
    [/^共\s+(\d+)\s+篇$/, (_, count) => `${count} entries`],
    [/^共\s+(\d+)\s+篇匹配$/, (_, count) => `${count} matches`],
    [
      /^(\d+)年(\d+)月 暂无日记$/,
      (_, year, month) => `No diary entries for ${MONTH_NAMES[Number(month) - 1] || month} ${year}`,
    ],
    [/^没有找到包含“(.+)”的日记$/, (_, keyword) => `No diary entries contain "${keyword}"`],
    [/^(\d+)月(\d+)日$/, (_, month, day) => `${month}/${day}`],
    [
      /^(\d+)月(\d+)日\s+(周日|周一|周二|周三|周四|周五|周六)$/,
      (_, month, day, weekday) => `${month}/${day} ${WEEKDAY_NAMES[weekday] || weekday}`,
    ],
    [/^总时长[:：]\s*(.+)$/, (_, value) => `Total: ${translateLine(value).trim()}`],
    [/^已打卡[:：]\s*(.+)$/, (_, value) => `Checked in: ${value}`],
    [/^命中天数:\s*(\d+)$/, (_, count) => `Active days: ${count}`],
    [/^已打卡天数:\s*(\d+)$/, (_, count) => `Checked-in days: ${count}`],
    [/^时长：(.+)$/, (_, value) => `Duration: ${translateLine(value).trim()}`],
    [/^占整体：(.+)$/, (_, value) => `Share of total: ${value}`],
    [/^占上级：(.+)$/, (_, value) => `Share of parent: ${value}`],
    [/^≤\s*(\d+(?:\.\d+)?)\s*小时$/, (_, value) => `≤ ${value} h`],
    [/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*小时$/, (_, min, max) => `${min} - ${max} h`],
    [/^>\s*(\d+(?:\.\d+)?)\s*小时$/, (_, value) => `> ${value} h`],
    [
      /^(\d+)月(\d+)日\s*-\s*(\d+)月(\d+)日$/,
      (_, monthStart, dayStart, monthEnd, dayEnd) =>
        `${monthStart}/${dayStart} - ${monthEnd}/${dayEnd}`,
    ],
    [/^第(\d+)周$/, (_, index) => `Week ${index}`],
    [
      /^显示\s+(.+?)\s+至\s+(.+)$/,
      (_, start, end) =>
        `Showing ${translateLine(start).trim()} to ${translateLine(end).trim()}`,
    ],
    [
      /^显示\s+(.+?)\s+至\s+(.+?)\s+的时间分配情况（(\d+)天）$/,
      (_, start, end, days) =>
        `Showing time allocation from ${translateLine(start).trim()} to ${translateLine(end).trim()} (${days} days)`,
    ],
    [
      /^(\d+)月(\d+)日\s+(.+)$/,
      (_, month, day, weekday) =>
        `${month}/${day} ${WEEKDAY_NAMES[weekday] || translateLine(weekday).trim()}`,
    ],
  ];

  function getLanguage() {
    return (
      window.ControlerI18n?.getLanguage?.() ||
      localStorage.getItem("appLanguage") ||
      "zh-CN"
    );
  }

  function isEnglish() {
    return getLanguage() === "en-US";
  }

  function normalizeLanguage(value) {
    const normalized = String(value || "").trim();
    if (normalized === "en" || normalized === "en-US") {
      return "en-US";
    }
    return "zh-CN";
  }

  function readStoredLanguage() {
    try {
      return String(localStorage.getItem("appLanguage") || "").trim();
    } catch (error) {
      return "";
    }
  }

  let electronLanguageBridgeWrapped = false;
  let electronLanguageSyncStarted = false;

  function wrapElectronLanguageBridge() {
    if (electronLanguageBridgeWrapped || !window.ControlerI18n) {
      return;
    }
    const originalSetLanguage = window.ControlerI18n.setLanguage;
    if (typeof originalSetLanguage !== "function") {
      return;
    }

    window.ControlerI18n.setLanguage = (language, options = {}) => {
      const nextOptions =
        options && typeof options === "object" ? { ...options } : {};
      const result = originalSetLanguage(language, nextOptions);
      if (
        nextOptions.syncNative !== false &&
        typeof window.electronAPI?.uiSetLanguage === "function"
      ) {
        Promise.resolve(
          window.electronAPI.uiSetLanguage(normalizeLanguage(language)),
        ).catch((error) => {
          console.error("同步 Electron 界面语言失败:", error);
        });
      }
      return result;
    };

    electronLanguageBridgeWrapped = true;
  }

  async function syncElectronLanguagePreference() {
    if (
      electronLanguageSyncStarted ||
      typeof window.electronAPI?.uiGetLanguage !== "function" ||
      typeof window.ControlerI18n?.setLanguage !== "function"
    ) {
      return;
    }

    electronLanguageSyncStarted = true;
    try {
      const mainLanguage = normalizeLanguage(await window.electronAPI.uiGetLanguage());
      const storedLanguage = readStoredLanguage();
      const normalizedStoredLanguage = storedLanguage
        ? normalizeLanguage(storedLanguage)
        : "";
      const currentLanguage = normalizeLanguage(
        window.ControlerI18n.getLanguage?.() ||
          normalizedStoredLanguage ||
          mainLanguage,
      );

      if (
        normalizedStoredLanguage === "en-US" &&
        mainLanguage === "zh-CN"
      ) {
        await window.electronAPI.uiSetLanguage(normalizedStoredLanguage);
        if (currentLanguage !== normalizedStoredLanguage) {
          window.ControlerI18n.setLanguage(normalizedStoredLanguage, {
            persist: true,
            dispatch: true,
            syncNative: false,
          });
        }
        return;
      }

      if (currentLanguage !== mainLanguage) {
        window.ControlerI18n.setLanguage(mainLanguage, {
          persist: true,
          dispatch: true,
          syncNative: false,
        });
      }
    } catch (error) {
      console.error("读取 Electron 界面语言失败:", error);
    }
  }

  function translateLine(line) {
    if (typeof line !== "string" || !isEnglish() || !/[\u4e00-\u9fff]/.test(line)) {
      return line;
    }

    let translated = EXTRA_MAP[line] ?? line;
    EXTRA_PATTERNS.forEach(([pattern, formatter]) => {
      translated = translated.replace(pattern, formatter);
    });
    if (translated === line && typeof window.ControlerI18n?.translateText === "function") {
      translated = window.ControlerI18n.translateText(line);
    }
    return translated;
  }

  function translateTextBlock(text) {
    if (typeof text !== "string") return text;
    return text
      .split("\n")
      .map((segment) => {
        const leading = segment.match(/^\s*/)?.[0] || "";
        const trailing = segment.match(/\s*$/)?.[0] || "";
        const core = segment.trim();
        if (!core) return segment;
        return `${leading}${translateLine(core)}${trailing}`;
      })
      .join("\n");
  }

  function rememberAttribute(element, attributeName) {
    element.__controlerI18nExtraAttrs ??= {};
    const currentValue = element.getAttribute(attributeName);
    if (
      !(attributeName in element.__controlerI18nExtraAttrs) &&
      /[\u4e00-\u9fff]/.test(String(currentValue || ""))
    ) {
      element.__controlerI18nExtraAttrs[attributeName] =
        currentValue;
    }
    return element.__controlerI18nExtraAttrs[attributeName];
  }

  function isButtonLikeInput(element) {
    return (
      element instanceof HTMLInputElement &&
      ["button", "submit", "reset"].includes(
        String(element.type || "").toLowerCase(),
      )
    );
  }

  function applyElementTranslation(element) {
    if (!(element instanceof Element)) return;

    ["placeholder", "title", "aria-label"].forEach((attributeName) => {
      if (!element.hasAttribute(attributeName)) return;
      const originalValue = rememberAttribute(element, attributeName);
      if (originalValue == null) return;
      const nextValue = isEnglish() ? translateTextBlock(originalValue) : originalValue;
      if (element.getAttribute(attributeName) !== nextValue) {
        element.setAttribute(attributeName, nextValue);
      }
    });

    if (isButtonLikeInput(element) && element.hasAttribute("value")) {
      const originalValue = rememberAttribute(element, "value");
      if (originalValue == null) return;
      const nextValue = isEnglish() ? translateTextBlock(originalValue) : originalValue;
      if (element.value !== nextValue) {
        element.value = nextValue;
      }
      if (element.getAttribute("value") !== nextValue) {
        element.setAttribute("value", nextValue);
      }
    }
  }

  function shouldSkipTextNode(node) {
    const parent = node?.parentElement;
    return (
      !(parent instanceof Element) ||
      parent.tagName === "SCRIPT" ||
      parent.tagName === "STYLE" ||
      !!parent.closest("[data-i18n-skip='true']")
    );
  }

  function applyTextTranslation(node) {
    if (!(node instanceof Text) || shouldSkipTextNode(node)) return;
    if (
      node.__controlerI18nExtraText === undefined &&
      /[\u4e00-\u9fff]/.test(String(node.nodeValue || ""))
    ) {
      node.__controlerI18nExtraText = node.nodeValue;
    }
    const originalValue = node.__controlerI18nExtraText;
    if (originalValue === undefined) return;
    const nextValue = isEnglish()
      ? translateTextBlock(originalValue)
      : originalValue;
    if (node.nodeValue !== nextValue) {
      node.nodeValue = nextValue;
    }
  }

  function refreshEnhancedSelects(root = document) {
    root
      .querySelectorAll?.("select")
      ?.forEach((select) => select.__uiEnhancedSelectApi?.refresh?.());
  }

  function applyTranslations(root = document.documentElement) {
    if (!root) return;

    if (root instanceof Element) {
      applyElementTranslation(root);
    }

    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    );

    for (let current = walker.currentNode; current; current = walker.nextNode()) {
      if (current.nodeType === Node.TEXT_NODE) {
        applyTextTranslation(current);
      } else {
        applyElementTranslation(current);
      }
    }

    refreshEnhancedSelects(root instanceof Element ? root : document);
  }

  function handleMutations(mutations) {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          applyTextTranslation(node);
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          applyTranslations(node);
        }
      });
    });
  }

  function init() {
    if (window.ControlerI18n) {
      window.ControlerI18n.isEnglish = isEnglish;
      window.ControlerI18n.translateUiText = translateTextBlock;
    }
    wrapElectronLanguageBridge();
    applyTranslations();
    void syncElectronLanguagePreference();

    const observer = new MutationObserver(handleMutations);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    window.addEventListener(LANGUAGE_EVENT, () => {
      window.requestAnimationFrame(() => applyTranslations());
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
