// Простой статический сервер для веб-клиента внутри Electron.
// Слушает случайный порт на 127.0.0.1 и отдаёт файлы из папки renderer.

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    "content-type": MIME[ext] || "application/octet-stream",
    "cache-control": "no-cache",
  });
  fs.createReadStream(filePath).pipe(res);
}

function startStaticServer(rootDir) {
  const root = path.resolve(rootDir);

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url || "/", "http://localhost");
        let pathname = decodeURIComponent(url.pathname);
        if (pathname.endsWith("/")) pathname += "index.html";

        const resolved = path.normalize(path.join(root, pathname));
        if (resolved !== root && !resolved.startsWith(root + path.sep)) {
          res.writeHead(403);
          res.end("Forbidden");
          return;
        }

        fs.stat(resolved, (err, stat) => {
          if (!err && stat.isFile()) {
            sendFile(res, resolved);
            return;
          }
          const indexPath = path.join(resolved, "index.html");
          fs.stat(indexPath, (err2, stat2) => {
            if (!err2 && stat2.isFile()) {
              sendFile(res, indexPath);
              return;
            }
            res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
            res.end("Не найдено");
          });
        });
      } catch {
        res.writeHead(400);
        res.end("Bad request");
      }
    });

    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => server.close(),
      });
    });
  });
}

module.exports = { startStaticServer };
