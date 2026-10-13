# Публикация Nova

Nova состоит из трёх частей, которые публикуются отдельно:

| Часть | Что это | Куда |
| --- | --- | --- |
| **Сайт** (`apps/landing/out`) | статика: лендинг + веб-клиент `/web` | Cloudflare Pages |
| **Бэкенд** (`apps/server`) | Node + REST + WebSocket | Render (Docker) |
| **Сборки** | установщики Windows, APK | GitHub Releases (или Cloudflare R2) |

> Почему сборки отдельно: у Cloudflare Pages лимит **25 МБ на файл**, а
> установщик Windows весит ~107 МБ. Поэтому он раздаётся с GitHub Releases,
> а `build:pages` не кладёт его в деплой.

---

## 0. Репозиторий на GitHub

Render и Cloudflare Pages удобнее всего подключать к Git-репозиторию.

```powershell
winget install --id Git.Git -e
winget install --id GitHub.cli -e   # даст команду gh

git init
git add .
git commit -m "Nova: сайт, бэкенд, десктоп и Android"

gh auth login                       # войти в свой аккаунт GitHub
gh repo create nova --public --source . --push
```

---

## 1. Бэкенд → Render

В репозитории уже есть `render.yaml` (Blueprint).

1. [dashboard.render.com](https://dashboard.render.com) → **New › Blueprint**.
2. Выбери свой репозиторий `nova` → Render прочитает `render.yaml` и создаст
   сервис `nova-server` (Docker, план Free).
3. Дождись сборки и проверь адрес:

```bash
curl https://nova-server.onrender.com/health   # {"ok":true,...}
```

Особенности бесплатного тарифа:

- сервис **засыпает** через ~15 минут простоя; первый запрос после паузы
  может занять 30–60 секунд, WebSocket-клиент переподключится сам;
- постоянного диска нет — `apps/server/data/db.json` теряется при редеплое.
  Чтобы данные сохранялись, включи диск в `render.yaml` (платный тариф).

---

## 2. Сайт → Cloudflare Pages

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages ›
   Create › Pages › Connect to Git** → выбери репозиторий.
2. Настройки сборки:
   - **Framework preset**: `None`
   - **Build command**: `npm ci && npm run build:pages`
   - **Build output directory**: `apps/landing/out`
3. Переменные окружения (**Settings › Environment variables**):

| Переменная | Значение |
| --- | --- |
| `NODE_VERSION` | `22` |
| `NEXT_PUBLIC_NOVA_API` | `https://nova-server.onrender.com` |
| `NEXT_PUBLIC_DOWNLOADS_BASE` | `https://github.com/<логин>/nova/releases/latest/download` |

4. **Save and Deploy**. Сайт будет доступен на `https://<проект>.pages.dev`.

Без Git можно залить готовую папку вручную:

```powershell
$env:NEXT_PUBLIC_NOVA_API = "https://nova-server.onrender.com"
$env:NEXT_PUBLIC_DOWNLOADS_BASE = "https://github.com/<логин>/nova/releases/latest/download"
npm run build:pages
npx wrangler pages deploy apps/landing/out --project-name nova
```

---

## 3. Файлы сборок → GitHub Releases

Имена файлов в релизе должны совпадать со ссылками в
`apps/landing/lib/site.ts`:

- `nova-setup-x64.exe` — установщик Windows
- `nova-portable.exe` — portable Windows
- `nova-android.apk` — Android

```powershell
# 1. собрать (Windows подписывается самоподписанным сертификатом)
npm run build:desktop
npm run build:apk

# 2. выложить релиз
gh release create v0.1.0 `
  apps/desktop/dist/nova-setup-x64.exe `
  apps/desktop/dist/nova-portable.exe `
  apps/mobile/dist/nova-android.apk `
  --title "Nova 0.1.0" --notes "Первый публичный релиз"
```

Прямые ссылки на последнюю версию:

```
https://github.com/<логин>/nova/releases/latest/download/nova-setup-x64.exe
https://github.com/<логин>/nova/releases/latest/download/nova-android.apk
```

> Альтернатива GitHub Releases — **Cloudflare R2** (бесплатно 10 ГБ, без платы
> за трафик). Залей файлы в бакет и укажи публичный домен в
> `NEXT_PUBLIC_DOWNLOADS_BASE`.

---

## Адрес сервера в приложениях

Веб-клиент берёт адрес в таком порядке:

1. `window.__NOVA_API__` — подставляется обёртками (десктоп, Android);
2. значение, введённое пользователем в форме входа («Сервер подключения») —
   хранится в `localStorage`;
3. `NEXT_PUBLIC_NOVA_API` (только сайт/веб-клиент);
4. `http://localhost:8081`.

Поэтому APK можно собрать один раз, а адрес сервера менять прямо в приложении.
Чтобы вшить адрес по умолчанию:

```powershell
# Android
$env:NOVA_API_URL = "https://nova-server.onrender.com"
npm run build:apk

# Сайт/веб-клиент
$env:NEXT_PUBLIC_NOVA_API = "https://nova-server.onrender.com"
npm run build:landing
```

---

## Чек-лист перед публикацией

- [ ] `npm run dev:server` + `npm run dev:landing` — чат работает локально
- [ ] `npm run build:desktop` — установщики собраны и подписаны
- [ ] `npm run build:apk` — APK собрался, ставится на телефон
- [ ] `render.yaml` подключён, `/health` отвечает
- [ ] Переменные Pages (`NEXT_PUBLIC_NOVA_API`, `NEXT_PUBLIC_DOWNLOADS_BASE`) заданы
- [ ] Релиз с файлами создан, ссылки на скачивание открываются
