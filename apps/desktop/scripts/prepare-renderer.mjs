// Копирует статическую сборку веб-клиента (apps/landing/out) в
// apps/desktop/renderer, откуда её отдаёт Electron.

import { access, cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, "..", "..", "landing", "out");
const target = resolve(here, "..", "renderer");

try {
  await access(source);
} catch {
  console.error("Не найдена сборка веб-клиента: " + source);
  console.error("Сначала выполни: npm run build:landing");
  process.exit(1);
}

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(source, target, {
  recursive: true,
  // Инсталляторы из public/downloads десктопу не нужны — не раздуваем сборку.
  filter: (src) => !src.replace(/\\/g, "/").includes("/downloads"),
});

console.log("Веб-клиент скопирован в apps/desktop/renderer");
