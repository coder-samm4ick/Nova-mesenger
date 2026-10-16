# Nova — прогресс (последнее обновление: 15.10.2026, вечер)

## Общее
- Сайт: https://coder-samm4ick.github.io/Nova-mesenger/ (ветка `gh-pages`, HEAD `a8ab651`)
- Бэкенд: https://nova-mesenger.onrender.com (Render, сервис `srv-db5eif59fdbs73cjga00`)
- Релиз v1.0.0 (id 411893621): nova-android.apk, nova-setup-x64.exe, nova-portable.exe,
  **новое от 15.10**: nova-x86_64.AppImage (125 297 540) и nova-amd64.deb (99 352 608) — залиты CI
- Токен GitHub (для пуша/CI): хранится в сессии агента (checkpoint), В ФАЙЛЫ НЕ ЗАПИСЫВАТЬ —
  push protection блокирует коммиты с токеном. Пуш: git push "https://x-access-token:<token>@github.com/coder-samm4ick/Nova-mesenger.git" <branch>
- Панель владельца (10 вкладок) принята и работает; владелец +888 222 9922 / Dimasik1982

## Что сделано недавно (15.10)
1. Дизайн v3 задеплоен: 3D-фон (Scene3D), эффекты (Effects.tsx), чисто чёрный фон (#000),
   панель owner, релиз v1.0.0 перезалит — всё в проде.
2. Добавлены цели сборки десктопа в apps/desktop/package.json:
   - linux: appImage + deb (артефакты nova-x86_64.AppImage, nova-amd64.deb)
   - mac: dmg x64 + arm64 (без подписи, identity: null)
   - executableName "Nova", homepage, author.email — для Linux-сборки обязательно
3. Создан .github/workflows/desktop-release.yml (workflow_dispatch):
   - job linux (ubuntu-latest): AppImage+deb → заливка в релиз — **уже отработал успешно**
   - job mac (macos-latest): dmg x64+arm64 → заливка; первый прогон собрал только arm64
     (нужны флаги --x64 --arm64 — поправлено в workflow, перезапуск поставлен на ночь 15.10)
4. iPhone/PWA (файлы закоммичены, НЕ задеплоено на сайт):
   - apps/landing/public/manifest.webmanifest (start_url "./web" — относительные пути, работает и с /Nova-mesenger/, и с корнем)
   - apps/landing/public/icon-192.png, icon-512.png, apple-touch-icon.png, icon-maskable-512.png
     (сгенерированы headless Edge, скрипт %TEMP%\gen-icons.cjs + %TEMP%\icon-gen.html)
   - apps/landing/app/layout.tsx: manifest, appleWebApp, icons.apple, mobile-web-app-capable
   - apps/landing/lib/site.ts: карточка iOS → href "/web", «Веб-версия»
   - apps/landing/app/page.tsx: для href "/web" кнопка «Открыть» вместо «Скачать»

## Осталось сделать (завтра, 16.10)
1. [СДЕЛАНО НОЧЬЮ] Проверить CI: macOS job → в релизе должны появиться nova-x64.dmg и nova-arm64.dmg
   (если упал — смотреть логи: api.github.com .../actions/runs, workflow desktop-release.yml)
2. Обновить lib/site.ts карточки:
   - macOS: href `${downloadsBase}/nova-arm64.dmg` (для Intel — x64.dmg на странице релиза), size по факту
   - Linux: href `${downloadsBase}/nova-x86_64.AppImage`, size "119 МБ",
     requirement "Ubuntu/Debian · AppImage · deb (см. релиз)"
3. Собрать Pages: из apps/landing — env NEXT_PUBLIC_DOWNLOADS_BASE=.../releases/download/v1.0.0,
   NEXT_PUBLIC_NOVA_API=https://nova-mesenger.onrender.com, NOVA_BASE_PATH=/Nova-mesenger,
   npm.cmd run build:pages
4. Синк out/ → C:\Users\Admin\Desktop\nova-gh: robocopy /MIR /XD downloads .git  (ОБЯЗАТЕЛЬНО исключить .git и downloads!)
   Проверить out/.nojekyll, коммит+пуш gh-pages
5. Коммит+пуш main (авто-деплой Render не сломает: правки только лендинг)
6. CDP-проверка на живом: manifest отдаётся (с префиксом /Nova-mesenger/), apple-touch-icon,
   карточки macOS/Linux/iOS (iOS — кнопка «Открыть» ведёт на /web), ошибок в консоли нет
7. Опционально (по желанию): пересобрать exe и APK с новым чёрным дизайном v3
   (сейчас в десктопе/APK старый лендинг) и перезалить в релиз:
   - десктоп: apps/landing build с NOVA_BASE_PATH="" → apps/desktop scripts/build.mjs
   - APK: cd apps/mobile && NOVA_API_URL=https://nova-mesenger.onrender.com npm.cmd run build:release
   - заливка: %TEMP%\upload-assets.ps1 (латиница! кириллица ломает PowerShell)

## Полезное
- Headless Edge CDP: "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new --remote-debugging-port=9346 --user-data-dir=%TEMP%\edge-cdp-v3
- Локальное превью: %TEMP%\nova-preview.cjs (порт 8123, отдаёт apps/landing/out)
- Проверочные скрипты: %TEMP%\cdp-live-v3.cjs, %TEMP%\cdp-web-black.cjs, %TEMP%\cdp-pixels.cjs
- НЕ использовать PowerShell Get-Content/Set-Content для UTF-8 с кириллицей — только edit или Node
- Терминал не закрывать; состояние переживает рестарт через git (main + gh-pages) и этот файл
