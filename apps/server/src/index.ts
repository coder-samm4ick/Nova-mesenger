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
  destroyUserSessions,
  hashPassword,
  listUserSessions,
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
 * Номер телефона владельца (+888 222 9922): регистрация на этот номер
 * делает тебя владельцем. Переопределяется env NOVA_OWNER_PHONE.
 */
const OWNER_PHONE = (process.env.NOVA_OWNER_PHONE ?? "8882229922").replace(/\D/g, "");
const PREMIUM_PRICE = Number(process.env.NOVA_PREMIUM_PRICE ?? 199);
const PREMIUM_DAYS = Number(process.env.NOVA_PREMIUM_DAYS ?? 30);
const SERVER_VERSION = process.env.NOVA_VERSION ?? "2.1.0";

const app = fastify({ logger: true });

/* Пустое тело без content-type не должно давать 415. */
app.addContentTypeParser(
  "application/json",
  { parseAs: "string" },
  (_request, body, done) => {
    const raw = typeof body === "string" ? body.trim() : "";
    if (!raw) return done(null, undefined);
    try {
      done(null, JSON.parse(raw));
    } catch {
      done(new Error("Некорректный JSON"), undefined);
    }
  }
);

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
  if (store.serverMeta().maintenance && phone !== OWNER_PHONE) {
    return reply
      .code(503)
      .send({ error: "Сервер на обслуживании — регистрация временно закрыта" });
  }
  if (ipBanned(request) && phone !== OWNER_PHONE) {
    return reply.code(403).send({ error: "IP-адрес заблокирован" });
  }
  if (!store.serverSettings().registrationOpen && phone !== OWNER_PHONE) {
    return reply.code(403).send({ error: "Регистрация новых пользователей закрыта" });
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

  const regIp = clientIp(request);
  if (regIp) store.updateUser(user.id, { ip: regIp });

  const token = createSession(user.id, sessionInfo(request));
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
  if (store.serverMeta().maintenance && !user.isOwner) {
    return reply
      .code(503)
      .send({ error: "Сервер на обслуживании — вход только для владельца" });
  }
  if (ipBanned(request)) {
    return reply.code(403).send({ error: "IP-адрес заблокирован" });
  }

  const ip = clientIp(request);
  if (ip) store.updateUser(user.id, { ip });

  const token = createSession(user.id, sessionInfo(request));
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
    /* владелец может читать любую переписку (модерация) */
    if (
      !isMember(request.params.chatId, auth.user.id) &&
      !auth.user.isOwner
    ) {
      return reply.code(404).send({ error: "Чат не найден" });
    }
    const query = request.query as { limit?: string | string[]; before?: string | string[] };
    const limit = Number(Array.isArray(query.limit) ? query.limit[0] : query.limit);
    const before = Array.isArray(query.before) ? query.before[0] : query.before;
    const messages = store.getMessagesPage(request.params.chatId, {
      limit: Number.isFinite(limit) ? limit : 50,
      beforeId: before || undefined,
    });
    /* shadowban: остальным не видны сообщения, отправленные после включения;
       владелец видит всё (модерация) */
    const visible = auth.user.isOwner
      ? messages
      : messages.filter((m) => {
          if (m.senderId === auth.user.id) return true;
          const sender = store.getUserById(m.senderId);
          if (!sender?.shadowBanned) return true;
          const since = sender.shadowBannedAt ?? 0;
          return m.createdAt < since;
        });
    return { messages: visible };
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

    const blocked = moderationError(auth.user.id, (asString((request.body as { text?: unknown })?.text) ?? "").trim());
    if (blocked) {
      return reply.code(403).send({ error: blocked });
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
  const meta = store.serverMeta();
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
    uptimeSec: Math.round(process.uptime()),
    memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
    wsConnections: connectedUserIds().length,
    version: SERVER_VERSION,
    maintenance: meta.maintenance,
    startedAt: meta.startedAt,
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
    .map((u) => store.toAdminUser(u));
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
    return { user: store.toAdminUser(updated ?? user) };
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
    return { user: store.toAdminUser(updated ?? user) };
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
    return { user: store.toAdminUser(updated ?? user) };
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
    return { user: store.toAdminUser(updated ?? user) };
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

/* --------------------- профиль, модерация, рассылка ------------------------ */

/** Публичный профиль пользователя: статусы, онлайн, общие чаты. */
app.get<{ Params: { userId: string } }>(
  "/api/users/:userId/profile",
  async (request, reply) => {
    const auth = currentAuth(request.headers);
    if (!auth) return reply.code(401).send({ error: "Требуется авторизация" });
    const user = store.getUserById(request.params.userId);
    if (!user) return reply.code(404).send({ error: "Пользователь не найден" });
    const sharedChats = store
      .listChats()
      .filter(
        (c) =>
          c.type !== "saved" &&
          c.memberIds.includes(auth.user.id) &&
          c.memberIds.includes(user.id)
      ).length;
    return {
      user: auth.user.isOwner ? store.toAdminUser(user) : store.toPublicUser(user),
      online: connectedUserIds().includes(user.id),
      sharedChats,
      messagesSent: auth.user.isOwner ? store.userMessageCount(user.id) : undefined,
    };
  }
);

/** Карточка пользователя для панели: профиль, счётчики и его чаты. */
app.get<{ Params: { userId: string } }>(
  "/api/admin/users/:userId/detail",
  async (request, reply) => {
    const auth = ownerAuth(request, reply);
    if (!auth) return;
    const user = store.getUserById(request.params.userId);
    if (!user) return reply.code(404).send({ error: "Пользователь не найден" });
    const chats = store
      .adminChatList()
      .filter((c) => c.memberIds.includes(user.id))
      .slice(0, 30);
    return {
      user: store.toAdminUser(user),
      online: connectedUserIds().includes(user.id),
      messagesSent: store.userMessageCount(user.id),
      transfers: store.getBerryTransactions(user.id, 500).length,
      chats,
    };
  }
);

/** Сброс пароля: человек входит только с новым паролем, сессии закрываются. */
app.post<{ Params: { userId: string } }>(
  "/api/admin/users/:userId/password",
  async (request, reply) => {
    const auth = ownerAuth(request, reply);
    if (!auth) return;
    const password = asString((request.body as { password?: unknown })?.password) ?? "";
    if (password.length < MIN_PASSWORD) {
      return reply.code(400).send({ error: `Пароль: минимум ${MIN_PASSWORD} символов` });
    }
    const user = store.getUserById(request.params.userId);
    if (!user) return reply.code(404).send({ error: "Пользователь не найден" });
    if (user.isBot) return reply.code(400).send({ error: "У бота нет пароля" });
    const salt = makeSalt();
    const passwordHash = await hashPassword(password, salt);
    store.setUserPassword(user.id, passwordHash, salt);
    closeUserSockets(user.id);
    destroyUserSessions(user.id);
    return { ok: true };
  }
);

/** Полное удаление аккаунта: чаты, сообщения, сессии. */
app.delete<{ Params: { userId: string } }>(
  "/api/admin/users/:userId",
  async (request, reply) => {
    const auth = ownerAuth(request, reply);
    if (!auth) return;
    const user = store.getUserById(request.params.userId);
    if (!user) return reply.code(404).send({ error: "Пользователь не найден" });
    if (user.id === auth.user.id) {
      return reply.code(400).send({ error: "Нельзя удалить самого себя" });
    }
    if (user.phone === OWNER_PHONE) {
      return reply.code(400).send({ error: "Нельзя удалить основного владельца" });
    }
    if (user.isBot && user.username === store.NOVA_BOT_USERNAME) {
      return reply.code(400).send({ error: "Встроенный Nova неделим" });
    }
    for (const chat of store.listChats()) {
      if (!chat.memberIds.includes(user.id)) continue;
      for (const member of chat.memberIds) {
        if (member !== user.id) {
          sendToUser(member, { type: "chat.deleted", chatId: chat.id });
        }
      }
    }
    closeUserSockets(user.id);
    destroyUserSessions(user.id);
    store.deleteUser(user.id);
    return { ok: true };
  }
);

/** Рассылка: сообщение в чат Nova + уведомление всем в сети. */
app.post("/api/admin/broadcast", async (request, reply) => {
  const auth = ownerAuth(request, reply);
  if (!auth) return;
  const text = (asString((request.body as { text?: unknown })?.text) ?? "").trim();
  if (!text) return reply.code(400).send({ error: "Текст рассылки пуст" });
  if (text.length > MAX_TEXT) {
    return reply.code(400).send({ error: `Рассылка: до ${MAX_TEXT} символов` });
  }
  const botId = store.novaBotId();
  let sent = 0;
  for (const user of store.listUsers()) {
    if (user.isBot) continue;
    if (botId) {
      const chat = store.ensureDm(user.id, botId);
      store.addMessage(chat.id, botId, text, { type: "text" });
      const last = store.getLastMessage(chat.id);
      if (last) sendToUser(user.id, { type: "message.new", message: last });
    }
    sendToUser(user.id, { type: "announcement", text });
    sent += 1;
  }
  return { sent };
});

/** Режим обслуживания: вход и регистрация — только владельцу. */
app.post("/api/admin/maintenance", async (request, reply) => {
  const auth = ownerAuth(request, reply);
  if (!auth) return;
  const on = (request.body as { on?: unknown })?.on === true;
  store.setMaintenance(on);
  if (on) {
    for (const user of store.listUsers()) {
      if (user.isBot || user.isOwner) continue;
      sendToUser(user.id, {
        type: "announcement",
        text: "Сервер временно на обслуживании. Зайди позже.",
      });
      closeUserSockets(user.id);
      destroyUserSessions(user.id);
    }
  }
  return { maintenance: on };
});

/** Модерация: удалить любое сообщение на сервере. */
app.post<{ Params: { messageId: string } }>(
  "/api/admin/messages/:messageId/delete",
  async (request, reply) => {
    const auth = ownerAuth(request, reply);
    if (!auth) return;
    const found = store.findChatByMessage(request.params.messageId);
    if (!found) return reply.code(404).send({ error: "Сообщение не найдено" });
    const chat = store.getChat(found.chatId);
    if (!store.deleteMessage(found.chatId, found.message.id)) {
      return reply.code(404).send({ error: "Сообщение не найдено" });
    }
    if (chat) {
      for (const member of chat.memberIds) {
        sendToUser(member, {
          type: "message.deleted",
          messageId: found.message.id,
          chatId: found.chatId,
        });
      }
    }
    return { ok: true };
  }
);

/* ================= СИСТЕМА ПОДАРКОВ ================= */

app.get("/api/gifts/catalog", async (request, reply) => {
  const auth = currentAuth(request.headers);
  if (!auth) return reply.code(401).send({ error: "Требуется авторизация" });
  return { gifts: store.listGiftCatalog(), balance: auth.user.berries };
});

app.post("/api/gifts/send", async (request, reply) => {
  const auth = currentAuth(request.headers);
  if (!auth) return reply.code(401).send({ error: "Требуется авторизация" });
  const body = (request.body ?? {}) as {
    giftId?: unknown; toId?: unknown; anonymous?: unknown; note?: unknown; scheduledFor?: unknown;
  };
  const giftId = asString(body.giftId) ?? "";
  const toId = asString(body.toId) ?? "";
  const anonymous = body.anonymous === true;
  const note = (asString(body.note) ?? "").trim().slice(0, 200);
  const scheduledFor = typeof body.scheduledFor === "number" ? body.scheduledFor : undefined;
  const target = store.getUserById(toId);
  if (!target) return reply.code(404).send({ error: "Получатель не найден" });
  const item = store.getGiftItem(giftId);
  if (!item || !item.active) return reply.code(404).send({ error: "Подарок не найден" });
  if (item.total > 0 && item.sold >= item.total) {
    return reply.code(409).send({ error: "Тираж закончился" });
  }
  if (auth.user.berries < item.price) {
    return reply.code(400).send({ error: "Недостаточно звёзд" });
  }
  store.addBerries(auth.user.id, -item.price);
  const gift = store.createGift({
    giftId: item.id, toId: target.id, fromId: anonymous ? null : auth.user.id,
    fromName: anonymous ? "Аноним" : auth.user.displayName, note, scheduledFor,
  });
  if (!gift) return reply.code(500).send({ error: "Не удалось создать подарок" });
  sendToUser(target.id, { type: "gift.received", gift });
  sendToUser(auth.user.id, { type: "berries", berries: auth.user.berries - item.price });
  if (auth.user.isOwner) {
    store.logAdmin({ adminId: auth.user.id, adminName: auth.user.displayName, action: "gift.send",
      targetType: "user", targetId: target.id, meta: `${item.name} → ${target.username}` });
  }
  return { gift, balance: auth.user.berries - item.price };
});

app.get<{ Params: { userId: string } }>("/api/gifts/user/:userId", async (request, reply) => {
  const auth = currentAuth(request.headers);
  if (!auth) return reply.code(401).send({ error: "Требуется авторизация" });
  const uid = request.params.userId;
  if (!store.getUserById(uid)) return reply.code(404).send({ error: "Пользователь не найден" });
  const gifts = store.giftsForUser(uid);
  return { gifts, collector: store.collectorLevel(uid) };
});

app.post("/api/promo/redeem", async (request, reply) => {
  const auth = currentAuth(request.headers);
  if (!auth) return reply.code(401).send({ error: "Требуется авторизация" });
  const code = (asString((request.body as { code?: unknown })?.code) ?? "").trim().toLowerCase();
  const promo = store.findPromo(code);
  if (!promo || !promo.active) return reply.code(404).send({ error: "Промокод не найден" });
  if (promo.maxUses > 0 && promo.uses >= promo.maxUses) return reply.code(409).send({ error: "Промокод использован" });
  if (promo.expiresAt && promo.expiresAt < Date.now()) return reply.code(410).send({ error: "Промокод истёк" });
  store.updatePromo(code, { uses: promo.uses + 1 });
  const updated = store.addBerries(auth.user.id, promo.berries);
  sendToUser(auth.user.id, { type: "berries", berries: updated?.berries ?? auth.user.berries });
  return { berries: promo.berries, balance: updated?.berries ?? auth.user.berries };
});

app.post("/api/reports", async (request, reply) => {
  const auth = currentAuth(request.headers);
  if (!auth) return reply.code(401).send({ error: "Требуется авторизация" });
  const body = (request.body ?? {}) as { targetType?: unknown; targetId?: unknown; reason?: unknown };
  const targetType = asString(body.targetType);
  const targetId = asString(body.targetId) ?? "";
  const reason = (asString(body.reason) ?? "").trim().slice(0, 300);
  if (!["user", "message", "chat"].includes(targetType ?? "") || !targetId) {
    return reply.code(400).send({ error: "Некорректная жалоба" });
  }
  const report = store.addReport({ reporterId: auth.user.id, targetType: targetType as "user" | "message" | "chat", targetId, reason });
  return { report };
});

/* ================= НАСТРОЙКИ СЕРВЕРА ================= */

app.get("/api/settings", async (request, reply) => {
  const auth = currentAuth(request.headers);
  if (!auth) return reply.code(401).send({ error: "Требуется авторизация" });
  const s = store.serverSettings();
  /* Владелец получает настройки целиком (для панели). */
  if (auth.user.isOwner) return { settings: s };
  return {
    settings: {
      registrationOpen: s.registrationOpen,
      rateLimitPerMin: s.rateLimitPerMin,
      features: s.features,
      wordBlacklist: [],
      linkWhitelist: [],
      bannedIps: [],
    },
  };
});

/* ================= файлы: раздел модерации ================= */

app.get("/api/admin/logs", async (request, reply) => {
  const auth = ownerAuth(request, reply);
  if (!auth) return;
  return { logs: store.listAdminLogs() };
});

app.get("/api/admin/reports", async (request, reply) => {
  const auth = ownerAuth(request, reply);
  if (!auth) return;
  const status = asString((request.query as { status?: string })?.status) as
    | "open" | "resolved" | "dismissed" | null;
  return { reports: store.listReports(status ?? undefined) };
});

app.post<{ Params: { id: string } }>("/api/admin/reports/:id/resolve", async (request, reply) => {
  const auth = ownerAuth(request, reply);
  if (!auth) return;
  const status = ((request.body as { status?: unknown })?.status === "dismissed" ? "dismissed" : "resolved") as
    "resolved" | "dismissed";
  const report = store.resolveReport(request.params.id, auth.user.id, status);
  if (!report) return reply.code(404).send({ error: "Жалоба не найдена" });
  store.logAdmin({ adminId: auth.user.id, adminName: auth.user.displayName,
    action: status === "resolved" ? "report.resolve" : "report.dismiss", targetType: "report", targetId: report.id });
  return { report };
});

/* --- модерация: mute, shadowban, бан с причиной и сроком --- */

app.post<{ Params: { userId: string } }>("/api/admin/users/:userId/mute", async (request, reply) => {
  const auth = ownerAuth(request, reply);
  if (!auth) return;
  const minutes = Number((request.body as { minutes?: unknown })?.minutes ?? 0);
  const reason = (asString((request.body as { reason?: unknown })?.reason) ?? "").trim().slice(0, 200);
  const until = minutes > 0 ? Date.now() + minutes * 60_000 : undefined;
  const updated = store.updateUser(request.params.userId, { mutedUntil: until });
  if (!updated) return reply.code(404).send({ error: "Пользователь не найден" });
  store.logAdmin({ adminId: auth.user.id, adminName: auth.user.displayName,
    action: until ? "user.mute" : "user.unmute", targetType: "user", targetId: updated.id,
    meta: `${minutes ? `${minutes} мин` : "навсегда"}${reason ? ` (${reason})` : ""}` });
  return { user: store.toAdminUser(updated) };
});

app.post<{ Params: { userId: string } }>("/api/admin/users/:userId/shadowban", async (request, reply) => {
  const auth = ownerAuth(request, reply);
  if (!auth) return;
  const on = (request.body as { on?: unknown })?.on === true;
  const updated = store.updateUser(request.params.userId, {
    shadowBanned: on,
    /* скрываем только то, что отправлено после включения */
    shadowBannedAt: on ? Date.now() : undefined,
  });
  if (!updated) return reply.code(404).send({ error: "Пользователь не найден" });
  store.logAdmin({ adminId: auth.user.id, adminName: auth.user.displayName,
    action: on ? "user.shadowban" : "user.unshadowban", targetType: "user", targetId: updated.id });
  return { user: store.toAdminUser(updated) };
});

app.post<{ Params: { userId: string } }>("/api/admin/users/:userId/ban", async (request, reply) => {
  const auth = ownerAuth(request, reply);
  if (!auth) return;
  const body = (request.body ?? {}) as { ban?: unknown; reason?: unknown; minutes?: unknown };
  const ban = body.ban === true;
  const reason = (asString(body.reason) ?? "").trim().slice(0, 200);
  const minutes = Number(body.minutes ?? 0);
  const userId = request.params.userId;
  const user = store.getUserById(userId);
  if (!user) return reply.code(404).send({ error: "Пользователь не найден" });
  if (user.isBot) return reply.code(400).send({ error: "Бота банить нельзя" });
  if (user.id === auth.user.id) return reply.code(400).send({ error: "Нельзя забанить себя" });
  if ((user.isOwner || user.phone === OWNER_PHONE) && ban) {
    return reply.code(400).send({ error: "Нельзя забанить владельца" });
  }
  const bannedUntil = ban && minutes > 0 ? Date.now() + minutes * 60_000 : undefined;
  const updated = store.updateUser(userId, {
    isBanned: ban, bannedReason: ban ? reason : undefined, bannedUntil,
  });
  if (ban) { closeUserSockets(userId); destroyUserSessions(userId); }
  if (updated) broadcastUserUpdated(updated.id);
  store.logAdmin({ adminId: auth.user.id, adminName: auth.user.displayName,
    action: ban ? "user.ban" : "user.unban", targetType: "user", targetId: userId, meta: reason || undefined });
  return { user: store.toAdminUser(updated ?? user) };
});

/* --- подарки: управление каталогом --- */

app.get("/api/admin/gifts", async (request, reply) => {
  const auth = ownerAuth(request, reply);
  if (!auth) return;
  return { gifts: store.listGiftCatalog() };
});

app.post("/api/admin/gifts", async (request, reply) => {
  const auth = ownerAuth(request, reply);
  if (!auth) return;
  const body = (request.body ?? {}) as {
    name?: unknown; glyph?: unknown; rarity?: unknown; category?: unknown;
    price?: unknown; total?: unknown;
  };
  const name = (asString(body.name) ?? "").trim();
  if (!name) return reply.code(400).send({ error: "Укажи название" });
  const item = store.addGiftItem({
    id: newId(), name, glyph: (asString(body.glyph) ?? "🎁").slice(0, 8),
    rarity: (asString(body.rarity) as "common") ?? "common",
    category: asString(body.category) ?? "collectible",
    price: Math.max(0, Math.trunc(Number(body.price ?? 10))),
    total: Math.max(0, Math.trunc(Number(body.total ?? 0))),
    active: true,
  });
  store.logAdmin({ adminId: auth.user.id, adminName: auth.user.displayName, action: "gift.create", targetType: "gift", targetId: item.id });
  return { gift: item };
});

app.patch<{ Params: { id: string } }>("/api/admin/gifts/:id", async (request, reply) => {
  const auth = ownerAuth(request, reply);
  if (!auth) return;
  const body = (request.body ?? {}) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const k of ["name", "glyph", "rarity", "category", "active"]) if (k in body) patch[k] = body[k];
  if ("price" in body) patch.price = Math.max(0, Math.trunc(Number(body.price)));
  if ("total" in body) patch.total = Math.max(0, Math.trunc(Number(body.total)));
  const item = store.updateGiftItem(request.params.id, patch);
  if (!item) return reply.code(404).send({ error: "Подарок не найден" });
  return { gift: item };
});

app.delete<{ Params: { id: string } }>("/api/admin/gifts/:id", async (request, reply) => {
  const auth = ownerAuth(request, reply);
  if (!auth) return;
  if (!store.removeGiftItem(request.params.id)) return reply.code(404).send({ error: "Подарок не найден" });
  return { ok: true };
});

/* --- промокоды --- */

app.post("/api/admin/promo", async (request, reply) => {
  const auth = ownerAuth(request, reply);
  if (!auth) return;
  const body = (request.body ?? {}) as { code?: unknown; berries?: unknown; maxUses?: unknown; expiresAt?: unknown };
  const code = (asString(body.code) ?? "").trim();
  if (!/^[a-z0-9_-]{3,32}$/i.test(code)) return reply.code(400).send({ error: "Код: 3–32 символа" });
  if (store.findPromo(code)) return reply.code(409).send({ error: "Такой код уже есть" });
  const promo = store.createPromo({
    code, berries: Math.max(1, Math.trunc(Number(body.berries ?? 50))),
    maxUses: Math.max(0, Math.trunc(Number(body.maxUses ?? 0))),
    expiresAt: typeof body.expiresAt === "number" ? body.expiresAt : null,
    active: true, createdBy: auth.user.id,
  });
  return { promo };
});

app.get("/api/admin/promo", async (request, reply) => {
  const auth = ownerAuth(request, reply);
  if (!auth) return;
  return { promos: store.listPromos() };
});

app.patch<{ Params: { code: string } }>("/api/admin/promo/:code", async (request, reply) => {
  const auth = ownerAuth(request, reply);
  if (!auth) return;
  const active = (request.body as { active?: unknown })?.active;
  const promo = store.updatePromo(request.params.code, typeof active === "boolean" ? { active } : {});
  if (!promo) return reply.code(404).send({ error: "Промокод не найден" });
  return { promo };
});

/* --- настройки сервера (feature-флаги, чёрный список, регистрация) --- */

/** Чтение настроек для панели: целиком, только владелец. */
app.get("/api/admin/settings", async (request, reply) => {
  const auth = ownerAuth(request, reply);
  if (!auth) return;
  return { settings: store.serverSettings() };
});

app.put("/api/admin/settings", async (request, reply) => {
  const auth = ownerAuth(request, reply);
  if (!auth) return;
  const body = (request.body ?? {}) as Partial<{
    registrationOpen: boolean; wordBlacklist: string[]; linkWhitelist: string[];
    rateLimitPerMin: number; bannedIps: string[]; features: Record<string, boolean>;
  }>;
  const s = store.updateSettings(body);
  store.logAdmin({ adminId: auth.user.id, adminName: auth.user.displayName, action: "settings.update",
    meta: Object.keys(body).join(", ") });
  return { settings: s };
});

/* --- аналитика --- */

app.get("/api/admin/analytics", async (request, reply) => {
  const auth = ownerAuth(request, reply);
  if (!auth) return;
  const days = Math.min(90, Math.max(7, Number((request.query as { days?: string })?.days ?? 14)));
  const top = store.topActiveUsers(20).map((t) => ({
    ...t, user: store.toAdminUser(store.getUserById(t.userId) ?? { id: t.userId, username: "unknown", displayName: "Удалён", avatarColor: "#666", berries: 0, createdAt: 0, passwordHash: "", salt: "" } as StoredUser),
  }));
  return { days: store.dayStats(days), top };
});

app.get("/api/admin/economy", async (request, reply) => {
  const auth = ownerAuth(request, reply);
  if (!auth) return;
  return { transactions: store.allTransactions(500), total: store.berriesTotal() };
});

app.get("/api/admin/export", async (request, reply) => {
  const auth = ownerAuth(request, reply);
  if (!auth) return;
  const format = asString((request.query as { format?: string })?.format) ?? "json";
  const users = store.listUsers().map((u) => store.toAdminUser(u));
  store.logAdmin({ adminId: auth.user.id, adminName: auth.user.displayName, action: "data.export", meta: format });
  if (format === "csv") {
    reply.header("content-type", "text/csv; charset=utf-8");
    reply.header("content-disposition", "attachment; filename=nova-users.csv");
    const head = "id,username,displayName,phone,berries,isOwner,isPremium,isVerified,isBanned,createdAt";
    const rows = users.map((u) => [u.id, u.username, `"${u.displayName}"`, u.phone ?? "", u.berries,
      u.isOwner, u.isPremium, u.isVerified, u.isBanned, new Date(u.createdAt).toISOString()].join(","));
    return [head, ...rows].join("\n");
  }
  return { users };
});

/* ---------------- панель владельца: сессии, массовое, бэкапы ----------------- */

app.get<{ Params: { userId: string } }>(
  "/api/admin/users/:userId/sessions",
  async (request, reply) => {
    const auth = ownerAuth(request, reply);
    if (!auth) return;
    const target = store.getUserById(request.params.userId);
    if (!target) return reply.code(404).send({ error: "Пользователь не найден" });
    const sessions = listUserSessions(target.id).map((s) => ({
      token: s.token,
      createdAt: s.createdAt,
      ua: s.ua ?? "",
      ip: s.ip ?? "",
      current: false,
    }));
    return { sessions };
  }
);

app.post<{ Params: { userId: string } }>(
  "/api/admin/users/:userId/sessions/revoke",
  async (request, reply) => {
    const auth = ownerAuth(request, reply);
    if (!auth) return;
    const token = asString((request.body as { token?: unknown })?.token) ?? "";
    if (!token) return reply.code(400).send({ error: "Укажи токен сессии" });
    destroySession(token);
    store.logAdmin({
      adminId: auth.user.id,
      adminName: auth.user.displayName,
      action: "session.revoke",
      meta: request.params.userId,
    });
    return { ok: true };
  }
);

app.post<{ Params: { userId: string } }>(
  "/api/admin/users/:userId/logout-all",
  async (request, reply) => {
    const auth = ownerAuth(request, reply);
    if (!auth) return;
    const target = store.getUserById(request.params.userId);
    if (!target) return reply.code(404).send({ error: "Пользователь не найден" });
    destroyUserSessions(target.id);
    closeUserSockets(target.id);
    store.logAdmin({
      adminId: auth.user.id,
      adminName: auth.user.displayName,
      action: "session.logout_all",
      meta: target.username,
    });
    return { ok: true };
  }
);

/** Режим «войти как этот пользователь»: временный токен цели. */
app.post<{ Params: { userId: string } }>(
  "/api/admin/users/:userId/impersonate",
  async (request, reply) => {
    const auth = ownerAuth(request, reply);
    if (!auth) return;
    const target = store.getUserById(request.params.userId);
    if (!target) return reply.code(404).send({ error: "Пользователь не найден" });
    if (target.id === auth.user.id) {
      return reply.code(400).send({ error: "Это и так вы" });
    }
    const token = createSession(target.id, sessionInfo(request));
    store.logAdmin({
      adminId: auth.user.id,
      adminName: auth.user.displayName,
      action: "user.impersonate",
      meta: target.username,
    });
    return { token, user: store.toAdminUser(target) };
  }
);

/** Массовое удаление сообщений: чат, автор и/или «раньше времени». */
app.post("/api/admin/messages/mass-delete", async (request, reply) => {
  const auth = ownerAuth(request, reply);
  if (!auth) return;
  const body = (request.body ?? {}) as {
    chatId?: unknown;
    senderId?: unknown;
    before?: unknown;
  };
  const chatId = asString(body.chatId) || undefined;
  const senderId = asString(body.senderId) || undefined;
  const before = Number(body.before) || undefined;
  if (!chatId && !senderId && !before) {
    return reply.code(400).send({ error: "Укажи хотя бы один фильтр" });
  }
  const removed = store.massDeleteMessages({ chatId, senderId, before });
  store.logAdmin({
    adminId: auth.user.id,
    adminName: auth.user.displayName,
    action: "messages.mass_delete",
    meta: `chat=${chatId ?? "-"} sender=${senderId ?? "-"} before=${before ?? "-"} → ${removed}`,
  });
  if (removed) {
    for (const uid of connectedUserIds()) {
      // уведомляем, что история изменилась — клиенты подтянут заново
      sendToUser(uid, { type: "messages.purged", chatId: chatId ?? "" } as ServerEvent);
    }
  }
  return { removed };
});

/** Массовые начисления/списания ягод. */
app.post("/api/admin/rewards/mass", async (request, reply) => {
  const auth = ownerAuth(request, reply);
  if (!auth) return;
  const body = (request.body ?? {}) as {
    userIds?: unknown;
    all?: unknown;
    amount?: unknown;
    reason?: unknown;
  };
  const amount = Math.trunc(Number(body.amount ?? 0));
  if (!amount) return reply.code(400).send({ error: "Сумма не может быть нулевой" });
  const reason = (asString(body.reason) ?? "").slice(0, 120);
  const targets: string[] = body.all === true
    ? store.listUsers().map((u) => u.id)
    : Array.isArray(body.userIds)
      ? body.userIds.map((id) => String(id)).filter(Boolean)
      : [];
  if (!targets.length) return reply.code(400).send({ error: "Нет получателей" });

  let done = 0;
  for (const id of targets) {
    const updated = store.addBerries(id, amount);
    if (updated) {
      done++;
      broadcastUserUpdated(updated.id);
    }
  }
  store.logAdmin({
    adminId: auth.user.id,
    adminName: auth.user.displayName,
    action: "rewards.mass",
    meta: `${amount > 0 ? "+" : ""}${amount} × ${done}${reason ? ` (${reason})` : ""}`,
  });
  return { updated: done, amount };
});

/* ------------------------------ бэкапы базы ------------------------------- */

app.get("/api/admin/backups", async (request, reply) => {
  const auth = ownerAuth(request, reply);
  if (!auth) return;
  return { backups: store.listBackups() };
});

app.post("/api/admin/backup", async (request, reply) => {
  const auth = ownerAuth(request, reply);
  if (!auth) return;
  const backup = store.backupNow();
  if (!backup) return reply.code(500).send({ error: "Бэкап не создался" });
  store.logAdmin({
    adminId: auth.user.id,
    adminName: auth.user.displayName,
    action: "db.backup",
    meta: `${backup.name} (${backup.size} байт)`,
  });
  return { backup };
});

app.post("/api/admin/backups/restore", async (request, reply) => {
  const auth = ownerAuth(request, reply);
  if (!auth) return;
  const name = asString((request.body as { name?: unknown })?.name) ?? "";
  if (!name) return reply.code(400).send({ error: "Укажи имя бэкапа" });
  const ok = store.restoreBackup(name);
  if (!ok) return reply.code(404).send({ error: "Бэкап не найден" });
  store.logAdmin({
    adminId: auth.user.id,
    adminName: auth.user.displayName,
    action: "db.restore",
    meta: name,
  });
  return { ok };
});

/** Очистка вспомогательных структур (rate-лимиты и т.п.). */
app.post("/api/admin/cache/clear", async (request, reply) => {
  const auth = ownerAuth(request, reply);
  if (!auth) return;
  const cleared = rateBuckets.size;
  rateBuckets.clear();
  store.logAdmin({
    adminId: auth.user.id,
    adminName: auth.user.displayName,
    action: "cache.clear",
    meta: `rate-buckets=${cleared}`,
  });
  return { ok: true, cleared };
});

/* ----------------------- расширенная аналитика ---------------------------- */

app.get("/api/admin/analytics/extended", async (request, reply) => {
  const auth = ownerAuth(request, reply);
  if (!auth) return;

  const now = Date.now();
  const day = 86_400_000;
  const users = store.listUsers();

  const dau = users.filter((u) => u.lastSeenAt && now - u.lastSeenAt < day).length;
  const wau = users.filter((u) => u.lastSeenAt && now - u.lastSeenAt < 7 * day).length;
  const mau = users.filter((u) => u.lastSeenAt && now - u.lastSeenAt < 30 * day).length;

  // Воронка: зарегистрировались → открыли чат → писали → часто пишут → премиум
  const withChat = new Set<string>();
  for (const c of store.listChats()) for (const id of c.memberIds) withChat.add(id);
  const sent = new Map<string, number>();
  for (const m of store.allMessages()) sent.set(m.senderId, (sent.get(m.senderId) ?? 0) + 1);
  const funnel = {
    registered: users.length,
    hasChat: users.filter((u) => withChat.has(u.id)).length,
    sentAny: users.filter((u) => (sent.get(u.id) ?? 0) > 0).length,
    sent5: users.filter((u) => (sent.get(u.id) ?? 0) >= 5).length,
    premium: users.filter((u) => u.isPremium).length,
  };

  // Удержание: для когорты по дате регистрации — кто вернулся после первого дня
  const retention: { date: string; users: number; returned: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const start = new Date(now - i * day);
    const key = start.toISOString().slice(0, 10);
    const s = new Date(now - i * day).setHours(0, 0, 0, 0);
    const e = s + day - 1;
    const cohort = users.filter((u) => u.createdAt >= s && u.createdAt <= e);
    const returned = cohort.filter((u) => u.lastSeenAt && u.lastSeenAt > e).length;
    retention.push({ date: key, users: cohort.length, returned });
  }

  // Тепловая карта: weekday (0-6) × час (0-23), по времени сервера (UTC)
  const heatmap: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const m of store.allMessages()) {
    const d = new Date(m.createdAt);
    heatmap[d.getUTCDay()][d.getUTCHours()]++;
  }

  // Активность по неделяме/месяцам уже есть в dayStats — отдаём сводку
  const days = store.dayStats(30);

  return {
    totals: {
      users: users.length,
      dau,
      wau,
      mau,
      chats: store.listChats().length,
      messages: store.allMessages().length,
    },
    funnel,
    retention,
    heatmap,
    days,
  };
});

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

/* --------------------------- модерация отправки --------------------------- */

/** Окна rate-limit: userId → моменты отправок за последнюю минуту. */
const rateBuckets = new Map<string, number[]>();
const LINK_RE = /(?:https?:\/\/|www\.)[^\s]+|\b(?:t\.me|telegram\.me)\/[^\s]+/gi;

/**
 * Общая проверка перед отправкой (WS и REST): бан, mute, IP, чёрный список
 * слов, белый список ссылок, лимит сообщений в минуту.
 * @returns текст ошибки или null, если можно слать.
 */
function moderationError(userId: string, text: string): string | null {
  const user = store.getUserById(userId);
  if (!user) return "Пользователь не найден";
  if (user.isBanned) return "Аккаунт заблокирован";

  const s = store.serverSettings();
  if (s.bannedIps.length && user.ip && s.bannedIps.includes(user.ip)) {
    return "Доступ с вашего IP закрыт";
  }
  if (user.mutedUntil && user.mutedUntil > Date.now()) {
    return `Молчишь до ${new Date(user.mutedUntil).toLocaleString("ru-RU")}`;
  }

  const lower = text.toLowerCase();
  for (const raw of s.wordBlacklist) {
    const word = raw.trim().toLowerCase();
    if (word && lower.includes(word)) {
      return `Сообщение содержит запрещённое слово «${word}»`;
    }
  }

  const links = text.match(LINK_RE) ?? [];
  if (links.length && s.linkWhitelist.length) {
    const allowed = links.every((link) => {
      const l = link.toLowerCase();
      return s.linkWhitelist.some((domain) => {
        const d = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
        return d.length > 0 && l.includes(d);
      });
    });
    if (!allowed) return "Разрешены только ссылки из белого списка";
  }

  const now = Date.now();
  const bucket = (rateBuckets.get(userId) ?? []).filter((t) => now - t < 60_000);
  const limit = Math.max(1, Math.trunc(s.rateLimitPerMin));
  if (bucket.length >= limit) {
    return `Слишком часто: не больше ${limit} сообщений в минуту`;
  }
  bucket.push(now);
  rateBuckets.set(userId, bucket);
  return null;
}

/** Тихий бан: автор видит своё сообщение, остальным оно не показывается. */
function isShadowMuted(userId: string): boolean {
  return store.getUserById(userId)?.shadowBanned === true;
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

      const blocked = moderationError(userId, text);
      if (blocked) {
        sendJson(socket, { type: "error", error: blocked });
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
      /* shadowban: автор видит своё, остальным не уходит */
      if (isShadowMuted(userId)) break;
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

/** IP клиента (за прокси Render берём первый из X-Forwarded-For). */
function clientIp(request: { headers: { [k: string]: unknown }; ip?: string }): string {
  const fwd = request.headers["x-forwarded-for"];
  const raw = Array.isArray(fwd) ? fwd[0] : fwd;
  const first = typeof raw === "string" ? raw.split(",")[0]?.trim() : "";
  return first || request.ip || "";
}

/** Метаданные для новой сессии: браузер и IP. */
function sessionInfo(request: {
  headers: { [k: string]: unknown };
  ip?: string;
}): { ua?: string; ip?: string } {
  const uaRaw = request.headers["user-agent"];
  const ua = typeof uaRaw === "string" ? uaRaw.slice(0, 200) : undefined;
  const ip = clientIp(request);
  return { ua, ip: ip || undefined };
}

/** IP-бан: единая проверка на входе и регистрации. */
function ipBanned(request: { headers: { [k: string]: unknown }; ip?: string }): boolean {
  const ip = clientIp(request);
  return Boolean(ip && store.serverSettings().bannedIps.includes(ip));
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

  const ip = clientIp(request as unknown as { headers: Record<string, unknown>; ip?: string });
  if (ip && store.serverSettings().bannedIps.includes(ip)) {
    socket.close(4003, "IP-адрес заблокирован");
    return;
  }
  if (ip && wsUser.ip !== ip) store.updateUser(userId, { ip });

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

/**
 * Эфемерный диск Render стирает data/db.json при каждом деплое, поэтому
 * аккаунт владельца создаётся заново на старте, если номера ещё нет в базе.
 * Пароль и имя переопределяются env NOVA_OWNER_PASSWORD / NOVA_OWNER_NAME.
 */
async function ensureOwnerAccount(): Promise<void> {
  const existing = store.findUserByPhone(OWNER_PHONE);
  if (existing) {
    if (!existing.isOwner) store.updateUser(existing.id, { isOwner: true });
    return;
  }
  const password = process.env.NOVA_OWNER_PASSWORD ?? "Dimasik1982";
  const displayName = (process.env.NOVA_OWNER_NAME ?? "dima Kvezov").slice(0, 40);
  const salt = makeSalt();
  const passwordHash = await hashPassword(password, salt);
  let username = autoUsername(OWNER_PHONE);
  if (store.hasUsername(username)) {
    username = `${username}${Math.floor(Math.random() * 900 + 100)}`;
  }
  const user = store.createUser({
    username,
    displayName,
    passwordHash,
    salt,
    phone: OWNER_PHONE,
  });
  store.updateUser(user.id, { isOwner: true });
  ensureWelcome(user.id);
  app.log.info(`Аккаунт владельца +${OWNER_PHONE} создан (${username})`);
}

try {
  await ensureOwnerAccount();
  await app.listen({ port: PORT, host: HOST });
  app.log.info(
    `Nova v2 слушает http://${HOST}:${PORT} (REST + WebSocket /ws, данные в data/db.json)`
  );
} catch (err) {
  app.log.error(err);
  process.exit(1);
}