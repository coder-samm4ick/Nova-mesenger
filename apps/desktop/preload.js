// Preload: прокидываем в веб-клиент адрес сервера Nova и признак того,
// что интерфейс открыт в настольном приложении (см. apps/landing/lib/shell.ts).
const { contextBridge } = require("electron");

const serverUrl = process.env.NOVA_SERVER_URL || "http://localhost:8081";

contextBridge.exposeInMainWorld("__NOVA_API__", serverUrl);
contextBridge.exposeInMainWorld("__NOVA_DESKTOP__", true);
