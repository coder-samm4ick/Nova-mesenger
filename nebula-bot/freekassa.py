# -*- coding: utf-8 -*-
"""
FreeKassa (кассир) — модуль для NEBULA-бота
===========================================
- Подпись уведомления: md5(MERCHANT_ID:AMOUNT:СЕКРЕТНОЕ_СЛОВО:MERCHANT_ORDER_ID)
- Подпись заказа (orders/create): md5(merchantId:amount:merchantOrderId:СЕКРЕТНОЕ_СЛОВО)
Секретное слово выбирается из .env (FK_SIGN_SECRET=2 по умолчанию).
"""
from __future__ import annotations

import hashlib
import json
import os
from os import getenv

from urllib.request import Request, urlopen


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

FK_API = getenv("FK_API", "https://api.freekassa.ru/v1/orders/create").strip()
# каким секретным словом подписываемся: "1" или "2"
_SIGN_WORD = getenv("FK_SIGN_SECRET", "2").strip()


def _secret() -> str:
    word = getenv("FK_SECRET1", "").strip() if _SIGN_WORD == "1" else getenv("FK_SECRET2", "").strip()
    return word


def merchant_id() -> str:
    return getenv("FK_MERCHANT_ID", "").strip()


def notify_sign(merchant_id: str, amount: str, order_id: str) -> str:
    """Контрольная подпись для проверки уведомления об оплате."""
    raw = f"{merchant_id}:{amount}:{_secret()}:{order_id}"
    return hashlib.md5(raw.encode("utf-8")).hexdigest()


def create_order_sign(merchant_id: str, amount: str, order_id: str) -> str:
    """Подпись для создания заказа (orders/create)."""
    raw = f"{merchant_id}:{amount}:{order_id}:{_secret()}"
    return hashlib.md5(raw.encode("utf-8")).hexdigest()


def verify_notify(params: dict) -> bool:
    """Проверяем уведомление от FreeKassa по подписи SIGN."""
    mid = params.get("MERCHANT_ID")
    amount = params.get("AMOUNT")
    order_id = params.get("MERCHANT_ORDER_ID")
    sign = params.get("SIGN")
    if not (mid and amount and order_id and sign):
        return False
    return notify_sign(mid, amount, order_id).upper() == sign.upper()


def create_order(amount: str, order_id: str, ip: str = "") -> str:
    """
    Создаёт заказ в FreeKassa и возвращает ссылку на оплату (location).
    Бросает исключение при ошибке — обрабатывай у вызывающего.
    """
    mid = merchant_id()
    if not mid:
        raise ValueError("FK_MERCHANT_ID не задан в .env")

    payload = {
        "merchantId": mid,
        "amount": str(amount),
        "merchantOrderId": str(order_id),
        "sign": create_order_sign(mid, str(amount), str(order_id)),
    }
    if ip:
        payload["ip"] = ip

    req = Request(
        FK_API,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(req, timeout=25) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    if data.get("type") == "success" and data.get("location"):
        return data["location"]
    raise ValueError(f"FreeKassa не вернул ссылку: {data}")


if __name__ == "__main__":
    print("MERCHANT_ID:", merchant_id() or "(не задан)")
    print("SIGN word:", _SIGN_WORD)
    print("test notify sign:", notify_sign("25965", "100", "test_1"))