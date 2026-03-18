import WidgetKit
import SwiftUI

@main
struct ControlerWidgetsBundle: WidgetBundle {
  var body: some Widget {
    ControlerKindWidget(metadata: .startTimer)
    ControlerKindWidget(metadata: .writeDiary)
    ControlerKindWidget(metadata: .weekGrid)
    ControlerKindWidget(metadata: .dayPie)
    ControlerKindWidget(metadata: .todos)
    ControlerKindWidget(metadata: .checkins)
    ControlerKindWidget(metadata: .weekView)
    ControlerKindWidget(metadata: .yearView)
  }
}
