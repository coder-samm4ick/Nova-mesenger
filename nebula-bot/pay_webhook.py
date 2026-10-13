# -*- coding: utf-8 -*-
"""
NEBULA — вебхук-сервер оплат (FreeKassa)
==========================================
Принимает уведомления от FreeKassa, проверяет подпись и шлёт
подтверждения клиенту и владельцу через Telegram Bot API.

Эндпоинты (через SSH-туннель):
  GET /freekassa/notify   — платёжное уведомление (ответ "YES")
  GET /freekassa/success  — страница "оплата прошла"
  GET /freekassa/fail     — страница "оплата не прошла"

Запуск: python pay_webhook.py  (порт из .env: FK_WEBHOOK_PORT=8090)
"""
from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer
from os import getenv
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen

import freekassa as fk


def load_env(path: str = ".env") -> None:
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip())


load_env()

BOT_TOKEN = getenv("BOT_TOKEN", "").strip()
OWNER_CHAT_ID = (getenv("OWNER_CHAT_ID") or "").strip()
CONTACT = getenv("CONTACT", "@Kvezovs").strip()
PORT = int(getenv("FK_WEBHOOK_PORT", "8090"))


def tg_send(chat_id: str, text: str) -> bool:
    """Отправить сообщение через Bot API (sendMessage, HTML)."""
    if not BOT_TOKEN or not chat_id:
        return False
    payload = json.dumps({
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }).encode("utf-8")
    req = Request(
        f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return bool(data.get("ok"))
    except Exception:  # noqa: BLE001
        return False


SUCCESS_PAGE = """<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8">
<title>Оплата принята</title></head><body style="font-family:sans-serif;text-align:center;padding:40px;background:#0b0e1a;color:#e8edff">
<h1 style="color:#64ffda">✅ Оплата принята</h1>
<p>Спасибо! Менеджер уже получил уведомление и скоро напишет вам.</p>
</body></html>"""

FAIL_PAGE = """<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8">
<title>Оплата не прошла</title></head><body style="font-family:sans-serif;text-align:center;padding:40px;background:#0b0e1a;color:#e8edff">
<h1 style="color:#ff5c8a">❌ Оплата не прошла</h1>
<p>Платёж был отменён или не завершён. Вернитесь в бот и попробуйте ещё раз.</p>
</body></html>"""


class Handler(BaseHTTPRequestHandler):
    server_version = "NEBULA-Pay/1.0"

    def _reply(self, body: bytes, code: int = 200, content_type: str = "text/plain; charset=utf-8"):
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path == "/freekassa/notify":
            self._handle_notify(parse_qs(parsed.query))
        elif parsed.path == "/freekassa/success":
            self._reply(SUCCESS_PAGE.encode("utf-8"), content_type="text/html; charset=utf-8")
        elif parsed.path == "/freekassa/fail":
            self._reply(FAIL_PAGE.encode("utf-8"), content_type="text/html; charset=utf-8")
        elif parsed.path == "/health":
            self._reply(b"ok")
        else:
            self._reply(b"NEBULA payment webhook alive\n", 404)

    def _handle_notify(self, qs: dict) -> None:
        params = {k: v[0] for k, v in qs.items()}
        if not fk.verify_notify(params):
            print(f"[notify] БАД-подпись: {params}", flush=True)
            self._reply(b"NO", code=403)
            return

        mid = params.get("MERCHANT_ID", "")
        amount = params.get("AMOUNT", "")
        intid = params.get("intid", "")
        order_id = params.get("MERCHANT_ORDER_ID", "")
        print(f"[notify] OK: заказ {order_id}, {amount} RUB, intid {intid}", flush=True)

        # от кого платёж: chat_id зашит в начале merchant_order_id
        client_chat = order_id.split(":")[0] if ":" in order_id else ""
        try:
            client_chat = str(int(client_chat))
        except ValueError:
            client_chat = ""

        # клиенту — подтверждение
        if client_chat:
            tg_send(
                client_chat,
                f"💳 <b>Оплата {amount} ₽ принята!</b>\n"
                f"Номер заказа: <code>{order_id}</code>\n\n"
                f"Менеджер уже получил уведомление и скоро напишет вам. Спасибо! 🚀",
            )

        # владельцу — платёж в работе
        if OWNER_CHAT_ID:
            tg_send(
                OWNER_CHAT_ID,
                f"💵 <b>Поступила оплата!</b>\n\n"
                f"Сумма: <b>{amount} ₽</b>\n"
                f"Заказ: <code>{order_id}</code>\n"
                f"ID платежа (intid): <code>{intid}</code>\n"
                f"Клиент: {'chat_id ' + client_chat if client_chat else '—'}\n\n"
                f"{CONTACT} — свяжитесь с клиентом для старта работы.",
            )

        self._reply(b"YES")

    def log_message(self, fmt, *args):  # noqa: A003
        print(f"[webhook] {fmt % args}", flush=True)


if __name__ == "__main__":
    print(f"FreeKassa-вебхук слушает на порту {PORT}...", flush=True)
    HTTPServer(("0.0.0.0", PORT), Handler).serve_forever()