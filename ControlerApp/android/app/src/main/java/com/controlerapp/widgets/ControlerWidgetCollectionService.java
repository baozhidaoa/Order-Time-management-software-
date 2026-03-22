package com.controlerapp.widgets;

import android.content.Context;
import android.content.Intent;
import android.text.TextUtils;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import com.controlerapp.R;

import java.util.ArrayList;
import java.util.List;

public final class ControlerWidgetCollectionService extends RemoteViewsService {
    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new Factory(getApplicationContext(), intent);
    }

    private static final class Factory implements RemoteViewsFactory {
        private final Context context;
        private final int appWidgetId;
        private final String kind;
        private final List<ControlerWidgetCollectionStore.RowData> rows = new ArrayList<>();

        Factory(Context context, Intent intent) {
            this.context = context == null ? null : context.getApplicationContext();
            this.appWidgetId =
                intent == null
                    ? 0
                    : intent.getIntExtra(
                        ControlerWidgetActionHandler.EXTRA_APP_WIDGET_ID,
                        0
                    );
            this.kind =
                intent == null
                    ? ""
                    : ControlerWidgetKinds.normalize(
                        intent.getStringExtra(ControlerWidgetActionHandler.EXTRA_WIDGET_KIND)
                    );
        }

        @Override
        public void onCreate() {
            onDataSetChanged();
        }

        @Override
        public void onDataSetChanged() {
            rows.clear();
            rows.addAll(
                ControlerWidgetCollectionStore.loadRows(context, appWidgetId, kind)
            );
        }

        @Override
        public void onDestroy() {
            rows.clear();
        }

        @Override
        public int getCount() {
            return rows.size();
        }

        @Override
        public RemoteViews getViewAt(int position) {
            if (position < 0 || position >= rows.size()) {
                return null;
            }

            ControlerWidgetCollectionStore.RowData row = rows.get(position);
            RemoteViews views = new RemoteViews(
                context.getPackageName(),
                R.layout.controler_widget_collection_item
            );
            views.setTextViewText(R.id.widget_collection_item_title, row.title);
            views.setTextViewText(R.id.widget_collection_item_meta, row.meta);
            views.setTextViewText(R.id.widget_collection_item_action, row.actionLabel);
            views.setTextColor(R.id.widget_collection_item_title, row.titleColor);
            views.setTextColor(R.id.widget_collection_item_meta, row.metaColor);
            views.setTextColor(R.id.widget_collection_item_action, row.actionTextColor);
            views.setViewVisibility(
                R.id.widget_collection_item_meta,
                row.meta == null || row.meta.trim().isEmpty() ? android.view.View.GONE : android.view.View.VISIBLE
            );
            views.setViewVisibility(
                R.id.widget_collection_item_action,
                row.actionLabel == null || row.actionLabel.trim().isEmpty()
                    ? android.view.View.GONE
                    : android.view.View.VISIBLE
            );
            views.setInt(
                R.id.widget_collection_item_accent,
                "setBackgroundColor",
                row.accentColor
            );

            Intent rowIntent = new Intent();
            rowIntent.putExtra(
                ControlerWidgetActionHandler.EXTRA_WIDGET_KIND,
                kind
            );
            rowIntent.putExtra(
                ControlerWidgetActionHandler.EXTRA_APP_WIDGET_ID,
                appWidgetId
            );
            if (row.openEnabled) {
                rowIntent.putExtra(
                    ControlerWidgetLaunchStore.EXTRA_PAGE,
                    TextUtils.isEmpty(row.page) ? ControlerWidgetKinds.defaultPage(kind) : row.page
                );
                rowIntent.putExtra(
                    ControlerWidgetLaunchStore.EXTRA_ACTION,
                    TextUtils.isEmpty(row.action) ? ControlerWidgetKinds.defaultAction(kind) : row.action
                );
                rowIntent.putExtra(ControlerWidgetLaunchStore.EXTRA_KIND, kind);
                rowIntent.putExtra(
                    ControlerWidgetLaunchStore.EXTRA_TARGET_ID,
                    row.targetId == null ? "" : row.targetId
                );
            } else {
                rowIntent.putExtra(
                    ControlerWidgetActionHandler.EXTRA_COMMAND,
                    ControlerWidgetActionHandler.COMMAND_NO_OP
                );
            }
            views.setOnClickFillInIntent(R.id.widget_collection_item_root, rowIntent);

            if (row.actionEnabled) {
                Intent actionIntent = new Intent();
                actionIntent.putExtra(
                    ControlerWidgetActionHandler.EXTRA_WIDGET_KIND,
                    kind
                );
                actionIntent.putExtra(
                    ControlerWidgetActionHandler.EXTRA_APP_WIDGET_ID,
                    appWidgetId
                );
                actionIntent.putExtra(
                    ControlerWidgetLaunchStore.EXTRA_PAGE,
                    TextUtils.isEmpty(row.page) ? ControlerWidgetKinds.defaultPage(kind) : row.page
                );
                actionIntent.putExtra(
                    ControlerWidgetLaunchStore.EXTRA_ACTION,
                    TextUtils.isEmpty(row.action) ? ControlerWidgetKinds.defaultAction(kind) : row.action
                );
                actionIntent.putExtra(ControlerWidgetLaunchStore.EXTRA_KIND, kind);
                actionIntent.putExtra(
                    ControlerWidgetLaunchStore.EXTRA_TARGET_ID,
                    row.targetId == null ? "" : row.targetId
                );
                if (!TextUtils.isEmpty(row.command)) {
                    actionIntent.putExtra(ControlerWidgetActionHandler.EXTRA_COMMAND, row.command);
                    actionIntent.putExtra(
                        ControlerWidgetActionHandler.EXTRA_TARGET_ID,
                        row.targetId == null ? "" : row.targetId
                    );
                }
                views.setOnClickFillInIntent(R.id.widget_collection_item_action, actionIntent);
            }
            return views;
        }

        @Override
        public RemoteViews getLoadingView() {
            return null;
        }

        @Override
        public int getViewTypeCount() {
            return 1;
        }

        @Override
        public long getItemId(int position) {
            if (position < 0 || position >= rows.size()) {
                return position;
            }
            ControlerWidgetCollectionStore.RowData row = rows.get(position);
            return (row.targetId + "|" + row.title + "|" + position).hashCode();
        }

        @Override
        public boolean hasStableIds() {
            return true;
        }
    }
}
