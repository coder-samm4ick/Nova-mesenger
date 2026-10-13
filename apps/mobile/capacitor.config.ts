import type { CapacitorConfig } from "@capacitor/cli";

// Обёртка веб-клиента Nova для Android.
//
// Внутрь APK попадает статический экспорт клиента (apps/landing/out → www),
// поэтому приложение работает без интернета для интерфейса, а к серверу
// подключается по адресу из настроек («Сервер подключения») или
// переменной окружения NOVA_API_URL на момент сборки.

const config: CapacitorConfig = {
  appId: "chat.nova.app",
  appName: "Nova",
  webDir: "www",
  // Тёмный фон оболочки — чтобы при запуске не мигал белый экран.
  backgroundColor: "#05070f",
  server: {
    // Схема WebView — http, чтобы без проблем обращаться к http-бэкенду
    // (иначе https-страница блокирует ws:// и http:// как mixed content).
    androidScheme: "http",
  },
  android: {
    // Разрешаем обращаться к http-серверу (например, localhost/LAN при разработке).
    allowMixedContent: true,
    backgroundColor: "#05070f",
  },
};

export default config;
