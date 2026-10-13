// Сборка десктоп-приложения Nova.
//
// 1. Копирует статический веб-клиент в renderer.
// 2. Включает подпись, если найден сертификат (certs/nova-selfsigned.pfx).
// 3. Запускает electron-builder (Windows: nsis + portable).
// 4. Публикует готовые установщики в раздачу сайта.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

function run(command, args, extraEnv) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    env: extraEnv ?? process.env,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// 1. Веб-клиент внутрь приложения.
run(process.execPath, [resolve(here, "prepare-renderer.mjs")]);

// 2. Подпись (если есть сертификат).
const env = { ...process.env };
const pfx = resolve(root, "certs", "nova-selfsigned.pfx");
const passwordFile = resolve(root, "certs", "password.txt");

if (existsSync(pfx)) {
  env.CSC_LINK = pfx;
  env.CSC_KEY_PASSWORD =
    process.env.CSC_KEY_PASSWORD ||
    (existsSync(passwordFile) ? readFileSync(passwordFile, "utf8").trim() : "nova");
  console.log("Подпись включена: " + pfx);
} else {
  console.log("Сертификат не найден — сборка без подписи (npm run make-cert).");
}

// 3. Сборка установщиков.
const builderCli = resolve(root, "..", "..", "node_modules", "electron-builder", "cli.js");
run(process.execPath, [builderCli, "--win", ...process.argv.slice(2)], env);

// 4. Публикация на сайт.
run(process.execPath, [resolve(here, "publish-installers.mjs")], env);
