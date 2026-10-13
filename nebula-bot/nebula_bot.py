# -*- coding: utf-8 -*-
"""
NEBULA Studio — Telegram-бот-витрина услуг
===========================================
Каталог по сложностям:
  🌐 Сайты            — 1 000 – 15 000 ₽
  📱 Приложения       — 5 000 – 25 000 ₽ (ПК, Android, iOS, веб)
  🤖 Боты             — 2 000 – 15 000 ₽
  🎨 Дизайн           — 1 000 – 10 000 ₽
  🚀 Продвижение      — от 1 500 ₽
Плюс калькулятор стоимости и приём заявок в один клик.

Запуск:  python nebula_bot.py   (токен из .env или BOT_TOKEN)
"""
from __future__ import annotations

import logging
import os
import time
from os import getenv

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.constants import ParseMode
from telegram.ext import (
    Application,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    Defaults,
    MessageHandler,
    filters,
)

import freekassa as fk

# --------------------------------------------------------------------------
# Конфигурация
# --------------------------------------------------------------------------

def load_env(path: str = ".env") -> None:
    """Мини-загрузчик .env без внешних зависимостей."""
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

TOKEN = getenv("BOT_TOKEN", "").strip()
# Если указан — заявки уходят владельцу прямо в личку
OWNER_CHAT_ID = (getenv("OWNER_CHAT_ID") or "").strip() or None
# Контакт для связи с менеджером
CONTACT = getenv("CONTACT", "@nebula_studio").strip()
# Название студии
STUDIO = getenv("STUDIO_NAME", "NEBULA").strip()
# Юридические документы (Telegraph)
DOCS_OFFER = getenv("DOCS_OFFER", "https://telegra.ph/PUBLICHNAYA-OFERTA-08-12-15").strip()
DOCS_PRIVACY = getenv("DOCS_PRIVACY", "https://telegra.ph/POLITIKA-KONFIDENCIALNOSTI-08-12-99").strip()
# FreeKassa — приём платежей (числовой ID мерчанта из панели freekassa.ru)
FK_MERCHANT_ID = getenv("FK_MERCHANT_ID", "").strip()
FK_MIN_AMOUNT = int(getenv("FK_MIN_AMOUNT", "100"))
FK_MAX_AMOUNT = int(getenv("FK_MAX_AMOUNT", "100000"))

logging.basicConfig(
    format="%(asctime)s - %(levelname)s - %(name)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger("nebula_bot")

# --------------------------------------------------------------------------
# Каталог услуг
# --------------------------------------------------------------------------

SERVICES_WEB = {
    "landing": {
        "name": "Лендинг (одностраничник)",
        "price": "1 000 – 5 000 ₽",
        "desc": "Страница под одну цель: продажа, запись, сбор заявок. "
                "Анимации, кнопки, форма обратной связи. Срок: 2–7 дней.",
    },
    "vizitka": {
        "name": "Сайт-визитка",
        "price": "3 000 – 7 000 ₽",
        "desc": "Услуги, контакты, про нас, карта. 3–5 страниц. "
                "Срок: 3–10 дней.",
    },
    "multipage": {
        "name": "Многостраничный сайт",
        "price": "5 000 – 10 000 ₽",
        "desc": "Новости, блог, каталог, галерея. До 10–15 страниц. "
                "Срок: 1–3 недели.",
    },
    "corp": {
        "name": "Корпоративный сайт",
        "price": "8 000 – 15 000 ₽",
        "desc": "Под компанию «под ключ»: структура, каталог, формы, "
                "личный кабинет. Срок: 2–4 недели.",
    },
    "shop": {
        "name": "Интернет-магазин",
        "price": "10 000 – 15 000 ₽",
        "desc": "Каталог, корзина, оплата, заказы в админку, уведомления. "
                "Срок: 3–6 недель.",
    },
    "service": {
        "name": "Веб-сервис / личный кабинет",
        "price": "12 000 – 15 000 ₽",
        "desc": "Вход по логину, свои данные, заказы, интеграции с API. "
                "Стоимость зависит от задач.",
    },
}

SERVICES_APPS = {
    "pc": {
        "name": "Приложение для ПК (Windows)",
        "price": "5 000 – 12 000 ₽",
        "desc": "Десктоп-программа: учёт, рабочая утилита, автоматизация. "
                "Срок: 1–3 недели.",
    },
    "android": {
        "name": "Мобильное приложение (Android)",
        "price": "7 000 – 15 000 ₽",
        "desc": "APK под ваш бизнес: каталог, личный кабинет, уведомления. "
                "Срок: 2–5 недель.",
    },
    "ios": {
        "name": "Мобильное приложение (iOS)",
        "price": "10 000 – 20 000 ₽",
        "desc": "Нативный и кроссплатформенный вариант. Срок: 3–6 недель.",
    },
    "cross": {
        "name": "Кроссплатформенное (ПК + Android + iOS)",
        "price": "15 000 – 25 000 ₽",
        "desc": "Одна кодовая база для всех устройств, общие данные. "
                "Срок: 1–2 месяца.",
    },
    "webapp": {
        "name": "Веб-приложение",
        "price": "10 000 – 20 000 ₽",
        "desc": "Работает в браузере с телефона и ПК: сервисы, панели, "
                "кабинеты. Срок: 2–5 недель.",
    },
    "messenger": {
        "name": "Мессенджер / чат-приложение",
        "price": "15 000 – 25 000 ₽",
        "desc": "Обмен сообщениями в реальном времени: свой чат для "
                "команды или клиентов, WebSocket, уведомления.",
    },
    "game": {
        "name": "Игра / интерактив",
        "price": "8 000 – 25 000 ₽",
        "desc": "Аркады, квизы, рекламные мини-игры, простая 2D-механика. "
                "Цена зависит от жанра и сложности.",
    },
}

SERVICES_BOTS = {
    "bot_simple": {
        "name": "Простой Telegram-бот",
        "price": "2 000 – 5 000 ₽",
        "desc": "Меню с кнопками, ответы на вопросы, каталог, рассылки. "
                "Срок: 2–5 дней.",
    },
    "bot_pro": {
        "name": "Продвинутый бот (БД, оплаты)",
        "price": "5 000 – 15 000 ₽",
        "desc": "База данных, приём оплат, личный кабинет, интеграции, "
                "логика на заказ. Срок: 1–3 недели.",
    },
    "bot_shop": {
        "name": "Бот для магазина / заказов",
        "price": "6 000 – 12 000 ₽",
        "desc": "Каталог товаров, корзина, оформление заказов, уведомления "
                "продавцу. Срок: 1–2 недели.",
    },
    "discord": {
        "name": "Discord-бот",
        "price": "3 000 – 8 000 ₽",
        "desc": "Модерация, роли, музыка, игры и команды под ваши задачи.",
    },
    "parser": {
        "name": "Автоматизация / парсер",
        "price": "4 000 – 10 000 ₽",
        "desc": "Сбор данных, обработка таблиц, связка ваших сервисов. "
                "Экономит часы ручной работы.",
    },
}

SERVICES_DESIGN = {
    "logo": {
        "name": "Логотип",
        "price": "1 000 – 3 000 ₽",
        "desc": "Уникальный знак + варианты на тёмном и светлом фоне. "
                "Срок: 2–4 дня, правки включены.",
    },
    "brand": {
        "name": "Фирменный стиль",
        "price": "5 000 – 10 000 ₽",
        "desc": "Логотип, цвета, шрифты, шаблоны соцсетей, визитка. "
                "Срок: 1–2 недели.",
    },
    "smm": {
        "name": "Дизайн соцсетей",
        "price": "2 000 – 5 000 ₽",
        "desc": "Шапки, обложки, карточки для постов, сторис. Пакетами.",
    },
    "ui": {
        "name": "Дизайн сайта / приложения",
        "price": "3 000 – 8 000 ₽",
        "desc": "Макет интерфейса (UI) для вёрстки или разработки.",
    },
}

SERVICES_OTHER = {
    "support": {
        "name": "Поддержка сайта (месяц)",
        "price": "1 500 – 5 000 ₽/мес",
        "desc": "Обновления, правки контента, бэкапы, мониторинг. "
                "Тарифы на выбор.",
    },
    "seo": {
        "name": "Продвижение / SEO",
        "price": "от 5 000 ₽",
        "desc": "Техническое SEO, семантика, внутренняя оптимизация.",
    },
    "smm_lead": {
        "name": "Ведение SMM (месяц)",
        "price": "от 6 000 ₽/мес",
        "desc": "Контент-план, посты, оформление, отчёты.",
    },
    "content": {
        "name": "Заполнение контентом",
        "price": "от 2 000 ₽",
        "desc": "Тексты, фото, товары для каталога — пакетом.",
    },
    "consult": {
        "name": "Консультация / техзадание",
        "price": "1 000 – 3 000 ₽",
        "desc": "Поможем понять, что нужно, и оценим проект в цифрах.",
    },
}

# Категории: ключ -> (эмодзи, название, диапазон, словарь услуг)
CATEGORIES = {
    "web": ("🌐", "Сайты", "1 000 – 15 000 ₽", SERVICES_WEB),
    "apps": ("📱", "Приложения", "5 000 – 25 000 ₽", SERVICES_APPS),
    "bots": ("🤖", "Боты", "2 000 – 15 000 ₽", SERVICES_BOTS),
    "design": ("🎨", "Дизайн", "1 000 – 10 000 ₽", SERVICES_DESIGN),
    "other": ("🚀", "Продвижение и другое", "от 1 500 ₽", SERVICES_OTHER),
}

# Калькулятор: тип -> уровни сложности -> диапазон
CALC_TYPES = {
    "web": ("🌐 Сайт", {
        "1": ("Простой", "1 000 – 3 000 ₽"),
        "2": ("Средний", "3 000 – 7 000 ₽"),
        "3": ("Сложный", "7 000 – 15 000 ₽"),
    }),
    "apps": ("📱 Приложение", {
        "1": ("Простое", "5 000 – 10 000 ₽"),
        "2": ("Среднее", "10 000 – 18 000 ₽"),
        "3": ("Сложное / кроссплатформенное", "18 000 – 25 000 ₽"),
    }),
    "bots": ("🤖 Бот", {
        "1": ("Простой", "2 000 – 5 000 ₽"),
        "2": ("Средний", "5 000 – 10 000 ₽"),
        "3": ("Продвинутый", "10 000 – 15 000 ₽"),
    }),
    "design": ("🎨 Дизайн", {
        "1": ("Простой", "1 000 – 3 000 ₽"),
        "2": ("Средний", "3 000 – 6 000 ₽"),
        "3": ("Комплексный", "6 000 – 10 000 ₽"),
    }),
}

# --------------------------------------------------------------------------
# Сборка клавиатур
# --------------------------------------------------------------------------

def main_menu_kb() -> InlineKeyboardMarkup:
    kb = [
        [InlineKeyboardButton(f"{e} {n} — {price}", callback_data=f"cat:{key}")
         for key, (e, n, price, _) in CATEGORIES.items()],
        [
            InlineKeyboardButton("🧮 Калькулятор стоимости", callback_data="calc:start"),
            InlineKeyboardButton("📝 Заказать", callback_data="order:generic"),
        ],
        [InlineKeyboardButton("💳 Оплатить заказ", callback_data="pay:generic")],
        [
            InlineKeyboardButton("💬 Контакты", callback_data="contact"),
            InlineKeyboardButton("ℹ️ О студии", callback_data="about"),
        ],
        [InlineKeyboardButton("⚖️ Документы (оферта и конфиденциальность)", callback_data="docs")],
    ]
    return InlineKeyboardMarkup(kb)


def docs_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("📄 Пользовательское соглашение", url=DOCS_OFFER)],
        [InlineKeyboardButton("🔒 Политика конфиденциальности", url=DOCS_PRIVACY)],
        [InlineKeyboardButton("⬅️ Назад", callback_data="menu:main")],
    ])


def back_kb(dest: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("⬅️ Назад", callback_data=dest)],
    ])


def category_kb(cat_key: str, services: dict) -> InlineKeyboardMarkup:
    kb = [
        [InlineKeyboardButton(s["name"], callback_data=f"svc:{cat_key}:{key}")]
        for key, s in services.items()
    ]
    kb.append([
        InlineKeyboardButton("🧮 Рассчитать", callback_data="calc:start"),
        InlineKeyboardButton("⬅️ Главное меню", callback_data="menu:main"),
    ])
    return InlineKeyboardMarkup(kb)


def service_kb(cat_key: str, svc_key: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [
            InlineKeyboardButton("📝 Заказать", callback_data=f"order:{cat_key}:{svc_key}"),
            InlineKeyboardButton("💳 Оплатить предоплату", callback_data=f"pay:{cat_key}:{svc_key}"),
        ],
        [InlineKeyboardButton("🧮 Аналогично рассчитать", callback_data="calc:start")],
        [InlineKeyboardButton("⬅️ Назад к категории", callback_data=f"cat:{cat_key}")],
        [InlineKeyboardButton("🏠 Главное меню", callback_data="menu:main")],
    ])


def calc_type_kb() -> InlineKeyboardMarkup:
    kb = [
        [InlineKeyboardButton(f"{n}", callback_data=f"calc:t:{key}")]
        for key, (n, _) in CALC_TYPES.items()
    ]
    kb.append([InlineKeyboardButton("⬅️ Назад", callback_data="menu:main")])
    return InlineKeyboardMarkup(kb)


def calc_complex_kb(type_key: str, label: str, levels: dict) -> InlineKeyboardMarkup:
    kb = [
        [InlineKeyboardButton(f"{mod} — {price}", callback_data=f"calc:c:{type_key}:{lv}")
         for lv, (mod, price) in levels.items()]
    ]
    kb.append([InlineKeyboardButton("⬅️ Выбрать тип снова", callback_data="calc:start")])
    return InlineKeyboardMarkup(kb)


def confirm_kb(svc: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [
            InlineKeyboardButton("✅ Да, хочу заказать", callback_data=f"order:{svc}"),
            InlineKeyboardButton("⬅️ Вернуться", callback_data="menu:main"),
        ]
    ])


# --------------------------------------------------------------------------
# Тексты
# --------------------------------------------------------------------------

WELCOME = (
    f"🎨 <b>{STUDIO} — студия цифровых продуктов</b>\n\n"
    f"Делаем сайты и приложения <b>любой сложности</b> по понятным ценам:\n\n"
    f"🌐 <b>Сайты</b> — от 1 000 до 15 000 ₽\n"
    f"   лендинг · визитка · многостраничник · магазин · корпоративный\n\n"
    f"📱 <b>Приложения</b> — от 5 000 до 25 000 ₽\n"
    f"   на ПК · Android · iOS · веб · мессенджер · игра\n\n"
    f"🤖 <b>Боты</b> — от 2 000 до 15 000 ₽\n"
    f"🎨 <b>Дизайн</b> — от 1 000 до 10 000 ₽\n"
    f"🚀 <b>Продвижение и другое</b> — от 1 500 ₽\n\n"
    f"👇 Выбери категорию, посмотри цену и закажи в один клик."
)

ABOUT = (
    f"ℹ️ <b>Что такое {STUDIO}?</b>\n\n"
    f"Это студия, которая собирает цифровые продукты «под ключ»:\n\n"
    f"🌐 сайты любой сложности — от лендинга до интернет-магазина;\n"
    f"📱 приложения для ПК, Android и iOS;\n"
    f"🤖 боты и автоматизация рутины;\n"
    f"🎨 логотипы и фирменный стиль;\n"
    f"🚀 поддержка, продвижение и ведение.\n\n"
    f"Мы честно называем цену ДО старта — по каталогу или через калькулятор 🧮\n\n"
    f"Напишите нам: {CONTACT}"
)

CONTACT_TEXT = (
    f"💬 <b>Связь со студией {STUDIO}</b>\n\n"
    f"👤 Менеджер: {CONTACT}\n\n"
    f"Как быстрее всего заказать:\n"
    f"1️⃣ нажми «📝 Заказать» в меню,\n"
    f"2️⃣ опиши задачу одним сообщением,\n"
    f"3️⃣ мы ответим с оценкой и сроками.\n\n"
    f"Также можно прислать пример, ссылку или техзадание прямо сюда."
)


def calc_result_text(type_key: str, level: str) -> str:
    label, levels = CALC_TYPES[type_key]
    mod, price = levels[level]
    return (
        f"🧮 <b>Оценка стоимости</b>\n\n"
        f"Тип: {label}\n"
        f"Сложность: <b>{mod}</b>\n\n"
        f"Ориентировочно: <b>{price}</b>\n\n"
        f"Точную цену зафиксируем на созвоне или в переписке — "
        f"пришлите описание задачи через «📝 Заказать»."
    )


# --------------------------------------------------------------------------
# Обработчики
# --------------------------------------------------------------------------

async def cmd_start(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(WELCOME, reply_markup=main_menu_kb())


async def cmd_menu(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(WELCOME, reply_markup=main_menu_kb())


async def show_main(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    _ = ctx
    query = update.callback_query
    await query.answer()
    await query.edit_message_text(WELCOME, reply_markup=main_menu_kb())


async def on_category(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    key = query.data.split(":", 1)[1]
    emoji, name, price, services = CATEGORIES[key]
    lines = [f"{emoji} <b>{name}</b> — {price}\n"]
    for svc in services.values():
        lines.append(f"• {svc['name']} — <b>{svc['price']}</b>")
    text = "\n".join(lines)
    text += f"\n\n👇 Нажми на услугу, чтобы узнать детали."
    await query.edit_message_text(text, reply_markup=category_kb(key, services))


async def on_service(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    _, cat_key, svc_key = query.data.split(":")
    svc = CATEGORIES[cat_key][3][svc_key]
    text = (
        f"🛠 <b>{svc['name']}</b>\n"
        f"💰 Цена: <b>{svc['price']}</b>\n\n"
        f"{svc['desc']}"
    )
    await query.edit_message_text(text, reply_markup=service_kb(cat_key, svc_key))


async def on_calc_start(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    await query.edit_message_text(
        "🧮 <b>Калькулятор стоимости</b>\n\n"
        "Что вам нужно посчитать?",
        reply_markup=calc_type_kb(),
    )


async def on_calc_type(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    type_key = query.data.split(":")[2]
    label, levels = CALC_TYPES[type_key]
    await query.edit_message_text(
        f"Выбрано: <b>{label}</b>\n\n"
        f"Какая сложность проекта?",
        reply_markup=calc_complex_kb(type_key, label, levels),
    )


async def on_calc_result(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    _, _, type_key, level = query.data.split(":")
    await query.edit_message_text(
        calc_result_text(type_key, level),
        reply_markup=confirm_kb("generic"),
    )


async def on_about(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    await query.edit_message_text(ABOUT, reply_markup=back_kb("menu:main"))


async def on_contacts(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    await query.edit_message_text(CONTACT_TEXT, reply_markup=back_kb("menu:main"))


async def on_docs(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    await query.edit_message_text(
        f"⚖️ <b>Документы студии {STUDIO}</b>\n\n"
        f"Перед заказом рекомендуем ознакомиться:\n\n"
        f"📄 <b>Пользовательское соглашение</b> — публичная оферта: "
        f"условия и порядок оказания услуг.\n"
        f"🔒 <b>Политика конфиденциальности</b> — как мы собираем, "
        f"храним и защищаем ваши данные.\n\n"
        f"👇 Открой документ, нажав на кнопку.",
        reply_markup=docs_kb(),
    )


async def on_pay_start(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    """Начало оплаты: просим ввести сумму предоплаты."""
    query = update.callback_query
    await query.answer()
    parts = query.data.split(":")
    label = "заказ"
    if len(parts) >= 3:
        _, cat_key, svc_key = parts
        try:
            label = CATEGORIES[cat_key][3][svc_key]["name"]
        except (KeyError, IndexError):
            label = "заказ"

    ctx.user_data["pay_svc"] = label
    ctx.user_data["await_amount"] = True
    await query.edit_message_text(
        f"💳 <b>Оплата: {label}</b>\n\n"
        f"Введите сумму в рублях — только цифры, например <b>1000</b>.\n"
        f"Диапазон: <b>{FK_MIN_AMOUNT} – {FK_MAX_AMOUNT} ₽</b>.\n\n"
        f"<i>Это предоплата за услугу: после оплаты менеджер получит "
        f"уведомление и начнёт работу.</i>"
    )


async def _process_payment(update: Update, ctx: ContextTypes.DEFAULT_TYPE, amount: int) -> None:
    """Создаём заказ в FreeKassa и присылаем клиенту ссылку на оплату."""
    user = update.effective_user
    svc = ctx.user_data.pop("pay_svc", "заказ")
    ctx.user_data.pop("await_amount", None)

    if not FK_MERCHANT_ID:
        await update.message.reply_text(
            "💳 Онлайн-оплата пока не подключена.\n"
            f"Напишите менеджеру {CONTACT} — подскажем, как оплатить."
        )
        return

    order_id = f"{user.id}:{int(time.time())}"
    try:
        link = fk.create_order(str(amount), order_id)
    except Exception as exc:  # noqa: BLE001
        logger.error("Ошибка создания платежа FreeKassa: %s", exc)
        await update.message.reply_text(
            "😔 Не удалось создать платёж. Попробуйте чуть позже "
            f"или напишите менеджеру {CONTACT}."
        )
        return

    await update.message.reply_text(
        f"💳 <b>Оплата: {svc}</b>\n"
        f"Сумма: <b>{amount} ₽</b>\n\n"
        f"👇 Нажмите, чтобы перейти к оплате:\n"
        f"<a href=\"{link}\">Перейти к оплате</a>\n\n"
        f"После оплаты вернитесь в бот — менеджер получит уведомление "
        f"и напишет вам первым.",
        reply_markup=InlineKeyboardMarkup([
            [InlineKeyboardButton("🏠 Главное меню", callback_data="menu:main")]
        ]),
    )


async def cmd_cancel(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    """Отмена текущего шага (ввод суммы / заявки)."""
    ctx.user_data.clear()
    await update.message.reply_text("Отменил ✓ Возвращаюсь в меню.", reply_markup=main_menu_kb())


async def on_order_start(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()

    # формат: order:generic  ИЛИ  order:<категория>:<услуга>
    parts = query.data.split(":")
    label = "Ваш проект"
    if len(parts) >= 3:
        _, cat_key, svc_key = parts
        try:
            label = CATEGORIES[cat_key][3][svc_key]["name"]
        except (KeyError, IndexError):
            label = "Ваш проект"

    ctx.user_data["order_svc"] = label
    await query.edit_message_text(
        f"📝 <b>Заказ: {label}</b>\n\n"
        f"Опишите задачу одним сообщением:\n"
        f"• что нужно сделать;\n"
        f"• есть ли пример / ссылка;\n"
        f"• телефон или @ник для связи.\n\n"
        f"Мы ответим в течение пары часов с ценой и сроком.\n\n"
        f"<i>Отправляя заявку, вы соглашаетесь с "
        f"<a href=\"{DOCS_OFFER}\">пользовательским соглашением</a> и "
        f"<a href=\"{DOCS_PRIVACY}\">политикой конфиденциальности</a>.</i>"
    )


async def on_user_text(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    """Принимаем сумму для оплаты или описание заявки."""
    text = update.message.text or ""

    # 1) ввод суммы для оплаты (после нажатия «💳 Оплатить»)
    if ctx.user_data.get("await_amount"):
        digits = text.replace(" ", "").replace("₽", "").strip()
        if digits.isdigit() and FK_MIN_AMOUNT <= int(digits) <= FK_MAX_AMOUNT:
            await _process_payment(update, ctx, int(digits))
        else:
            await update.message.reply_text(
                f"🔢 Нужно число от <b>{FK_MIN_AMOUNT}</b> до <b>{FK_MAX_AMOUNT}</b> ₽.\n"
                f"Например: <b>1000</b>\n\n"
                f"Отменить ввод — команда /cancel."
            )
        return

    # 2) приём заявки после нажатия «📝 Заказать»
    if "order_svc" not in ctx.user_data:
        return

    user = update.effective_user
    svc = ctx.user_data.pop("order_svc")
    text = update.message.text or ""

    payload = (
        f"🔔 <b>Новая заявка!</b>\n\n"
        f"Услуга: <b>{svc}</b>\n"
        f"От: {user.full_name or user.username or user.id}"
        f"{' (@' + user.username + ')' if user.username else ''}\n"
        f"ID: <code>{user.id}</code>\n\n"
        f"— Описание задачи —\n{text}"
    )

    if OWNER_CHAT_ID:
        try:
            await ctx.bot.send_message(
                chat_id=OWNER_CHAT_ID,
                text=payload,
            )
        except Exception as exc:  # noqa: BLE001
            logger.error("Не удалось отправить заявку владельцу: %s", exc)

    await update.message.reply_text(
        f"✅ <b>Заявка принята!</b>\n\n"
        f"«{svc}» — всё записали.\n"
        f"Менеджер {CONTACT} свяжется с вами в ближайшее время "
        f"с предварительной оценкой.\n\n"
        f"Если срочно — напишите напрямую {CONTACT}.",
        reply_markup=back_kb("menu:main"),
    )


async def on_error(update: object, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    """Глобальный обработчик: логируем ошибку и не даём боту умереть."""
    logger.error("Ошибка при обработке: %s", ctx.error)
    if isinstance(update, Update) and update.callback_query:
        try:
            await update.callback_query.answer(
                "Что-то пошло не так — попробуй ещё раз 🙂", show_alert=False
            )
        except Exception:  # noqa: BLE001
            pass


# --------------------------------------------------------------------------
# Главная
# --------------------------------------------------------------------------

def main() -> None:
    if not TOKEN:
        raise SystemExit(
            "Нет токена! Создай бота у @BotFather, получи токен и запиши его "
            "в .env (BOT_TOKEN=...) или задай переменную окружения BOT_TOKEN."
        )

    app = Application.builder().token(TOKEN).defaults(
        Defaults(parse_mode=ParseMode.HTML)
    ).build()

    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("menu", cmd_menu))
    app.add_handler(CommandHandler("cancel", cmd_cancel))

    app.add_handler(CallbackQueryHandler(show_main, pattern=r"^menu:main$"))
    app.add_handler(CallbackQueryHandler(on_category, pattern=r"^cat:"))
    app.add_handler(CallbackQueryHandler(on_service, pattern=r"^svc:"))
    app.add_handler(CallbackQueryHandler(on_calc_start, pattern=r"^calc:start$"))
    app.add_handler(CallbackQueryHandler(on_calc_type, pattern=r"^calc:t:"))
    app.add_handler(CallbackQueryHandler(on_calc_result, pattern=r"^calc:c:"))
    app.add_handler(CallbackQueryHandler(on_about, pattern=r"^about$"))
    app.add_handler(CallbackQueryHandler(on_contacts, pattern=r"^contact$"))
    app.add_handler(CallbackQueryHandler(on_docs, pattern=r"^docs$"))
    app.add_handler(CallbackQueryHandler(on_order_start, pattern=r"^order:"))
    app.add_handler(CallbackQueryHandler(on_pay_start, pattern=r"^pay:"))

    app.add_handler(
        MessageHandler(filters.TEXT & ~filters.COMMAND, on_user_text)
    )

    app.add_error_handler(on_error)

    logger.info("Бот %s запущен. Жмём Ctrl+C для остановки.", STUDIO)
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()