package com.donghaihui.robothand;

import android.content.Context;
import android.net.wifi.WifiManager;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private WifiManager.MulticastLock multicastLock;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LocalLlmPlugin.class);
        registerPlugin(MdnsResolverPlugin.class);
        super.onCreate(savedInstanceState);

        WifiManager wifiManager = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        if (wifiManager != null) {
            multicastLock = wifiManager.createMulticastLock("robot-hand-mdns");
            multicastLock.setReferenceCounted(false);
            multicastLock.acquire();
        }

        WebView webView = getBridge().getWebView();
        WebSettings settings = webView.getSettings();
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        WebView.setWebContentsDebuggingEnabled(true);
    }

    @Override
    public void onDestroy() {
        if (multicastLock != null && multicastLock.isHeld()) {
            multicastLock.release();
        }
        super.onDestroy();
    }
}
