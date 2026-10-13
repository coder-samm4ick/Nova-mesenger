// Точка входа десктоп-клиента Nova (Electron).
//
// Приложение поднимает локальный статический сервер с веб-клиентом
// (папка renderer) и открывает его в обычном окне — без меню,
// адресной строки и прочей «браузерной» обвязки. Сообщения идут на
// сервер Nova, адрес которого берётся из NOVA_SERVER_URL
// (по умолчанию localhost:8081).

const fs = require("node:fs");
const path = require("node:path");
const { app, BrowserWindow, Menu, shell } = require("electron");

const { startStaticServer } = require("./static-server.js");

const SERVER_URL = process.env.NOVA_SERVER_URL ||
  (app.isPackaged ? "https://nova-mesenger.onrender.com" : "http://localhost:8081");
const ICON_PATH = path.join(__dirname, "icon.png");

let mainWindow = null;
let staticServer = null;

/* ------------------------- сохранение размера окна ------------------------- */

function stateFile() {
  return path.join(app.getPath("userData"), "window-state.json");
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile(), "utf8"));
  } catch {
    return null;
  }
}

function saveState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const { width, height, x, y } = mainWindow.getBounds();
  try {
    fs.writeFileSync(
      stateFile(),
      JSON.stringify({ width, height, x, y, maximized: mainWindow.isMaximized() }),
    );
  } catch {
    /* настройки окна не критичны */
  }
}

/* ---------------------------------- окно ---------------------------------- */

async function createWindow() {
  staticServer = await startStaticServer(path.join(__dirname, "renderer"));

  const saved = loadState();

  mainWindow = new BrowserWindow({
    width: saved?.width ?? 1180,
    height: saved?.height ?? 780,
    x: saved?.x,
    y: saved?.y,
    minWidth: 860,
    minHeight: 600,
    backgroundColor: "#05070f",
    title: "Nova",
    icon: fs.existsSync(ICON_PATH) ? ICON_PATH : undefined,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      navigateOnDragDrop: false,
    },
  });

  if (saved?.maximized) mainWindow.maximize();

  // Меню приложения не нужно — окно выглядит как отдельное приложение.
  if (process.platform !== "darwin") Menu.setApplicationMenu(null);
  mainWindow.setMenuBarVisibility(false);

  // Отключаем масштабирование страницы (Ctrl +/− и жест «щипок»).
  mainWindow.webContents.setVisualZoomLevelLimits(1, 1);

  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.loadURL(`${staticServer.url}/web/`);

  // Внешние ссылки открываем в системном браузере, а окно приложения
  // не даём «увести» на чужой адрес.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith(staticServer.url)) return;
    event.preventDefault();
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
    }
  });

  // В собранном приложении прячем браузерные горячие клавиши
  // (обновление, DevTools, печать, «просмотр кода»).
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (!app.isPackaged || input.type !== "keyDown") return;
    const key = (input.key || "").toLowerCase();
    const mod = input.control || input.meta;
    const blocked =
      (mod && ["r", "p", "u"].includes(key)) ||
      key === "f5" ||
      key === "f7" ||
      key === "f12" ||
      (mod && input.shift && ["i", "j", "c"].includes(key));
    if (blocked) event.preventDefault();
  });

  for (const evt of ["resize", "move", "close"]) {
    mainWindow.on(evt, saveState);
  }
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

/* ----------------------------- запуск приложения ---------------------------- */

// Один экземпляр: повторный запуск поднимает уже открытое окно.
const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    app.setAppUserModelId("chat.nova.desktop");
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  staticServer?.close();
});

// Сообщаем рендереру адрес сервера (см. apps/landing/lib/api.ts).
process.env.NOVA_SERVER_URL = SERVER_URL;
