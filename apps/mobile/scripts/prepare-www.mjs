// Готовит папку www для Capacitor из статического экспорта веб-клиента.
//
// Запускается перед `cap sync`. Тяжёлые инсталляторы (public/downloads)
// в приложение не попадают.

import {
  cpSync,
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const landingOut = join(appDir, "..", "landing", "out");
const wwwDir = join(appDir, "www");

if (!existsSync(landingOut)) {
  console.error("Не найден статический экспорт клиента:", landingOut);
  console.error("Сначала собери клиент: npm run build:landing");
  process.exit(1);
}

rmSync(wwwDir, { recursive: true, force: true });
cpSync(landingOut, wwwDir, {
  recursive: true,
  filter: (src) => !src.replace(/\\/g, "/").includes("/downloads"),
});

// Необязательно: вшиваем адрес сервера по умолчанию (NOVA_API_URL=... npm run sync).
const apiUrl = process.env.NOVA_API_URL?.trim();
if (apiUrl) {
  const htmlFiles = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".html")) htmlFiles.push(full);
    }
  })(wwwDir);

  const snippet = `<script>window.__NOVA_API__=${JSON.stringify(apiUrl)};</script>`;
  for (const file of htmlFiles) {
    const html = readFileSync(file, "utf8");
    if (html.includes("__NOVA_API__")) continue;
    writeFileSync(file, html.replace(/<head>/i, `<head>${snippet}`));
  }
}

// Мобильное приложение — это мессенджер, поэтому корневой страницей делаем
// интерфейс чата. Capacitor не отдаёт отдельные URL вида /web/ (WebViewLocalServer
// для корня отдаёт только index.html), поэтому кладём страницу чата в корень.
// Ассеты с расширением (/_next/...) при этом грузятся как обычно.
const chatIndex = join(wwwDir, "web", "index.html");
if (!existsSync(chatIndex)) {
  console.error("Не найден интерфейс чата:", chatIndex);
  process.exit(1);
}
cpSync(chatIndex, join(wwwDir, "index.html"));

console.log(
  `www готов: ${wwwDir}${apiUrl ? ` (API по умолчанию: ${apiUrl})` : ""}`,
);
