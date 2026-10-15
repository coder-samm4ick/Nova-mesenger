// Сборка сайта для статического хостинга (Cloudflare Pages и др.).
//
// Отличие от обычного `next build`: если задан внешний адрес файлов сборок
// (NEXT_PUBLIC_DOWNLOADS_BASE), локальная папка out/downloads удаляется —
// инсталляторы весят больше лимита Cloudflare Pages (25 МБ на файл).

// Сборка для GitHub Pages: сайт живёт в подкаталоге /Nova-mesenger/, поэтому
// все ссылки на чанки и маршруты должны нести этот префикс (иначе Pages отдаёт
// 404 и клиент висит на «Загружаем Nova…»). Десктоп/мобильные сборки идут мимо
// этого скрипта и получают пути от корня. Переопределить: NOVA_BASE_PATH="".

if (process.env.NOVA_BASE_PATH === undefined) {
  process.env.NOVA_BASE_PATH = "/Nova-mesenger";
}

import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const nextBin = createRequire(import.meta.url).resolve("next/dist/bin/next");

execFileSync(process.execPath, [nextBin, "build"], {
  cwd: appDir,
  stdio: "inherit",
});

const externalBase = process.env.NEXT_PUBLIC_DOWNLOADS_BASE?.trim();
if (externalBase) {
  rmSync(join(appDir, "out", "downloads"), { recursive: true, force: true });
  console.log(
    `\nЛокальные файлы out/downloads удалены: сборки отдаются с ${externalBase}`,
  );
}

// Переписываем корневые ссылки под подкаталог хостинга (GitHub Pages).
execFileSync(process.execPath, [join(appDir, "scripts", "fix-pages-paths.mjs")], {
  cwd: appDir,
  stdio: "inherit",
});
