// Тонкий клиент REST API Nova.
//
// Адрес сервера задаётся переменной окружения NEXT_PUBLIC_NOVA_API
// (например, http://localhost:8081). По умолчанию — локальный сервер.

import type {
  AdminChatView,
  AdminStats,
  AdminUserDetail,
  BerryTx,
  ChatView,
  Message,
  PhotoAttachment,
  User,
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

  adminBan: (token: string, userId: string, ban: boolean) =>
    request<{ user: User }>(
      `/api/admin/users/${encodeURIComponent(userId)}/ban`,
      { method: "POST", token, body: { ban } }
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
};