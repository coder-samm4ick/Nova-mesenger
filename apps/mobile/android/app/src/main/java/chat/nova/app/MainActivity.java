package chat.nova.app;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final int NOVA_BACKGROUND = Color.parseColor("#05070F");

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Фон окна и WebView в тон интерфейса — без белой вспышки при запуске.
        getWindow().getDecorView().setBackgroundColor(NOVA_BACKGROUND);

        WebView webView = getBridge().getWebView();
        if (webView != null) {
            webView.setBackgroundColor(NOVA_BACKGROUND);
            // Убираем «резиновый» синий отблеск при прокрутке до края.
            webView.setOverScrollMode(View.OVER_SCROLL_NEVER);

            WebSettings settings = webView.getSettings();
            // Интерфейс ведёт себя как приложение, а не как сайт:
            // без масштабирования «щипком» и по двойному тапу.
            settings.setSupportZoom(false);
            settings.setBuiltInZoomControls(false);
            settings.setDisplayZoomControls(false);
        }
    }

    @Override
    public void onBackPressed() {
        // Системная кнопка «Назад»: сначала внутри WebView (закрыть открытый
        // чат, окна и т.п.), и только потом — выход из приложения.
        WebView webView = getBridge().getWebView();
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        super.onBackPressed();
    }
}
