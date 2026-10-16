package io.github.harveyxiacn.prtracker;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Home-screen widget. It only displays a small, already-localised snapshot that the app writes
 * through PrTrackerNativePlugin.setWidgetSnapshot. No network and no background work.
 */
public class PrTrackerWidget extends AppWidgetProvider {

    static final String PREFS = "prtracker_widget";
    static final String KEY_SNAPSHOT = "snapshot";
    static final int MAX_LINES = 3;

    private static final int[] ROW_IDS = {R.id.widget_row1, R.id.widget_row2, R.id.widget_row3};
    private static final int[] LABEL_IDS = {R.id.widget_label1, R.id.widget_label2, R.id.widget_label3};
    private static final int[] VALUE_IDS = {R.id.widget_value1, R.id.widget_value2, R.id.widget_value3};

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        updateWidgets(context, appWidgetManager, appWidgetIds);
    }

    static void saveSnapshot(Context context, String json) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        prefs.edit().putString(KEY_SNAPSHOT, json).apply();
    }

    /** Redraws every placed instance of the widget. */
    static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        if (manager == null) {
            return;
        }
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, PrTrackerWidget.class));
        if (ids != null && ids.length > 0) {
            updateWidgets(context, manager, ids);
        }
    }

    private static void updateWidgets(Context context, AppWidgetManager manager, int[] ids) {
        RemoteViews views = buildViews(context);
        for (int id : ids) {
            manager.updateAppWidget(id, views);
        }
    }

    private static RemoteViews buildViews(Context context) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.prtracker_widget);

        Intent intent = new Intent(context, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pending = PendingIntent.getActivity(
                context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_root, pending);

        String raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_SNAPSHOT, null);
        int shown = 0;
        if (raw != null) {
            try {
                JSONObject snapshot = new JSONObject(raw);
                String title = snapshot.optString("title", "");
                if (title.length() > 0) {
                    views.setTextViewText(R.id.widget_title, title);
                }
                JSONArray lines = snapshot.optJSONArray("lines");
                if (lines != null) {
                    for (int i = 0; i < lines.length() && shown < MAX_LINES; i++) {
                        JSONObject line = lines.optJSONObject(i);
                        if (line == null) {
                            continue;
                        }
                        views.setTextViewText(LABEL_IDS[shown], line.optString("label", ""));
                        views.setTextViewText(VALUE_IDS[shown], line.optString("value", ""));
                        views.setTextColor(VALUE_IDS[shown], toneColor(context, line.optString("tone", "")));
                        views.setViewVisibility(ROW_IDS[shown], View.VISIBLE);
                        shown++;
                    }
                }
            } catch (JSONException e) {
                shown = 0;
            }
        }
        for (int i = shown; i < MAX_LINES; i++) {
            views.setViewVisibility(ROW_IDS[i], View.GONE);
        }
        views.setViewVisibility(R.id.widget_empty, shown == 0 ? View.VISIBLE : View.GONE);
        return views;
    }

    private static int toneColor(Context context, String tone) {
        int res;
        if ("good".equals(tone)) {
            res = R.color.prtracker_widget_good;
        } else if ("warn".equals(tone)) {
            res = R.color.prtracker_widget_warn;
        } else if ("critical".equals(tone)) {
            res = R.color.prtracker_widget_critical;
        } else {
            res = R.color.prtracker_widget_text;
        }
        return context.getColor(res);
    }
}
