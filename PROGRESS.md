# Nova Landing — deployment progress

## Status: LIVE + OWNER + APPS REBUILT (2026-10-14)

### Что сделано 2026-10-13/14
- **Web-версия полностью работает** (гидрация через `TURBOPACK_CHUNK_BASE_PATH="/Nova-mesenger/_next/"` в `<head>`), E2E через живой UI: регистрация → чат → сообщения → WS.
- **Скачивания** ведут на GitHub Releases v1.0.0 (env `NEXT_PUBLIC_DOWNLOADS_BASE`), склейка basePath вылечена, hrefs проверены 200.
- **Владелец**: `OWNER_PHONE=8882229922` в коде (main `da322c9`), бэкенд пересобран на Render из ветки `main` (ветка сервиса переключена, авто-деплой), аккаунт **+888 222 9922 / Dimasik1982** (Dimasik) isOwner=True.
- **Регистрация**: выбор региона (25 стран, вкл. 🚀 Nova +888) + валидация длины номера (`AuthPanel.tsx`), задеплоено (gh-pages `46c49ad`), проверено E2E вживую.
- **API base** зашит в сборку: `NEXT_PUBLIC_NOVA_API=https://nova-mesenger.onrender.com` (без него сайт собирался на localhost:8081 — фикс в `46c49ad`).
- **Приложения пересобраны под новый сервер**:
  - десктоп: `main.js` default = `app.isPackaged ? "https://nova-mesenger.onrender.com" : localhost` (main `ccf5e07`), exe пересобраны, URL проверен в app.asar;
  - android: `NOVA_API_URL=https://nova-mesenger.onrender.com` зашит в `window.__NOVA_API__`, APK пересобран подписан (certs/nova-android.keystore);
  - оба заливаются в Release v1.0.0 (заменяют старые ассеты с 192.168.1.248/localhost).
- **Сборка статики**: `next build` НЕ эмитит `out/` — синтезируется из `.next/server/app/*.html` + `.next/static` + `public` (см. Temp scripts assemble/rewrite/dedup), затем рерайт путей под `/Nova-mesenger/`.

### Ветки
- `main` (default) = исходники, HEAD `ccf5e07`.
- `gh-pages` = сайт, HEAD `46c49ad`, Pages source pinned.

---

## Status: FIXED (2026-10-13) — root cause found and deployed

### ROOT CAUSE (confirmed)
CSS rule `.reveal{opacity:0;transform:translateY(26px)}` hid ALL page content. Content only became visible when JS (IntersectionObserver) added class `in-view`. If JS failed during React hydration, content stayed invisible on the dark background => "blank page" despite 200 + full HTML. The `@media (prefers-reduced-motion:reduce)` override only helped users with reduced-motion enabled.

### FIX deployed
- Edited `nova-gh/_next/static/chunks/0l8pur7lmc38-.css`: `.reveal{opacity:0;...}` -> `.reveal{opacity:1;transform:none}` (content visible by default, no JS dependency).
- Commit 8b0280e "Fix: make .reveal visible by default" pushed to gh-pages. Deployment state=success. Live CSS verified: opacity:0 count=0, opacity:1 count=2.

### User-reported problem
- Was: blank/white page + CSP error even in incognito.
- CSP error was from GitHub's 404 page (`default-src 'none'`) OR a browser extension — our JS does NOT use eval/new Function (verified 0 in all chunks), and our site sets NO CSP header/meta.

### Remaining / next
1. User to hard-refresh (Ctrl+Shift+R) and confirm content is visible.
2. If interactive elements (nav toggle, FAQ accordion) don't work, that's a separate JS/hydration error — need user's F12 Console errors.
3. `/web` doesn't load: client-side app needing Nova backend API (NEXT_PUBLIC_NOVA_API). Separate from landing.
4. Download buttons 404: host the 3 binaries on GitHub Releases (up to 2 GB each), rebuild with NEXT_PUBLIC_DOWNLOADS_BASE=<releases URL>, re-push.

### Live URL
https://coder-samm4ick.github.io/Nova-mesenger/

### Verified from server side
- `/` -> 200, HTML 64877 B, title "Nova - ...", sections: download, features, compare, faq
- CSS /_next/static/chunks/0l8pur7lmc38-.css -> 200 text/css (now 37660 B, reveal visible)
- JS /_next/static/chunks/0umf92h1sb77c.js -> 200
- /web/ -> 200 (479 B body — client-rendered, needs backend)
- /favicon.svg -> 200
- No CSP header on any response. Runtime does NOT use eval/new Function.
- gh-pages HEAD: 8b0280e (fix), before: f27f482 (.nojekyll), c395daa (first deploy). Deployments API state=success.

### What was fixed earlier
1. Removed 216 MB binaries (nova-setup-x64.exe 106MB, nova-portable.exe 106MB, nova-android.apk 3.2MB) — GitHub rejects >25MB.
2. Rewrote all asset paths with basePath `/Nova-mesenger/` (31 refs).
3. Added `.nojekyll` — GitHub Pages (Jekyll) ignores `_`-prefixed dirs, so `_next/` was 404.
4. Moved `public/*` (favicon.svg, _headers) to repo root.
5. Made `.reveal` visible by default (the blank-page fix).

### Key paths (Windows)
- Deployment source: `C:\Users\Admin\Desktop\nova-gh\` (basePath-prefixed, .nojekyll, ready to push)
- Clean site (root-relative, no basePath): `C:\Users\Admin\Desktop\nova-site\`
- Next.js source: `C:\Users\Admin\Desktop\project\apps\landing\`
- Build config: `apps/landing/next.config.mjs` (output: export, trailingSlash, basePath/assetPrefix = /Nova-mesenger)
- IMPORTANT: `next build` with `output: "export"` does NOT generate `out/` in this Next.js 16.4.0 (Turbopack) — export is broken. The deployed site was assembled manually from `.next/server/app/*.html` + `.next/static` + `public`.

### Rebuild/push commands (if needed)
- Rewrite paths: `powershell -File C:\Users\Admin\Desktop\project\rewrite-paths.ps1`
- Add .nojekyll + push: `powershell -File C:\Users\Admin\Desktop\project\add-nojekyll.ps1`
- Git: `C:\Program Files\Git\bin\git.exe`, credential helper = manager (works, no PAT needed)
- Push: `cd C:\Users\Admin\Desktop\nova-gh; git push origin gh-pages --force`

### Notes
- Next.js 16.4.0 is a modified build (see AGENTS.md in apps/landing and node_modules/next). Docs in node_modules/next/dist/docs/.
- Background test servers (serve-site.js :8090, serve-gh.js :8091) were cancelled on restart — not needed now.
