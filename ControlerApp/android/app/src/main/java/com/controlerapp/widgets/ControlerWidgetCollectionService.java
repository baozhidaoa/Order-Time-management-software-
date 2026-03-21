package com.controlerapp.widgets;

import android.content.Context;
import android.content.Intent;
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
            views.setTextColor(R.id.widget_collection_item_title, row.titleColor);
            views.setTextColor(R.id.widget_collection_item_meta, row.metaColor);
            views.setViewVisibility(
                R.id.widget_collection_item_meta,
                row.meta == null || row.meta.trim().isEmpty() ? android.view.View.GONE : android.view.View.VISIBLE
            );
            views.setInt(
                R.id.widget_collection_item_accent,
                "setBackgroundColor",
                row.accentColor
            );

            Intent fillInIntent = new Intent();
            fillInIntent.putExtra(
                ControlerWidgetLaunchStore.EXTRA_PAGE,
                ControlerWidgetKinds.defaultPage(kind)
            );
            fillInIntent.putExtra(
                ControlerWidgetLaunchStore.EXTRA_ACTION,
                ControlerWidgetKinds.defaultAction(kind)
            );
            fillInIntent.putExtra(ControlerWidgetLaunchStore.EXTRA_KIND, kind);
            fillInIntent.putExtra(
                ControlerWidgetLaunchStore.EXTRA_TARGET_ID,
                row.targetId == null ? "" : row.targetId
            );
            views.setOnClickFillInIntent(R.id.widget_collection_item_root, fillInIntent);
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
