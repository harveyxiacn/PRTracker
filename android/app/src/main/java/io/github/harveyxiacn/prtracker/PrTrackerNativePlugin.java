package io.github.harveyxiacn.prtracker;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.view.Window;
import android.view.WindowManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Small local plugin for the Android-only features: the home-screen widget snapshot and the
 * privacy screen (FLAG_SECURE). Nothing here touches the network.
 */
@CapacitorPlugin(name = "PrTrackerNative")
public class PrTrackerNativePlugin extends Plugin {

    static final String NATIVE_PREFS = "prtracker_native";
    static final String KEY_SECURE = "secure";

    @PluginMethod
    public void setWidgetSnapshot(PluginCall call) {
        String json = call.getString("json");
        if (json == null) {
            call.reject("json is required");
            return;
        }
        Context context = getContext();
        PrTrackerWidget.saveSnapshot(context, json);
        PrTrackerWidget.updateAll(context);
        call.resolve();
    }

    @PluginMethod
    public void setSecure(final PluginCall call) {
        Boolean value = call.getBoolean("enabled", Boolean.FALSE);
        final boolean enabled = value != null && value.booleanValue();
        final Activity activity = getActivity();
        if (activity == null) {
            call.reject("No activity");
            return;
        }
        SharedPreferences prefs = activity.getSharedPreferences(NATIVE_PREFS, Context.MODE_PRIVATE);
        prefs.edit().putBoolean(KEY_SECURE, enabled).apply();
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                applySecureFlag(activity, enabled);
                call.resolve();
            }
        });
    }

    @PluginMethod
    public void isSupported(PluginCall call) {
        JSObject result = new JSObject();
        result.put("widget", true);
        result.put("secure", true);
        call.resolve(result);
    }

    /** Called from MainActivity.onCreate (UI thread) to restore the last choice. */
    static void applyStoredSecureFlag(Activity activity) {
        SharedPreferences prefs = activity.getSharedPreferences(NATIVE_PREFS, Context.MODE_PRIVATE);
        if (prefs.getBoolean(KEY_SECURE, false)) {
            applySecureFlag(activity, true);
        }
    }

    static void applySecureFlag(Activity activity, boolean enabled) {
        Window window = activity.getWindow();
        if (window == null) {
            return;
        }
        if (enabled) {
            window.addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        } else {
            window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
        }
    }
}
