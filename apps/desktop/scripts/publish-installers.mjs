// Кладёт собранные установщики в раздачу сайта (apps/landing/public/downloads),
// чтобы кнопка «Скачать» вела на свежую сборку.

import { existsSync } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, "..", "dist");
const downloads = resolve(here, "..", "..", "landing", "public", "downloads");

await mkdir(downloads, { recursive: true });

const artifacts = ["nova-setup-x64.exe", "nova-portable.exe"];

for (const name of artifacts) {
  const source = resolve(dist, name);
  if (!existsSync(source)) {
    console.warn("Пропущено (нет файла): " + name);
    continue;
  }
  await copyFile(source, resolve(downloads, name));
  console.log("Опубликовано на сайте: " + name);
}
