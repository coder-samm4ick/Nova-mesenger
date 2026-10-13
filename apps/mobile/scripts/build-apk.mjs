// Сборка APK через Gradle wrapper.
//   node scripts/build-apk.mjs debug
//   node scripts/build-apk.mjs release
//
// Для release автоматически настраивает подпись и создаёт ключ (если его нет).

import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import {
  androidDir,
  appDir,
  configureSigning,
  ensureKeystore,
  gradleEnv,
} from "./lib/android.mjs";

function runGradle(gradlew, args, options) {
  // Node 24 больше не запускает .bat напрямую — shell сам обернёт вызов для cmd.
  execFileSync(gradlew, args, { ...options, shell: true });
}

const mode = process.argv[2] === "release" ? "release" : "debug";
const task = mode === "release" ? "assembleRelease" : "assembleDebug";

const gradlew = join(
  androidDir,
  process.platform === "win32" ? "gradlew.bat" : "gradlew",
);
if (!existsSync(gradlew)) {
  console.error("Не найден Gradle wrapper. Сначала: npm run add:android");
  process.exit(1);
}

if (mode === "release") {
  configureSigning();
  ensureKeystore();
}

const { env, jdk, sdk } = gradleEnv();
if (!jdk) {
  console.error(
    "Не найден JDK 21. Установи Temurin 21 и задай JAVA_HOME (см. README).",
  );
  process.exit(1);
}
if (!sdk) {
  console.error("Не найден Android SDK. Задай ANDROID_HOME (см. README).");
  process.exit(1);
}

console.log(`\nСборка APK (${mode})...`);
runGradle(gradlew, [task], { cwd: androidDir, stdio: "inherit", env });

const builtApk = join(
  androidDir,
  "app",
  "build",
  "outputs",
  "apk",
  mode,
  mode === "release" ? "app-release.apk" : "app-debug.apk",
);
const outDir = join(appDir, "dist");
const outApk = join(
  outDir,
  mode === "debug" ? "nova-android-debug.apk" : "nova-android.apk",
);

if (existsSync(builtApk)) {
  mkdirSync(outDir, { recursive: true });
  copyFileSync(builtApk, outApk);
  console.log(`\nГотово: ${outApk}`);

  // Публикуем APK на сайт (локальная разработка / прямая раздача).
  const landingDownloads = join(appDir, "..", "landing", "public", "downloads");
  mkdirSync(landingDownloads, { recursive: true });
  const published = join(landingDownloads, "nova-android.apk");
  copyFileSync(builtApk, published);
  console.log(`Опубликовано на сайт: ${published}`);
} else {
  console.warn("\nAPK не найден по ожидаемому пути:", builtApk);
}
