// Общие типы сервера Nova.

export type ChatType = "dm" | "group" | "channel" | "saved";

export type User = {
  id: string;
  username: string;
  displayName: string;
  avatarColor: string;
  phone?: string;
  isBot?: boolean;
  isOwner?: boolean;
  isPremium?: boolean;
  premiumUntil?: number;
  isBanned?: boolean;
  isVerified?: boolean;
  berries: number;
  lastSeenAt?: number;
  createdAt: number;
  /* --- модерация (панель владельца) --- */
  /** До какого момента пользователь не может писать (mute). */
  mutedUntil?: number;
  /** Тихий бан: сообщения видны только автору, но не уходят другим. */
  shadowBanned?: boolean;
  /** Когда включён shadowban: скрываются только сообщения после этого момента. */
  shadowBannedAt?: number;
  /** Причина бана (показывается владельцу). */
  bannedReason?: string;
  /** Временный бан: до этого момента. Нет — перманентный. */
  bannedUntil?: number;
  /** Последний IP (для логов и анти-фрод). */
  ip?: string;
  /** Отключённые системные флаги для этого пользователя. */
  flags?: Record<string, boolean>;
};

export type StoredUser = User & {
  passwordHash: string;
  salt: string;
};

export type Chat = {
  id: string;
  type: ChatType;
  memberIds: string[];
  title?: string;
  ownerId?: string;
  avatarColor?: string;
  noCopy?: boolean;
  createdAt: number;
};

export type PhotoAttachment = {
  fileId: string;
  url: string;
  mime: string;
  size: number;
};

export type MessageType = "text" | "sticker" | "photo";

/** Одна реакция на сообщение: эмодзи + кто поставил. */
export type MessageReaction = {
  emoji: string;
  userIds: string[];
};

/** Снимок сообщения, на которое отвечают (цитата). */
export type MessageRef = {
  id: string;
  senderId: string;
  senderName: string;
  text?: string;
  type: MessageType;
  sticker?: string;
  photoUrl?: string;
};

/** Откуда переслано сообщение. */
export type ForwardRef = {
  chatId: string;
  chatTitle: string;
  senderName: string;
  messageId: string;
};

export type Message = {
  id: string;
  chatId: string;
  senderId: string;
  text: string;
  type: MessageType;
  sticker?: string;
  photo?: PhotoAttachment;
  edited?: boolean;
  deleted?: boolean;
  reactions?: MessageReaction[];
  replyTo?: MessageRef;
  forwardedFrom?: ForwardRef;
  createdAt: number;
};

export type ChatView = {
  id: string;
  type: ChatType;
  title: string;
  peer: User | null;
  avatarColor: string;
  lastMessage: Message | null;
  unreadCount: number;
  readUntilId: string | null;
  memberCount?: number;
  ownerId?: string;
  banned?: boolean; // канал, где писать может только владелец
  noCopy?: boolean; // защита от копирования и пересылки
  createdAt: number;
};

export type BerryTx = {
  id: string;
  fromId: string;
  toId: string;
  amount: number;
  note?: string;
  createdAt: number;
};

/** Сводка для панели владельца. */
export type AdminStats = {
  users: number;
  bots: number;
  dms: number;
  groups: number;
  channels: number;
  saved: number;
  chats: number;
  messages: number;
  uploads: number;
  berriesTotal: number;
  online: number;
  /** Системные показатели сервера. */
  uptimeSec: number;
  memoryMB: number;
  wsConnections: number;
  version: string;
  maintenance: boolean;
  startedAt: number;
};

/** Чат в списке панели владельца. */
export type AdminChatView = {
  id: string;
  type: ChatType;
  title: string;
  memberIds: string[];
  memberCount: number;
  ownerId?: string;
  ownerName?: string;
  noCopy?: boolean;
  createdAt: number;
  lastMessageAt: number | null;
  lastMessageText?: string;
};

export type CallAction = "request" | "accept" | "decline" | "end" | "ice";

export type ClientEvent =
  | {
      type: "message.send";
      chatId: string;
      text: string;
      clientId: string;
      sticker?: string;
      replyToId?: string;
    }
  | { type: "message.edit"; messageId: string; text: string }
  | { type: "message.delete"; messageId: string }
  | { type: "message.read"; chatId: string; messageId: string }
  | { type: "typing"; chatId: string; isTyping: boolean }
  | {
      type: "call";
      chatId: string;
      callId: string;
      action: CallAction;
      payload?: unknown;
    }
  | { type: "ping" };

export type ServerEvent =
  | { type: "ready"; you: string; online: string[] }
  | { type: "message.new"; message: Message }
  | { type: "message.ack"; clientId: string; message: Message }
  | { type: "message.edited"; message: Message }
  | { type: "message.deleted"; messageId: string; chatId: string }
  /** История перезаписана массовым удалением (панель владельца). */
  | { type: "messages.purged"; chatId: string }
  | {
      type: "message.reactions";
      chatId: string;
      messageId: string;
      reactions: MessageReaction[];
    }
  | { type: "chat.deleted"; chatId: string }
  | { type: "chat.noCopy"; chatId: string; noCopy: boolean }
  | { type: "user.updated"; user: User }
  | { type: "message.read"; chatId: string; userId: string; messageId: string }
  | { type: "typing"; chatId: string; userId: string; isTyping: boolean }
  | { type: "presence"; userId: string; online: boolean }
  | { type: "berries"; berries: number }
  | {
      type: "call";
      chatId: string;
      callId: string;
      from: string;
      to: string;
      action: CallAction;
      payload?: unknown;
    }
  | { type: "pong" }
  | { type: "error"; error: string }
  /** Объявление от владельца (рассылка) — показывается уведомлением. */
  | { type: "announcement"; text: string }
  /** Подарок (пуш при получении). */
  | { type: "gift.received"; gift: UserGift }
  /** Системное уведомление произвольного вида. */
  | { type: "notice"; kind: string; text: string };

/* ================= СИСТЕМА ПОДАРКОВ (Telegram-style gifts) ================= */

export type GiftRarity = "common" | "rare" | "epic" | "legendary" | "limited";

/** Элемент каталога подарков. */
export type GiftCatalogItem = {
  id: string;
  name: string;
  /** Эмодзи-глиф подарка. */
  glyph: string;
  rarity: GiftRarity;
  /** Категория: стикеры / анимированные / коллекционные / сезонные. */
  category: string;
  /** Цена во внутренней валюте (звёзды). */
  price: number;
  /** Всего выпущено штук (0 = без ограничения). */
  total: number;
  /** Сколько уже разослано. */
  sold: number;
  /** Активен ли в каталоге. */
  active: boolean;
  createdAt: number;
};

/** Конкретный подарок, полученный пользователем (с серийным номером). */
export type UserGift = {
  /** Серийный номер вида #0001. */
  serial: number;
  giftId: string;
  name: string;
  glyph: string;
  rarity: GiftRarity;
  /** Ценность для уровня коллекционера. */
  value: number;
  toId: string;
  /** null = анонимно. */
  fromId: string | null;
  fromName: string;
  note?: string;
  /** Запланированная дата отправки (день рождения и т.п.). */
  scheduledFor?: number;
  /** Принят ли получателем. */
  accepted: boolean;
  createdAt: number;
};

/* ================= ЖАЛОБЫ, ЛОГИ, ПРОМО, ФЛАГИ ================= */

/** Жалоба пользователя (очередь модерации). */
export type Report = {
  id: string;
  reporterId: string;
  targetType: "user" | "message" | "chat";
  targetId: string;
  reason: string;
  status: "open" | "resolved" | "dismissed";
  createdAt: number;
  resolvedBy?: string;
  resolvedAt?: number;
};

/** Запись в журнале действий владельца. */
export type AdminLog = {
  id: string;
  adminId: string;
  adminName: string;
  action: string;
  targetType?: string;
  targetId?: string;
  meta?: string;
  createdAt: number;
};

/** Промокод на звёзды. */
export type PromoCode = {
  code: string;
  berries: number;
  uses: number;
  maxUses: number;
  expiresAt: number | null;
  active: boolean;
  createdBy: string;
  createdAt: number;
};

/* ================= НАСТРОЙКИ СЕРВЕРА (флаги и лимиты) ================= */

/** Глобальные настройки, которые владелец крутит из панели. */
export type ServerSettings = {
  /** Открыта ли регистрация. */
  registrationOpen: boolean;
  /** Чёрный список слов (сообщения с ними отклоняются). */
  wordBlacklist: string[];
  /** Разрешённые домены-ссылки (пусто = все разрешены). */
  linkWhitelist: string[];
  /** Лимит сообщений в минуту на пользователя. */
  rateLimitPerMin: number;
  /** Блокировки по IP. */
  bannedIps: string[];
  /** Вкл/выкл отдельные фичи (feature flags). */
  features: Record<string, boolean>;
};

/** Аналитика за день (для графиков и тепловой карты). */
export type DayStat = {
  date: string;
  newUsers: number;
  messages: number;
  activeUsers: number;
};