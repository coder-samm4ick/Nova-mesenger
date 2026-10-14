// Хранилище Nova: пользователи, чаты, сообщения, прочтения, ягоды, файлы.
//
// Данные живут в Map и при каждом изменении сохраняются в JSON-снапшот
// `data/db.json` (заготовка под будущую SQLite/Postgres). При старте снапшот
// загружается обратно. Путь к файлу можно переопределить переменной
// окружения NOVA_DATA_FILE.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { newId } from "./auth.js";
import type {
  AdminChatView,
  AdminLog,
  BerryTx,
  Chat,
  ChatView,
  DayStat,
  ForwardRef,
  GiftCatalogItem,
  Message,
  MessageReaction,
  MessageRef,
  PhotoAttachment,
  PromoCode,
  Report,
  ServerSettings,
  StoredUser,
  User,
  UserGift,
} from "./types.js";

const AVATAR_COLORS = [
  "#2fa8ff",
  "#7c5cff",
  "#ff7ac6",
  "#23e6c3",
  "#ffca28",
  "#ff6b6b",
  "#4fc3f7",
  "#7ed957",
];

export const SAVED_TITLE = "Избранное";
export const NOVA_BOT_USERNAME = "nova";

/** Стартовый баланс ягод для нового человека. */
function startBerries(): number {
  const v = Number(process.env.NOVA_START_BERRIES ?? 100);
  return Number.isFinite(v) && v >= 0 ? Math.floor(v) : 100;
}

/** Стабильный цвет аватара по логину. */
export function avatarColorFor(username: string): string {
  let hash = 0;
  for (const ch of username) hash = (hash * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

const users = new Map<string, StoredUser>();
const usernames = new Map<string, string>(); // логин (lowercase) → id
const phones = new Map<string, string>(); // телефон (digits) → id
const chats = new Map<string, Chat>();
const dmKeys = new Map<string, string>(); // "отсортированная:пара" → id чата
const messagesByChat = new Map<string, Message[]>();
// chatId → (userId → id последнего прочитанного сообщения)
const readCursors = new Map<string, Map<string, string>>();
const uploadedFiles = new Map<string, PhotoAttachment>();
const berryTransactions: BerryTx[] = [];

/* --- новые коллекции: подарки, жалобы, логи, промо, настройки --- */
let giftCatalog: GiftCatalogItem[] = [];
let userGifts: UserGift[] = [];
let giftSerial = 0;
let reports: Report[] = [];
let adminLogs: AdminLog[] = [];
let promoCodes: PromoCode[] = [];
const settings: ServerSettings = {
  registrationOpen: true,
  wordBlacklist: [],
  linkWhitelist: [],
  rateLimitPerMin: 30,
  bannedIps: [],
  features: {},
};

type DbSnapshot = {
  users: StoredUser[];
  chats: Chat[];
  messages: Message[];
  readCursors?: { chatId: string; userId: string; messageId: string }[];
  uploadedFiles?: PhotoAttachment[];
  berryTransactions?: BerryTx[];
  meta?: { maintenance?: boolean };
  giftCatalog?: GiftCatalogItem[];
  userGifts?: UserGift[];
  giftSerial?: number;
  reports?: Report[];
  adminLogs?: AdminLog[];
  promoCodes?: PromoCode[];
  settings?: Partial<ServerSettings>;
};

/**
 * Служебное состояние сервера. `maintenance` — режим обслуживания: вход и
 * регистрация доступны только владельцу.
 */
const meta = { maintenance: false, startedAt: Date.now() };

export function serverMeta(): { maintenance: boolean; startedAt: number } {
  return { maintenance: meta.maintenance, startedAt: meta.startedAt };
}

export function setMaintenance(on: boolean): void {
  meta.maintenance = on;
  save();
}

/** Путь к db.json: рядом с src/ в папке data, либо NOVA_DATA_FILE. */
function dataFile(): string {
  if (process.env.NOVA_DATA_FILE) return process.env.NOVA_DATA_FILE;
  return join(dirname(fileURLToPath(import.meta.url)), "..", "data", "db.json");
}

/** Каталог загруженных файлов (фото). */
export function uploadsDir(): string {
  if (process.env.NOVA_UPLOADS_DIR) return process.env.NOVA_UPLOADS_DIR;
  return join(dirname(fileURLToPath(import.meta.url)), "..", "data", "uploads");
}

function save(): void {
  try {
    const file = dataFile();
    mkdirSync(dirname(file), { recursive: true });
    const snapshot: DbSnapshot = {
      users: [...users.values()],
      chats: [...chats.values()],
      messages: [...messagesByChat.values()].flat(),
      readCursors: [...readCursors.entries()].flatMap(([chatId, map]) =>
        [...map.entries()].map(([userId, messageId]) => ({ chatId, userId, messageId }))
      ),
      uploadedFiles: [...uploadedFiles.values()],
      berryTransactions,
      meta: { maintenance: meta.maintenance },
      giftCatalog,
      userGifts,
      giftSerial,
      reports,
      adminLogs,
      promoCodes,
      settings: {
        registrationOpen: settings.registrationOpen,
        wordBlacklist: settings.wordBlacklist,
        linkWhitelist: settings.linkWhitelist,
        rateLimitPerMin: settings.rateLimitPerMin,
        bannedIps: settings.bannedIps,
        features: settings.features,
      },
    };
    writeFileSync(file, JSON.stringify(snapshot, null, 2), "utf8");
  } catch (err) {
    console.error("Не удалось сохранить data/db.json:", err);
  }
}

function normalizeUser(raw: Partial<StoredUser>): StoredUser | null {
  if (!raw.id || !raw.username) return null;
  const username = raw.username.toLowerCase();
  return {
    id: raw.id,
    username,
    displayName: raw.displayName?.trim() || username,
    avatarColor: raw.avatarColor || avatarColorFor(username),
    phone: raw.phone ?? undefined,
    isBot: Boolean(raw.isBot),
    isOwner: Boolean(raw.isOwner),
    isPremium: Boolean(raw.isPremium),
    premiumUntil: typeof raw.premiumUntil === "number" ? raw.premiumUntil : undefined,
    isBanned: Boolean(raw.isBanned),
    isVerified: Boolean(raw.isVerified),
    berries: typeof raw.berries === "number" ? Math.max(0, raw.berries) : 0,
    lastSeenAt: typeof raw.lastSeenAt === "number" ? raw.lastSeenAt : undefined,
    createdAt: raw.createdAt ?? Date.now(),
    /* модерация */
    mutedUntil: typeof raw.mutedUntil === "number" ? raw.mutedUntil : undefined,
    shadowBanned: Boolean(raw.shadowBanned),
    bannedReason: raw.bannedReason ?? undefined,
    bannedUntil: typeof raw.bannedUntil === "number" ? raw.bannedUntil : undefined,
    ip: raw.ip ?? undefined,
    flags: raw.flags && typeof raw.flags === "object" ? raw.flags : undefined,
    passwordHash: raw.passwordHash ?? "",
    salt: raw.salt ?? "",
  };
}

function normalizeChat(raw: Partial<Chat>): Chat | null {
  if (!raw.id || !Array.isArray(raw.memberIds)) return null;
  const type = raw.type === "group" || raw.type === "channel" || raw.type === "saved" ? raw.type : "dm";
  return {
    id: raw.id,
    type,
    memberIds: raw.memberIds,
    title: raw.title ?? undefined,
    ownerId: raw.ownerId ?? undefined,
    avatarColor: raw.avatarColor ?? undefined,
    noCopy: Boolean(raw.noCopy),
    createdAt: raw.createdAt ?? Date.now(),
  };
}

function normalizeMessage(raw: Partial<Message>): Message | null {
  if (!raw.id || !raw.chatId || !raw.senderId) return null;
  return {
    id: raw.id,
    chatId: raw.chatId,
    senderId: raw.senderId,
    text: raw.text ?? "",
    type: raw.type === "sticker" || raw.type === "photo" ? raw.type : "text",
    sticker: raw.sticker,
    photo: raw.photo,
    edited: Boolean(raw.edited),
    deleted: Boolean(raw.deleted),
    reactions: normalizeReactions(raw.reactions),
    replyTo:
      raw.replyTo && typeof raw.replyTo.id === "string" && typeof raw.replyTo.senderName === "string"
        ? raw.replyTo
        : undefined,
    forwardedFrom:
      raw.forwardedFrom &&
      typeof raw.forwardedFrom.chatId === "string" &&
      typeof raw.forwardedFrom.chatTitle === "string"
        ? raw.forwardedFrom
        : undefined,
    createdAt: raw.createdAt ?? Date.now(),
  };
}

function normalizeReactions(
  reactions: MessageReaction[] | undefined
): MessageReaction[] | undefined {
  if (!Array.isArray(reactions)) return undefined;
  const clean = reactions
    .filter(
      (r): r is MessageReaction =>
        Boolean(r) &&
        typeof r.emoji === "string" &&
        r.emoji.trim().length > 0 &&
        Array.isArray(r.userIds)
    )
    .map((r) => ({
      emoji: r.emoji.trim().slice(0, 8),
      userIds: r.userIds.filter((id): id is string => typeof id === "string"),
    }))
    .filter((r) => r.userIds.length > 0);
  return clean.length > 0 ? clean : undefined;
}

function load(): void {
  let parsed: DbSnapshot | null = null;
  try {
    parsed = JSON.parse(readFileSync(dataFile(), "utf8")) as DbSnapshot;
  } catch {
    return; // файла ещё нет или он битый — стартуем с пустым хранилищем
  }
  for (const raw of parsed?.users ?? []) {
    const user = normalizeUser(raw);
    if (!user) continue;
    users.set(user.id, user);
    usernames.set(user.username.toLowerCase(), user.id);
    if (user.phone) phones.set(user.phone, user.id);
  }
  for (const raw of parsed?.chats ?? []) {
    const chat = normalizeChat(raw);
    if (!chat) continue;
    chats.set(chat.id, chat);
    if (chat.type === "dm" && chat.memberIds.length === 2) {
      dmKeys.set(dmKey(chat.memberIds[0], chat.memberIds[1]), chat.id);
    }
  }
  for (const message of parsed?.messages ?? []) {
    const m = normalizeMessage(message);
    if (!m) continue;
    const list = messagesByChat.get(m.chatId) ?? [];
    list.push(m);
    messagesByChat.set(m.chatId, list);
  }
  for (const rc of parsed?.readCursors ?? []) {
    if (!rc || !rc.chatId || !rc.userId || !rc.messageId) continue;
    let map = readCursors.get(rc.chatId);
    if (!map) {
      map = new Map();
      readCursors.set(rc.chatId, map);
    }
    map.set(rc.userId, rc.messageId);
  }
  for (const f of parsed?.uploadedFiles ?? []) {
    if (f?.fileId && f?.url) uploadedFiles.set(f.fileId, f);
  }
  for (const tx of parsed?.berryTransactions ?? []) {
    if (tx?.id && tx?.fromId && tx?.toId) berryTransactions.push(tx);
  }
  if (parsed?.meta && typeof parsed.meta.maintenance === "boolean") {
    meta.maintenance = parsed.meta.maintenance;
  }
  /* новые коллекции */
  if (Array.isArray(parsed?.giftCatalog)) giftCatalog = parsed.giftCatalog;
  if (Array.isArray(parsed?.userGifts)) userGifts = parsed.userGifts;
  if (typeof parsed?.giftSerial === "number") giftSerial = parsed.giftSerial;
  if (Array.isArray(parsed?.reports)) reports = parsed.reports;
  if (Array.isArray(parsed?.adminLogs)) adminLogs = parsed.adminLogs;
  if (Array.isArray(parsed?.promoCodes)) promoCodes = parsed.promoCodes;
  if (parsed?.settings) {
    if (typeof parsed.settings.registrationOpen === "boolean")
      settings.registrationOpen = parsed.settings.registrationOpen;
    if (Array.isArray(parsed.settings.wordBlacklist))
      settings.wordBlacklist = parsed.settings.wordBlacklist;
    if (Array.isArray(parsed.settings.linkWhitelist))
      settings.linkWhitelist = parsed.settings.linkWhitelist;
    if (typeof parsed.settings.rateLimitPerMin === "number")
      settings.rateLimitPerMin = parsed.settings.rateLimitPerMin;
    if (Array.isArray(parsed.settings.bannedIps))
      settings.bannedIps = parsed.settings.bannedIps;
    if (parsed.settings.features && typeof parsed.settings.features === "object")
      settings.features = parsed.settings.features;
  }
}

load();

function dmKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/** Публичное представление пользователя (без пароля и соли). */
export function toPublicUser(user: StoredUser): User {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarColor: user.avatarColor,
    phone: user.phone,
    isBot: user.isBot,
    isOwner: user.isOwner,
    isPremium: user.isPremium,
    premiumUntil: user.premiumUntil,
    isBanned: user.isBanned,
    isVerified: Boolean(user.isVerified),
    berries: user.berries,
    lastSeenAt: user.lastSeenAt,
    createdAt: user.createdAt,
  };
}

/* -------------------------------- боты ---------------------------------- */

/** Гарантирует существование встроенного бота Nova. */
export function ensureBots(): void {
  if (usernames.has(NOVA_BOT_USERNAME)) return;
  const bot: StoredUser = {
    id: newId(),
    username: NOVA_BOT_USERNAME,
    displayName: "Nova",
    avatarColor: avatarColorFor(NOVA_BOT_USERNAME),
    berries: 0,
    isBot: true,
    createdAt: Date.now(),
    passwordHash: "",
    salt: "",
  };
  users.set(bot.id, bot);
  usernames.set(NOVA_BOT_USERNAME, bot.id);
  save();
}

export function novaBotId(): string {
  return usernames.get(NOVA_BOT_USERNAME) ?? "";
}

export function listBots(): User[] {
  return [...users.values()]
    .filter((u) => u.isBot)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map(toPublicUser);
}

export function createBot(input: { username: string; displayName: string }): StoredUser {
  const username = input.username.trim().toLowerCase();
  const bot: StoredUser = {
    id: newId(),
    username,
    displayName: input.displayName.trim() || username,
    avatarColor: avatarColorFor(username),
    berries: 0,
    isBot: true,
    createdAt: Date.now(),
    passwordHash: "",
    salt: "",
  };
  users.set(bot.id, bot);
  usernames.set(username, bot.id);
  save();
  return bot;
}

/* ------------------------------ пользователи ------------------------------ */

export function hasUsername(username: string): boolean {
  return usernames.has(username.trim().toLowerCase());
}

export function hasPhone(phone: string): boolean {
  return phones.has(phone);
}

export function findUserByPhone(phone: string): StoredUser | null {
  const id = phones.get(phone);
  return id ? users.get(id) ?? null : null;
}

export function createUser(input: {
  username: string;
  displayName: string;
  passwordHash: string;
  salt: string;
  phone?: string;
  isBot?: boolean;
}): StoredUser {
  const isBot = Boolean(input.isBot);
  const username = input.username.trim().toLowerCase();
  const user: StoredUser = {
    id: newId(),
    username,
    displayName: input.displayName.trim() || username,
    avatarColor: avatarColorFor(username),
    phone: input.phone ?? undefined,
    isBot,
    berries: isBot ? 0 : startBerries(),
    createdAt: Date.now(),
    passwordHash: input.passwordHash,
    salt: input.salt,
  };
  users.set(user.id, user);
  usernames.set(username, user.id);
  if (user.phone) phones.set(user.phone, user.id);
  save();
  return user;
}

export function getUserById(id: string): StoredUser | null {
  return users.get(id) ?? null;
}

export function findUserByUsername(username: string): StoredUser | null {
  const id = usernames.get(username.trim().toLowerCase());
  return id ? users.get(id) ?? null : null;
}

export function listUsers(): StoredUser[] {
  return [...users.values()];
}

export function updateUser(
  userId: string,
  patch: Partial<
    Pick<
      StoredUser,
      | "displayName"
      | "avatarColor"
      | "isOwner"
      | "isPremium"
      | "premiumUntil"
      | "isBanned"
      | "isVerified"
      | "berries"
      | "lastSeenAt"
      | "mutedUntil"
      | "shadowBanned"
      | "bannedReason"
      | "bannedUntil"
      | "ip"
      | "flags"
    >
  >
): StoredUser | null {
  const user = users.get(userId);
  if (!user) return null;
  const next: StoredUser = { ...user, ...patch };
  users.set(userId, next);
  save();
  return next;
}

export function setUserPassword(
  userId: string,
  passwordHash: string,
  salt: string
): StoredUser | null {
  const user = users.get(userId);
  if (!user) return null;
  const next: StoredUser = { ...user, passwordHash, salt };
  users.set(userId, next);
  save();
  return next;
}

export function touchActivity(userId: string): void {
  const user = users.get(userId);
  if (!user) return;
  const now = Date.now();
  if (user.lastSeenAt && now - user.lastSeenAt < 30_000) return;
  user.lastSeenAt = now;
  save();
}

/** Поиск людей по логину или имени, без самого себя. */
export function searchUsers(query: string, excludeId: string, limit = 30): User[] {
  const q = query.trim().toLowerCase();
  const result: User[] = [];
  for (const user of users.values()) {
    if (user.id === excludeId) continue;
    if (
      q &&
      !user.username.includes(q) &&
      !user.displayName.toLowerCase().includes(q)
    ) {
      continue;
    }
    result.push(toPublicUser(user));
    if (result.length >= limit) break;
  }
  return result;
}

/* --------------------------------- чаты ---------------------------------- */

export function getChat(id: string): Chat | null {
  return chats.get(id) ?? null;
}

export function listChats(): Chat[] {
  return [...chats.values()];
}

/** Уникальные id участников чатов, в которых состоит пользователь (без него самого). */
export function peersOf(userId: string): string[] {
  const out = new Set<string>();
  for (const chat of chats.values()) {
    if (chat.memberIds.includes(userId)) {
      for (const id of chat.memberIds) if (id !== userId) out.add(id);
    }
  }
  return [...out];
}

function makeChat(input: {
  type: Chat["type"];
  memberIds: string[];
  title?: string;
  ownerId?: string;
  avatarColor?: string;
}): Chat {
  const chat: Chat = {
    id: newId(),
    type: input.type,
    memberIds: input.memberIds,
    title: input.title,
    ownerId: input.ownerId,
    avatarColor: input.avatarColor,
    createdAt: Date.now(),
  };
  chats.set(chat.id, chat);
  if (chat.type === "dm" && chat.memberIds.length === 2) {
    dmKeys.set(dmKey(chat.memberIds[0], chat.memberIds[1]), chat.id);
  }
  save();
  return chat;
}

/** Возвращает существующий диалог между двумя людьми или создаёт новый. */
export function ensureDm(aId: string, bId: string): Chat {
  const existingId = dmKeys.get(dmKey(aId, bId));
  if (existingId) {
    const existing = chats.get(existingId);
    if (existing) return existing;
  }
  return makeChat({ type: "dm", memberIds: [aId, bId] });
}

/** Чат «Избранное» — диалог с самим собой. */
export function ensureSaved(userId: string): Chat {
  const existing = [...chats.values()].find(
    (c) => c.type === "saved" && c.memberIds.includes(userId)
  );
  if (existing) return existing;
  return makeChat({
    type: "saved",
    memberIds: [userId],
    title: SAVED_TITLE,
    avatarColor: "#ffca28",
  });
}

export function createGroup(input: {
  title: string;
  creatorId: string;
  memberIds: string[];
  avatarColor?: string;
}): Chat {
  const members = Array.from(
    new Set([input.creatorId, ...input.memberIds].filter(Boolean))
  );
  return makeChat({
    type: "group",
    memberIds: members,
    title: input.title.trim() || "Группа",
    ownerId: input.creatorId,
    avatarColor: input.avatarColor || avatarColorFor(input.title.trim() || "group"),
  });
}

export function createChannel(input: {
  title: string;
  ownerId: string;
  avatarColor?: string;
}): Chat {
  return makeChat({
    type: "channel",
    memberIds: [input.ownerId],
    title: input.title.trim() || "Канал",
    ownerId: input.ownerId,
    avatarColor: input.avatarColor || avatarColorFor(input.title.trim() || "channel"),
  });
}

export function addChatMember(chatId: string, userId: string): boolean {
  const chat = chats.get(chatId);
  if (!chat || chat.memberIds.includes(userId)) return false;
  chat.memberIds.push(userId);
  save();
  return true;
}

/** Публичные каналы (можно подписаться по логину). */
export function listPublicChannels(excludeOwner: string | null = null): Chat[] {
  return [...chats.values()]
    .filter((c) => c.type === "channel" && (excludeOwner ? !c.memberIds.includes(excludeOwner) : true))
    .sort((a, b) => b.createdAt - a.createdAt);
}

/* ------------------------------- сообщения -------------------------------- */

export function getMessages(chatId: string): Message[] {
  return [...(messagesByChat.get(chatId) ?? [])];
}

/** Сообщения с пагинацией: last N до beforeId (включительно) — по возрастанию. */
export function getMessagesPage(
  chatId: string,
  opts: { limit?: number; beforeId?: string } = {}
): Message[] {
  const all = messagesByChat.get(chatId) ?? [];
  let end = all.length;
  if (opts.beforeId) {
    const idx = all.findIndex((m) => m.id === opts.beforeId);
    if (idx >= 0) end = idx + 1;
  }
  const limit = Math.max(1, Math.min(opts.limit ?? 50, 200));
  const start = Math.max(0, end - limit);
  return all.slice(start, end);
}

export function getMessageById(chatId: string, messageId: string): Message | null {
  const all = messagesByChat.get(chatId) ?? [];
  return all.find((m) => m.id === messageId) ?? null;
}

export function addMessage(
  chatId: string,
  senderId: string,
  text: string,
  opts: {
    type?: Message["type"];
    sticker?: string;
    photo?: PhotoAttachment;
    replyTo?: MessageRef;
    forwardedFrom?: ForwardRef;
  } = {}
): Message {
  const message: Message = {
    id: newId(),
    chatId,
    senderId,
    text,
    type: opts.type ?? "text",
    sticker: opts.sticker,
    photo: opts.photo,
    replyTo: opts.replyTo,
    forwardedFrom: opts.forwardedFrom,
    createdAt: Date.now(),
  };
  const list = messagesByChat.get(chatId) ?? [];
  list.push(message);
  messagesByChat.set(chatId, list);
  save();
  return message;
}

export function editMessage(
  chatId: string,
  messageId: string,
  text: string
): Message | null {
  const message = getMessageById(chatId, messageId);
  if (!message || message.deleted) return null;
  message.text = text;
  message.edited = true;
  save();
  return message;
}

export function deleteMessage(chatId: string, messageId: string): Message | null {
  const message = getMessageById(chatId, messageId);
  if (!message || message.deleted) return null;
  message.deleted = true;
  message.text = "";
  message.sticker = undefined;
  message.photo = undefined;
  save();
  return message;
}

export function getLastMessage(chatId: string): Message | null {
  const all = messagesByChat.get(chatId) ?? [];
  for (let i = all.length - 1; i >= 0; i--) {
    if (!all[i].deleted) return all[i];
  }
  return null;
}

/** Переключение реакции пользователя на сообщении. Возвращает обновлённое сообщение. */
export function toggleReaction(
  chatId: string,
  messageId: string,
  userId: string,
  emoji: string
): Message | null {
  const message = getMessageById(chatId, messageId);
  const clean = emoji.trim().slice(0, 8);
  if (!message || message.deleted || !clean) return null;
  const reactions: MessageReaction[] = message.reactions
    ? message.reactions.map((r) => ({ emoji: r.emoji, userIds: [...r.userIds] }))
    : [];
  const entry = reactions.find((r) => r.emoji === clean);
  if (entry) {
    if (entry.userIds.includes(userId)) {
      entry.userIds = entry.userIds.filter((id) => id !== userId);
    } else {
      entry.userIds.push(userId);
    }
  } else {
    reactions.push({ emoji: clean, userIds: [userId] });
  }
  message.reactions = reactions.filter((r) => r.userIds.length > 0);
  if (!message.reactions.length) message.reactions = undefined;
  save();
  return message;
}

/** Включение/выключение защиты от копирования для чата. */
export function setChatNoCopy(chatId: string, noCopy: boolean): Chat | null {
  const chat = chats.get(chatId);
  if (!chat) return null;
  chat.noCopy = noCopy;
  save();
  return chat;
}

/** Название чата для любого зрителя (для подписи «Переслано из …»). */
export function chatTitleFor(chatId: string, viewerId: string): string {
  const chat = chats.get(chatId);
  if (!chat) return "Чат";
  return chatTitle(chat, viewerId);
}

/** Снимок сообщения для цитаты ответа (без приватных полей). */
export function replySnapshot(chatId: string, messageId: string): MessageRef | null {
  const message = getMessageById(chatId, messageId);
  if (!message || message.deleted) return null;
  const sender = users.get(message.senderId);
  return {
    id: message.id,
    senderId: message.senderId,
    senderName: sender?.displayName ?? (message.senderId === NOVA_BOT_USERNAME ? "Nova" : "…"),
    text: message.text,
    type: message.type,
    sticker: message.sticker,
    photoUrl: message.photo?.url,
  };
}

/* ------------------------------ прочтения -------------------------------- */

function cursorFor(chatId: string, userId: string): number {
  const map = readCursors.get(chatId);
  const id = map?.get(userId);
  if (!id) return -1;
  const list = messagesByChat.get(chatId) ?? [];
  return list.findIndex((m) => m.id === id);
}

/** Количество непрочитанных сообщений (свои и удалённые не считаются). */
export function unreadCountFor(userId: string, chatId: string): number {
  const list = messagesByChat.get(chatId) ?? [];
  if (list.length === 0) return 0;
  const cursor = cursorFor(chatId, userId);
  let count = 0;
  for (let i = cursor + 1; i < list.length; i++) {
    const m = list[i];
    if (m.deleted || m.senderId === userId) continue;
    count += 1;
  }
  return count;
}

export function readUntilIdFor(userId: string, chatId: string): string | null {
  const map = readCursors.get(chatId);
  return map?.get(userId) ?? null;
}

/** Отмечает, что пользователь прочитал сообщение (и последующие). */
export function markRead(userId: string, chatId: string, messageId: string): string {
  const list = messagesByChat.get(chatId) ?? [];
  const id = list.some((m) => m.id === messageId)
    ? messageId
    : list.length > 0
      ? list[list.length - 1].id
      : messageId;
  let map = readCursors.get(chatId);
  if (!map) {
    map = new Map();
    readCursors.set(chatId, map);
  }
  map.set(userId, id);
  save();
  return id;
}

/* ------------------------------- представления ----------------------------- */

function chatTitle(chat: Chat, viewerId: string): string {
  if (chat.type === "saved") return SAVED_TITLE;
  if (chat.type === "dm" || chat.type === "group" || chat.type === "channel") {
    if (chat.title) return chat.title;
    const peerId = chat.memberIds.find((id) => id !== viewerId) ?? null;
    const peer = peerId ? users.get(peerId) ?? null : null;
    return peer ? peer.displayName : "Диалог";
  }
  return "Диалог";
}

function chatColor(chat: Chat, viewerId: string): string {
  if (chat.type === "saved") return "#ffca28";
  if (chat.avatarColor) return chat.avatarColor;
  const peerId = chat.memberIds.find((id) => id !== viewerId) ?? null;
  const peer = peerId ? users.get(peerId) ?? null : null;
  return peer ? peer.avatarColor : "#2a3350";
}

export function chatView(chatId: string, viewerId: string): ChatView {
  const chat = chats.get(chatId);
  if (!chat) throw new Error("Чат не найден");
  const peerId =
    chat.type === "dm" ? chat.memberIds.find((id) => id !== viewerId) ?? null : null;
  const peer = peerId ? users.get(peerId) ?? null : null;
  return {
    id: chat.id,
    type: chat.type,
    title: chatTitle(chat, viewerId),
    peer: peer ? toPublicUser(peer) : null,
    avatarColor: chatColor(chat, viewerId),
    lastMessage: getLastMessage(chat.id),
    unreadCount: unreadCountFor(viewerId, chat.id),
    readUntilId: readUntilIdFor(viewerId, chat.id),
    memberCount: chat.memberIds.length,
    ownerId: chat.ownerId,
    banned: chat.type === "channel" && chat.ownerId !== viewerId,
    noCopy: Boolean(chat.noCopy),
    createdAt: chat.createdAt,
  };
}

/** Список чатов пользователя в виде ChatView, отсортирован по свежести. */
export function listChatViewsForUser(userId: string): ChatView[] {
  const views: ChatView[] = [];
  for (const chat of chats.values()) {
    if (!chat.memberIds.includes(userId)) continue;
    views.push(chatView(chat.id, userId));
  }
  return views.sort((a, b) => {
    const at = a.lastMessage?.createdAt ?? a.createdAt;
    const bt = b.lastMessage?.createdAt ?? b.createdAt;
    return bt - at;
  });
}

/* --------------------- панель владельца: удаление и статистика ---------------- */

/** Полное удаление чата: сам чат, индекс диалога, сообщения и прочтения. */
export function deleteChat(chatId: string): boolean {
  const chat = chats.get(chatId);
  if (!chat) return false;
  if (chat.type === "dm" && chat.memberIds.length === 2) {
    dmKeys.delete(dmKey(chat.memberIds[0], chat.memberIds[1]));
  }
  chats.delete(chatId);
  messagesByChat.delete(chatId);
  readCursors.delete(chatId);
  save();
  return true;
}

/** Удаление бота (кроме встроенного Nova) со всеми его чатами и сообщениями. */
export function deleteBot(botId: string): boolean {
  const bot = users.get(botId);
  if (!bot || !bot.isBot || bot.username === NOVA_BOT_USERNAME) return false;
  for (const chat of [...chats.values()]) {
    if (chat.memberIds.includes(botId)) deleteChat(chat.id);
  }
  users.delete(botId);
  usernames.delete(bot.username);
  if (bot.phone) phones.delete(bot.phone);
  save();
  return true;
}

export function messageCount(): number {
  let n = 0;
  for (const list of messagesByChat.values()) n += list.length;
  return n;
}

/** Полное удаление пользователя (включая ботов): чаты, аккаунт, индексы. */
export function deleteUser(userId: string): boolean {
  const user = users.get(userId);
  if (!user) return false;
  for (const chat of [...chats.values()]) {
    if (chat.memberIds.includes(userId)) deleteChat(chat.id);
  }
  users.delete(userId);
  usernames.delete(user.username);
  if (user.phone) phones.delete(user.phone);
  save();
  return true;
}

/** Сколько сообщений написал пользователь (для карточки в админке). */
export function userMessageCount(userId: string): number {
  let n = 0;
  for (const list of messagesByChat.values()) {
    for (const m of list) if (m.senderId === userId) n += 1;
  }
  return n;
}

/** Ищет сообщение по id среди всех чатов (модерация владельца). */
export function findChatByMessage(messageId: string): { chatId: string; message: Message } | null {
  for (const [chatId, list] of messagesByChat.entries()) {
    const found = list.find((m) => m.id === messageId);
    if (found) return { chatId, message: found };
  }
  return null;
}

export function uploadCount(): number {
  return uploadedFiles.size;
}

export function berriesTotal(): number {
  let sum = 0;
  for (const user of users.values()) sum += user.berries;
  return sum;
}

export function chatTypeCounts(): { dm: number; group: number; channel: number; saved: number } {
  const counts = { dm: 0, group: 0, channel: 0, saved: 0 };
  for (const chat of chats.values()) {
    if (chat.type in counts) counts[chat.type] += 1;
  }
  return counts;
}

/** Список чатов для панели владельца (без лишних полей просмотра). */
export function adminChatList(): AdminChatView[] {
  const views: AdminChatView[] = [];
  for (const chat of chats.values()) {
    const messageList = messagesByChat.get(chat.id) ?? [];
    const last = messageList[messageList.length - 1] ?? null;
    const owner = chat.ownerId ? users.get(chat.ownerId) ?? null : null;
    views.push({
      id: chat.id,
      type: chat.type,
      title:
        chat.title ||
        (chat.type === "saved" ? SAVED_TITLE : chat.type === "dm" ? "Диалог" : "Без названия"),
      memberIds: chat.memberIds,
      memberCount: chat.memberIds.length,
      ownerId: chat.ownerId,
      ownerName: owner ? owner.displayName : undefined,
      noCopy: Boolean(chat.noCopy),
      createdAt: chat.createdAt,
      lastMessageAt: last?.createdAt ?? null,
      lastMessageText: last ? (last.type === "sticker" ? "Стикер" : last.photo ? "Фото" : last.text.slice(0, 80)) : undefined,
    });
  }
  return views.sort((a, b) => (b.lastMessageAt ?? b.createdAt) - (a.lastMessageAt ?? a.createdAt));
}

/* --------------------------------- ягоды ---------------------------------- */

export function getBerryTransactions(userId: string, limit = 20): BerryTx[] {
  return berryTransactions
    .filter((t) => t.fromId === userId || t.toId === userId)
    .slice(-limit)
    .reverse();
}

export function addBerries(userId: string, amount: number): StoredUser | null {
  const user = users.get(userId);
  if (!user) return null;
  user.berries = Math.max(0, user.berries + amount);
  save();
  return user;
}

export function transferBerries(
  fromId: string,
  toId: string,
  amount: number,
  note?: string
): { ok: boolean; error?: string; balance?: number } {
  const from = users.get(fromId);
  const to = users.get(toId);
  if (!from || !to) return { ok: false, error: "Пользователь не найден" };
  if (from.id === to.id) return { ok: false, error: "Нельзя перевести самому себе" };
  if (amount <= 0 || !Number.isSafeInteger(amount)) {
    return { ok: false, error: "Некорректная сумма" };
  }
  if (from.berries < amount) {
    return { ok: false, error: `Недостаточно ягод: баланс ${from.berries}` };
  }
  from.berries -= amount;
  to.berries += amount;
  berryTransactions.push({
    id: newId(),
    fromId: from.id,
    toId: to.id,
    amount,
    note: note ? note.slice(0, 200) : undefined,
    createdAt: Date.now(),
  });
  save();
  return { ok: true, balance: from.berries };
}

/* ------------------------------- файлы ----------------------------------- */

export function registerUpload(
  file: Omit<PhotoAttachment, "url"> & { url: string }
): PhotoAttachment {
  const attachment: PhotoAttachment = {
    fileId: file.fileId,
    url: file.url,
    mime: file.mime,
    size: file.size,
  };
  uploadedFiles.set(file.fileId, attachment);
  save();
  return attachment;
}

export function getUpload(fileId: string): PhotoAttachment | null {
  return uploadedFiles.get(fileId) ?? null;
}

/** Заполнить пустую папку uploads маркером, чтобы директория существовала. */
export function ensureUploadsDir(): void {
  const dir = uploadsDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/* ================= СИСТЕМА ПОДАРКОВ ================= */

/** Дефолтный каталог подарков (создаётся при первом старте). */
function defaultGiftCatalog(): GiftCatalogItem[] {
  const now = Date.now();
  const mk = (
    id: string, name: string, glyph: string, rarity: GiftCatalogItem["rarity"],
    category: string, price: number, total: number
  ): GiftCatalogItem => ({ id, name, glyph, rarity, category, price, total, sold: 0, active: true, createdAt: now });
  return [
    mk("duck", "Уточка", "🐤", "common", "sticker", 10, 0),
    mk("rose", "Роза", "🌹", "common", "seasonal", 15, 0),
    mk("cake", "Торт", "🎂", "common", "animated", 25, 0),
    mk("bear", "Мишка", "🧸", "rare", "collectible", 60, 0),
    mk("ring", "Кольцо", "💍", "rare", "collectible", 90, 0),
    mk("rocket", "Ракета", "🚀", "epic", "animated", 150, 0),
    mk("crown", "Корона", "👑", "epic", "collectible", 250, 0),
    mk("trophy", "Кубок", "🏆", "legendary", "collectible", 500, 0),
    mk("diamond", "Бриллиант", "💎", "legendary", "collectible", 800, 0),
    mk("unicorn", "Единорог", "🦄", "limited", "seasonal", 1200, 1000),
  ];
}

export function listGiftCatalog(): GiftCatalogItem[] {
  if (giftCatalog.length === 0) {
    giftCatalog = defaultGiftCatalog();
    save();
  }
  return giftCatalog;
}

export function getGiftItem(id: string): GiftCatalogItem | null {
  return giftCatalog.find((g) => g.id === id) ?? null;
}

export function updateGiftItem(id: string, patch: Partial<GiftCatalogItem>): GiftCatalogItem | null {
  const idx = giftCatalog.findIndex((g) => g.id === id);
  if (idx < 0) return null;
  giftCatalog[idx] = { ...giftCatalog[idx], ...patch };
  save();
  return giftCatalog[idx];
}

export function addGiftItem(item: Omit<GiftCatalogItem, "createdAt" | "sold">): GiftCatalogItem {
  const full: GiftCatalogItem = { ...item, sold: 0, createdAt: Date.now() };
  giftCatalog.push(full);
  save();
  return full;
}

export function removeGiftItem(id: string): boolean {
  const before = giftCatalog.length;
  giftCatalog = giftCatalog.filter((g) => g.id !== id);
  save();
  return giftCatalog.length < before;
}

/** Создаёт подарок с серийным номером. */
export function createGift(input: {
  giftId: string;
  toId: string;
  fromId: string | null;
  fromName: string;
  note?: string;
  scheduledFor?: number;
}): UserGift | null {
  const item = getGiftItem(input.giftId);
  if (!item) return null;
  giftSerial += 1;
  const gift: UserGift = {
    serial: giftSerial,
    giftId: item.id,
    name: item.name,
    glyph: item.glyph,
    rarity: item.rarity,
    value: item.price,
    toId: input.toId,
    fromId: input.fromId,
    fromName: input.fromName,
    note: input.note,
    scheduledFor: input.scheduledFor,
    accepted: true,
    createdAt: Date.now(),
  };
  userGifts.push(gift);
  item.sold += 1;
  save();
  return gift;
}

export function giftsForUser(userId: string): UserGift[] {
  return userGifts.filter((g) => g.toId === userId).sort((a, b) => b.createdAt - a.createdAt);
}

export function allGifts(): UserGift[] {
  return [...userGifts].sort((a, b) => b.createdAt - a.createdAt);
}

/** Уровень коллекционера по сумме стоимости подарков. */
export function collectorLevel(userId: string): { level: number; totalValue: number; nextIn: number } {
  const total = giftsForUser(userId).reduce((s, g) => s + g.value, 0);
  const level = Math.floor(Math.sqrt(total / 100)) + 1;
  const cur = (level - 1) ** 2 * 100;
  const next = level ** 2 * 100;
  return { level, totalValue: total, nextIn: Math.max(0, next - total) };
}

/* ================= ЖАЛОБЫ / ЛОГИ / ПРОМО / НАСТРОЙКИ ================= */

export function addReport(input: Omit<Report, "id" | "status" | "createdAt">): Report {
  const report: Report = { ...input, id: newId(), status: "open", createdAt: Date.now() };
  reports.push(report);
  save();
  return report;
}

export function listReports(status?: Report["status"]): Report[] {
  const list = status ? reports.filter((r) => r.status === status) : reports;
  return [...list].sort((a, b) => b.createdAt - a.createdAt);
}

export function resolveReport(id: string, adminId: string, status: "resolved" | "dismissed"): Report | null {
  const r = reports.find((x) => x.id === id);
  if (!r) return null;
  r.status = status;
  r.resolvedBy = adminId;
  r.resolvedAt = Date.now();
  save();
  return r;
}

export function logAdmin(input: Omit<AdminLog, "id" | "createdAt">): AdminLog {
  const log: AdminLog = { ...input, id: newId(), createdAt: Date.now() };
  adminLogs.push(log);
  if (adminLogs.length > 2000) adminLogs = adminLogs.slice(-2000);
  save();
  return log;
}

export function listAdminLogs(limit = 200): AdminLog[] {
  return [...adminLogs].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
}

export function findPromo(code: string): PromoCode | null {
  return promoCodes.find((p) => p.code === code.toLowerCase()) ?? null;
}

export function createPromo(input: Omit<PromoCode, "code" | "uses" | "createdAt"> & { code: string }): PromoCode {
  const promo: PromoCode = { ...input, code: input.code.toLowerCase(), uses: 0, createdAt: Date.now() };
  promoCodes.push(promo);
  save();
  return promo;
}

export function listPromos(): PromoCode[] {
  return [...promoCodes].sort((a, b) => b.createdAt - a.createdAt);
}

export function updatePromo(code: string, patch: Partial<PromoCode>): PromoCode | null {
  const p = promoCodes.find((x) => x.code === code.toLowerCase());
  if (!p) return null;
  Object.assign(p, patch);
  save();
  return p;
}

export function removePromo(code: string): boolean {
  const before = promoCodes.length;
  promoCodes = promoCodes.filter((p) => p.code !== code.toLowerCase());
  save();
  return promoCodes.length < before;
}

export function serverSettings(): ServerSettings {
  return { ...settings };
}

export function updateSettings(patch: Partial<ServerSettings>): ServerSettings {
  if (typeof patch.registrationOpen === "boolean") settings.registrationOpen = patch.registrationOpen;
  if (Array.isArray(patch.wordBlacklist)) settings.wordBlacklist = patch.wordBlacklist;
  if (Array.isArray(patch.linkWhitelist)) settings.linkWhitelist = patch.linkWhitelist;
  if (typeof patch.rateLimitPerMin === "number") settings.rateLimitPerMin = patch.rateLimitPerMin;
  if (Array.isArray(patch.bannedIps)) settings.bannedIps = patch.bannedIps;
  if (patch.features && typeof patch.features === "object") settings.features = { ...settings.features, ...patch.features };
  save();
  return { ...settings };
}

export function isFeatureOn(key: string, def = false): boolean {
  return typeof settings.features[key] === "boolean" ? settings.features[key] : def;
}

/* ================= АНАЛИТИКА ================= */

/** Строит дневную статистику по пользователям и сообщениям (для графиков). */
export function dayStats(days = 14): DayStat[] {
  const out: DayStat[] = [];
  const now = Date.now();
  for (let i = days - 1; i >= 0; i--) {
    const start = new Date(now - i * 86400_000);
    const key = start.toISOString().slice(0, 10);
    const dayStart = start.setHours(0, 0, 0, 0);
    const dayEnd = dayStart + 86400_000 - 1;
    const newUsers = [...users.values()].filter((u) => u.createdAt >= dayStart && u.createdAt <= dayEnd).length;
    let messages = 0;
    for (const list of messagesByChat.values()) {
      for (const m of list) if (m.createdAt >= dayStart && m.createdAt <= dayEnd) messages++;
    }
    const activeUsers = [...users.values()].filter(
      (u) => u.lastSeenAt && u.lastSeenAt >= dayStart && u.lastSeenAt <= dayEnd
    ).length;
    out.push({ date: key, newUsers, messages, activeUsers });
  }
  return out;
}

/** Топ активных пользователей по количеству сообщений. */
export function topActiveUsers(limit = 20): { userId: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const list of messagesByChat.values()) {
    for (const m of list) counts.set(m.senderId, (counts.get(m.senderId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([userId, count]) => ({ userId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/** Все транзакции (для экономики). */
export function allTransactions(limit = 500): BerryTx[] {
  return [...berryTransactions].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
}