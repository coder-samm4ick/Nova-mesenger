// Определение того, что клиент запущен внутри нативной оболочки
// (Electron на ПК или Capacitor на Android), а не как обычный сайт.
//
// Оболочки помечают себя: Electron прокидывает window.__NOVA_DESKTOP__,
// Capacitor — объект window.Capacitor с методом isNativePlatform().

type NovaWindow = Window & {
  __NOVA_DESKTOP__?: boolean;
  Capacitor?: {
    isNativePlatform?: () => boolean;
    getPlatform?: () => string;
  };
};

/** Запущено ли приложение в нативной оболочке (ПК или мобильной). */
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const win = window as NovaWindow;
  if (win.__NOVA_DESKTOP__ === true) return true;
  try {
    return win.Capacitor?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

/** Запущено ли на мобильном устройстве (Android/iOS в Capacitor). */
export function isMobileApp(): boolean {
  if (typeof window === "undefined") return false;
  const win = window as NovaWindow;
  try {
    return win.Capacitor?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}
