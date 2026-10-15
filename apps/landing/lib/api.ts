// Тонкий клиент REST API Nova.
//
// Адрес сервера задаётся переменной окружения NEXT_PUBLIC_NOVA_API
// (например, http://localhost:8081). По умолчанию — локальный сервер.

import type {
  AdminChatView,
  AdminLog,
  AdminSession,
  AdminStats,
  AdminUserDetail,
  BackupInfo,
  BerryTx,
  ChatView,
  CollectorInfo,
  DayStat,
  ExtendedAnalytics,
  GiftCatalogItem,
  Message,
  PhotoAttachment,
  PromoCode,
  Report,
  ServerSettings,
  User,
  UserGift,
  UserProfile,
} from "./chat-types";

const API_STORAGE_KEY = "nova.apiBase";

/** Сохранённый пользователем адрес сервера (если задан). */
export function getStoredApiBase(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(API_STORAGE_KEY);
    return value && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

/** Сохраняет адрес сервера (или сбрасывает, если передать null). */
export function setStoredApiBase(value: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (value && value.trim()) {
      window.localStorage.setItem(API_STORAGE_KEY, value.trim());
    } else {
      window.localStorage.removeItem(API_STORAGE_KEY);
    }
  } catch {
    /* localStorage может быть недоступен */
  }
}

/** Адрес сервера: выбор пользователя → значение обёртки → env → localhost. */
function resolveApiBase(): string {
  const stored = getStoredApiBase();
  if (stored) return stored;

  if (typeof window !== "undefined") {
    const injected = (window as unknown as { __NOVA_API__?: unknown }).__NOVA_API__;
    if (typeof injected === "string" && injected.trim()) return injected.trim();
  }
  return process.env.NEXT_PUBLIC_NOVA_API ?? "http://localhost:8081";
}

export const API_BASE = resolveApiBase().replace(/\/+$/, "");

export const WS_URL = `${API_BASE.replace(/^http/, "ws")}/ws`;

/** Приводит относительный URL вложения к абсолютному. */
export function mediaUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_BASE}${url.startsWith("/") ? url : `/${url}`}`;
}

export type AuthResult = { token: string; user: User };

type RequestOptions = {
  method?: string;
  token?: string | null;
  body?: unknown;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", token, body } = options;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(
      `Не удалось подключиться к серверу (${API_BASE}). Проверь, что бэкенд запущен.`
    );
  }

  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `Ошибка ${res.status}`);
  }
  return data as T;
}

export const api = {
  /* ------------------------------- аккаунт ------------------------------- */

  register: (phone: string, displayName: string, password: string) =>
    request<AuthResult>("/api/auth/register", {
      method: "POST",
      body: { phone, displayName, password },
    }),

  login: (login: string, password: string) =>
    request<AuthResult>("/api/auth/login", {
      method: "POST",
      body: { login, password },
    }),

  logout: (token: string) =>
    request<{ ok: boolean }>("/api/auth/logout", { method: "POST", token }),

  me: (token: string) => request<{ user: User }>("/api/me", { token }),

  patchMe: (token: string, patch: { displayName?: string; avatarColor?: string }) =>
    request<{ user: User }>("/api/me", { method: "PATCH", token, body: patch }),

  /* ------------------------------ чаты ----------------------------------- */

  chats: (token: string) => request<{ chats: ChatView[] }>("/api/chats", { token }),

  createChat: (token: string, peerId: string) =>
    request<{ chat: ChatView }>("/api/chats", {
      method: "POST",
      token,
      body: { peerId },
    }),

  createGroup: (token: string, title: string, memberIds: string[]) =>
    request<{ chat: ChatView }>("/api/groups", {
      method: "POST",
      token,
      body: { title, memberIds },
    }),

  createChannel: (token: string, title: string) =>
    request<{ chat: ChatView }>("/api/channels", {
      method: "POST",
      token,
      body: { title },
    }),

  channels: (token: string) =>
    request<{ channels: ChatView[] }>("/api/channels", { token }),

  joinChannel: (token: string, channelId: string) =>
    request<{ chat: ChatView }>(`/api/channels/${encodeURIComponent(channelId)}/join`, {
      method: "POST",
      token,
      body: {},
    }),

  /* ---------------------------- сообщения -------------------------------- */

  messages: (token: string, chatId: string, opts: { limit?: number; before?: string } = {}) =>
    request<{ messages: Message[] }>(
      `/api/chats/${encodeURIComponent(chatId)}/messages?limit=${opts.limit ?? 50}${
        opts.before ? `&before=${encodeURIComponent(opts.before)}` : ""
      }`,
      { token }
    ),

  sendMessage: (token: string, chatId: string, text: string, replyToId?: string) =>
    request<{ message: Message }>(
      `/api/chats/${encodeURIComponent(chatId)}/messages`,
      {
        method: "POST",
        token,
        body: replyToId ? { text, replyToId } : { text },
      }
    ),

  sendSticker: (token: string, chatId: string, sticker: string) =>
    request<{ message: Message }>(
      `/api/chats/${encodeURIComponent(chatId)}/messages`,
      { method: "POST", token, body: { sticker } }
    ),

  sendPhoto: (token: string, chatId: string, text: string, fileId: string) =>
    request<{ message: Message }>(
      `/api/chats/${encodeURIComponent(chatId)}/messages`,
      { method: "POST", token, body: { text, photo: { fileId } } }
    ),

  editMessage: (token: string, chatId: string, messageId: string, text: string) =>
    request<{ message: Message }>(
      `/api/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}`,
      { method: "PATCH", token, body: { text } }
    ),

  deleteMessage: (token: string, chatId: string, messageId: string) =>
    request<{ ok: boolean }>(
      `/api/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}`,
      { method: "DELETE", token }
    ),

  markRead: (token: string, chatId: string, messageId: string) =>
    request<{ ok: boolean }>(`/api/chats/${encodeURIComponent(chatId)}/read`, {
      method: "POST",
      token,
      body: { messageId },
    }),

  toggleReaction: (token: string, chatId: string, messageId: string, emoji: string) =>
    request<{ message: Message }>(
      `/api/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}/reactions`,
      { method: "POST", token, body: { emoji } }
    ),

  forwardMessage: (token: string, chatId: string, messageId: string, toChatIds: string[]) =>
    request<{ messages: Message[] }>(
      `/api/chats/${encodeURIComponent(chatId)}/forward`,
      { method: "POST", token, body: { messageId, toChatIds } }
    ),

  setNoCopy: (token: string, chatId: string, noCopy: boolean) =>
    request<{ chat: ChatView }>(
      `/api/chats/${encodeURIComponent(chatId)}/no-copy`,
      { method: "POST", token, body: { noCopy } }
    ),

  upload: async (token: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API_BASE}/api/uploads`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const data = (await res.json().catch(() => ({}))) as {
      file?: PhotoAttachment;
      error?: string;
    };
    if (!res.ok || !data.file) {
      throw new Error(data.error ?? `Ошибка загрузки файла (${res.status})`);
    }
    return data.file;
  },

  /* ------------------------------ люди ----------------------------------- */

  searchUsers: (token: string, query: string) =>
    request<{ users: User[] }>(`/api/users?q=${encodeURIComponent(query)}`, {
      token,
    }),

  userById: (token: string, userId: string) =>
    request<{ user: User }>(`/api/users/${encodeURIComponent(userId)}`, { token }),

  bots: (token: string) => request<{ bots: User[] }>("/api/bots", { token }),

  createBot: (token: string, username: string, displayName: string) =>
    request<{ user: User }>("/api/bots", {
      method: "POST",
      token,
      body: { username, displayName },
    }),

  /* ------------------------------- ягоды --------------------------------- */

  berries: (token: string) =>
    request<{ balance: number; transactions: BerryTx[] }>("/api/berries", { token }),

  transferBerries: (token: string, toId: string, amount: number, note?: string) =>
    request<{ ok: boolean; balance: number }>("/api/berries/transfer", {
      method: "POST",
      token,
      body: { toId, amount, note },
    }),

  buyPremium: (token: string) =>
    request<{ user: User; price: number; days: number }>("/api/me/premium", {
      method: "POST",
      token,
      body: {},
    }),

  /* ------------------------- панель владельца ------------------------------ */

  adminStats: (token: string) =>
    request<{ stats: AdminStats }>("/api/admin/stats", { token }),

  adminUsers: (token: string, q = "") =>
    request<{ users: User[] }>(
      `/api/admin/users${q ? `?q=${encodeURIComponent(q)}` : ""}`,
      { token }
    ),

  adminBerries: (token: string, userId: string, amount: number) =>
    request<{ user: User }>(
      `/api/admin/users/${encodeURIComponent(userId)}/berries`,
      { method: "POST", token, body: { amount } }
    ),

  adminPremium: (token: string, userId: string, premium: boolean) =>
    request<{ user: User }>(
      `/api/admin/users/${encodeURIComponent(userId)}/premium`,
      { method: "POST", token, body: { premium } }
    ),

  adminOwner: (token: string, userId: string, owner: boolean) =>
    request<{ user: User }>(
      `/api/admin/users/${encodeURIComponent(userId)}/owner`,
      { method: "POST", token, body: { owner } }
    ),

  adminBan: (token: string, userId: string, ban: boolean, reason = "", minutes = 0) =>
    request<{ user: User }>(
      `/api/admin/users/${encodeURIComponent(userId)}/ban`,
      { method: "POST", token, body: { ban, reason, minutes } }
    ),

  adminVerify: (token: string, userId: string, verify: boolean) =>
    request<{ user: User }>(
      `/api/admin/users/${encodeURIComponent(userId)}/verify`,
      { method: "POST", token, body: { verify } }
    ),

  adminDeleteBot: (token: string, botId: string) =>
    request<{ ok: boolean }>(
      `/api/admin/bots/${encodeURIComponent(botId)}/delete`,
      { method: "POST", token, body: {} }
    ),

  adminChats: (token: string, type = "", q = "") =>
    request<{ chats: AdminChatView[] }>(
      `/api/admin/chats?type=${encodeURIComponent(type)}${
        q ? `&q=${encodeURIComponent(q)}` : ""
      }`,
      { token }
    ),

  adminDeleteChat: (token: string, chatId: string) =>
    request<{ ok: boolean }>(
      `/api/admin/chats/${encodeURIComponent(chatId)}/delete`,
      { method: "POST", token, body: {} }
    ),

  /* --------------------------- профиль и модерация ------------------------- */

  /** Публичный профиль: статусы, онлайн, общие чаты. */
  userProfile: (token: string, userId: string) =>
    request<UserProfile>(`/api/users/${encodeURIComponent(userId)}/profile`, { token }),

  /** Детальная карточка для панели владельца (со списком чатов). */
  adminUserDetail: (token: string, userId: string) =>
    request<AdminUserDetail>(`/api/admin/users/${encodeURIComponent(userId)}/detail`, {
      token,
    }),

  adminResetPassword: (token: string, userId: string, password: string) =>
    request<{ ok: boolean }>(
      `/api/admin/users/${encodeURIComponent(userId)}/password`,
      { method: "POST", token, body: { password } }
    ),

  adminDeleteUser: (token: string, userId: string) =>
    request<{ ok: boolean }>(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: "DELETE",
      token,
    }),

  adminBroadcast: (token: string, text: string) =>
    request<{ sent: number }>("/api/admin/broadcast", {
      method: "POST",
      token,
      body: { text },
    }),

  adminMaintenance: (token: string, on: boolean) =>
    request<{ maintenance: boolean }>("/api/admin/maintenance", {
      method: "POST",
      token,
      body: { on },
    }),

  adminDeleteMessage: (token: string, messageId: string) =>
    request<{ ok: boolean }>(
      `/api/admin/messages/${encodeURIComponent(messageId)}/delete`,
      { method: "POST", token, body: {} }
    ),

  /* --------------------------- подарки и экономика ------------------------- */

  giftsCatalog: (token: string) =>
    request<{ gifts: GiftCatalogItem[]; balance: number }>("/api/gifts/catalog", { token }),

  sendGift: (token: string, giftId: string, toId: string, opts: {
    anonymous?: boolean; note?: string; scheduledFor?: number;
  } = {}) =>
    request<{ gift: UserGift; balance: number }>("/api/gifts/send", {
      method: "POST", token,
      body: { giftId, toId, anonymous: opts.anonymous, note: opts.note, scheduledFor: opts.scheduledFor },
    }),

  userGifts: (token: string, userId: string) =>
    request<{ gifts: UserGift[]; collector: CollectorInfo }>(
      `/api/gifts/user/${encodeURIComponent(userId)}`, { token }),

  redeemPromo: (token: string, code: string) =>
    request<{ berries: number; balance: number }>("/api/promo/redeem", {
      method: "POST", token, body: { code },
    }),

  sendReport: (token: string, targetType: "user" | "message" | "chat", targetId: string, reason: string) =>
    request<{ report: Report }>("/api/reports", {
      method: "POST", token, body: { targetType, targetId, reason },
    }),

  settings: (token: string) =>
    request<{ settings: ServerSettings }>("/api/settings", { token }),

  /* ----------------------- админ: расширенная панель ----------------------- */

  adminLogs: (token: string) => request<{ logs: AdminLog[] }>("/api/admin/logs", { token }),

  adminReports: (token: string, status = "") =>
    request<{ reports: Report[] }>(`/api/admin/reports${status ? `?status=${status}` : ""}`, { token }),

  adminResolveReport: (token: string, id: string, status: "resolved" | "dismissed") =>
    request<{ report: Report }>(`/api/admin/reports/${encodeURIComponent(id)}/resolve`, {
      method: "POST", token, body: { status },
    }),

  adminMute: (token: string, userId: string, minutes: number, reason = "") =>
    request<{ user: User }>(`/api/admin/users/${encodeURIComponent(userId)}/mute`, {
      method: "POST", token, body: { minutes, reason },
    }),

  adminShadowban: (token: string, userId: string, on: boolean) =>
    request<{ user: User }>(`/api/admin/users/${encodeURIComponent(userId)}/shadowban`, {
      method: "POST", token, body: { on },
    }),

  adminGifts: (token: string) => request<{ gifts: GiftCatalogItem[] }>("/api/admin/gifts", { token }),

  adminCreateGift: (token: string, gift: { name: string; glyph: string; rarity: string; category: string; price: number; total: number }) =>
    request<{ gift: GiftCatalogItem }>("/api/admin/gifts", { method: "POST", token, body: gift }),

  adminUpdateGift: (token: string, id: string, patch: Record<string, unknown>) =>
    request<{ gift: GiftCatalogItem }>(`/api/admin/gifts/${encodeURIComponent(id)}`, {
      method: "PATCH", token, body: patch }),

  adminDeleteGift: (token: string, id: string) =>
    request<{ ok: boolean }>(`/api/admin/gifts/${encodeURIComponent(id)}`, { method: "DELETE", token }),

  adminPromos: (token: string) => request<{ promos: PromoCode[] }>("/api/admin/promo", { token }),

  adminCreatePromo: (token: string, promo: { code: string; berries: number; maxUses: number; expiresAt?: number | null }) =>
    request<{ promo: PromoCode }>("/api/admin/promo", { method: "POST", token, body: promo }),

  adminUpdatePromo: (token: string, code: string, active: boolean) =>
    request<{ promo: PromoCode }>(`/api/admin/promo/${encodeURIComponent(code)}`, {
      method: "PATCH", token, body: { active } }),

  adminUpdateSettings: (token: string, patch: Partial<ServerSettings> & Record<string, unknown>) =>
    request<{ settings: ServerSettings }>("/api/admin/settings", { method: "PUT", token, body: patch }),

  adminAnalytics: (token: string, days = 14) =>
    request<{ days: DayStat[]; top: { userId: string; count: number; user: User }[] }>(
      `/api/admin/analytics?days=${days}`, { token }),

  adminEconomy: (token: string) =>
    request<{ transactions: BerryTx[]; total: number }>("/api/admin/economy", { token }),

  /* --------------- админ: сессии, массовое, бэкапы, аналитика -------------- */

  /** Полные настройки сервера (только владелец). */
  adminSettings: (token: string) =>
    request<{ settings: ServerSettings }>("/api/admin/settings", { token }),

  /** Активные сессии пользователя: когда, откуда, из какого браузера. */
  adminSessions: (token: string, userId: string) =>
    request<{ sessions: AdminSession[] }>(
      `/api/admin/users/${encodeURIComponent(userId)}/sessions`,
      { token }
    ),

  adminRevokeSession: (token: string, userId: string, sessionToken: string) =>
    request<{ ok: boolean }>(
      `/api/admin/users/${encodeURIComponent(userId)}/sessions/revoke`,
      { method: "POST", token, body: { token: sessionToken } }
    ),

  /** Выйти со всех устройств пользователя. */
  adminLogoutAll: (token: string, userId: string) =>
    request<{ ok: boolean }>(
      `/api/admin/users/${encodeURIComponent(userId)}/logout-all`,
      { method: "POST", token, body: {} }
    ),

  /** Режим «войти как этот пользователь»: возвращает временный токен. */
  adminImpersonate: (token: string, userId: string) =>
    request<{ token: string; user: User }>(
      `/api/admin/users/${encodeURIComponent(userId)}/impersonate`,
      { method: "POST", token, body: {} }
    ),

  /** Массовое удаление сообщений по фильтру (чат / автор / раньше времени). */
  adminMassDelete: (
    token: string,
    filter: { chatId?: string; senderId?: string; before?: number }
  ) =>
    request<{ removed: number }>("/api/admin/messages/mass-delete", {
      method: "POST",
      token,
      body: filter,
    }),

  /** Массовые начисления/списания звёзд. */
  adminRewardsMass: (
    token: string,
    payload: { userIds?: string[]; all?: boolean; amount: number; reason?: string }
  ) =>
    request<{ updated: number; amount: number }>("/api/admin/rewards/mass", {
      method: "POST",
      token,
      body: payload,
    }),

  adminBackups: (token: string) =>
    request<{ backups: BackupInfo[] }>("/api/admin/backups", { token }),

  adminBackupCreate: (token: string) =>
    request<{ backup: BackupInfo }>("/api/admin/backup", {
      method: "POST",
      token,
      body: {},
    }),

  adminBackupRestore: (token: string, name: string) =>
    request<{ ok: boolean }>("/api/admin/backups/restore", {
      method: "POST",
      token,
      body: { name },
    }),

  adminCacheClear: (token: string) =>
    request<{ ok: boolean; cleared: number }>("/api/admin/cache/clear", {
      method: "POST",
      token,
      body: {},
    }),

  /** DAU/WAU/MAU, воронка, удержание, тепловая карта активности. */
  adminAnalyticsExtended: (token: string) =>
    request<ExtendedAnalytics>("/api/admin/analytics/extended", { token }),

  /** Выгрузка пользователей текстом (JSON или CSV) для скачивания. */
  adminExportText: async (token: string, format: "json" | "csv" = "json") => {
    const res = await fetch(`${API_BASE}/api/admin/export?format=${format}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const text = await res.text();
    if (!res.ok) {
      let msg = `Ошибка ${res.status}`;
      try {
        msg = (JSON.parse(text) as { error?: string }).error ?? msg;
      } catch {
        /* не JSON — оставляем статус */
      }
      throw new Error(msg);
    }
    return text;
  },
};