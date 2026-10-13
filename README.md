# Nova — мессенджер нового поколения

Кроссплатформенный мессенджер: **ПК, телефоны и веб**, плюс сайт для скачивания.
Вдохновлён Telegram, но с упором на приватность, скорость и открытость.

> Рабочее название продукта — **Nova**. Меняется в одном месте:
> `apps/landing/lib/site.ts`.

## Статус

| Часть | Что это | Статус |
| --- | --- | --- |
| `apps/landing` | Сайт для скачивания (Next.js 16 + TS) | ✅ готов |
| `apps/server` | Бэкенд (Fastify + WebSocket), аккаунты, чаты, сообщения | ✅ работает |
| Веб-клиент в `apps/landing/app/web` | Чат в браузере (`/web`) | ✅ готов |
| `apps/desktop` | Десктоп-клиент на Electron (Windows собран, macOS/Linux 🔜) | ✅ |
| `apps/mobile` | Android-приложение (Capacitor, готовый APK); iOS 🔜 | ✅ Android |
| `packages/shared` | Общие типы и утилиты | 🔜 (пока типы продублированы) |

## Быстрый старт

Требуется Node.js 20+.

```bash
# из корня проекта

# 1. установить зависимости
npm install

# 2. бэкенд → http://localhost:8081
npm run dev:server

# 3. сайт и веб-клиент → http://localhost:3000 и /web
npm run dev:landing

# продакшн-сборка сайта (статика в apps/landing/out)
npm run build:landing

# десктоп-приложение на Electron (откроет окно, нужен запущенный сервер)
npm run dev:desktop

# установщик Windows (apps/desktop/dist/nova-setup-x64.exe)
npm run build:desktop

# Android-приложение (нужны JDK 21 и Android SDK — см. ниже)
npm run build:apk      # → apps/mobile/dist/nova-android.apk
```

Открой **http://localhost:3000/web**, создай аккаунт и напиши себе со
второго браузера/вкладки — сообщения приходят в реальном времени.

Десктоп-приложение подключается к тому же серверу. Адрес по умолчанию —
`http://localhost:8081`, переопределяется переменной `NOVA_SERVER_URL`.

> Веб-клиент обращается к серверу по адресу из `NEXT_PUBLIC_NOVA_API`
> (по умолчанию `http://localhost:8081`). Нужен другой адрес —
> создай `apps/landing/.env.local`:
> `NEXT_PUBLIC_NOVA_API=https://api.example.com`.

> На Windows, если `npm` блокируется политикой PowerShell, используйте
> `npm.cmd` или выполните один раз:
> `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`.

## Структура

```
project/
├─ apps/
│  ├─ landing/            # сайт для скачивания + веб-клиент
│  │  ├─ app/             # маршруты (App Router): /, /web, 404
│  │  ├─ components/      # UI-компоненты и иконки
│  │  │  └─ chat/         # веб-клиент мессенджера (ChatApp, AuthPanel)
│  │  ├─ lib/site.ts      # бренд, релизы, фичи, FAQ — правь здесь
│  │  ├─ lib/api.ts       # REST-клиент сервера
│  │  ├─ lib/chat-types.ts# типы клиента (зеркало сервера)
│  │  └─ public/downloads # инсталляторы (Windows — настоящий, ост. — по мере сборки)
│  ├─ server/             # бэкенд Nova
│  │  ├─ src/index.ts     # Fastify: REST + WebSocket
│  │  ├─ src/store.ts     # пользователи, чаты, сообщения (+ data/db.json)
│  │  ├─ src/auth.ts      # пароли (scrypt) и сессии
│  │  └─ src/types.ts     # общие типы
│  └─ desktop/            # десктоп-клиент (Electron)
│     ├─ main.js          # главный процесс: окно + запуск UI
│     ├─ static-server.js # отдаёт веб-клиент внутри приложения
│     ├─ preload.js       # прокидывает адрес сервера в UI
│     ├─ scripts/         # сборка, сертификат, публикация установщиков
│     ├─ certs/           # ключ подписи (приватный, в .gitignore)
│     └─ renderer/        # копия статического веб-клиента (при сборке)
├─ packages/              # общие пакеты (план)
└─ package.json           # workspace-корень
```

`apps/mobile` (Android, Capacitor):

```
apps/mobile/
├─ capacitor.config.ts    # id, имя, www
├─ scripts/               # подготовка www, ключ подписи, сборка APK
├─ android/               # нативный проект (генерируется `npm run add:android`)
└─ www/                   # копия веб-клиента (при сборке, в .gitignore)
```

## Как менять сайт

- **Название, слоган, ссылки** → `apps/landing/lib/site.ts`
- **Версии и ссылки на сборки** → массив `releases` там же
- **Возможности, сравнение, FAQ** → `features`, `comparison`, `faq` там же
- **Цвета и стиль** → CSS-переменные в `apps/landing/app/globals.css`

Когда появятся настоящие сборки — положите их в
`apps/landing/public/downloads/` с теми же именами (или поправьте ссылки
в `releases`). Для деплоя на хостинг с лимитом на размер файла укажи
внешний адрес раздачи в `NEXT_PUBLIC_DOWNLOADS_BASE` (см. `DEPLOY.md`).

## Подпись установщика (Windows)

Сборка автоматически подписывает `Nova.exe`, установщик, деинсталлятор и
portable-версию, если есть сертификат `apps/desktop/certs/nova-selfsigned.pfx`
(подпись включается скриптом `apps/desktop/scripts/build.mjs` через переменные
`CSC_LINK` / `CSC_KEY_PASSWORD`).

### Самоподписанный сертификат (для разработки)

```bash
# создать сертификат и добавить его в доверенные текущего пользователя
npm run make-cert

# собрать подписанные установщики
npm run build:desktop
```

Файлы сертификата лежат в `apps/desktop/certs/` (папка в `.gitignore` —
приватный ключ не коммитим) и **доверены только на этой машине**. У других
людей Windows покажет «Неизвестный издатель»: для распространения нужен
настоящий сертификат от удостоверяющего центра.

### Настоящий сертификат

Купите код-сертификат (`.pfx`) у DigiCert/Sectigo и укажите его перед сборкой:

```powershell
$env:CSC_LINK = "C:\path\to\cert.pfx"
$env:CSC_KEY_PASSWORD = "пароль"
npm run build:desktop
```

### Удалить самоподписанный сертификат

```powershell
Get-ChildItem Cert:\CurrentUser\Root, Cert:\CurrentUser\TrustedPublisher, Cert:\CurrentUser\My |
  Where-Object Subject -like "*CN=Nova*" | Remove-Item
Remove-Item -Recurse -Force apps\desktop\certs
```

## Мобильное приложение (Android)

Обёртка веб-клиента на [Capacitor](https://capacitorjs.com): внутрь APK
попадает тот же статический клиент, что и в браузере.

Нужны **JDK 21** и **Android SDK** (platform-tools, platform 36,
build-tools 35/36). Укажи `JAVA_HOME` и `ANDROID_HOME` — либо положи JDK в
`~/jdk-21`, а SDK в `~/Android/Sdk`: скрипты найдут их сами.

```bash
# сгенерировать нативный android-проект (один раз)
npm run add:android

# собрать подписанный APK → apps/mobile/dist/nova-android.apk
npm run build:apk
```

Ключ подписи создаётся автоматически в `apps/mobile/certs/` (папка в
`.gitignore`), пароль по умолчанию `nova-mobile` или из переменной
`NOVA_ANDROID_KEYSTORE_PASSWORD`. Для Google Play сделай отдельный ключ
и храни его в тайне.

Адрес сервера задаётся прямо в приложении на экране входа
(«Сервер подключения») или вшивается при сборке:

```powershell
$env:NOVA_API_URL = "https://nova-server.onrender.com"
npm run build:apk
```

## Публикация

Пошаговая инструкция — в [`DEPLOY.md`](./DEPLOY.md). Коротко:

- **Сайт** → Cloudflare Pages (статика из `apps/landing/out`, сборка
  `npm run build:pages`);
- **Бэкенд** → Render (Docker, `render.yaml` уже в репозитории);
- **Сборки** (установщики Windows, APK) → GitHub Releases; адрес раздачи
  задаётся переменной `NEXT_PUBLIC_DOWNLOADS_BASE`.

## API сервера

Порт по умолчанию — `8081` (меняется переменной `PORT`).

| Метод | Путь | Назначение |
| --- | --- | --- |
| `POST` | `/api/auth/register` | регистрация → `{ token, user }` |
| `POST` | `/api/auth/login` | вход → `{ token, user }` |
| `POST` | `/api/auth/logout` | выход |
| `GET` | `/api/me` | текущий пользователь |
| `GET` | `/api/users?q=` | поиск людей |
| `GET` / `POST` | `/api/chats` | список чатов / создать личный чат |
| `GET` / `POST` | `/api/chats/:id/messages` | история / отправить сообщение |
| `WS` | `/ws?token=` | события в реальном времени |

Защищённые запросы используют заголовок `Authorization: Bearer <token>`.

## Дорожная карта

1. ✅ **Сайт для скачивания** — лендинг с кнопками под все платформы.
2. ✅ **Бэкенд**: аккаунты, личные чаты, доставка в реальном времени
   (WebSocket), хранение истории.
3. ✅ **Веб-клиент**: чат в браузере на том же стеке (`/web`).
4. 🔄 **Десктоп и мобильные клиенты**: Windows ✅ (Electron),
   Android ✅ (Capacitor, APK); macOS/Linux и iOS — в работе.
5. 🔜 **Звонки, группы, каналы, боты, E2E-шифрование**.
6. 🔜 **Файлы и медиа** в сообщениях.

## Лицензия

TBD.
