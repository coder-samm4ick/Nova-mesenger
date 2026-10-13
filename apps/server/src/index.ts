// Бэкенд Nova: REST API + WebSocket.
//
// Запуск (из корня проекта):            npm run dev:server
// Адрес по умолчанию:                   http://localhost:8081
// WebSocket подключается по токену:     ws://localhost:8081/ws?token=...
//
// Фичи:
//   • регистрация/вход по номеру телефона (владелец — NOVA_OWNER_PHONE)
//   • личные чаты, группы, каналы, «Избранное»
//   • стикеры и фото, редактирование/удаление сообщений
//   • прочтения (непрочитанные + галочки)
//   • звонки (сигналинг поверх WebSocket)
//   • ягоды (валюта) и подписка Premium
//   • боты (встроенный Nova-бот + боты владельца)
//
// Данные сохраняются в data/db.json, файлы — в data/uploads/.

import { createWriteStream, mkdirSync } from "node:fs";
import { extname, join } from "node:path";
import { pipeline } from "node:stream";
import { promisify } from "node:util";

import fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import multipart from "@fastify/multipart";
import staticPlugin from "@fastify/static";
import { WebSocket } from "ws";

import {
  createSession,
  destroySession,
  hashPassword,
  makeSalt,
  newId,
  userIdFromToken,
  verifyPassword,
} from "./auth.js";
import * as store from "./store.js";
import type {
  ChatView,
  ClientEvent,
  Message,
  ServerEvent,
  StoredUser,
} from "./types.js";

const PORT = Number(process.env.NOVA_PORT ?? process.env.PORT ?? 8081);
const HOST = process.env.NOVA_HOST ?? process.env.HOST ?? "0.0.0.0";

const MAX_TEXT = 4000;
const MIN_PASSWORD = 6;
const USERNAME_RE = /^[a-z0-9_-]{3,32}$/;
const PHONE_DIGITS_RE = /^\d{8,15}$/;

/**
 * Номер телефона владельца (+888 888 8888): регистрация на этот номер
 * делает тебя владельцем. Переопределяется env NOVA_OWNER_PHONE.
 */
const OWNER_PHONE = (process.env.NOVA_OWNER_PHONE ?? "8888888888").replace(/\D/g, "");
const PREMIUM_PRICE = Number(process.env.NOVA_PREMIUM_PRICE ?? 199);
const PREMIUM_DAYS = Number(process.env.NOVA_PREMIUM_DAYS ?? 30);

const app = fastify({ logger: true });

await app.register(cors, {
  origin: true,
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
});
await app.register(websocket);
await app.register(multipart, {
  limits: { fileSize: 15 * 1024 * 1024, files: 1, fields: 0 },
});
await app.register(staticPlugin, {
  root: store.uploadsDir(),
  prefix: "/uploads/",
  decorateReply: false,
});

store.ensureBots();
store.ensureUploadsDir();

/* ----------------------------- вспомогательное ---------------------------- */

const streamPipeline = promisify(pipeline);

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function digits(value: unknown): string {
  return String(value ?? "")
    .replace(/\D/g, "")
    .slice(0, 16);
}

function currentAuth(headers: {
  authorization?: string | string[] | undefined;
}): { user: StoredUser; token: string } | null {
  const value = Array.isArray(headers.authorization)
    ? headers.authorization[0]
    : headers.authorization;
  if (!value || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  if (!token) return null;
  const userId = userIdFromToken(token);
  if (!userId) return null;
  const user = store.getUserById(userId);
  if (!user || user.isBanned) return null;
  return { user, token };
}

/** Закрывает все сокеты пользователя (например, при бане). */
function closeUserSockets(userId: string): void {
  const set = socketsByUser.get(userId);
  if (!set) return;
  for (const socket of set) {
    try {
      socket.close(4001, "Аккаунт заблокирован");
    } catch {
      /* сокет уже закрыт */
    }
  }
}

function isMember(chatId: string, userId: string): boolean {
  const chat = store.getChat(chatId);
  return Boolean(chat && chat.memberIds.includes(userId));
}

function canSendToChat(chatId: string, userId: string): boolean {
  const chat = store.getChat(chatId);
  if (!chat) return false;
  if (chat.type === "channel") return chat.ownerId === userId;
  return chat.memberIds.includes(userId);
}

function chatView(chatId: string, viewerId: string): ChatView {
  return store.chatView(chatId, viewerId);
}

/** Авто-имя пользователя из телефона: user<последние 4 цифры>. */
function autoUsername(phone: string): string {
  const tail = phone.slice(-4);
  let base = `user${tail}`;
  while (store.hasUsername(base)) {
    base = `user${tail}${Math.floor(10 + Math.random() * 89)}`;
  }
  return base;
}

/** Стартовый онбординг: «Избранное» + приветственный чат с ботом Nova. */
function ensureWelcome(userId: string): void {
  const botId = store.novaBotId();

  const botChat = botId ? store.ensureDm(userId, botId) : null;
  const existing = botChat ? store.getMessages(botChat.id) : [];
  if (botChat && !existing.some((m) => m.senderId === botId)) {
    store.addMessage(
      botChat.id,
      botId,
      "Добро пожаловать в **Nova** — мессенджер нового поколения!",
      { type: "text" }
    );
    store.addMessage(
      botChat.id,
      botId,
      "Вот что умеет Nova:\n• личные чаты, группы и каналы\n• стикеры и фото\n• звонки\n• ягоды — внутренняя валюта\n• «Избранное» — заметки с самим собой\n\nНапиши /help — и я подскажу, что умею.",
      { type: "text" }
    );
    store.addMessage(
      botChat.id,
      botId,
      "Нашёл тебя в благоухающем списке пользователей. Хочешь — попроси у меня ягод консультацию: напиши слово «эконом».",
      { type: "text" }
    );
  }
  store.ensureSaved(userId);
}

/* ---------------------------------- REST ---------------------------------- */

app.get("/health", async () => ({
  ok: true,
  now: Date.now(),
  uptime: process.uptime(),
  users: store.listUsers().length,
  bots: store.listBots().length,
  channels: store.listPublicChannels().length,
  version: "2.0",
}));

app.post("/api/auth/register", async (request, reply) => {
  const body = (request.body ?? {}) as {
    phone?: unknown;
    username?: unknown;
    displayName?: unknown;
    password?: unknown;
  };
  const phone = digits(body.phone ?? "");
  let username = (asString(body.username) ?? "").trim().toLowerCase();
  const password = asString(body.password) ?? "";
  const displayName = (asString(body.displayName) ?? "").trim();

  if (!phone && !USERNAME_RE.test(username)) {
    return reply.code(400).send({
      error: "Укажи номер телефона (или логин 3–32: латиница, цифры, «_» или «-»)",
    });
  }
  if (phone && !PHONE_DIGITS_RE.test(phone)) {
    return reply.code(400).send({ error: "Номер телефона: 8–15 цифр" });
  }
  if (phone && store.hasPhone(phone)) {
    return reply.code(409).send({ error: "Этот номер уже зарегистрирован" });
  }
  if (!username) {
    username = autoUsername(phone);
  } else if (!USERNAME_RE.test(username)) {
    return reply
      .code(400)
      .send({ error: "Логин: 3–32 символа, латиница, цифры, «_» или «-»" });
  }
  if (store.hasUsername(username)) {
    return reply.code(409).send({ error: "Этот логин уже занят" });
  }
  if (password.length < MIN_PASSWORD) {
    return reply
      .code(400)
      .send({ error: `Пароль: минимум ${MIN_PASSWORD} символов` });
  }
  if (displayName.length > 40) {
    return reply.code(400).send({ error: "Имя: не длиннее 40 символов" });
  }

  const salt = makeSalt();
  const passwordHash = await hashPassword(password, salt);
  const user = store.createUser({
    username,
    displayName,
    passwordHash,
    salt,
    phone: phone || undefined,
  });

  // Номер владельца → роль владельца сразу.
  if (phone && phone === OWNER_PHONE) {
    store.updateUser(user.id, { isOwner: true });
  }

  const token = createSession(user.id);
  ensureWelcome(user.id);
  return { token, user: store.toPublicUser(store.getUserById(user.id)!) };
});

app.post("/api/auth/login", async (request, reply) => {
  const body = (request.body ?? {}) as { login?: unknown; password?: unknown };
  const login = (asString(body.login) ?? "").trim().toLowerCase();
  const password = asString(body.password) ?? "";

  const byPhone = digits(login);
  const user = PHONE_DIGITS_RE.test(byPhone)
    ? store.findUserByPhone(byPhone)
    : store.findUserByUsername(login);

  if (!user) return reply.code(401).send({ error: "Неверный логин или пароль" });
  const ok = await verifyPassword(password, user.salt, user.passwordHash);
  if (!ok) return reply.code(401).send({ error: "Неверный логин или пароль" });
  if (user.isBanned) {
    return reply.code(403).send({ error: "Аккаунт заблокирован владельцем" });
  }

  const token = createSession(user.id);
  ensureWelcome(user.id);
  store.touchActivity(user.id);
  return { token, user: store.toPublicUser(user) };
});

app.post("/api/auth/logout", async (request, reply) => {
  const auth = currentAuth(request.headers);
  if (!auth) return reply.code(401).send({ error: "Требуется авторизация" });
  destroySession(auth.token);
  return { ok: true };
});

app.get("/api/me", async (request, reply) => {
  const auth = currentAuth(request.headers);
  if (!auth) return reply.code(401).send({ error: "Требуется авторизация" });
  return { user: store.toPublicUser(auth.user) };
});

app.patch("/api/me", async (request, reply) => {
  const auth = currentAuth(request.headers);
  if (!auth) return reply.code(401).send({ error: "Требуется авторизация" });
  const body = (request.body ?? {}) as {
    displayName?: unknown;
    avatarColor?: unknown;
  };
  const patch: { displayName?: string; avatarColor?: string } = {};
  if (asString(body.displayName) !== null) {
    const name = (body.displayName as string).trim();
    if (!name || name.length > 40) {
      return reply.code(400).send({ error: "Имя: 1–40 символов" });
    }
    patch.displayName = name;
  }
  if (asString(body.avatarColor) !== null) {
    const color = (body.avatarColor as string).trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
      return reply.code(400).send({ error: "Некорректный цвет аватара" });
    }
    patch.avatarColor = color;
  }
  const updated = store.updateUser(auth.user.id, patch);
  return { user: store.toPublicUser(updated ?? auth.user) };
});

app.get("/api/users", async (request, reply) => {
  const auth = currentAuth(request.headers);
  if (!auth) return reply.code(401).send({ error: "Требуется авторизация" });
  const raw = (request.query as { q?: string | string[] })?.q;
  const q = Array.isArray(raw) ? raw[0] ?? "" : raw ?? "";
  return { users: store.searchUsers(q, auth.user.id) };
});

app.get("/api/bots", async (request, reply) => {
  const auth = currentAuth(request.headers);
  if (!auth) return reply.code(401).send({ error: "Требуется авторизация" });
  return { bots: store.listBots() };
});

app.get<{ Params: { userId: string } }>(
  "/api/users/:userId",
  async (request, reply) => {
    const auth = currentAuth(request.headers);
    if (!auth) return reply.code(401).send({ error: "Требуется авторизация" });
    const user = store.getUserById(request.params.userId);
    if (!user) return reply.code(404).send({ error: "Пользователь не найден" });
    return { user: store.toPublicUser(user) };
  }
);

app.post("/api/bots", async (request, reply) => {
  const auth = currentAuth(request.headers);
  if (!auth) return reply.code(401).send({ error: "Требуется авторизация" });
  if (!auth.user.isOwner) {
    return reply.code(403).send({ error: "Создавать ботов может только владелец" });
  }
  const body = (request.body ?? {}) as { username?: unknown; displayName?: unknown };
  const username = (asString(body.username) ?? "").trim().toLowerCase();
  if (!USERNAME_RE.test(username)) {
    return reply
      .code(400)
      .send({ error: "Логин бота: 3–32 символа, латиница, цифры, «_» или «-»" });
  }
  if (store.hasUsername(username)) {
    return reply.code(409).send({ error: "Этот логин уже занят" });
  }
  const bot = store.createBot({
    username,
    displayName: (asString(body.displayName) ?? "").trim() || username,
  });
  return { user: store.toPublicUser(bot) };
});

/* --------------------------------- чаты ----------------------------------- */

app.get("/api/chats", async (request, reply) => {
  const auth = currentAuth(request.headers);
  if (!auth) return reply.code(401).send({ error: "Требуется авторизация" });
  return { chats: store.listChatViewsForUser(auth.user.id) };
});

app.post("/api/chats", async (request, reply) => {
  const auth = currentAuth(request.headers);
  if (!auth) return reply.code(401).send({ error: "Требуется авторизация" });

  const peerId = asString((request.body as { peerId?: unknown })?.peerId) ?? "";
  if (!peerId || peerId === auth.user.id) {
    return reply.code(400).send({ error: "Укажи собеседника" });
  }
  const peer = store.getUserById(peerId);
  if (!peer) return reply.code(404).send({ error: "Пользователь не найден" });

  const chat = store.ensureDm(auth.user.id, peer.id);
  return { chat: chatView(chat.id, auth.user.id) };
});

app.post("/api/groups", async (request, reply) => {
  const auth = currentAuth(request.headers);
  if (!auth) return reply.code(401).send({ error: "Требуется авторизация" });
  const body = (request.body ?? {}) as {
    title?: unknown;
    memberIds?: unknown;
  };
  const title = (asString(body.title) ?? "").trim();
  if (!title || title.length > 60) {
    return reply.code(400).send({ error: "Название группы: 1–60 символов" });
  }
  const memberIds = Array.isArray(body.memberIds)
    ? (body.memberIds as unknown[])
        .map((v) => (typeof v === "string" ? v : ""))
        .filter((v, i, arr) => v && arr.indexOf(v) === i)
        .filter((v) => store.getUserById(v))
        .filter((v) => v !== auth.user.id)
        .slice(0, 99)
    : [];
  const chat = store.createGroup({ title, creatorId: auth.user.id, memberIds });
  return { chat: chatView(chat.id, auth.user.id) };
});

app.post("/api/channels", async (request, reply) => {
  const auth = currentAuth(request.headers);
  if (!auth) return reply.code(401).send({ error: "Требуется авторизация" });
  const title = (asString((request.body as { title?: unknown })?.title) ?? "").trim();
  if (!title || title.length > 60) {
    return reply.code(400).send({ error: "Название канала: 1–60 символов" });
  }
  const chat = store.createChannel({ title, ownerId: auth.user.id });
  return { chat: chatView(chat.id, auth.user.id) };
});

app.get("/api/channels", async (request, reply) => {
  const auth = currentAuth(request.headers);
  if (!auth) return reply.code(401).send({ error: "Требуется авторизация" });
  const channels = store
    .listPublicChannels()
    .map((c) => chatView(c.id, auth.user.id));
  return { channels };
});

app.post<{ Params: { channelId: string } }>(
  "/api/channels/:channelId/join",
  async (request, reply) => {
    const auth = currentAuth(request.headers);
    if (!auth) return reply.code(401).send({ error: "Требуется авторизация" });
    const chat = store.getChat(request.params.channelId);
    if (!chat || chat.type !== "channel") {
      return reply.code(404).send({ error: "Канал не найден" });
    }
    store.addChatMember(chat.id, auth.user.id);
    return { chat: chatView(chat.id, auth.user.id) };
  }
);

/* ------------------------------- сообщения -------------------------------- */

app.get<{ Params: { chatId: string } }>(
  "/api/chats/:chatId/messages",
  async (request, reply) => {
    const auth = currentAuth(request.headers);
    if (!auth) return reply.code(401).send({ error: "Требуется авторизация" });
    if (!isMember(request.params.chatId, auth.user.id)) {
      return reply.code(404).send({ error: "Чат не найден" });
    }
    const query = request.query as { limit?: string | string[]; before?: string | string[] };
    const limit = Number(Array.isArray(query.limit) ? query.limit[0] : query.limit);
    const before = Array.isArray(query.before) ? query.before[0] : query.before;
    const messages = store.getMessagesPage(request.params.chatId, {
      limit: Number.isFinite(limit) ? limit : 50,
      beforeId: before || undefined,
    });
    return { messages };
  }
);

app.post<{ Params: { chatId: string } }>(
  "/api/chats/:chatId/messages",
  async (request, reply) => {
    const auth = currentAuth(request.headers);
    if (!auth) return reply.code(401).send({ error: "Требуется авторизация" });
    if (!canSendToChat(request.params.chatId, auth.user.id)) {
      return reply
        .code(403)
        .send({ error: "В канале писать может только его владелец" });
    }

    const body = (request.body ?? {}) as {
      text?: unknown;
      sticker?: unknown;
      photo?: { fileId?: unknown };
      replyToId?: unknown;
    };
    const chatId = request.params.chatId;
    const text = (asString(body.text) ?? "").trim();
    const sticker = (asString(body.sticker) ?? "").trim();
    const photoFileId = asString(body.photo?.fileId) ?? "";
    const replyToId = asString(body.replyToId) ?? "";
    const replyTo = replyToId ? store.replySnapshot(chatId, replyToId) ?? null : null;
    if (replyToId && !replyTo) {
      return reply.code(400).send({ error: "Нельзя ответить на удалённое сообщение" });
    }

    if (photoFileId) {
      const attachment = store.getUpload(photoFileId);
      if (!attachment) {
        return reply.code(400).send({ error: "Файл не найден — загрузи его заново" });
      }
      const message = store.addMessage(chatId, auth.user.id, text, {
        type: "photo",
        photo: attachment,
        replyTo: replyTo ?? undefined,
      });
      broadcastNewMessage(message, null);
      return { message };
    }

    if (sticker) {
      if (sticker.length > 8) {
        return reply.code(400).send({ error: "Некорректный стикер" });
      }
      const message = store.addMessage(chatId, auth.user.id, "", {
        type: "sticker",
        sticker,
        replyTo: replyTo ?? undefined,
      });
      broadcastNewMessage(message, null);
      return { message };
    }

    if (!text) {
      return reply.code(400).send({ error: "Сообщение не может быть пустым" });
    }
    if (text.length > MAX_TEXT) {
      return reply
        .code(400)
        .send({ error: `Слишком длинное сообщение (максимум ${MAX_TEXT} символов)` });
    }

    const message = store.addMessage(chatId, auth.user.id, text, {
      replyTo: replyTo ?? undefined,
    });
    broadcastNewMessage(message, null);
    return { message };
  }
);

app.patch<{ Params: { chatId: string; messageId: string } }>(
  "/api/chats/:chatId/messages/:messageId",
  async (request, reply) => {
    const auth = currentAuth(request.headers);
    if (!auth) return reply.code(401).send({ error: "Требуется авторизация" });
    const { chatId, messageId } = request.params;
    const chat = store.getChat(chatId);
    const message = store.getMessageById(chatId, messageId);
    if (!chat || !message || !chat.memberIds.includes(auth.user.id)) {
      return reply.code(404).send({ error: "Сообщение не найдено" });
    }
    if (message.senderId !== auth.user.id && chat.ownerId !== auth.user.id) {
      return reply.code(403).send({ error: "Можно редактировать только свои сообщения" });
    }
    const text = (asString((request.body as { text?: unknown })?.text) ?? "").trim();
    if (!text || text.length > MAX_TEXT) {
      return reply
        .code(400)
        .send({ error: `Сообщение: 1–${MAX_TEXT} символов` });
    }
    const updated = store.editMessage(chatId, messageId, text) ?? message;
    for (const memberId of chat.memberIds) {
      sendToUser(memberId, { type: "message.edited", message: updated });
    }
    return { message: updated };
  }
);

app.delete<{ Params: { chatId: string; messageId: string } }>(
  "/api/chats/:chatId/messages/:messageId",
  async (request, reply) => {
    const auth = currentAuth(request.headers);
    if (!auth) return reply.code(401).send({ error: "Требуется авторизация" });
    const { chatId, messageId } = request.params;
    const chat = store.getChat(chatId);
    const message = store.getMessageById(chatId, messageId);
    if (!chat || !message || !chat.memberIds.includes(auth.user.id)) {
      return reply.code(404).send({ error: "Сообщение не найдено" });
    }
    if (message.senderId !== auth.user.id && chat.ownerId !== auth.user.id) {
      return reply.code(403).send({ error: "Можно удалять только свои сообщения" });
    }
    store.deleteMessage(chatId, messageId);
    for (const memberId of chat.memberIds) {
      sendToUser(memberId, {
        type: "message.deleted",
        chatId,
        messageId,
      });
    }
    return { ok: true };
  }
);

app.post<{ Params: { chatId: string; messageId: string } }>(
  "/api/chats/:chatId/messages/:messageId/reactions",
  async (request, reply) => {
    const auth = currentAuth(request.headers);
    if (!auth) return reply.code(401).send({ error: "Требуется авторизация" });
    const { chatId, messageId } = request.params;
    const chat = store.getChat(chatId);
    if (!chat || !chat.memberIds.includes(auth.user.id)) {
      return reply.code(404).send({ error: "Чат не найден" });
    }
    const emoji = asString((request.body as { emoji?: unknown })?.emoji) ?? "";
    if (!emoji.trim()) {
      return reply.code(400).send({ error: "Укажи эмодзи реакции" });
    }
    const updated = store.toggleReaction(chatId, messageId, auth.user.id, emoji);
    if (!updated) return reply.code(404).send({ error: "Сообщение не найдено" });
    for (const memberId of chat.memberIds) {
      sendToUser(memberId, {
        type: "message.reactions",
        chatId,
        messageId,
        reactions: updated.reactions ?? [],
      });
    }
    return { message: updated };
  }
);

app.post<{ Params: { chatId: string } }>(
  "/api/chats/:chatId/forward",
  async (request, reply) => {
    const auth = currentAuth(request.headers);
    if (!auth) return reply.code(401).send({ error: "Требуется авторизация" });
    const body = (request.body ?? {}) as { messageId?: unknown; toChatIds?: unknown };
    const messageId = asString(body.messageId) ?? "";
    const sourceChat = store.getChat(request.params.chatId);
    const message = store.getMessageById(request.params.chatId, messageId);
    if (!sourceChat || !message || message.deleted) {
      return reply.code(404).send({ error: "Сообщение не найдено" });
    }
    if (!sourceChat.memberIds.includes(auth.user.id)) {
      return reply.code(404).send({ error: "Чат не найден" });
    }
    if (sourceChat.noCopy && !auth.user.isOwner) {
      return reply.code(403).send({ error: "Сообщение защищено от пересылки" });
    }

    const rawTargets = Array.isArray(body.toChatIds) ? body.toChatIds : [];
    const targets = [...new Set(rawTargets.map((t) => asString(t) ?? "").filter(Boolean))];
    const author = store.getUserById(message.senderId);
    const forwardedFrom = {
      chatId: sourceChat.id,
      chatTitle: store.chatTitleFor(sourceChat.id, auth.user.id),
      senderName: author?.displayName ?? "…",
      messageId: message.id,
    };

    const forwarded: Message[] = [];
    for (const targetId of targets) {
      const target = store.getChat(targetId);
      if (!target) continue;
      if (!target.memberIds.includes(auth.user.id)) continue;
      if (!canSendToChat(target.id, auth.user.id)) continue;
      const copy = store.addMessage(target.id, auth.user.id, message.text, {
        type: message.type,
        sticker: message.sticker,
        photo: message.photo,
        forwardedFrom,
      });
      broadcastNewMessage(copy, null);
      forwarded.push(copy);
    }
    if (forwarded.length === 0) {
      return reply.code(400).send({ error: "Не выбран чат для пересылки" });
    }
    return { messages: forwarded };
  }
);

app.post<{ Params: { chatId: string } }>(
  "/api/chats/:chatId/no-copy",
  async (request, reply) => {
    const auth = currentAuth(request.headers);
    if (!auth) return reply.code(401).send({ error: "Требуется авторизация" });
    const chat = store.getChat(request.params.chatId);
    if (!chat || !chat.memberIds.includes(auth.user.id)) {
      return reply.code(404).send({ error: "Чат не найден" });
    }
    const allowed = auth.user.isOwner || chat.ownerId === auth.user.id;
    if (!allowed) {
      return reply.code(403).send({ error: "Защиту может включить только владелец" });
    }
    const noCopy = (request.body as { noCopy?: unknown })?.noCopy === true;
    const updated = store.setChatNoCopy(chat.id, noCopy) ?? chat;
    for (const memberId of chat.memberIds) {
      sendToUser(memberId, { type: "chat.noCopy", chatId: chat.id, noCopy });
    }
    return { chat: store.chatView(chat.id, auth.user.id) };
  }
);

app.post<{ Params: { chatId: string } }>(
  "/api/chats/:chatId/read",
  async (request, reply) => {
    const auth = currentAuth(request.headers);
    if (!auth) return reply.code(401).send({ error: "Требуется авторизация" });
    const chatId = request.params.chatId;
    if (!isMember(chatId, auth.user.id)) {
      return reply.code(404).send({ error: "Чат не найден" });
    }
    const messageId =
      (asString((request.body as { messageId?: unknown })?.messageId) as string) ?? "";
    const readId = store.markRead(auth.user.id, chatId, messageId);
    const chat = store.getChat(chatId);
    if (chat) {
      for (const memberId of chat.memberIds) {
        if (memberId === auth.user.id) continue;
        sendToUser(memberId, {
          type: "message.read",
          chatId,
          userId: auth.user.id,
          messageId: readId,
        });
      }
    }
    return { ok: true, readUntilId: readId };
  }
);

/* --------------------------------- ягоды ---------------------------------- */

app.get("/api/berries", async (request, reply) => {
  const auth = currentAuth(request.headers);
  if (!auth) return reply.code(401).send({ error: "Требуется авторизация" });
  const user = store.getUserById(auth.user.id);
  if (!user) return reply.code(404).send({ error: "Пользователь не найден" });
  return {
    balance: user.berries,
    transactions: store.getBerryTransactions(user.id),
  };
});

app.post("/api/berries/transfer", async (request, reply) => {
  const auth = currentAuth(request.headers);
  if (!auth) return reply.code(401).send({ error: "Требуется авторизация" });
  const body = (request.body ?? {}) as {
    toId?: unknown;
    amount?: unknown;
    note?: unknown;
  };
  const amount = Math.floor(Number(body.amount));
  const result = store.transferBerries(
    auth.user.id,
    (asString(body.toId) as string) ?? "",
    amount,
    (asString(body.note) as string) ?? ""
  );
  if (!result.ok) {
    return reply.code(400).send({ error: result.error ?? "Ошибка перевода" });
  }
  const me = store.getUserById(auth.user.id);
  const peer = store.getUserById((asString(body.toId) as string) ?? "");
  if (me) sendToUser(me.id, { type: "berries", berries: me.berries });
  if (peer) sendToUser(peer.id, { type: "berries", berries: peer.berries });
  return { ok: true, balance: result.balance };
});

app.post("/api/me/premium", async (request, reply) => {
  const auth = currentAuth(request.headers);
  if (!auth) return reply.code(401).send({ error: "Требуется авторизация" });
  const user = store.getUserById(auth.user.id);
  if (!user) return reply.code(404).send({ error: "Пользователь не найден" });
  if (user.isPremium) {
    return reply.code(400).send({ error: "Premium уже активен" });
  }
  if (user.berries < PREMIUM_PRICE) {
    return reply.code(400).send({
      error: `Для Premium нужно ${PREMIUM_PRICE} ягод, у тебя ${user.berries}`,
    });
  }
  const transfer = store.transferBerries(user.id, store.novaBotId() || user.id, PREMIUM_PRICE, "Premium");
  if (!transfer.ok) {
    return reply.code(400).send({ error: transfer.error ?? "Ошибка оплаты" });
  }
  const updated = store.updateUser(user.id, {
    isPremium: true,
    premiumUntil: Date.now() + PREMIUM_DAYS * 86400_000,
  });
  if (updated) sendToUser(updated.id, { type: "berries", berries: updated.berries });
  return { user: store.toPublicUser(updated ?? user), price: PREMIUM_PRICE, days: PREMIUM_DAYS };
});

/* ------------------------- панель владельца (/api/admin) ----------------- */

/** Админ-методы доступны только владельцу. */
function ownerAuth(
  request: { headers: { authorization?: string | string[] | undefined } },
  reply: { code: (n: number) => { send: (b: { error: string }) => unknown } }
): { user: StoredUser; token: string } | null {
  const auth = currentAuth(request.headers);
  if (!auth) {
    reply.code(401).send({ error: "Требуется авторизация" });
    return null;
  }
  if (!auth.user.isOwner) {
    reply.code(403).send({ error: "Доступно только владельцу" });
    return null;
  }
  return auth;
}

app.get("/api/admin/stats", async (request, reply) => {
  const auth = ownerAuth(request, reply);
  if (!auth) return;
  const types = store.chatTypeCounts();
  const stats = {
    users: store.listUsers().filter((u) => !u.isBot).length,
    bots: store.listBots().length,
    dms: types.dm,
    groups: types.group,
    channels: types.channel,
    saved: types.saved,
    chats: store.listChats().length,
    messages: store.messageCount(),
    uploads: store.uploadCount(),
    berriesTotal: store.berriesTotal(),
    online: connectedUserIds().length,
  };
  return { stats };
});

app.get("/api/admin/users", async (request, reply) => {
  const auth = ownerAuth(request, reply);
  if (!auth) return;
  const raw = (request.query as { q?: string | string[] })?.q;
  const q = (Array.isArray(raw) ? raw[0] ?? "" : raw ?? "").trim().toLowerCase();
  const users = store
    .listUsers()
    .filter((u) => !q || u.username.includes(q) || u.displayName.toLowerCase().includes(q))
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, 200)
    .map((u) => store.toPublicUser(u));
  return { users };
});

app.post<{ Params: { userId: string } }>(
  "/api/admin/users/:userId/berries",
  async (request, reply) => {
    const auth = ownerAuth(request, reply);
    if (!auth) return;
    const raw = (request.body as { amount?: unknown })?.amount;
    if (typeof raw !== "number" || !Number.isFinite(raw) || Math.abs(raw) > 1_000_000 || Math.trunc(raw) !== raw) {
      return reply.code(400).send({ error: "Сумма: целое число, по модулю до 1 000 000" });
    }
    const user = store.getUserById(request.params.userId);
    if (!user) return reply.code(404).send({ error: "Пользователь не найден" });
    const updated = store.addBerries(user.id, raw as number);
    if (updated) sendToUser(updated.id, { type: "berries", berries: updated.berries });
    return { user: store.toPublicUser(updated ?? user) };
  }
);

app.post<{ Params: { userId: string } }>(
  "/api/admin/users/:userId/premium",
  async (request, reply) => {
    const auth = ownerAuth(request, reply);
    if (!auth) return;
    const premium = (request.body as { premium?: unknown })?.premium === true;
    const user = store.getUserById(request.params.userId);
    if (!user) return reply.code(404).send({ error: "Пользователь не найден" });
    const updated = store.updateUser(user.id, {
      isPremium: premium,
      premiumUntil: premium ? Date.now() + PREMIUM_DAYS * 86400_000 : undefined,
    });
    if (updated) {
      broadcastUserUpdated(updated.id);
    }
    return { user: store.toPublicUser(updated ?? user) };
  }
);

app.post<{ Params: { userId: string } }>(
  "/api/admin/users/:userId/owner",
  async (request, reply) => {
    const auth = ownerAuth(request, reply);
    if (!auth) return;
    const owner = (request.body as { owner?: unknown })?.owner === true;
    const userId = request.params.userId;
    const user = store.getUserById(userId);
    if (!user) return reply.code(404).send({ error: "Пользователь не найден" });
    if (user.isBot) return reply.code(400).send({ error: "Бот не может быть владельцем" });
    if (userId === auth.user.id) {
      return reply.code(400).send({ error: "Нельзя менять роль самому себе" });
    }
    // Основной владелец (номер NOVA_OWNER_PHONE) неснимаем.
    if (user.phone && user.phone === OWNER_PHONE && !owner) {
      return reply.code(400).send({ error: "Нельзя снять роль с основного владельца" });
    }
    const updated = store.updateUser(userId, { isOwner: owner });
    if (updated) {
      broadcastUserUpdated(updated.id);
    }
    return { user: store.toPublicUser(updated ?? user) };
  }
);

app.post<{ Params: { userId: string } }>(
  "/api/admin/users/:userId/ban",
  async (request, reply) => {
    const auth = ownerAuth(request, reply);
    if (!auth) return;
    const ban = (request.body as { ban?: unknown })?.ban === true;
    const userId = request.params.userId;
    const user = store.getUserById(userId);
    if (!user) return reply.code(404).send({ error: "Пользователь не найден" });
    if (user.isBot) return reply.code(400).send({ error: "Бота банить нельзя" });
    if (user.id === auth.user.id) return reply.code(400).send({ error: "Нельзя забанить себя" });
    if ((user.isOwner || user.phone === OWNER_PHONE) && ban) {
      return reply.code(400).send({ error: "Нельзя забанить владельца" });
    }
    const updated = store.updateUser(userId, { isBanned: ban });
    if (ban) closeUserSockets(userId);
    return { user: store.toPublicUser(updated ?? user) };
  }
);

app.post<{ Params: { userId: string } }>(
  "/api/admin/users/:userId/verify",
  async (request, reply) => {
    const auth = ownerAuth(request, reply);
    if (!auth) return;
    const verify = (request.body as { verify?: unknown })?.verify === true;
    const user = store.getUserById(request.params.userId);
    if (!user) return reply.code(404).send({ error: "Пользователь не найден" });
    const updated = store.updateUser(user.id, { isVerified: verify });
    if (updated) {
      broadcastUserUpdated(updated.id);
    }
    return { user: store.toPublicUser(updated ?? user) };
  }
);

app.post<{ Params: { botId: string } }>(
  "/api/admin/bots/:botId/delete",
  async (request, reply) => {
    const auth = ownerAuth(request, reply);
    if (!auth) return;
    const bot = store.getUserById(request.params.botId);
    if (!bot || !bot.isBot) return reply.code(404).send({ error: "Бот не найден" });
    if (bot.username === store.NOVA_BOT_USERNAME) {
      return reply.code(400).send({ error: "Встроенный Nova — удалить нельзя" });
    }
    const botChats = store.listChats().filter((c) => c.memberIds.includes(bot.id));
    for (const chat of botChats) {
      for (const member of chat.memberIds) {
        sendToUser(member, { type: "chat.deleted", chatId: chat.id });
      }
    }
    store.deleteBot(bot.id);
    return { ok: true };
  }
);

app.get("/api/admin/chats", async (request, reply) => {
  const auth = ownerAuth(request, reply);
  if (!auth) return;
  const rawType = asString((request.query as { type?: string | string[] })?.type);
  const query = (request.query as { q?: string | string[] })?.q;
  const q = (Array.isArray(query) ? query[0] ?? "" : query ?? "").trim().toLowerCase();
  let chats = store.adminChatList();
  if (rawType === "group" || rawType === "channel" || rawType === "dm" || rawType === "saved") {
    chats = chats.filter((c) => c.type === rawType);
  }
  if (q) {
    chats = chats.filter(
      (c) => c.title.toLowerCase().includes(q) || (c.ownerName ?? "").toLowerCase().includes(q)
    );
  }
  return { chats };
});

app.post<{ Params: { chatId: string } }>(
  "/api/admin/chats/:chatId/delete",
  async (request, reply) => {
    const auth = ownerAuth(request, reply);
    if (!auth) return;
    const chat = store.getChat(request.params.chatId);
    if (!chat) return reply.code(404).send({ error: "Чат не найден" });
    store.deleteChat(chat.id);
    for (const member of chat.memberIds) {
      sendToUser(member, { type: "chat.deleted", chatId: chat.id });
    }
    return { ok: true };
  }
);

/* --------------------------------- файлы ---------------------------------- */

app.post("/api/uploads", async (request, reply) => {
  const auth = currentAuth(request.headers);
  if (!auth) return reply.code(401).send({ error: "Требуется авторизация" });

  const part = await request.file();
  if (!part) return reply.code(400).send({ error: "Файл не передан" });

  const ext = extname(part.filename || "").toLowerCase().slice(0, 10) || ".bin";
  const fileId = `${newId()}${ext}`;
  const dir = store.uploadsDir();
  mkdirSync(dir, { recursive: true });
  const dest = join(dir, fileId);
  await streamPipeline(part.file, createWriteStream(dest));

  const attachment = store.registerUpload({
    fileId,
    url: `/uploads/${fileId}`,
    mime: part.mimetype || "application/octet-stream",
    size: 0,
  });
  // Размер дадим после записи (filesize через stat не будем тянуть — аппроксимация).
  return { file: attachment };
});

/* ------------------------------- WebSocket -------------------------------- */

const socketsByUser = new Map<string, Set<WebSocket>>();

function registerSocket(userId: string, socket: WebSocket): void {
  let set = socketsByUser.get(userId);
  if (!set) {
    set = new Set();
    socketsByUser.set(userId, set);
  }
  set.add(socket);
}

/** Убирает сокет и возвращает false, если у пользователя не осталось сессий. */
function unregisterSocket(userId: string, socket: WebSocket): boolean {
  const set = socketsByUser.get(userId);
  if (!set) return true;
  set.delete(socket);
  if (set.size === 0) {
    socketsByUser.delete(userId);
    return false;
  }
  return true;
}

function connectedUserIds(): string[] {
  return [...socketsByUser.keys()];
}

function sendJson(socket: WebSocket, event: ServerEvent): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  try {
    socket.send(JSON.stringify(event));
  } catch {
    /* сокет мог закрыться прямо во время отправки */
  }
}

function sendToUser(userId: string, event: ServerEvent): void {
  const set = socketsByUser.get(userId);
  if (!set) return;
  for (const socket of set) sendJson(socket, event);
}

/** Рассылка карточки пользователя ему самому и всем, кто делит с ним чаты (live-бейджи). */
function broadcastUserUpdated(userId: string): void {
  const stored = store.getUserById(userId);
  if (!stored) return;
  const pub = store.toPublicUser(stored);
  const targets = new Set([userId, ...store.peersOf(userId)]);
  const event: ServerEvent = { type: "user.updated", user: pub };
  for (const id of targets) sendToUser(id, event);
}

/** Рассылка presence всем, кроме исключённого сокета. */
function broadcastPresence(
  userId: string,
  online: boolean,
  excludeSocket: WebSocket | null
): void {
  const event: ServerEvent = { type: "presence", userId, online };
  for (const otherId of connectedUserIds()) {
    if (otherId === userId) continue;
    const set = socketsByUser.get(otherId);
    if (!set) continue;
    for (const socket of set) {
      if (socket !== excludeSocket) sendJson(socket, event);
    }
  }
}

/** Рассылка нового сообщения всем членам чата, кроме исключённого сокета. */
function broadcastNewMessage(message: Message, excludeSocket: WebSocket | null): void {
  const chat = store.getChat(message.chatId);
  if (!chat) return;
  for (const memberId of chat.memberIds) {
    const set = socketsByUser.get(memberId);
    if (!set) continue;
    for (const socket of set) {
      if (socket !== excludeSocket) {
        sendJson(socket, { type: "message.new", message });
      }
    }
  }
}

function toPayload(rawData: unknown): string {
  if (typeof rawData === "string") return rawData;
  if (Buffer.isBuffer(rawData)) return rawData.toString("utf8");
  if (Array.isArray(rawData)) return Buffer.concat(rawData).toString("utf8");
  if (rawData instanceof ArrayBuffer) return new TextDecoder().decode(rawData);
  return String(rawData);
}

/** Мини-ответы встроенного бота Nova в личных чатах. */
/** Ищет сообщение в чатах пользователя по id. */
function findMyMessage(userId: string, messageId: string): Message | null {
  const chatIds = store
    .listChatViewsForUser(userId)
    .map((c) => c.id);
  for (const chatId of chatIds) {
    const m = store.getMessageById(chatId, messageId);
    if (m) return m;
  }
  return null;
}

function novaBotReply(chatId: string, userId: string, text: string): void {
  const botId = store.novaBotId();
  const chat = store.getChat(chatId);
  if (!botId || !chat || chat.type !== "dm") return;
  const peerId = chat.memberIds.find((id) => id !== userId);
  if (peerId !== botId) return;

  const lower = text.toLowerCase();
  let reply = "";
  if (lower.startsWith("/help") || lower.includes("что умеешь")) {
    reply =
      "Я встроенный бот Nova.\n\nУмею:\n• /help — этот список\n• «эконом» — совет по бюджету\n• «ягоды» — как заработать\n• «премиум» — что даёт Premium\n\nА ещё со мной можно просто поболтать.";
  } else if (lower.includes("эконом")) {
    reply =
      "Совет по бюджету: начни с личных чатов и «Избранного», а видео и фото держи до 5 МБ — так не разгонишь трафик";
  } else if (lower.includes("ягоды") || lower.includes("🍓")) {
    reply =
      "Ягоды — валюта Nova. За что даём: активность, помощь другим, переводы по кнопке «Передать ягоды». Premium стоит 199 ягод/мес.";
  } else if (lower.includes("премиум") || lower.includes("premium")) {
    reply =
      "Premium даёт бейдж, эксклюзивные стикеры и приоритетную поддержку. Купить можно в профиле за 199 ягод.";
  } else if (lower.includes(">")) {
    reply = "Я прочитал(а) и киваю";
  } else {
    reply = "Понял! Сообщение сохранил. Если нужен совет — напиши «эконом»";
  }
  setTimeout(() => {
    const message = store.addMessage(chatId, botId, reply);
    broadcastNewMessage(message, null);
  }, 600 + Math.random() * 900);
}

function handleClientEvent(
  userId: string,
  socket: WebSocket,
  event: ClientEvent
): void {
  switch (event.type) {
    case "message.send": {
      const chat = store.getChat(event.chatId);
      if (!chat || !chat.memberIds.includes(userId)) {
        sendJson(socket, { type: "error", error: "Чат не найден" });
        return;
      }
      const text = event.text.trim();
      const sticker = (event.sticker ?? "").trim();
      const replyTo = event.replyToId
        ? store.replySnapshot(event.chatId, event.replyToId) ?? null
        : null;
      if (event.replyToId && !replyTo) {
        sendJson(socket, { type: "error", error: "Нельзя ответить на удалённое сообщение" });
        return;
      }

      if (sticker && sticker.length <= 8) {
        const message = store.addMessage(chat.id, userId, "", {
          type: "sticker",
          sticker,
          replyTo: replyTo ?? undefined,
        });
        sendJson(socket, { type: "message.ack", clientId: event.clientId, message });
        broadcastNewMessage(message, socket);
        return;
      }

      if (!text) {
        sendJson(socket, { type: "error", error: "Сообщение не может быть пустым" });
        return;
      }
      if (text.length > MAX_TEXT) {
        sendJson(socket, { type: "error", error: "Слишком длинное сообщение" });
        return;
      }

      const message = store.addMessage(chat.id, userId, text, {
        replyTo: replyTo ?? undefined,
      });
      sendJson(socket, {
        type: "message.ack",
        clientId: event.clientId,
        message,
      });
      broadcastNewMessage(message, socket);
      novaBotReply(chat.id, userId, text);
      break;
    }
    case "message.edit": {
      const message = findMyMessage(userId, event.messageId);
      if (!message) {
        sendJson(socket, { type: "error", error: "Сообщение не найдено" });
        return;
      }
      const chat = store.getChat(message.chatId);
      const text = event.text.trim();
      if (!chat || !chat.memberIds.includes(userId)) {
        sendJson(socket, { type: "error", error: "Чат не найден" });
        return;
      }
      if (message.senderId !== userId && chat.ownerId !== userId) {
        sendJson(socket, { type: "error", error: "Нельзя редактировать чужие сообщения" });
        return;
      }
      if (!text || text.length > MAX_TEXT) {
        sendJson(socket, { type: "error", error: "Сообщение не может быть пустым" });
        return;
      }
      const updated = store.editMessage(message.chatId, message.id, text);
      if (!updated) return;
      for (const memberId of chat.memberIds) {
        sendToUser(memberId, { type: "message.edited", message: updated });
      }
      break;
    }
    case "message.delete": {
      const target = findMyMessage(userId, event.messageId);
      if (!target) {
        sendJson(socket, { type: "error", error: "Сообщение не найдено" });
        return;
      }
      const chat = store.getChat(target.chatId);
      if (!chat) return;
      if (target.senderId !== userId && chat.ownerId !== userId) {
        sendJson(socket, { type: "error", error: "Нельзя удалять чужие сообщения" });
        return;
      }
      store.deleteMessage(target.chatId, target.id);
      for (const memberId of chat.memberIds) {
        sendToUser(memberId, {
          type: "message.deleted",
          chatId: target.chatId,
          messageId: target.id,
        });
      }
      break;
    }
    case "message.read": {
      const chat = store.getChat(event.chatId);
      if (!chat || !chat.memberIds.includes(userId)) return;
      const readId = store.markRead(userId, event.chatId, event.messageId);
      for (const memberId of chat.memberIds) {
        if (memberId === userId) continue;
        sendToUser(memberId, {
          type: "message.read",
          chatId: event.chatId,
          userId,
          messageId: readId,
        });
      }
      break;
    }
    case "typing": {
      const chat = store.getChat(event.chatId);
      if (!chat) return;
      for (const memberId of chat.memberIds) {
        if (memberId === userId) continue;
        sendToUser(memberId, {
          type: "typing",
          chatId: chat.id,
          userId,
          isTyping: Boolean(event.isTyping),
        });
      }
      break;
    }
    case "call": {
      const chat = store.getChat(event.chatId);
      if (!chat || !chat.memberIds.includes(userId)) {
        sendJson(socket, { type: "error", error: "Чат не найден" });
        return;
      }
      for (const memberId of chat.memberIds) {
        if (memberId === userId) continue;
        sendToUser(memberId, {
          type: "call",
          chatId: chat.id,
          callId: event.callId,
          from: userId,
          to: memberId,
          action: event.action,
          payload: event.payload,
        });
      }
      break;
    }
    case "ping":
      break;
    default:
      break;
  }
}

app.get("/ws", { websocket: true }, (socket, request) => {
  const raw = (request.query as { token?: string | string[] })?.token;
  const token = Array.isArray(raw) ? raw[0] ?? "" : raw ?? "";
  const userId = userIdFromToken(token || undefined);

  if (!userId) {
    socket.close(4001, "Пользователь не авторизован");
    return;
  }
  const wsUser = store.getUserById(userId);
  if (!wsUser || wsUser.isBanned) {
    socket.close(4001, "Аккаунт заблокирован");
    return;
  }

  registerSocket(userId, socket);
  store.touchActivity(userId);
  sendJson(socket, { type: "ready", you: userId, online: connectedUserIds() });
  broadcastPresence(userId, true, socket);

  socket.on("message", (rawData) => {
    let event: ClientEvent;
    try {
      event = JSON.parse(toPayload(rawData)) as ClientEvent;
    } catch {
      return; // некорректные кадры игнорируем
    }
    handleClientEvent(userId, socket, event);
  });

  socket.on("close", () => {
    const stillOnline = unregisterSocket(userId, socket);
    if (!stillOnline) {
      store.touchActivity(userId);
      broadcastPresence(userId, false, null);
    }
  });

  socket.on("error", () => socket.close());
});

/* ---------------------------------- старт --------------------------------- */

try {
  await app.listen({ port: PORT, host: HOST });
  app.log.info(
    `Nova v2 слушает http://${HOST}:${PORT} (REST + WebSocket /ws, данные в data/db.json)`
  );
} catch (err) {
  app.log.error(err);
  process.exit(1);
}