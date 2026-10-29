package io.github.harveyxiacn.prtracker;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local plugins must be registered before the bridge is created in super.onCreate.
        registerPlugin(PrTrackerNativePlugin.class);
        registerPlugin(AppUpdaterPlugin.class);
        super.onCreate(savedInstanceState);
        // Re-apply the privacy screen before the web app has loaded, so the first frames and
        // the recents thumbnail are already protected after a cold start.
        PrTrackerNativePlugin.applyStoredSecureFlag(this);
    }
}
