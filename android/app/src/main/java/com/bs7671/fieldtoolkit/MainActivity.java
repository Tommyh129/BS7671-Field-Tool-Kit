package com.bs7671.fieldtoolkit;

import android.os.Bundle;

import com.scgscorp.capacitorpluginpurchase.InAppPurchasePlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Register billing before Capacitor creates the bridge. This keeps the plugin
        // available even if generated plugin auto-discovery fails in a release build.
        registerPlugin(InAppPurchasePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
