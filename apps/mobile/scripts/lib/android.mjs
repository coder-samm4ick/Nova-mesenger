// Общие помощники для сборки Android: поиск JDK/SDK, подпись, ключ.

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const appDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const androidDir = join(appDir, "android");
export const gradleAppFile = join(androidDir, "app", "build.gradle");
export const keystorePropsFile = join(androidDir, "keystore.properties");

const isWin = process.platform === "win32";

function firstSubdir(base) {
  if (!existsSync(base)) return null;
  const dirs = readdirSync(base, { withFileTypes: true }).filter((e) =>
    e.isDirectory(),
  );
  return dirs.length ? join(base, dirs[0].name) : null;
}

/** JAVA_HOME: из окружения или портативная установка ~/jdk-21 (~/jdk-17). */
export function resolveJdk() {
  const fromEnv = process.env.JAVA_HOME;
  const javaBin = isWin ? "java.exe" : "java";
  if (fromEnv && existsSync(join(fromEnv, "bin", javaBin))) return fromEnv;

  const home = process.env.USERPROFILE || process.env.HOME || "";
  // Capacitor 8 требует JDK 21; 17 оставлен как запасной вариант.
  for (const name of ["jdk-21", "jdk-17"]) {
    const portable = firstSubdir(join(home, name));
    if (portable && existsSync(join(portable, "bin", javaBin))) return portable;
  }
  return fromEnv ?? null;
}

/** Android SDK: из окружения или ~/Android/Sdk. */
export function resolveAndroidSdk() {
  const fromEnv = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;

  const home = process.env.USERPROFILE || process.env.HOME || "";
  const candidate = join(home, "Android", "Sdk");
  if (existsSync(candidate)) return candidate;
  return fromEnv ?? null;
}

/** Окружение для Gradle: JAVA_HOME/ANDROID_HOME + local.properties. */
export function gradleEnv() {
  const jdk = resolveJdk();
  const sdk = resolveAndroidSdk();
  const env = { ...process.env };
  if (jdk) env.JAVA_HOME = jdk;
  if (sdk) {
    env.ANDROID_HOME = sdk;
    env.ANDROID_SDK_ROOT = sdk;
    // local.properties — канонический способ указать sdk.dir.
    writeFileSync(
      join(androidDir, "local.properties"),
      `sdk.dir=${sdk.replace(/\\/g, "/")}\n`,
    );
  }
  return { env, jdk, sdk };
}

/** Идемпотентно добавляет чтение keystore.properties и signingConfig в build.gradle. */
export function configureSigning() {
  if (!existsSync(gradleAppFile)) {
    throw new Error(
      "Не найден android/app/build.gradle — сначала выполни: npm run add:android",
    );
  }

  let gradle = readFileSync(gradleAppFile, "utf8");
  if (gradle.includes("// nova-signing")) {
    return;
  }

  gradle =
    `// nova-signing: подпись release-сборки ключом из android/keystore.properties.\n` +
    `def keystorePropertiesFile = rootProject.file("keystore.properties")\n` +
    `def keystoreProperties = new Properties()\n` +
    `def hasReleaseKeystore = keystorePropertiesFile.exists()\n` +
    `if (hasReleaseKeystore) {\n` +
    `    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))\n` +
    `}\n\n` +
    gradle;

  gradle = gradle.replace(
    /android \{\n/,
    `android {\n` +
      `    signingConfigs {\n` +
      `        if (hasReleaseKeystore) {\n` +
      `            release {\n` +
      `                storeFile file(keystoreProperties['storeFile'])\n` +
      `                storePassword keystoreProperties['storePassword']\n` +
      `                keyAlias keystoreProperties['keyAlias']\n` +
      `                keyPassword keystoreProperties['keyPassword']\n` +
      `            }\n` +
      `        }\n` +
      `    }\n`,
  );

  gradle = gradle.replace(
    `        release {\n` +
      `            minifyEnabled false\n` +
      `            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'\n` +
      `        }`,
    `        release {\n` +
      `            minifyEnabled false\n` +
      `            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'\n` +
      `            if (hasReleaseKeystore) {\n` +
      `                signingConfig signingConfigs.release\n` +
      `            }\n` +
      `        }`,
  );

  writeFileSync(gradleAppFile, gradle);
  console.log("Подпись release-сборки настроена в android/app/build.gradle");
}

/** Создаёт ключ подписи (если ещё нет) и android/keystore.properties. */
export function ensureKeystore() {
  const certsDir = join(appDir, "certs");
  const keystorePath = join(certsDir, "nova-android.keystore");
  const password = process.env.NOVA_ANDROID_KEYSTORE_PASSWORD || "nova-mobile";
  const alias = "nova";
  const dname = "CN=Nova, O=Nova, C=RU";

  mkdirSync(certsDir, { recursive: true });

  if (!existsSync(keystorePath)) {
    const jdk = resolveJdk();
    const keytool = jdk
      ? join(jdk, "bin", isWin ? "keytool.exe" : "keytool")
      : "keytool";
    console.log("Создаю ключ подписи Android...");
    execFileSync(
      keytool,
      [
        "-genkeypair",
        "-keystore",
        keystorePath,
        "-alias",
        alias,
        "-keyalg",
        "RSA",
        "-keysize",
        "2048",
        "-validity",
        "10000",
        "-storetype",
        "PKCS12",
        "-storepass",
        password,
        "-keypass",
        password,
        "-dname",
        dname,
      ],
      { stdio: "inherit" },
    );
  } else {
    console.log("Ключ подписи уже существует:", keystorePath);
  }

  writeFileSync(
    keystorePropsFile,
    [
      `storeFile=${keystorePath.replace(/\\/g, "/")}`,
      `storePassword=${password}`,
      `keyAlias=${alias}`,
      `keyPassword=${password}`,
      "",
    ].join("\n"),
  );
  console.log("Настроен:", keystorePropsFile);
}
