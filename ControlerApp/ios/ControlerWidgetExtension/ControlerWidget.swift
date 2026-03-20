import WidgetKit
import SwiftUI

private let widgetAppGroupIdentifier = "group.com.controlerapp.shared"
private let widgetSnapshotFileName = "widget-snapshot.json"

private struct WidgetSnapshotFile: Decodable {
  let generatedAt: String?
  let widgets: [String: WidgetSnapshotItem]
}

private struct WidgetSnapshotItem: Decodable {
  let kind: String?
  let title: String?
  let subtitle: String?
  let summary: String?
  let page: String?
  let action: String?
  let launchURL: String?
}

private struct WidgetMetadata {
  let kind: String
  let title: String
  let subtitle: String
  let page: String
  let action: String
  let description: String

  static let startTimer = WidgetMetadata(
    kind: "start-timer",
    title: "开始计时",
    subtitle: "打开记录页开始或结束计时",
    page: "index",
    action: "start-timer",
    description: "显示开始计时入口。"
  )
  static let writeDiary = WidgetMetadata(
    kind: "write-diary",
    title: "写日记",
    subtitle: "打开记录页继续今天的日记",
    page: "diary",
    action: "new-diary",
    description: "显示写日记入口。"
  )
  static let weekGrid = WidgetMetadata(
    kind: "week-grid",
    title: "一周表格视图",
    subtitle: "查看近 7 天时段分布",
    page: "stats",
    action: "show-week-grid",
    description: "查看近一周时段分布。"
  )
  static let dayPie = WidgetMetadata(
    kind: "day-pie",
    title: "一天的饼状图",
    subtitle: "查看今天的项目时间占比",
    page: "stats",
    action: "show-day-pie",
    description: "查看今天的项目时间占比。"
  )
  static let todos = WidgetMetadata(
    kind: "todos",
    title: "待办事项",
    subtitle: "查看今天的待办列表",
    page: "todo",
    action: "show-todos",
    description: "查看待办列表。"
  )
  static let checkins = WidgetMetadata(
    kind: "checkins",
    title: "打卡列表",
    subtitle: "查看今天的打卡项",
    page: "todo",
    action: "show-checkins",
    description: "查看打卡列表。"
  )
  static let weekView = WidgetMetadata(
    kind: "week-view",
    title: "周视图",
    subtitle: "查看未来一周计划",
    page: "plan",
    action: "show-week-view",
    description: "查看未来 7 天计划。"
  )
  static let yearView = WidgetMetadata(
    kind: "year-view",
    title: "年视图",
    subtitle: "查看全年目标摘要",
    page: "plan",
    action: "show-year-view",
    description: "查看全年目标摘要。"
  )
}

private struct ControlerWidgetContent {
  let title: String
  let subtitle: String
  let summary: String
  let launchURL: URL
}

private struct ControlerWidgetEntry: TimelineEntry {
  let date: Date
  let metadata: WidgetMetadata
  let content: ControlerWidgetContent
}

private enum WidgetSnapshotStore {
  static func content(for metadata: WidgetMetadata) -> ControlerWidgetContent {
    guard
      let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: widgetAppGroupIdentifier),
      let data = try? Data(contentsOf: containerURL.appendingPathComponent(widgetSnapshotFileName)),
      let snapshot = try? JSONDecoder().decode(WidgetSnapshotFile.self, from: data),
      let item = snapshot.widgets[metadata.kind]
    else {
      return fallbackContent(for: metadata)
    }

    let launchURL = URL(string: item.launchURL ?? "") ?? fallbackLaunchURL(for: metadata)
    return ControlerWidgetContent(
      title: item.title ?? metadata.title,
      subtitle: item.subtitle ?? metadata.subtitle,
      summary: item.summary ?? "打开应用查看详情",
      launchURL: launchURL
    )
  }

  static func fallbackContent(for metadata: WidgetMetadata) -> ControlerWidgetContent {
    ControlerWidgetContent(
      title: metadata.title,
      subtitle: metadata.subtitle,
      summary: "打开应用查看详情",
      launchURL: fallbackLaunchURL(for: metadata)
    )
  }

  private static func fallbackLaunchURL(for metadata: WidgetMetadata) -> URL {
    var components = URLComponents()
    components.scheme = "controlerapp"
    components.host = "launch"
    components.queryItems = [
      URLQueryItem(name: "page", value: metadata.page),
      URLQueryItem(name: "action", value: metadata.action),
      URLQueryItem(name: "source", value: "ios-widget"),
      URLQueryItem(name: "kind", value: metadata.kind),
    ]
    return components.url ?? URL(string: "controlerapp://launch")!
  }
}

private struct ControlerWidgetProvider: TimelineProvider {
  let metadata: WidgetMetadata

  func placeholder(in context: Context) -> ControlerWidgetEntry {
    ControlerWidgetEntry(
      date: Date(),
      metadata: metadata,
      content: WidgetSnapshotStore.fallbackContent(for: metadata)
    )
  }

  func getSnapshot(in context: Context, completion: @escaping (ControlerWidgetEntry) -> Void) {
    completion(
      ControlerWidgetEntry(
        date: Date(),
        metadata: metadata,
        content: WidgetSnapshotStore.content(for: metadata)
      )
    )
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<ControlerWidgetEntry>) -> Void) {
    let entry = ControlerWidgetEntry(
      date: Date(),
      metadata: metadata,
      content: WidgetSnapshotStore.content(for: metadata)
    )
    let refreshDate = Calendar.current.date(byAdding: .minute, value: 15, to: Date()) ?? Date().addingTimeInterval(900)
    completion(Timeline(entries: [entry], policy: .after(refreshDate)))
  }
}

private struct ControlerWidgetView: View {
  let entry: ControlerWidgetEntry

  var body: some View {
    Link(destination: entry.content.launchURL) {
      ZStack(alignment: .topLeading) {
        LinearGradient(
          colors: [
            Color(red: 0.13, green: 0.20, blue: 0.34),
            Color(red: 0.08, green: 0.47, blue: 0.58),
          ],
          startPoint: .topLeading,
          endPoint: .bottomTrailing
        )

        VStack(alignment: .leading, spacing: 8) {
          Text(entry.content.title)
            .font(.system(size: 17, weight: .semibold, design: .rounded))
            .foregroundColor(.white)
            .lineLimit(2)
          Text(entry.content.subtitle)
            .font(.system(size: 12, weight: .medium, design: .rounded))
            .foregroundColor(.white.opacity(0.82))
            .lineLimit(2)
          Spacer(minLength: 0)
          Text(entry.content.summary)
            .font(.system(size: 13, weight: .semibold, design: .rounded))
            .foregroundColor(.white)
            .lineLimit(2)
          HStack {
            Text("Order")
              .font(.system(size: 11, weight: .bold, design: .rounded))
              .foregroundColor(.white.opacity(0.92))
            Spacer()
            Image(systemName: "arrow.up.forward.app.fill")
              .font(.system(size: 12, weight: .bold))
              .foregroundColor(.white.opacity(0.92))
          }
        }
        .padding(16)
      }
      .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
  }
}

struct ControlerKindWidget: Widget {
  let metadata: WidgetMetadata

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: metadata.kind, provider: ControlerWidgetProvider(metadata: metadata)) { entry in
      ControlerWidgetView(entry: entry)
    }
    .configurationDisplayName(metadata.title)
    .description(metadata.description)
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}
