# Nova — прогресс (обновлено 16.10.2026, всё доделано)

## Статус: задачи macOS / iPhone / Linux ВЫПОЛНЕНЫ и задеплоены
- Релиз v1.0.0 (id 411893621) содержит 7 артефактов:
  nova-android.apk (3,3 МБ), nova-setup-x64.exe (107 МБ), nova-portable.exe (106 МБ),
  nova-x64.dmg (126 МБ), nova-arm64.dmg (122 МБ), nova-x86_64.AppImage (119 МБ), nova-amd64.deb (95 МБ)
- Сайт: карточки Windows/macOS/Linux/Android — «Скачать» (прямые ссылки, проверены 200);
  iOS — «Веб-версия», кнопка «Открыть» → /web; PWA: манифест + иконки 192/512/apple-touch/maskable
- Проверено CDP на живом: лендинг и /web без JS-ошибок, manifest/apple-icon отдаются (200)
- git: main = bdaf032, gh-pages = caf6484; бэкенд /health ок (2 юзера, 1 бот, v2.0)

## Опционально (по запросу пользователя)
1. Пересобрать exe и APK с новым чёрным дизайном v3 (сейчас в десктопе/APK лендинг старый):
   - десктоп: apps/landing build с NOVA_BASE_PATH="" → apps/desktop scripts/build.mjs
   - APK: cd apps/mobile && NOVA_API_URL=https://nova-mesenger.onrender.com npm.cmd run build:release
   - заливка: %TEMP%\upload-assets.ps1 (латиница! кириллица ломает PowerShell)
2. Apple-подпись для mac dmg (сейчас без подписи — открывать правый клик → «Открыть»)

## Общее
- Сайт: https://coder-samm4ick.github.io/Nova-mesenger/ (gh-pages)
- Бэкенд: https://nova-mesenger.onrender.com (Render, сервис srv-db5eif59fdbs73cjga00, /health)
- macOS+Linux собирает GitHub Actions: .github/workflows/desktop-release.yml (workflow_dispatch,
  job'ы macos-latest и ubuntu-latest, заливают артефакты в релиз через gh release upload --clobber)
- Linux-сборка локально на Windows невозможна (symlink/fpm) — только через CI; mac — только на mac
- Десктоп-конфиг: apps/desktop/package.json (linux/mac цели, executableName "Nova", homepage, author.email)
- Токен GitHub (пуша/CI): в сессии агента, В ФАЙЛЫ НЕ ЗАПИСЫВАТЬ (push protection).
  Пуш: git push "https://x-access-token:<token>@github.com/coder-samm4ick/Nova-mesenger.git" <branch>
- Панель владельца (10 вкладок) работает; владелец +888 222 9922 / Dimasik1982

## Полезное
- Headless Edge CDP: "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new --remote-debugging-port=9346 --user-data-dir=%TEMP%\edge-cdp-v3
- Проверочные скрипты: %TEMP%\cdp-cards-live.cjs (карточки сайта), %TEMP%\cdp-web-check2.cjs (/web),
  %TEMP%\cdp-live-v3.cjs, %TEMP%\cdp-pixels.cjs, %TEMP%\gen-icons.cjs (PWA-иконки)
- Сборка Pages: из apps/landing с env NEXT_PUBLIC_DOWNLOADS_BASE=.../releases/download/v1.0.0,
  NEXT_PUBLIC_NOVA_API=https://nova-mesenger.onrender.com, NOVA_BASE_PATH=/Nova-mesenger → npm.cmd run build:pages
- Синк в nova-gh: robocopy /MIR /XD downloads .git (ОБЯЗАТЕЛЬНО исключать .git и downloads!)
- НЕ использовать PowerShell Get-Content/Set-Content для UTF-8 с кириллицей — только edit или Node
- Терминал не закрывать; состояние переживает рестарт через git (main + gh-pages) и этот файл
