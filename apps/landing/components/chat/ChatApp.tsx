"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

import {
  LogoMark,
  Plus,
  ArrowRight,
  Close,
  Reply,
  Forward,
  Edit,
  Trash,
  Paperclip,
  Smile,
  Star,
  Megaphone,
  Crown,
  Ban,
  Unlock,
  Check,
  CheckDouble,
  Search,
  ChatBubble,
  Gear,
  Users,
  Bot,
  Sparkles,
  Shield,
  Phone,
  Lock,
} from "@/components/Icons";
import {
  Sticker,
  GlyphIcon,
  STICKER_IDS,
  PREMIUM_STICKER_IDS,
  REACTION_IDS,
  REACTION_LABELS,
  stickerLabel,
} from "@/components/Stickers";
import { api, mediaUrl, API_BASE, type AuthResult, WS_URL } from "@/lib/api";
import { releases } from "@/lib/site";
import { isNativeApp } from "@/lib/shell";
import type {
  AdminChatView,
  AdminStats,
  AdminUserDetail,
  BerryTx,
  ChatView,
  ClientEvent,
  ForwardRef,
  GiftCatalogItem,
  Message,
  MessageReaction,
  MessageRef,
  ServerEvent,
  User,
  UserProfile,
} from "@/lib/chat-types";

import { AuthPanel } from "./AuthPanel";
import { GiftShowcase } from "./GiftShowcase";
import {
  AdminAnalytics,
  AdminEconomy,
  AdminGifts,
  AdminModeration,
  AdminServer,
  AdminUserTools,
} from "./AdminExtra";

type Connection = "connecting" | "online" | "offline";
type CallPhase = "idle" | "outgoing" | "incoming" | "connecting" | "active";

type CallState = {
  phase: CallPhase;
  callId: string | null;
  chatId: string | null;
  peerId: string | null;
  peerDisplayName: string;
  avatarColor: string;
  startedAt: number | null;
  error?: string;
};

const EMPTY_CALL: CallState = {
  phase: "idle",
  callId: null,
  chatId: null,
  peerId: null,
  peerDisplayName: "",
  avatarColor: "#2a3350",
  startedAt: null,
};

const TOKEN_KEY = "nova.token";

/* Стикеры и реакции — собственные векторные глифы (см. components/Stickers.tsx). */

function makeId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

function initial(value: string): string {
  return value.trim().charAt(0).toUpperCase() || "?";
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatListTime(ts: number): string {
  const date = new Date(ts);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? formatTime(ts)
    : date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

function formatLastSeen(ts?: number): string {
  if (!ts) return "не в сети";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "был(а) только что";
  if (diff < 3600_000) return `был(а) ${Math.floor(diff / 60_000)} мин назад`;
  if (diff < 86400_000)
    return `был(а) в ${new Date(ts).toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  return `был(а) ${new Date(ts).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
  })}`;
}

function lastMessagePreview(message: Message): string {
  if (message.deleted) return "Сообщение удалено";
  if (message.type === "sticker") return "Стикер";
  if (message.type === "photo")
    return message.text ? `Фото: ${message.text}` : "Фото";
  return message.text;
}

function Avatar({
  user,
  size = 44,
}: {
  user: Pick<User, "displayName" | "avatarColor">;
  size?: number;
}) {
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        background: user.avatarColor,
        fontSize: size * 0.4,
      }}
    >
      {initial(user.displayName)}
    </span>
  );
}

function ChatAvatar({ chat, size = 44 }: { chat: ChatView; size?: number }) {
  if (chat.type === "dm" && chat.peer) {
    return <Avatar user={chat.peer} size={size} />;
  }
  const glyph =
    chat.type === "saved" ? (
      <Star width={size * 0.5} height={size * 0.5} />
    ) : chat.type === "channel" ? (
      <Megaphone width={size * 0.5} height={size * 0.5} />
    ) : (
      <Users width={size * 0.5} height={size * 0.5} />
    );
  return (
    <span
      className="avatar chat-avatar-icon"
      style={{
        width: size,
        height: size,
        background: chat.avatarColor,
        fontSize: size * 0.42,
      }}
      title={chat.title}
    >
      {glyph}
    </span>
  );
}

function RoleBadge({ user }: { user: User }) {
  const role = user.isOwner ? (
    <span className="badge badge-owner" title="Владелец Nova">
      <Crown width={13} height={13} />
    </span>
  ) : user.isPremium ? (
    <span className="badge badge-premium" title="Premium Nova">
      <Sparkles width={13} height={13} />
    </span>
  ) : user.isBot ? (
    <span className="badge badge-bot" title="Бот">
      <Bot width={13} height={13} />
    </span>
  ) : null;
  const verified = user.isOwner || user.isVerified;
  return (
    <>
      {role}
      {verified && (
        <span className="badge badge-verified" title="Проверенный аккаунт">
          <Check width={13} height={13} />
        </span>
      )}
    </>
  );
}

function ReplyQuote({ quote }: { quote: MessageRef }) {
  let preview = "";
  if (quote.type === "sticker") preview = "";
  else if (quote.type === "photo") preview = quote.text ? `Фото: ${quote.text}` : "Фото";
  else preview = quote.text ?? "";
  return (
    <span className="msg-reply">
      <i className="msg-reply-bar" aria-hidden="true" />
      <span className="msg-reply-body">
        <span className="msg-reply-name">{quote.senderName}</span>
        {quote.type === "sticker" ? (
          <Sticker id={quote.sticker ?? ""} size={20} className="msg-reply-emoji" />
        ) : (
          <span className="msg-reply-text">{preview || "…"}</span>
        )}
      </span>
    </span>
  );
}

function ForwardLabel({ from }: { from: ForwardRef }) {
  return (
    <span className="msg-forward">
      <Forward width={13} height={13} />
      {from.chatTitle === from.senderName ? "Переслано" : `Переслано из ${from.chatTitle}`}
      <span className="msg-forward-sender"> · {from.senderName}</span>
    </span>
  );
}

function ReactionBar({
  message,
  meId,
  pickerOpen,
  onToggleEmoji,
  onOpenPicker,
  onClosePicker,
}: {
  message: Message;
  meId: string;
  pickerOpen: boolean;
  onToggleEmoji: (emoji: string) => void;
  onOpenPicker: () => void;
  onClosePicker: () => void;
}) {
  const reactions = message.reactions ?? [];
  return (
    <span className="msg-reactions">
      {reactions.map((r) => {
        const mine = r.userIds.includes(meId);
        return (
          <button
            key={r.emoji}
            className={`reaction-chip${mine ? " mine" : ""}`}
            title={
              mine
                ? "Убрать свою реакцию"
                : `Реакция: ${REACTION_LABELS[r.emoji] ?? stickerLabel(r.emoji)}`
            }
            onClick={() => onToggleEmoji(r.emoji)}
          >
            <GlyphIcon id={r.emoji} size={17} className="reaction-emoji" />
            <span className="reaction-count">{r.userIds.length}</span>
          </button>
        );
      })}
      <button
        className={`reaction-add${pickerOpen ? " on" : ""}`}
        title="Поставить реакцию"
        onClick={pickerOpen ? onClosePicker : onOpenPicker}
      >
        {pickerOpen ? <Close width={13} height={13} /> : <Plus width={13} height={13} />}
      </button>
      {pickerOpen && (
        <span className="reaction-picker">
          {REACTION_IDS.map((e) => (
            <button
              key={e}
              className={`reaction-pick${
                (message.reactions ?? []).some((r) => r.emoji === e && r.userIds.includes(meId))
                  ? " mine"
                  : ""
              }`}
              title={REACTION_LABELS[e] ?? e}
              onClick={() => onToggleEmoji(e)}
            >
              <GlyphIcon id={e} size={18} />
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

function CallOverlayUI({
  call,
  remoteAudioRef,
  onDecline,
  onAccept,
  onHangup,
}: {
  call: CallState;
  remoteAudioRef: RefObject<HTMLAudioElement | null>;
  onDecline: () => void;
  onAccept: () => void;
  onHangup: () => void;
}) {
  if (call.phase === "idle") return null;
  const ringing = call.phase === "outgoing" || call.phase === "incoming";
  const label =
    call.phase === "outgoing"
      ? "Звоним…"
      : call.phase === "incoming"
        ? "Входящий звонок…"
        : call.phase === "active"
          ? "Идёт звонок"
          : "Соединяем…";
  const seconds = call.startedAt ? Math.floor((Date.now() - call.startedAt) / 1000) : 0;
  const timer = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(
    seconds % 60
  ).padStart(2, "0")}`;

  return (
    <div className="call-overlay">
      <audio ref={remoteAudioRef} autoPlay />
      <div className="call-card">
        {ringing && <span className="call-pulse" />}
        <span
          className="avatar call-avatar"
          style={{ background: call.avatarColor, fontSize: 28 }}
        >
          {initial(call.peerDisplayName || "@")}
        </span>
        <span className="call-name">{call.peerDisplayName || "Собеседник"}</span>
        <span className="call-label">{label}</span>
        {call.phase === "active" && <span className="call-timer">{timer}</span>}
        {call.error && <span className="call-error">{call.error}</span>}
        <div className="call-actions">
          {call.phase === "incoming" ? (
            <>
              <button className="call-btn call-decline" onClick={onDecline}>
                Отклонить
              </button>
              <button className="call-btn call-accept" onClick={onAccept}>
                Ответить
              </button>
            </>
          ) : (
            <button className="call-btn call-decline" onClick={onHangup}>
              {call.phase === "outgoing" ? "Отменить" : "Завершить"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function ChatApp() {
  const [booting, setBooting] = useState(true);
  const [me, setMe] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [connection, setConnection] = useState<Connection>("offline");

  const [chats, setChats] = useState<ChatView[]>([]);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [typingIn, setTypingIn] = useState<Record<string, boolean>>({});
  const [people, setPeople] = useState<Record<string, User>>({});
  const [peerRead, setPeerRead] = useState<Record<string, string | null>>({});

  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [reactFor, setReactFor] = useState<string | null>(null);
  const [fwdMsg, setFwdMsg] = useState<Message | null>(null);
  const [fwdTargets, setFwdTargets] = useState<Set<string>>(new Set());
  const [fwdBusy, setFwdBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [berries, setBerries] = useState(0);
  const [berryTx, setBerryTx] = useState<BerryTx[]>([]);

  const [stickerOpen, setStickerOpen] = useState(false);
  const [modal, setModal] = useState<"none" | "new" | "transfer" | "profile" | "gift">(
    "none"
  );
  // Вкладки приложения (как в Telegram): чаты / настройки / админ-панель.
  const [tab, setTab] = useState<"chats" | "settings" | "admin">("chats");
  const [call, setCall] = useState<CallState>(EMPTY_CALL);

  // Карточка профиля (другого пользователя)
  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [profileInfo, setProfileInfo] = useState<UserProfile | null>(null);
  const [profileDetail, setProfileDetail] = useState<AdminUserDetail | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileErr, setProfileErr] = useState<string | null>(null);
  const [pResetPass, setPResetPass] = useState("");
  /* вкладки внутри карточки профиля: инфо или витрина подарков */
  const [profileTab, setProfileTab] = useState<"info" | "gifts">("info");
  /* --- отправка подарка --- */
  const [giftCatalog, setGiftCatalog] = useState<GiftCatalogItem[]>([]);
  const [giftPick, setGiftPick] = useState<string | null>(null);
  const [giftNote, setGiftNote] = useState("");
  const [giftAnon, setGiftAnon] = useState(false);
  const [giftDate, setGiftDate] = useState("");
  const [giftBal, setGiftBal] = useState(0);
  const [giftBusy, setGiftBusy] = useState(false);
  const [giftErr, setGiftErr] = useState<string | null>(null);
  // Баннер объявления (рассылка владельца)
  const [notice, setNotice] = useState<string | null>(null);

  // Модал «Новый чат»
  const [nTab, setNTab] = useState<"users" | "group" | "channel" | "browse">("users");
  const [nQ, setNQ] = useState("");
  const [nUsers, setNUsers] = useState<User[]>([]);
  const [nBots, setNBots] = useState<User[]>([]);
  const [nGroupTitle, setNGroupTitle] = useState("");
  const [nGroupMembers, setNGroupMembers] = useState<User[]>([]);
  const [nChannelTitle, setNChannelTitle] = useState("");
  const [nChannels, setNChannels] = useState<ChatView[]>([]);
  const [nBusy, setNBusy] = useState(false);

  // Модал «Передать звёзды»
  const [transferTo, setTransferTo] = useState<User | null>(null);
  const [transferAmount, setTransferAmount] = useState("");
  const [transferNote, setTransferNote] = useState("");
  const [xQ, setXQ] = useState("");
  const [xUsers, setXUsers] = useState<User[]>([]);

  // Жалоба на пользователя из его профиля
  const [reportFor, setReportFor] = useState<string | null>(null);
  const [reportText, setReportText] = useState("");
  const [reportBusy, setReportBusy] = useState(false);

  // Промокод в настройках
  const [promoCode, setPromoCode] = useState("");
  const [promoBusy, setPromoBusy] = useState(false);

  // Панель владельца
  const [aTab, setATab] = useState<
    | "stats"
    | "users"
    | "moderation"
    | "gifts"
    | "economy"
    | "bots"
    | "channels"
    | "groups"
    | "broadcast"
    | "system"
  >("stats");
  /** Режим «войти как пользователь»: кто открыт вместо владельца. */
  const [impersonating, setImpersonating] = useState<User | null>(null);
  const ownerTokenRef = useRef<string | null>(null);
  const [aStats, setAStats] = useState<AdminStats | null>(null);
  const [aQ, setAQ] = useState("");
  const [aFilter, setAFilter] = useState<
    "all" | "online" | "premium" | "verified" | "owner" | "banned"
  >("all");
  const [aUsers, setAUsers] = useState<User[]>([]);
  const [aBots, setABots] = useState<User[]>([]);
  const [aChats, setAChats] = useState<AdminChatView[]>([]);
  const [aAmounts, setAAmounts] = useState<Record<string, string>>({});
  const [aBotName, setABotName] = useState("");
  const [aBotUser, setABotUser] = useState("");
  const [aBusy, setABusy] = useState(false);
  const [aDanger, setADanger] = useState<string | null>(null);
  const [aMsg, setAMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [bcText, setBcText] = useState("");
  const [bcBusy, setBcBusy] = useState(false);

  const [profileName, setProfileName] = useState("");
  const [premiumPrice, setPremiumPrice] = useState(199);

  const tokenRef = useRef<string | null>(null);
  const meRef = useRef<User | null>(null);
  const activeRef = useRef<string | null>(null);
  const messagesRef = useRef<Record<string, Message[]>>({});
  const chatsRef = useRef<ChatView[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSent = useRef(0);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const eventRef = useRef<(event: ServerEvent) => void>(() => {});
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const lastReadSent = useRef<Record<string, string | null>>({});

  // WebRTC
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  tokenRef.current = token;
  meRef.current = me;
  activeRef.current = activeId;
  messagesRef.current = messages;
  chatsRef.current = chats;

  /* --------------------------- режим приложения -------------------------- */
  // Внутри Electron/Capacitor включаем «нативную» вёрстку (во весь экран, с
  // учётом вырезов экрана) и учим системную кнопку «Назад» вести себя как в
  // обычном приложении: из открытого чата возвращаемся к списку чатов.
  useEffect(() => {
    const app = isNativeApp();
    document.documentElement.dataset.shell = app ? "app" : "web";
    if (!app) return;
    const onPop = () => setActiveId(null);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  /* ------------------------------ контекст людей -------------------------- */

  function indexPeople(list: User[]) {
    if (!list.length) return;
    setPeople((prev) => {
      const next = { ...prev };
      for (const u of list) next[u.id] = u;
      return next;
    });
  }

  /* ------------------------------ сообщения ------------------------------ */

  function upsertMessage(chatId: string, message: Message, clientId?: string) {
    setMessages((prev) => {
      const list = prev[chatId] ?? [];
      if (clientId) {
        const idx = list.findIndex((m) => m.id === clientId);
        if (idx >= 0) {
          const next = [...list];
          next[idx] = message;
          return { ...prev, [chatId]: next };
        }
      }
      if (list.some((m) => m.id === message.id)) return prev;
      return { ...prev, [chatId]: [...list, message] };
    });
  }

  function applyMessageEdit(message: Message) {
    setMessages((prev) => {
      const list = prev[message.chatId] ?? [];
      const idx = list.findIndex((m) => m.id === message.id);
      if (idx < 0) return prev;
      const next = [...list];
      next[idx] = message;
      return { ...prev, [message.chatId]: next };
    });
  }

  function applyMessageDelete(chatId: string, messageId: string) {
    setMessages((prev) => {
      const list = prev[chatId] ?? [];
      const idx = list.findIndex((m) => m.id === messageId);
      if (idx < 0) return prev;
      const next = [...list];
      next[idx] = {
        ...next[idx],
        deleted: true,
        text: "",
        sticker: undefined,
        photo: undefined,
      };
      return { ...prev, [chatId]: next };
    });
    setChats((prev) =>
      sortChats(
        prev.map((c) => {
          if (c.id !== chatId || c.lastMessage?.id !== messageId) return c;
          return { ...c, lastMessage: findLastVisible(chatId, messageId) };
        })
      )
    );
  }

  function findLastVisible(chatId: string, excludeId?: string): Message | null {
    const list = messagesRef.current[chatId] ?? [];
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      if (m.id === excludeId) continue;
      if (!m.deleted) return m;
    }
    return null;
  }

  function sortChats(list: ChatView[]): ChatView[] {
    return [...list].sort((a, b) => {
      const at = a.lastMessage?.createdAt ?? a.createdAt;
      const bt = b.lastMessage?.createdAt ?? b.createdAt;
      return bt - at;
    });
  }

  function applyMessageReactions(chatId: string, messageId: string, reactions: MessageReaction[]) {
    const clean = reactions.length ? reactions : undefined;
    setMessages((prev) => {
      const list = prev[chatId] ?? [];
      const idx = list.findIndex((m) => m.id === messageId);
      if (idx < 0) return prev;
      const next = [...list];
      next[idx] = { ...next[idx], reactions: clean };
      return { ...prev, [chatId]: next };
    });
    setChats((prev) =>
      prev.map((c) =>
        c.id === chatId && c.lastMessage?.id === messageId
          ? { ...c, lastMessage: { ...c.lastMessage, reactions: clean } }
          : c
      )
    );
  }

  async function toggleMessageReaction(message: Message, emoji: string) {
    const current = tokenRef.current;
    if (!current || message.deleted) return;
    try {
      const { message: updated } = await api.toggleReaction(
        current,
        message.chatId,
        message.id,
        emoji
      );
      applyMessageReactions(message.chatId, message.id, updated.reactions ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось изменить реакцию");
    } finally {
      setReactFor(null);
    }
  }

  function startReply(message: Message) {
    if (message.deleted) return;
    setReplyTo(message);
    setEditingId(null);
    setDraft("");
    setStickerOpen(false);
    setError(null);
    window.setTimeout(() => composerRef.current?.focus(), 0);
  }

  function openForward(message: Message) {
    if (message.deleted) return;
    setFwdMsg(message);
    setFwdTargets(new Set());
  }

  async function submitForward() {
    const current = tokenRef.current;
    const message = fwdMsg;
    if (!current || !message || fwdTargets.size === 0) return;
    setFwdBusy(true);
    try {
      const { messages } = await api.forwardMessage(
        current,
        message.chatId,
        message.id,
        [...fwdTargets]
      );
      for (const m of messages) {
        upsertMessage(m.chatId, m);
        touchChat(m);
      }
      setFwdMsg(null);
      setFwdTargets(new Set());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось переслать");
    } finally {
      setFwdBusy(false);
    }
  }

  async function toggleNoCopy(chatId: string) {
    const current = tokenRef.current;
    const chat = chatsRef.current.find((c) => c.id === chatId);
    if (!current || !chat) return;
    try {
      const { chat: updated } = await api.setNoCopy(current, chatId, !chat.noCopy);
      setChats((prev) => prev.map((c) => (c.id === chatId ? updated : c)));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось изменить защиту");
    }
  }

  function touchChat(message: Message) {
    const list = chatsRef.current;
    if (!list.some((c) => c.id === message.chatId)) {
      const current = tokenRef.current;
      if (current) {
        api
          .chats(current)
          .then(({ chats: fresh }) => setChats(sortChats(fresh)))
          .catch(() => {});
      }
      return;
    }
    setChats((prev) =>
      sortChats(
        prev.map((c) =>
          c.id === message.chatId
            ? {
                ...c,
                lastMessage: message,
                unreadCount:
                  c.id === activeRef.current
                    ? 0
                    : (c.unreadCount ?? 0) +
                      (message.senderId === meRef.current?.id ? 0 : 1),
              }
            : c
        )
      )
    );
  }

  function markCurrentRead() {
    const current = tokenRef.current;
    const active = activeRef.current;
    if (!current || !active) return;
    const list = messagesRef.current[active] ?? [];
    if (list.length === 0) return;
    const last = list[list.length - 1];
    if (
      lastReadSent.current[active] === last.id &&
      last.senderId === meRef.current?.id
    ) {
      return;
    }
    lastReadSent.current[active] = last.id;
    const ws = wsRef.current;
    const event: ClientEvent = {
      type: "message.read",
      chatId: active,
      messageId: last.id,
    };
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    } else {
      api.markRead(current, active, last.id).catch(() => {});
    }
    setChats((prev) =>
      prev.map((c) =>
        c.id === active ? { ...c, unreadCount: 0, readUntilId: last.id } : c
      )
    );
  }

  function clearTypingLater(chatId: string) {
    setTimeout(() => {
      setTypingIn((prev) => (prev[chatId] ? { ...prev, [chatId]: false } : prev));
    }, 2600);
  }

  /* ------------------------------- звонки --------------------------------- */

  function sendCall(
    action: Extract<ClientEvent, { type: "call" }>["action"],
    payload?: unknown
  ) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    if (!call.chatId || !call.callId) return false;
    const event: ClientEvent = {
      type: "call",
      chatId: call.chatId,
      callId: call.callId,
      action,
      ...(payload !== undefined ? { payload } : {}),
    };
    ws.send(JSON.stringify(event));
    return true;
  }

  function cleanupRtc() {
    try {
      pcRef.current?.close();
    } catch {}
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
  }

  async function initRtc() {
    if (pcRef.current) return pcRef.current;
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    });
    pcRef.current = pc;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    } catch {
      /* микрофон недоступен — соединение продолжится в режиме «тишины» */
    }
    pc.onicecandidate = (ev) => {
      if (ev.candidate) sendCall("ice", { candidate: ev.candidate.toJSON() });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        setCall((c) => ({ ...c, phase: "active", startedAt: Date.now() }));
      } else if (pc.connectionState === "failed") {
        setCall((c) => ({ ...c, error: "Не удалось установить соединение" }));
      }
    };
    pc.ontrack = (ev) => {
      if (remoteAudioRef.current && ev.streams[0]) {
        remoteAudioRef.current.srcObject = ev.streams[0];
      }
    };
    return pc;
  }

  async function startCall(chat: ChatView) {
    const current = callRef.current;
    if (current.phase !== "idle") return;
    const peer = chat.peer;
    if (!peer) return;
    cleanupRtc();
    const callId = makeId();
    setCall({
      phase: "outgoing",
      callId,
      chatId: chat.id,
      peerId: peer.id,
      peerDisplayName: peer.displayName,
      avatarColor: peer.avatarColor,
      startedAt: null,
    });
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setCall((c) => ({ ...c, phase: "idle", error: "Нет связи с сервером" }));
      return;
    }
    ws.send(
      JSON.stringify({ type: "call", chatId: chat.id, callId, action: "request" } satisfies ClientEvent)
    );
  }

  async function acceptIncomingCall() {
    const active = callRef.current;
    if (!active.callId || !active.chatId) return;
    setCall((c) => ({ ...c, phase: "connecting", startedAt: null }));
    await initRtc();
    sendCall("accept");
  }

  function declineIncomingCall() {
    sendCall("decline");
    cleanupRtc();
    setCall({ ...EMPTY_CALL });
  }

  function hangUp() {
    sendCall("end");
    cleanupRtc();
    setCall({ ...EMPTY_CALL });
  }

  const callRef = useRef<CallState>(EMPTY_CALL);
  callRef.current = call;

  async function handleCallEvent(event: Extract<ServerEvent, { type: "call" }>) {
    if (event.action === "request") {
      const current = callRef.current;
      if (current.phase !== "idle") {
        return;
      }
      const caller = people[event.from] ?? null;
      if (!caller && tokenRef.current) {
        try {
          const { user } = await api.userById(tokenRef.current, event.from);
          indexPeople([user]);
        } catch {
          /* не критично */
        }
      }
      const info = people[event.from] ?? null;
      setCall({
        phase: "incoming",
        callId: event.callId,
        chatId: event.chatId,
        peerId: event.from,
        peerDisplayName: info?.displayName ?? "Собеседник",
        avatarColor: info?.avatarColor ?? "#2a3350",
        startedAt: null,
      });
      return;
    }

    const active = callRef.current;
    if (active.callId !== event.callId) return;

    if (event.action === "accept") {
      if (active.phase !== "outgoing") return;
      setCall((c) => ({ ...c, phase: "connecting" }));
      const pc = await initRtc();
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendCall("ice", { sdp: pc.localDescription });
      } catch (err) {
        setCall((c) => ({
          ...c,
          phase: "idle",
          error: `Ошибка старта соединения: ${String(err)}`,
        }));
      }
      return;
    }

    if (event.action === "ice" && event.payload) {
      const payload = event.payload as {
        sdp?: RTCSessionDescriptionInit;
        candidate?: RTCIceCandidateInit;
      };
      if (payload.sdp) {
        const pc = await initRtc();
        try {
          await pc.setRemoteDescription(payload.sdp as RTCSessionDescriptionInit);
          if (payload.sdp.type === "offer") {
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            sendCall("ice", { sdp: pc.localDescription });
          }
        } catch {
          /* рассинхрон SDP — игнорируем */
        }
      } else if (payload.candidate) {
        const pc = pcRef.current;
        if (!pc) return;
        try {
          await pc.addIceCandidate(payload.candidate as RTCIceCandidateInit);
        } catch {
          /* кандидат мог устареть */
        }
      }
      return;
    }

    if (event.action === "decline" || event.action === "end") {
      setCall({ ...EMPTY_CALL });
      cleanupRtc();
    }
  }

  /* ------------------------------ события WS ----------------------------- */

  eventRef.current = (event: ServerEvent) => {
    switch (event.type) {
      case "ready":
        setOnline(new Set(event.online));
        break;
      case "presence":
        setOnline((prev) => {
          const next = new Set(prev);
          if (event.online) next.add(event.userId);
          else next.delete(event.userId);
          return next;
        });
        break;
      case "typing":
        if (event.userId === meRef.current?.id) break;
        setTypingIn((prev) => ({ ...prev, [event.chatId]: event.isTyping }));
        if (event.isTyping) clearTypingLater(event.chatId);
        break;
      case "message.new":
        upsertMessage(event.message.chatId, event.message);
        touchChat(event.message);
        if (activeRef.current === event.message.chatId) markCurrentRead();
        break;
      case "message.ack":
        upsertMessage(event.message.chatId, event.message, event.clientId);
        touchChat(event.message);
        break;
      case "message.edited":
        applyMessageEdit(event.message);
        setChats((prev) =>
          sortChats(
            prev.map((c) =>
              c.id === event.message.chatId ? { ...c, lastMessage: event.message } : c
            )
          )
        );
        break;
      case "message.deleted":
        applyMessageDelete(event.chatId, event.messageId);
        break;
      case "message.reactions":
        applyMessageReactions(event.chatId, event.messageId, event.reactions);
        break;
      case "chat.deleted":
        setChats((prev) => prev.filter((c) => c.id !== event.chatId));
        setMessages((prev) => {
          const next = { ...prev };
          delete next[event.chatId];
          return next;
        });
        setActiveId((cur) => (cur === event.chatId ? null : cur));
        break;
      case "chat.noCopy":
        setChats((prev) =>
          prev.map((c) => (c.id === event.chatId ? { ...c, noCopy: event.noCopy } : c))
        );
        break;
      case "user.updated":
        indexPeople([event.user]);
        if (event.user.id === meRef.current?.id) {
          setMe(event.user);
          setBerries(event.user.berries);
        }
        setChats((prev) =>
          prev.map((c) => (c.peer?.id === event.user.id ? { ...c, peer: event.user } : c))
        );
        break;
      case "message.read":
        if (event.userId === meRef.current?.id) break;
        setPeerRead((prev) => ({ ...prev, [event.chatId]: event.messageId }));
        break;
      case "berries":
        setBerries(event.berries);
        break;
      case "call":
        handleCallEvent(event).catch(() => {});
        break;
      case "error":
        setError(event.error);
        break;
      case "announcement": {
        const text = event.text;
        setNotice(text);
        window.setTimeout(() => {
          setNotice((cur) => (cur === text ? null : cur));
        }, 9000);
        break;
      }
      case "gift.received": {
        const g = event.gift;
        const text = `Вам подарили «${g.name}» ${g.glyph} от ${g.fromId ? g.fromName : "анонима"}!`;
        setNotice(text);
        window.setTimeout(() => {
          setNotice((cur) => (cur === text ? null : cur));
        }, 10000);
        break;
      }
      case "notice": {
        const text = event.text;
        setNotice(text);
        window.setTimeout(() => {
          setNotice((cur) => (cur === text ? null : cur));
        }, 9000);
        break;
      }
      default:
        break;
    }
  };

  /* ------------------------------- сессия -------------------------------- */

  useEffect(() => {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (!saved) {
      setBooting(false);
      return;
    }
    api
      .me(saved)
      .then(({ user }) => {
        setToken(saved);
        setMe(user);
        setBerries(user.berries);
        indexPeople([user]);
      })
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setBooting(false));
  }, []);

  useEffect(() => {
    if (!token) return;
    api
      .chats(token)
      .then(({ chats: fresh }) => {
        setChats(sortChats(fresh));
        indexPeople(
          fresh.map((c) => c.peer).filter((p): p is User => p !== null)
        );
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Ошибка"));
    // Каталог пользователей и ботов (для групп/профилей)
    api
      .searchUsers(token, "")
      .then((r) => indexPeople(r.users))
      .catch(() => {});
    api
      .bots(token)
      .then((r) => indexPeople(r.bots))
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    setProfileName(me?.displayName ?? "");
  }, [me]);

  /* ----------------------------- WebSocket ------------------------------- */

  useEffect(() => {
    if (!token) return;
    let disposed = false;
    let attempt = 0;
    let reconnect: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (disposed) return;
      setConnection("connecting");
      const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed) return;
        attempt = 0;
        setConnection("online");
      };

      ws.onmessage = (ev) => {
        try {
          eventRef.current(JSON.parse(ev.data as string) as ServerEvent);
        } catch {
          /* игнорируем некорректные кадры */
        }
      };

      ws.onclose = (ev) => {
        if (wsRef.current === ws) wsRef.current = null;
        if (disposed) return;
        setConnection("offline");
        if (ev.code === 4001) {
          localStorage.removeItem(TOKEN_KEY);
          setToken(null);
          setMe(null);
          return;
        }
        reconnect = setTimeout(connect, Math.min(1000 * 2 ** attempt, 15000));
        attempt += 1;
      };

      ws.onerror = () => ws.close();
    };

    connect();
    return () => {
      disposed = true;
      if (reconnect) clearTimeout(reconnect);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [token]);

  /* ----------------------------- разметка чата --------------------------- */

  const activeMessages = [...(activeId ? messages[activeId] ?? [] : [])].sort(
    (a, b) => a.createdAt - b.createdAt
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [activeMessages.length, activeId, typingIn]);

  useEffect(() => {
    if (!activeId) return;
    markCurrentRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, activeMessages.length]);

  /* Блокировка копирования, когда в активном чате включена защита. */
  const noCopyActive = Boolean(chats.find((c) => c.id === activeId)?.noCopy);
  useEffect(() => {
    if (!noCopyActive) return;
    const notBlocked = (target: EventTarget | null) => {
      const node = target as HTMLElement | null;
      if (!node || typeof node.closest !== "function") return true;
      // Разрешаем копирование в инпутах (композер, поиск).
      if (node.closest("input, textarea")) return true;
      return !node.closest(".web-thread");
    };
    const block = (e: Event) => {
      if (notBlocked(e.target)) return;
      e.preventDefault();
    };
    document.addEventListener("copy", block, true);
    document.addEventListener("cut", block, true);
    document.addEventListener("selectstart", block, true);
    document.addEventListener("dragstart", block, true);
    return () => {
      document.removeEventListener("copy", block, true);
      document.removeEventListener("cut", block, true);
      document.removeEventListener("selectstart", block, true);
      document.removeEventListener("dragstart", block, true);
    };
  }, [noCopyActive]);

  /* --------------------------- панель владельца --------------------------- */

  useEffect(() => {
    if (tab !== "admin") return;
    const current = tokenRef.current;
    const viewer = meRef.current;
    if (!current || !viewer?.isOwner) return;
    let alive = true;
    setAMsg(null);
    const load = async () => {
      try {
        if (aTab === "stats" || aTab === "system") {
          const res = await api.adminStats(current);
          if (alive) setAStats(res.stats);
        } else if (aTab === "users") {
          const res = await api.adminUsers(current, aQ);
          if (alive) setAUsers(res.users);
        } else if (aTab === "bots") {
          const res = await api.adminUsers(current, "");
          if (alive) setABots(res.users.filter((b) => b.isBot));
        } else if (aTab === "channels" || aTab === "groups") {
          const res = await api.adminChats(current, aTab === "groups" ? "group" : "channel", aQ);
          if (alive) setAChats(res.chats);
        }
      } catch (err) {
        if (alive) {
          setAMsg({ kind: "err", text: err instanceof Error ? err.message : "Ошибка загрузки" });
        }
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, [tab, aTab, aQ]);

  function aAmount(userId: string): number {
    const v = Number(aAmounts[userId] ?? 10);
    return Number.isFinite(v) && v > 0 ? Math.trunc(v) : 0;
  }

  function aPatchUser(userId: string, next: User) {
    setAUsers((list) => list.map((u) => (u.id === userId ? next : u)));
  }

  function aConfirmAction(id: string, run: () => Promise<void>) {
    if (aDanger !== id) {
      setADanger(id);
      window.setTimeout(() => setADanger((d) => (d === id ? null : d)), 5000);
      return;
    }
    setADanger(null);
    void run();
  }

  async function aBerries(user: User, delta: number) {
    const current = tokenRef.current;
    if (!current) return;
    try {
      const res = await api.adminBerries(current, user.id, delta);
      aPatchUser(user.id, res.user);
      setAMsg({ kind: "ok", text: `${res.user.displayName} — звёзд: ${res.user.berries}` });
      return res.user;
    } catch (err) {
      setAMsg({ kind: "err", text: err instanceof Error ? err.message : "Ошибка" });
      return null;
    }
  }

  async function aPremium(user: User, on: boolean) {
    const current = tokenRef.current;
    if (!current) return;
    try {
      const res = await api.adminPremium(current, user.id, on);
      aPatchUser(user.id, res.user);
      setAMsg({
        kind: "ok",
        text: on
          ? `Premium включён для ${res.user.displayName}`
          : `Premium убран у ${res.user.displayName}`,
      });
      return res.user;
    } catch (err) {
      setAMsg({ kind: "err", text: err instanceof Error ? err.message : "Ошибка" });
      return null;
    }
  }

  async function aOwner(user: User, on: boolean) {
    const current = tokenRef.current;
    if (!current) return;
    try {
      const res = await api.adminOwner(current, user.id, on);
      aPatchUser(user.id, res.user);
      setAMsg({
        kind: "ok",
        text: on
          ? `${res.user.displayName} теперь владелец`
          : `Роль владельца снята с ${res.user.displayName}`,
      });
      return res.user;
    } catch (err) {
      setAMsg({ kind: "err", text: err instanceof Error ? err.message : "Ошибка" });
      return null;
    }
  }

  async function aBan(user: User, on: boolean) {
    const current = tokenRef.current;
    if (!current) return;
    try {
      const res = await api.adminBan(current, user.id, on);
      aPatchUser(user.id, res.user);
      setAMsg({
        kind: "ok",
        text: on
          ? `${res.user.displayName} заблокирован`
          : `${res.user.displayName} разблокирован`,
      });
      return res.user;
    } catch (err) {
      setAMsg({ kind: "err", text: err instanceof Error ? err.message : "Ошибка" });
      return null;
    }
  }

  async function aCreateBot() {
    const current = tokenRef.current;
    if (!current) return;
    const username = aBotUser.trim().toLowerCase();
    if (!username) return;
    setABusy(true);
    try {
      await api.createBot(current, username, aBotName.trim() || username);
      setABotUser("");
      setABotName("");
      const res = await api.adminUsers(current, "");
      setABots(res.users.filter((b) => b.isBot));
      setAMsg({ kind: "ok", text: "Бот создан" });
    } catch (err) {
      setAMsg({ kind: "err", text: err instanceof Error ? err.message : "Ошибка" });
    } finally {
      setABusy(false);
    }
  }

  async function aDeleteBot(bot: User) {
    const current = tokenRef.current;
    if (!current) return;
    try {
      await api.adminDeleteBot(current, bot.id);
      setABots((list) => list.filter((b) => b.id !== bot.id));
      setAMsg({ kind: "ok", text: `Бот ${bot.displayName} удалён` });
    } catch (err) {
      setAMsg({ kind: "err", text: err instanceof Error ? err.message : "Ошибка" });
    }
  }

  async function aDeleteChat(chat: AdminChatView) {
    const current = tokenRef.current;
    if (!current) return;
    try {
      await api.adminDeleteChat(current, chat.id);
      setAChats((list) => list.filter((c) => c.id !== chat.id));
      setAMsg({ kind: "ok", text: `Чат «${chat.title}» удалён` });
    } catch (err) {
      setAMsg({ kind: "err", text: err instanceof Error ? err.message : "Ошибка" });
    }
  }

  async function aVerify(user: User, on: boolean) {
    const current = tokenRef.current;
    if (!current) return;
    try {
      const res = await api.adminVerify(current, user.id, on);
      aPatchUser(user.id, res.user);
      setAMsg({
        kind: "ok",
        text: on
          ? `${res.user.displayName} — проверенный аккаунт`
          : `Галочка снята с ${res.user.displayName}`,
      });
      return res.user;
    } catch (err) {
      setAMsg({ kind: "err", text: err instanceof Error ? err.message : "Ошибка" });
      return null;
    }
  }

  async function aNoCopy(chat: AdminChatView) {
    const current = tokenRef.current;
    if (!current) return;
    try {
      await api.setNoCopy(current, chat.id, !chat.noCopy);
      setAChats((list) =>
        list.map((c) => (c.id === chat.id ? { ...c, noCopy: !chat.noCopy } : c))
      );
      setAMsg({
        kind: "ok",
        text: chat.noCopy
          ? `Снята защита с «${chat.title}»`
          : `Защита включена для «${chat.title}»`,
      });
    } catch (err) {
      setAMsg({ kind: "err", text: err instanceof Error ? err.message : "Ошибка" });
    }
  }

  /* ------------------------------ профиль --------------------------------- */

  /** Открывает карточку профиля пользователя (своё — это вкладка настроек). */
  /* --------------------- жалоба пользователя и промокод ------------------- */

  async function sendReportNow(targetId: string) {
    const current = tokenRef.current;
    if (!current) return;
    const reason = reportText.trim();
    if (reason.length < 3) {
      setAMsg({ kind: "err", text: "Опиши, что не так" });
      return;
    }
    setReportBusy(true);
    try {
      await api.sendReport(current, "user", targetId, reason);
      setAMsg({ kind: "ok", text: "Жалоба отправлена владельцу" });
      setReportFor(null);
      setReportText("");
    } catch (err) {
      setAMsg({
        kind: "err",
        text: err instanceof Error ? err.message : "Не удалось отправить жалобу",
      });
    } finally {
      setReportBusy(false);
    }
  }

  async function redeemNow() {
    const current = tokenRef.current;
    const code = promoCode.trim().toUpperCase();
    if (!current || !code) return;
    setPromoBusy(true);
    try {
      const res = await api.redeemPromo(current, code);
      setBerries(res.balance);
      setPromoCode("");
      setAMsg({ kind: "ok", text: `Промокод принят: +${res.berries} ★` });
    } catch (err) {
      setAMsg({ kind: "err", text: err instanceof Error ? err.message : "Промокод не сработал" });
    } finally {
      setPromoBusy(false);
    }
  }

  function openProfile(user: User) {
    const current = tokenRef.current;
    if (!current) return;
    if (user.id === meRef.current?.id) {
      setTab("settings");
      return;
    }
    setProfileUser(user);
    setProfileInfo(null);
    setProfileDetail(null);
    setProfileErr(null);
    setProfileBusy(true);
    setPResetPass("");
    setModal("profile");
    void (async () => {
      try {
        const info = await api.userProfile(current, user.id);
        setProfileUser(info.user);
        setProfileInfo(info);
        if (meRef.current?.isOwner) {
          try {
            setProfileDetail(await api.adminUserDetail(current, user.id));
          } catch {
            setProfileDetail(null);
          }
        }
      } catch (err) {
        setProfileErr(err instanceof Error ? err.message : "Не удалось открыть профиль");
      } finally {
        setProfileBusy(false);
      }
    })();
  }

  /** Перечитывает карточку после действий владельца. */
  async function refreshProfile() {
    const current = tokenRef.current;
    const target = profileUser;
    if (!current || !target) return;
    try {
      const info = await api.userProfile(current, target.id);
      setProfileUser(info.user);
      setProfileInfo(info);
      if (meRef.current?.isOwner) {
        try {
          setProfileDetail(await api.adminUserDetail(current, target.id));
        } catch {
          /* детали не критичны */
        }
      }
    } catch {
      /* тихо: карточка уже показана */
    }
  }

  /** Открывает модал отправки подарка (каталог подгружается с сервера). */
  function openGiftModal() {
    const current = tokenRef.current;
    if (!current || !profileUser) return;
    setGiftPick(null);
    setGiftNote("");
    setGiftAnon(false);
    setGiftDate("");
    setGiftErr(null);
    setModal("gift");
    void (async () => {
      try {
        const res = await api.giftsCatalog(current);
        setGiftCatalog(res.gifts.filter((g) => g.active));
        setGiftBal(res.balance);
      } catch (err) {
        setGiftErr(err instanceof Error ? err.message : "Каталог недоступен");
      }
    })();
  }

  /** Проверка + отправка выбранного подарка получателю (профиль). */
  async function sendGiftNow() {
    const current = tokenRef.current;
    if (!current || !profileUser || !giftPick) return;
    const item = giftCatalog.find((g) => g.id === giftPick);
    if (!item) return;
    if (giftBal < item.price) {
      setGiftErr("Недостаточно звёзд на балансе");
      return;
    }
    setGiftBusy(true);
    setGiftErr(null);
    try {
      const scheduledFor = giftDate ? new Date(`${giftDate}T12:00:00`).getTime() : undefined;
      const res = await api.sendGift(current, item.id, profileUser.id, {
        anonymous: giftAnon,
        note: giftNote.trim() || undefined,
        scheduledFor: Number.isFinite(scheduledFor) ? scheduledFor : undefined,
      });
      setGiftBal(res.balance);
      setModal("profile");
      setProfileTab("gifts");
      setNotice(`Подарок «${item.name}» отправлен ${giftAnon ? "анонимно " : ""}пользователю ${profileUser.displayName}`);
    } catch (err) {
      setGiftErr(err instanceof Error ? err.message : "Не удалось отправить");
    } finally {
      setGiftBusy(false);
    }
  }

  async function aResetPassword(user: User, password: string): Promise<boolean> {
    const current = tokenRef.current;
    if (!current) return false;
    try {
      await api.adminResetPassword(current, user.id, password);
      setAMsg({ kind: "ok", text: `Новый пароль сохранён для ${user.displayName}` });
      setPResetPass("");
      return true;
    } catch (err) {
      setAMsg({ kind: "err", text: err instanceof Error ? err.message : "Ошибка" });
      return false;
    }
  }

  async function aDeleteUser(user: User): Promise<boolean> {
    const current = tokenRef.current;
    if (!current) return false;
    try {
      await api.adminDeleteUser(current, user.id);
      setAMsg({ kind: "ok", text: `Аккаунт ${user.displayName} удалён` });
      setAUsers((list) => list.filter((u) => u.id !== user.id));
      setChats((prev) => prev.filter((c) => c.peer?.id !== user.id));
      setModal("none");
      setProfileUser(null);
      return true;
    } catch (err) {
      setAMsg({ kind: "err", text: err instanceof Error ? err.message : "Ошибка" });
      return false;
    }
  }

  /* --------------------------- рассылка и сервер -------------------------- */

  async function aBroadcast() {
    const current = tokenRef.current;
    const text = bcText.trim();
    if (!current || !text) return;
    setBcBusy(true);
    try {
      const res = await api.adminBroadcast(current, text);
      setAMsg({ kind: "ok", text: `Рассылка доставлена: ${res.sent} чел.` });
      setBcText("");
    } catch (err) {
      setAMsg({ kind: "err", text: err instanceof Error ? err.message : "Ошибка" });
    } finally {
      setBcBusy(false);
    }
  }

  async function aToggleMaintenance(on: boolean) {
    const current = tokenRef.current;
    if (!current) return;
    try {
      const res = await api.adminMaintenance(current, on);
      setAStats((s) => (s ? { ...s, maintenance: res.maintenance } : s));
      setAMsg({
        kind: "ok",
        text: on
          ? "Обслуживание включено: вошли только владельцы"
          : "Обслуживание завершено, все могут входить",
      });
    } catch (err) {
      setAMsg({ kind: "err", text: err instanceof Error ? err.message : "Ошибка" });
    }
  }

  async function exportUsers() {
    const current = tokenRef.current;
    if (!current) return;
    try {
      const res = await api.adminUsers(current, "");
      const blob = new Blob([JSON.stringify(res.users, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `nova-users-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setAMsg({ kind: "ok", text: `Выгружено: ${res.users.length}` });
    } catch (err) {
      setAMsg({ kind: "err", text: err instanceof Error ? err.message : "Ошибка" });
    }
  }

  function fmtUptime(sec: number): string {
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (d > 0) return `${d} д ${h} ч ${m} м`;
    if (h > 0) return `${h} ч ${m} м`;
    if (m > 0) return `${m} м ${s} с`;
    return `${s} с`;
  }

  /** Фильтр списка людей в панели владельца. */
  function aFilteredUsers(): User[] {
    const myId = meRef.current?.id;
    switch (aFilter) {
      case "online":
        return aUsers.filter((u) => u.id === myId || online.has(u.id));
      case "premium":
        return aUsers.filter((u) => u.isPremium);
      case "verified":
        return aUsers.filter((u) => u.isVerified);
      case "owner":
        return aUsers.filter((u) => u.isOwner);
      case "banned":
        return aUsers.filter((u) => u.isBanned);
      default:
        return aUsers;
    }
  }

  /** Счётчик для чипов фильтров. */
  function aFilterCount(key: typeof aFilter): number {
    const myId = meRef.current?.id;
    switch (key) {
      case "online":
        return aUsers.filter((u) => u.id === myId || online.has(u.id)).length;
      case "premium":
        return aUsers.filter((u) => u.isPremium).length;
      case "verified":
        return aUsers.filter((u) => u.isVerified).length;
      case "owner":
        return aUsers.filter((u) => u.isOwner).length;
      case "banned":
        return aUsers.filter((u) => u.isBanned).length;
      default:
        return aUsers.length;
    }
  }

  /* ------------------------------- действия ------------------------------ */

  function handleAuth(result: AuthResult) {
    localStorage.setItem(TOKEN_KEY, result.token);
    setToken(result.token);
    setMe(result.user);
    setBerries(result.user.berries);
    indexPeople([result.user]);
  }

  /* --- режим «войти как пользователь» (из панели владельца) --- */

  function startImpersonate(nextToken: string, user: User) {
    const ownerToken = tokenRef.current;
    localStorage.setItem(TOKEN_KEY, nextToken);
    ownerTokenRef.current = ownerToken;
    setImpersonating(meRef.current);
    setToken(nextToken);
    tokenRef.current = nextToken;
    setMe(user);
    meRef.current = user;
    setBerries(user.berries);
    setChats([]);
    setMessages({});
    setActiveId(null);
    setModal("none");
    setTab("chats");
  }

  function stopImpersonate() {
    const back = ownerTokenRef.current;
    ownerTokenRef.current = null;
    setImpersonating(null);
    if (!back) return;
    localStorage.setItem(TOKEN_KEY, back);
    setToken(back);
    tokenRef.current = back;
    api
      .me(back)
      .then(({ user }) => {
        setMe(user);
        meRef.current = user;
        setBerries(user.berries);
      })
      .catch(() => {});
  }

  async function logout() {
    const current = tokenRef.current;
    if (current) api.logout(current).catch(() => {});
    localStorage.removeItem(TOKEN_KEY);
    wsRef.current?.close();
    wsRef.current = null;
    cleanupRtc();
    setToken(null);
    setMe(null);
    setChats([]);
    setMessages({});
    setActiveId(null);
    setConnection("offline");
    setCall({ ...EMPTY_CALL });
    setModal("none");
    setTab("chats");
    if (typeof window !== "undefined" && isNativeApp()) {
      window.history.replaceState(null, "");
    }
  }

  function openChat(id: string) {
    setTab("chats");
    if (
      typeof window !== "undefined" &&
      isNativeApp() &&
      window.history.state?.novaChat !== id
    ) {
      window.history.pushState({ novaChat: id }, "");
    }
    setActiveId(id);
    setError(null);
    setEditingId(null);
    setStickerOpen(false);
    const current = tokenRef.current;
    if (current && !messagesRef.current[id]) {
      setLoadingHistory(true);
      api
        .messages(current, id)
        .then(({ messages: history }) =>
          setMessages((prev) => ({ ...prev, [id]: history }))
        )
        .catch((err) => setError(err instanceof Error ? err.message : "Ошибка"))
        .finally(() => setLoadingHistory(false));
    }
  }

  /** Закрыть открытый чат: в приложении — как системная кнопка «Назад». */
  function closeChat() {
    if (
      typeof window !== "undefined" &&
      isNativeApp() &&
      window.history.state?.novaChat
    ) {
      window.history.back();
      return;
    }
    setActiveId(null);
  }

  function emitTyping(isTyping: boolean) {
    const ws = wsRef.current;
    const chatId = activeRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !chatId) return;
    ws.send(JSON.stringify({ type: "typing", chatId, isTyping } satisfies ClientEvent));
  }

  function stopTyping() {
    if (typingTimer.current) {
      clearTimeout(typingTimer.current);
      typingTimer.current = null;
    }
    if (lastTypingSent.current) {
      emitTyping(false);
      lastTypingSent.current = 0;
    }
  }

  function onDraft(value: string) {
    setDraft(value);
    if (!value.trim()) {
      stopTyping();
      return;
    }
    const now = Date.now();
    if (now - lastTypingSent.current > 1200) {
      emitTyping(true);
      lastTypingSent.current = now;
    }
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(stopTyping, 2000);
  }

  function sendSticker(sticker: string) {
    const chatId = activeRef.current;
    const currentUser = meRef.current;
    if (!chatId || !currentUser) return;
    setStickerOpen(false);
    setReplyTo(null);
    const clientId = makeId();
    upsertMessage(
      chatId,
      {
        id: clientId,
        chatId,
        senderId: currentUser.id,
        text: "",
        type: "sticker",
        sticker,
        createdAt: Date.now(),
      },
      clientId
    );
    const ws = wsRef.current;
    const event: ClientEvent = {
      type: "message.send",
      chatId,
      text: "",
      clientId,
      sticker,
    };
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    } else if (tokenRef.current) {
      api
        .sendSticker(tokenRef.current, chatId, sticker)
        .then(({ message }) => upsertMessage(chatId, message, clientId))
        .catch((err) => setError(err instanceof Error ? err.message : "Ошибка отправки"));
    }
  }

  async function onFilePicked(file: File | undefined) {
    const current = tokenRef.current;
    const chatId = activeRef.current;
    if (!file || !current || !chatId) return;
    if (file.size > 15 * 1024 * 1024) {
      setError("Файл больше 15 МБ — выбери фото поменьше");
      return;
    }
    try {
      const attachment = await api.upload(current, file);
      const { message } = await api.sendPhoto(current, chatId, draft.trim(), attachment.fileId);
      setDraft("");
      setReplyTo(null);
      upsertMessage(chatId, message);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка отправки фото");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function send() {
    const text = draft.trim();
    const chatId = activeRef.current;
    const currentUser = meRef.current;
    if (!text || !chatId || !currentUser) return;

    if (editingId) {
      const current = tokenRef.current;
      if (!current) return;
      try {
        const { message } = await api.editMessage(current, chatId, editingId, text);
        applyMessageEdit(message);
        setEditingId(null);
        setDraft("");
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Не удалось изменить сообщение");
      }
      return;
    }

    const answerTo: MessageRef | null = replyTo
      ? {
          id: replyTo.id,
          senderId: replyTo.senderId,
          senderName:
            replyTo.senderId === currentUser.id
              ? "Ты"
              : people[replyTo.senderId]?.displayName ?? "…",
          text: replyTo.text,
          type: replyTo.type,
          sticker: replyTo.sticker,
          photoUrl: replyTo.photo?.url,
        }
      : null;
    const clientId = makeId();
    upsertMessage(
      chatId,
      {
        id: clientId,
        chatId,
        senderId: currentUser.id,
        text,
        type: "text",
        replyTo: answerTo ?? undefined,
        createdAt: Date.now(),
      },
      clientId
    );
    setDraft("");
    setReplyTo(null);
    stopTyping();

    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      const event: ClientEvent = {
        type: "message.send",
        chatId,
        text,
        clientId,
        ...(answerTo ? { replyToId: answerTo.id } : {}),
      };
      ws.send(JSON.stringify(event));
    } else if (tokenRef.current) {
      api
        .sendMessage(tokenRef.current, chatId, text, answerTo?.id)
        .then(({ message }) => upsertMessage(chatId, message, clientId))
        .catch((err) => setError(err instanceof Error ? err.message : "Ошибка отправки"));
    }
  }

  async function deleteMessage(message: Message) {
    const current = tokenRef.current;
    if (!current) return;
    try {
      await api.deleteMessage(current, message.chatId, message.id);
      applyMessageDelete(message.chatId, message.id);
      if (editingId === message.id) {
        setEditingId(null);
        setDraft("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить сообщение");
    }
  }

  function startEditing(message: Message) {
    setEditingId(message.id);
    setDraft(message.text);
    setReplyTo(null);
    setStickerOpen(false);
  }

  async function startChat(peer: User) {
    const current = tokenRef.current;
    if (!current) return;
    try {
      const { chat } = await api.createChat(current, peer.id);
      setChats((prev) => sortChats([chat, ...prev.filter((c) => c.id !== chat.id)]));
      indexPeople([peer]);
      setModal("none");
      openChat(chat.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  }

  async function joinChannel(channelId: string) {
    const current = tokenRef.current;
    if (!current) return;
    try {
      const { chat } = await api.joinChannel(current, channelId);
      setChats((prev) => sortChats([...prev.filter((c) => c.id !== chat.id), chat]));
      setModal("none");
      openChat(chat.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  }

  function openNewChat() {
    setModal("new");
    setNTab("users");
    setNQ("");
    setNGroupTitle("");
    setNGroupMembers([]);
    setNChannelTitle("");
    setError(null);
  }

  function openTransfer(peer: User | null) {
    setTransferTo(peer);
    setTransferAmount("");
    setTransferNote("");
    setXQ("");
    setModal("transfer");
    setError(null);
  }

  async function submitTransfer() {
    const current = tokenRef.current;
    const to = transferTo;
    if (!current || !to) return;
    const amount = Math.floor(Number(transferAmount));
    if (!amount || amount < 1) return;
    try {
      const res = await api.transferBerries(current, to.id, amount, transferNote.trim() || undefined);
      setBerries(res.balance);
      setTransferAmount("");
      setTransferNote("");
      setModal("none");
      setError(null);
      api
        .berries(current)
        .then((r) => setBerryTx(r.transactions))
        .catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка перевода");
    }
  }

  async function buyPremium() {
    const current = tokenRef.current;
    if (!current) return;
    try {
      const res = await api.buyPremium(current);
      setMe(res.user);
      setBerries(res.user.berries);
      setPremiumPrice(res.price);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось купить Premium");
    }
  }

  async function renameMe() {
    const current = tokenRef.current;
    if (!current) return;
    try {
      const { user } = await api.patchMe(current, { displayName: profileName.trim() });
      setMe(user);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить имя");
    }
  }

  // Загрузка списков для модалов
  useEffect(() => {
    if (modal !== "new") return;
    const current = tokenRef.current;
    if (!current) return;
    api
      .bots(current)
      .then((r) => {
        setNBots(r.bots);
        indexPeople(r.bots);
      })
      .catch(() => {});
    if (nTab === "browse") {
      api
        .channels(current)
        .then((r) => setNChannels(r.channels))
        .catch(() => setNChannels([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal, nTab]);

  useSearchEffect(
    modal === "new" && (nTab === "users" || nTab === "group"),
    nQ,
    () => setNUsers
  );

  useSearchEffect(
    modal === "transfer" && !transferTo,
    xQ,
    () => setXUsers
  );

  function useSearchEffect(active: boolean, query: string, setter: () => React.Dispatch<React.SetStateAction<User[]>>) {
    const setterFn = setter();
    useEffect(() => {
      const current = tokenRef.current;
      if (!active || !current) return;
      const handle = setTimeout(() => {
        api
          .searchUsers(current, query)
          .then((r) => {
            setterFn(r.users);
            indexPeople(r.users);
          })
          .catch(() => setterFn([]));
      }, 200);
      return () => clearTimeout(handle);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active, query]);
  }

  useEffect(() => {
    if (tab !== "settings") return;
    const current = tokenRef.current;
    if (!current) return;
    api
      .berries(current)
      .then((r) => {
        setBerries(r.balance);
        setBerryTx(r.transactions);
      })
      .catch(() => {});
  }, [tab]);

  /* -------------------------------- рендер ------------------------------- */

  if (booting) {
    return (
      <div className="web-boot">
        <span className="brand-mark auth-logo">
          <LogoMark size={30} />
        </span>
        <p className="auth-subtitle">Загружаем Nova…</p>
      </div>
    );
  }

  if (!me || !token) {
    return <AuthPanel onAuth={handleAuth} />;
  }

  const activeChat = chats.find((c) => c.id === activeId) ?? null;
  const peer = activeChat?.peer ?? null;
  const peerOnline = peer ? online.has(peer.id) : false;
  const peerTyping = activeId ? Boolean(typingIn[activeId]) : false;
  const peerReadUpTo = activeId ? peerRead[activeId] ?? null : null;
  const peerReadIdx = peerReadUpTo
    ? activeMessages.findIndex((m) => m.id === peerReadUpTo)
    : -1;
  const canPost = !activeChat || !(activeChat.type === "channel" && activeChat.banned);
  const stickers = me.isPremium ? [...STICKER_IDS, ...PREMIUM_STICKER_IDS] : STICKER_IDS;
  const totalUnread = chats.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0);

  return (
    <div className={`web-shell tab-${tab} ${activeId ? "has-active" : ""}`}>
      {/* ---------- рейка вкладок (десктоп) / нижняя панель (мобайл) ---------- */}
      <nav className="web-rail" aria-label="Навигация">
        <button
          className={`rail-btn ${tab === "chats" ? "on" : ""}`}
          onClick={() => setTab("chats")}
        >
          <span className="rail-ico">
            <ChatBubble width={21} height={21} />
            {totalUnread > 0 && (
              <i className="rail-badge">{totalUnread > 99 ? "99+" : totalUnread}</i>
            )}
          </span>
          <span>Чаты</span>
        </button>
        <button
          className={`rail-btn ${tab === "settings" ? "on" : ""}`}
          onClick={() => setTab("settings")}
        >
          <span className="rail-ico">
            <Gear width={21} height={21} />
          </span>
          <span>Настройки</span>
        </button>
        {me.isOwner && (
          <button
            className={`rail-btn ${tab === "admin" ? "on" : ""}`}
            onClick={() => setTab("admin")}
          >
            <span className="rail-ico">
              <Shield width={21} height={21} />
            </span>
            <span>Админ</span>
          </button>
        )}
        <span className="rail-spacer" />
        <button
          className="rail-avatar"
          onClick={() => setTab("settings")}
          title="Профиль"
        >
          <Avatar user={me} size={38} />
        </button>
      </nav>

      {tab === "chats" && (
        <>
      <aside className="web-side">
        <header className="web-side-head">
          <span className="brand web-brand">
            <span className="brand-mark">
              <LogoMark size={20} />
            </span>
            Nova
          </span>
          <span
            className={`conn-badge conn-${connection}`}
            title={
              connection === "online"
                ? "Подключено"
                : connection === "connecting"
                  ? "Подключение…"
                  : "Нет связи"
            }
          >
            {connection === "online"
              ? "в сети"
              : connection === "connecting"
                ? "подключение…"
                : "офлайн"}
          </span>
        </header>

        <div className="web-side-actions">
          <button className="btn btn-ghost btn-new" onClick={openNewChat}>
            <Plus width={18} height={18} />
            Новый чат
          </button>
        </div>

        <div className="web-chat-list">
          {chats.length === 0 && (
            <p className="web-empty-note">
              Пока нет чатов. «Новый чат» откроет людей, ботов, группы и каналы —
              а «Избранное» и чат с ботом Nova уже ждут тебя.
            </p>
          )}
          {chats.map((chat) => {
            const isActive = chat.id === activeId;
            const typing = typingIn[chat.id];
            const preview = typing
              ? "печатает…"
              : chat.lastMessage
                ? `${chat.lastMessage.senderId === me.id ? "Ты: " : ""}${lastMessagePreview(chat.lastMessage)}`
                : "Нет сообщений";
            const unread = chat.unreadCount ?? 0;
            return (
              <button
                key={chat.id}
                className={`chat-item ${isActive ? "active" : ""}`}
                onClick={() => openChat(chat.id)}
              >
                <ChatAvatar chat={chat} />
                <span className="chat-item-text">
                  <span className="chat-item-top">
                    <span className="chat-item-name">
                      {peerOf(chat) && <RoleBadge user={peerOf(chat)!} />}
                      {chat.title}
                    </span>
                    <span className="chat-item-meta">
                      {unread > 0 && <span className="unread-badge">{unread}</span>}
                      {chat.lastMessage && (
                        <span className="chat-item-time">
                          {formatListTime(chat.lastMessage.createdAt)}
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="chat-item-preview">{preview}</span>
                </span>
              </button>
            );
          })}
        </div>

        <footer className="web-side-foot">
          <button
            className="user-row foot-user"
            onClick={() => {
              setTab("settings");
              setError(null);
            }}
          >
            <Avatar user={me} size={38} />
            <span className="user-row-text">
              <span className="user-row-name">
                {me.displayName} <RoleBadge user={me} />
              </span>
              <span className="user-row-login">
                {berries}
              </span>
            </span>
          </button>
          <button
            className="btn btn-ghost btn-berries"
            onClick={() => openTransfer(null)}
            title="Передать звёзды"
          >
            <GlyphIcon id="star" size={18} />
          </button>
          {me.isOwner && (
            <button
              className="btn btn-ghost btn-owner"
              onClick={() => {
                setTab("admin");
                setError(null);
              }}
              title="Панель владельца"
            >
              <Shield width={18} height={18} />
            </button>
          )}
          <button className="btn btn-ghost btn-logout" onClick={logout} title="Выйти">
            Выйти
          </button>
        </footer>
      </aside>

      <section className="web-main">
        {!activeChat ? (
          <div className="web-placeholder">
            <span className="brand-mark auth-logo">
              <LogoMark size={30} />
            </span>
            <h2>Выбери чат</h2>
            <p className="lead">
              Личные чаты, группы, каналы и «Избранное». Фото, стикеры, звонки,
              галочки прочтения и звёзды — всё в реальном времени.
            </p>
          </div>
        ) : (
          <>
            <header className="web-main-head">
              <button
                className="btn btn-ghost btn-back"
                aria-label="Назад"
                onClick={closeChat}
              >
                <ArrowRight width={18} height={18} style={{ transform: "rotate(180deg)" }} />
              </button>
              <span
                className={`avatar-wrap${peer ? " p-clickable" : ""}`}
                title={peer ? "Открыть профиль" : undefined}
                onClick={() => peer && openProfile(peer)}
              >
                <ChatAvatar chat={activeChat} />
                {peerOnline && <span className="online-dot" />}
              </span>
              <span
                className={`web-main-title${peer ? " p-clickable" : ""}`}
                onClick={() => peer && openProfile(peer)}
              >
                <span className="chat-item-name">
                  {peer && <RoleBadge user={peer} />}
                  {activeChat.title}
                  {peer && <span className="muted-login"> @{peer.username}</span>}
                </span>
                <span className="web-main-status">
                  {peerTyping
                    ? "печатает…"
                    : peerOnline
                      ? "в сети"
                      : peer
                        ? formatLastSeen(peer.lastSeenAt)
                        : activeChat.type === "saved"
                          ? "Заметки с самим собой"
                          : activeChat.type === "channel"
                            ? `${activeChat.memberCount ?? 1} подписчик(ов)`
                            : `${activeChat.memberCount ?? 2} участника`}
                </span>
              </span>
              <span className="web-main-actions">
                {activeChat.type === "dm" && peer && (
                  <button
                    className="btn btn-ghost btn-icon"
                    title="Позвонить"
                    onClick={() => startCall(activeChat)}
                  >
                    <Phone width={18} height={18} />
                  </button>
                )}
                {(activeChat.type === "dm" || activeChat.type === "group") && peer && (
                  <button
                    className="btn btn-ghost btn-icon"
                    title="Передать звёзды"
                    onClick={() => openTransfer(peer)}
                  >
                    <GlyphIcon id="star" size={18} />
                  </button>
                )}
                {me.isOwner && (
                  <button
                    className={`btn btn-ghost btn-icon no-copy-btn${activeChat.noCopy ? " on" : ""}`}
                    title={
                      activeChat.noCopy
                        ? "Защита включена — выключить"
                        : "Включить защиту от копирования и пересылки"
                    }
                    onClick={() => toggleNoCopy(activeChat.id)}
                  >
                    {activeChat.noCopy ? (
                      <Lock width={16} height={16} />
                    ) : (
                      <Unlock width={16} height={16} />
                    )}
                  </button>
                )}
              </span>
            </header>

            {activeChat.noCopy && (
              <div className="no-copy-note">
                <Lock width={13} height={13} />
                Сообщения защищены от копирования и пересылки
              </div>
            )}

            <div
              className={`web-thread${activeChat.noCopy ? " no-copy" : ""}`}
              onContextMenu={
                activeChat.noCopy
                  ? (e) => {
                      if ((e.target as HTMLElement | null)?.closest?.("img")) e.preventDefault();
                    }
                  : undefined
              }
            >
              {loadingHistory && <p className="web-empty-note">Загружаем историю…</p>}
              {!loadingHistory && activeMessages.length === 0 && (
                <p className="web-empty-note">Здесь пока пусто. Напиши первое сообщение</p>
              )}
              {activeMessages.map((message) => {
                const own = message.senderId === me.id;
                const index = activeMessages.findIndex((m) => m.id === message.id);
                const readByPeer =
                  own && activeChat.type === "dm" && peerReadIdx >= index;
                const sender = !own ? people[message.senderId] ?? undefined : undefined;
                const showSender = !own && activeChat.type !== "dm" && sender;
                const noCopyBlocked = activeChat.noCopy === true && !me.isOwner;
                const mayManage = own || activeChat.ownerId === me.id;
                const bubbleContent = (
                  <>
                    {message.forwardedFrom && !message.deleted && (
                      <ForwardLabel from={message.forwardedFrom} />
                    )}
                    {message.replyTo && !message.deleted && (
                      <ReplyQuote quote={message.replyTo} />
                    )}
                    {message.type === "sticker" && !message.deleted ? (
                      <Sticker id={message.sticker ?? ""} size={72} className="msg-sticker" />
                    ) : message.type === "photo" && !message.deleted && message.photo ? (
                      <span className="msg-photo-wrap">
                        <img
                          src={mediaUrl(message.photo.url)}
                          alt={message.text}
                          className="msg-photo"
                        />
                        {message.text && <span className="msg-text">{message.text}</span>}
                        <span className="msg-time">
                          {formatTime(message.createdAt)}
                          {own && activeChat.type === "dm" && (
                            <span className="msg-tick">
                              {readByPeer ? (
                                <CheckDouble width={14} height={14} />
                              ) : (
                                <Check width={13} height={13} />
                              )}
                            </span>
                          )}
                        </span>
                      </span>
                    ) : message.deleted ? (
                      <span className="msg-deleted">Сообщение удалено</span>
                    ) : (
                      <span className="msg-text">{message.text}</span>
                    )}
                    {message.type !== "photo" && (
                      <>
                        {message.edited && !message.deleted && (
                          <span className="msg-edited">изменено</span>
                        )}
                        <span className="msg-time">
                          {formatTime(message.createdAt)}
                          {own && activeChat.type === "dm" && (
                            <span className="msg-tick">
                              {readByPeer ? (
                                <CheckDouble width={14} height={14} />
                              ) : (
                                <Check width={13} height={13} />
                              )}
                            </span>
                          )}
                        </span>
                      </>
                    )}
                    {!message.deleted && (
                      <>
                        <ReactionBar
                          message={message}
                          meId={me.id}
                          pickerOpen={reactFor === message.id}
                          onToggleEmoji={(emoji) => toggleMessageReaction(message, emoji)}
                          onOpenPicker={() => setReactFor(message.id)}
                          onClosePicker={() => setReactFor(null)}
                        />
                        <span className="msg-actions">
                          <button
                            className="msg-act"
                            title="Ответить"
                            onClick={() => startReply(message)}
                          >
                            <Reply width={15} height={15} />
                          </button>
                          {!noCopyBlocked && (
                            <button
                              className="msg-act"
                              title="Переслать"
                              onClick={() => openForward(message)}
                            >
                              <Forward width={15} height={15} />
                            </button>
                          )}
                          {mayManage && (
                            <>
                              <button
                                className="msg-act"
                                title="Изменить"
                                onClick={() => startEditing(message)}
                              >
                                <Edit width={15} height={15} />
                              </button>
                              <button
                                className="msg-act"
                                title="Удалить"
                                onClick={() => deleteMessage(message)}
                              >
                                <Trash width={15} height={15} />
                              </button>
                            </>
                          )}
                        </span>
                      </>
                    )}
                  </>
                );
                return (
                  <div key={message.id} className={`msg-row ${own ? "own" : "peer"}`}>
                    {!own ? (
                      <span className="msg-stack">
                        {showSender && (
                          <span
                            className="msg-sender p-clickable"
                            style={{ color: sender?.avatarColor ?? "#8a93ad" }}
                            title={sender ? "Открыть профиль" : undefined}
                            onClick={() => sender && openProfile(sender)}
                          >
                            {sender?.displayName ?? "…"}
                          </span>
                        )}
                        <div className="msg-bubble peer">{bubbleContent}</div>
                      </span>
                    ) : (
                      <div className="msg-bubble own">{bubbleContent}</div>
                    )}
                  </div>
                );
              })}
              {peerTyping && (
                <div className="msg-row peer">
                  <div className="typing">
                    <i />
                    <i />
                    <i />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {error && <div className="composer-error">{error}</div>}

            {canPost ? (
              <>
                {replyTo && !editingId && (
                  <div className="composer-reply">
                    <i className="msg-reply-bar" aria-hidden="true" />
                    <span className="composer-reply-text">
                      <span className="msg-reply-name">
                        {replyTo.senderId === me.id
                          ? "Ты"
                          : people[replyTo.senderId]?.displayName ?? "…"}
                      </span>
                      <span className="composer-reply-content">
                        {replyTo.type === "sticker"
                          ? "Стикер"
                          : replyTo.type === "photo"
                            ? replyTo.text || "Фото"
                            : replyTo.text}
                      </span>
                    </span>
                    <button
                      className="btn btn-ghost btn-cancel-edit"
                      title="Отменить ответ"
                      onClick={() => setReplyTo(null)}
                    >
                      <Close width={14} height={14} />
                    </button>
                  </div>
                )}
                <div className="composer">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => onFilePicked(e.target.files?.[0])}
                  />
                  <button
                    className="btn btn-ghost btn-icon"
                    title="Прикрепить фото"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Paperclip width={18} height={18} />
                  </button>
                  <button
                    className={`btn btn-ghost btn-icon ${stickerOpen ? "active" : ""}`}
                    title="Стикеры"
                    onClick={() => setStickerOpen((v) => !v)}
                  >
                    <Smile width={18} height={18} />
                  </button>
                  <textarea
                    ref={composerRef}
                    value={draft}
                    onChange={(e) => onDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                    rows={1}
                    placeholder={editingId ? "Измени сообщение…" : replyTo ? "Ответить…" : "Напиши сообщение…"}
                  />
                  {editingId && (
                    <button
                      className="btn btn-ghost btn-cancel-edit"
                      onClick={() => {
                        setEditingId(null);
                        setDraft("");
                      }}
                    >
                      <Close width={14} height={14} />
                    </button>
                  )}
                  <button
                    className="btn btn-primary btn-send"
                    onClick={send}
                    disabled={!draft.trim()}
                  >
                    {editingId ? "Сохранить" : "Отправить"}
                  </button>
                </div>
                {stickerOpen && (
                  <div className="sticker-panel">
                    {stickers.map((s) => (
                      <button
                        key={s}
                        className="sticker-cell"
                        title={stickerLabel(s)}
                        onClick={() => sendSticker(s)}
                      >
                        <Sticker id={s} size={38} />
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="banned-notice">
                <Megaphone width={15} height={15} />
                В канале писать может только его владелец.
              </div>
            )}
          </>
        )}
      </section>
        </>
      )}

      {/* ---------------- вкладка «Настройки» ---------------- */}
      {tab === "settings" && (
        <section className="web-panel settings-panel">
          <header className="web-panel-head">
            <h2>Настройки</h2>
            <span className={`conn-badge conn-${connection}`}>
              {connection === "online"
                ? "в сети"
                : connection === "connecting"
                  ? "подключение…"
                  : "офлайн"}
            </span>
          </header>

          <div className="web-panel-body">
            <div className="profile-top settings-profile">
              <Avatar user={me} size={76} />
              <div>
                <div className="user-row-name profile-name">
                  {me.displayName} <RoleBadge user={me} />
                </div>
                <div className="user-row-login">@{me.username}</div>
                {me.phone && (
                  <div className="user-row-login">
                    <Phone width={13} height={13} /> {me.phone}
                  </div>
                )}
                {me.isOwner && (
                  <div className="profile-owner">
                    Владелец Nova <Crown width={13} height={13} />
                  </div>
                )}
                {me.isPremium && me.premiumUntil && (
                  <div className="profile-premium">
                    Premium <Sparkles width={13} height={13} /> до{" "}
                    {new Date(me.premiumUntil).toLocaleDateString("ru-RU")}
                  </div>
                )}
                <div className="profile-berries">
                  <GlyphIcon id="star" size={14} /> Баланс: <b>{berries}</b>
                </div>
              </div>
            </div>

            <div className="settings-card">
              <h3>Профиль</h3>
              <label className="field">
                <span>Отображаемое имя</span>
                <div className="server-settings-row">
                  <input
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    maxLength={40}
                  />
                  <button className="btn btn-primary" onClick={renameMe}>
                    Сохранить
                  </button>
                </div>
              </label>

              {!me.isPremium && (
                <div className="settings-row-inline">
                  <button
                    className="btn btn-premium"
                    onClick={buyPremium}
                    disabled={berries < premiumPrice}
                  >
                    Купить Premium за {premiumPrice} <GlyphIcon id="star" size={14} />
                  </button>
                  <button className="btn btn-ghost" onClick={() => openTransfer(null)}>
                    Передать звёзды
                  </button>
                  {berries < premiumPrice && (
                    <p className="auth-hint">
                      Не хватает {premiumPrice - berries} <GlyphIcon id="star" size={13} />
                    </p>
                  )}
                </div>
              )}
              {me.isPremium && (
                <div className="settings-row-inline">
                  <button className="btn btn-ghost" onClick={() => openTransfer(null)}>
                    Передать звёзды
                  </button>
                </div>
              )}

              <details className="server-settings">
                <summary>История звёзд</summary>
                <div className="berry-tx-list">
                  {berryTx.length === 0 && <p className="web-search-note">Пока нет операций</p>}
                  {berryTx.map((tx) => (
                    <div key={tx.id} className="berry-tx-row">
                      <span>
                        {tx.fromId === me.id ? "→ перевод" : "← получено"}{" "}
                        <b>
                          {tx.amount} <GlyphIcon id="star" size={12} />
                        </b>
                        {tx.note && <span className="user-row-login"> — {tx.note}</span>}
                      </span>
                      <span className="user-row-login">{formatListTime(tx.createdAt)}</span>
                    </div>
                  ))}
                </div>
              </details>

              <details className="server-settings">
                <summary>Промокод</summary>
                <div className="server-settings-row">
                  <input
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value)}
                    placeholder="NOVA2026"
                    maxLength={32}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void redeemNow();
                    }}
                  />
                  <button
                    className="btn btn-primary"
                    disabled={promoBusy || !promoCode.trim()}
                    onClick={() => void redeemNow()}
                  >
                    Активировать
                  </button>
                </div>
                <p className="auth-hint">Вводи код без учёта регистра — звёзды сразу на баланс.</p>
              </details>
            </div>

            <div className="settings-card">
              <h3>Скачать приложение</h3>
              {releases
                .filter((r) => r.href !== "#")
                .map((r) => (
                  <a key={r.id} className="settings-dl-row" href={r.href}>
                    <span className="user-row-name">Nova для {r.name}</span>
                    <span className="user-row-login">
                      {r.requirement} · {r.size}
                    </span>
                  </a>
                ))}
            </div>

            <div className="settings-card">
              <h3>О приложении</h3>
              <div className="settings-info-row">
                <span>Сервер</span>
                <code>{API_BASE}</code>
              </div>
              <div className="settings-info-row">
                <span>Версия</span>
                <b>Nova 2.0</b>
              </div>
            </div>

            <button className="btn btn-danger settings-logout" onClick={logout}>
              Выйти из аккаунта
            </button>
          </div>
        </section>
      )}

      {/* ---------------- модал «Новый чат» ---------------- */}
      {modal === "new" && (
        <div className="modal-overlay" onClick={() => setModal("none")}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Новый чат</h3>
              <button className="btn btn-ghost btn-close" onClick={() => setModal("none")}>
                <Close width={14} height={14} />
              </button>
            </div>

            <div className="auth-tabs modal-tabs">
              {(
                [
                  ["users", "Люди"],
                  ["group", "Группа"],
                  ["channel", "Канал"],
                  ["browse", "Каналы"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`auth-tab ${nTab === key ? "active" : ""}`}
                  onClick={() => setNTab(key)}
                >
                  {label}
                </button>
              ))}
            </div>

            {nTab === "users" && (
              <div className="modal-body">
                <input
                  className="web-search-input"
                  value={nQ}
                  onChange={(e) => setNQ(e.target.value)}
                  placeholder="Поиск по логину или имени…"
                  autoFocus
                />
                <div className="modal-list">
                  {nUsers.length === 0 && <p className="web-search-note">Никого не нашли</p>}
                  {nUsers.map((user) => (
                    <button key={user.id} className="user-row" onClick={() => startChat(user)}>
                      <Avatar user={user} size={36} />
                      <span className="user-row-text">
                        <span className="user-row-name">
                          {user.displayName} <RoleBadge user={user} />
                        </span>
                        <span className="user-row-login">@{user.username}</span>
                      </span>
                      <ArrowRight width={16} height={16} />
                    </button>
                  ))}
                  {nBots.length > 0 && <p className="modal-section-title">Боты</p>}
                  {nBots.map((bot) => (
                    <button key={bot.id} className="user-row" onClick={() => startChat(bot)}>
                      <Avatar user={bot} size={36} />
                      <span className="user-row-text">
                        <span className="user-row-name">
                          {bot.displayName} <RoleBadge user={bot} />
                        </span>
                        <span className="user-row-login">@{bot.username}</span>
                      </span>
                      <ArrowRight width={16} height={16} />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {nTab === "group" && (
              <div className="modal-body">
                <label className="field">
                  <span>Название группы</span>
                  <input
                    value={nGroupTitle}
                    onChange={(e) => setNGroupTitle(e.target.value)}
                    placeholder="например, Команда Nova"
                    maxLength={60}
                  />
                </label>
                <input
                  className="web-search-input"
                  value={nQ}
                  onChange={(e) => setNQ(e.target.value)}
                  placeholder="Добавить участников (поиск)…"
                />
                <div className="modal-list modal-list-sm">
                  {nGroupMembers.length > 0 && (
                    <div className="chips">
                      {nGroupMembers.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          className="chip"
                          onClick={() =>
                            setNGroupMembers((prev) => prev.filter((x) => x.id !== u.id))
                          }
                          title="Убрать"
                        >
                          {u.displayName} <Close width={14} height={14} />
                        </button>
                      ))}
                    </div>
                  )}
                  {nUsers.map((user) => (
                    <button
                      key={user.id}
                      className={`user-row ${nGroupMembers.some((u) => u.id === user.id) ? "selected" : ""}`}
                      onClick={() =>
                        setNGroupMembers((prev) =>
                          prev.some((u) => u.id === user.id)
                            ? prev.filter((u) => u.id !== user.id)
                            : [...prev, user]
                        )
                      }
                    >
                      <Avatar user={user} size={32} />
                      <span className="user-row-text">
                        <span className="user-row-name">{user.displayName}</span>
                        <span className="user-row-login">@{user.username}</span>
                      </span>
                      {nGroupMembers.some((u) => u.id === user.id) && (
                        <Check width={15} height={15} />
                      )}
                    </button>
                  ))}
                </div>
                <button
                  className="btn btn-primary btn-lg auth-submit"
                  onClick={async () => {
                    const current = tokenRef.current;
                    if (!current || !nGroupTitle.trim()) return;
                    setNBusy(true);
                    try {
                      const { chat } = await api.createGroup(
                        current,
                        nGroupTitle.trim(),
                        nGroupMembers.map((u) => u.id)
                      );
                      setChats((prev) => sortChats([chat, ...prev.filter((c) => c.id !== chat.id)]));
                      setModal("none");
                      openChat(chat.id);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Ошибка создания группы");
                    } finally {
                      setNBusy(false);
                    }
                  }}
                  disabled={nBusy || !nGroupTitle.trim()}
                >
                  {nBusy ? "Создаём…" : "Создать группу"}
                </button>
              </div>
            )}

            {nTab === "channel" && (
              <div className="modal-body">
                <label className="field">
                  <span>Название канала</span>
                  <input
                    value={nChannelTitle}
                    onChange={(e) => setNChannelTitle(e.target.value)}
                    placeholder="например, Новости Nova"
                    maxLength={60}
                    autoFocus
                  />
                </label>
                <p className="auth-hint">
                  В канале публиковать сообщения сможешь только ты. Остальные — подписчики.
                </p>
                <button
                  className="btn btn-primary btn-lg auth-submit"
                  onClick={async () => {
                    const current = tokenRef.current;
                    if (!current || !nChannelTitle.trim()) return;
                    setNBusy(true);
                    try {
                      const { chat } = await api.createChannel(current, nChannelTitle.trim());
                      setChats((prev) => sortChats([chat, ...prev.filter((c) => c.id !== chat.id)]));
                      setModal("none");
                      openChat(chat.id);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Ошибка создания канала");
                    } finally {
                      setNBusy(false);
                    }
                  }}
                  disabled={nBusy || !nChannelTitle.trim()}
                >
                  {nBusy ? "Создаём…" : "Создать канал"}
                </button>
              </div>
            )}

            {nTab === "browse" && (
              <div className="modal-body">
                {nChannels.length === 0 && (
                  <p className="web-search-note">Пока нет доступных каналов</p>
                )}
                {nChannels.map((channel) => (
                  <div key={channel.id} className="channel-row">
                    <ChatAvatar chat={channel} size={38} />
                    <span className="user-row-text">
                      <span className="user-row-name">{channel.title}</span>
                      <span className="user-row-login">
                        {channel.memberCount ?? 0} подписчиков
                      </span>
                    </span>
                    <button className="btn btn-ghost btn-join" onClick={() => joinChannel(channel.id)}>
                      Подписаться
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------------- модал «Переслать сообщение» ---------------- */}
      {fwdMsg && (
        <div className="modal-overlay" onClick={() => setFwdMsg(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Переслать сообщение</h3>
              <button className="btn btn-ghost btn-close" onClick={() => setFwdMsg(null)}>
                <Close width={14} height={14} />
              </button>
            </div>
            <p className="auth-hint">Куда переслать? Выбери один или несколько чатов:</p>
            <div className="modal-list modal-list-sm fwd-list">
              {chats.length === 0 && (
                <p className="web-search-note">Нет чатов для пересылки</p>
              )}
              {chats.map((c) => (
                <button
                  key={c.id}
                  className={`fwd-row${fwdTargets.has(c.id) ? " selected" : ""}`}
                  onClick={() =>
                    setFwdTargets((prev) => {
                      const next = new Set(prev);
                      if (next.has(c.id)) next.delete(c.id);
                      else next.add(c.id);
                      return next;
                    })
                  }
                >
                  <ChatAvatar chat={c} size={34} />
                  <span className="fwd-row-text">
                    <span className="fwd-row-name">{c.title}</span>
                    <span className="user-row-login">
                      {c.type === "dm"
                        ? "личный чат"
                        : c.type === "saved"
                          ? "Избранное"
                          : c.type === "channel"
                            ? "канал"
                            : "группа"}
                      {c.noCopy ? " · защита" : ""}
                    </span>
                  </span>
                  {fwdTargets.has(c.id) && (
                    <span className="fwd-check">
                      <Check width={16} height={16} />
                    </span>
                  )}
                </button>
              ))}
            </div>
            <button
              className="btn btn-primary btn-lg auth-submit"
              onClick={submitForward}
              disabled={fwdBusy || fwdTargets.size === 0}
            >
              {fwdBusy ? "Пересылаем…" : `Переслать (${fwdTargets.size})`}
            </button>
          </div>
        </div>
      )}

      {/* ---------------- вкладка «Панель владельца» ---------------- */}
      {tab === "admin" && me.isOwner && (
        <section className="web-panel admin-panel">
          <div className="admin-card">
            <div className="modal-head admin-head">
              <div className="admin-head-info">
                <span className="admin-shield">
                  <LogoMark size={22} />
                </span>
                <div className="admin-head-text">
                  <h3>Панель владельца</h3>
                  <p className="admin-sub">Права, звёзды и порядок — всё под контролем</p>
                </div>
              </div>
              <button className="btn btn-ghost btn-close" onClick={() => setTab("chats")}>
                <Close width={14} height={14} />
                К чатам
              </button>
            </div>

            <div className="admin-tabs">
              {(
                [
                  ["stats", "Обзор"],
                  ["users", "Люди"],
                  ["moderation", "Модерация"],
                  ["gifts", "Подарки"],
                  ["economy", "Экономика"],
                  ["broadcast", "Рассылка"],
                  ["bots", "Боты"],
                  ["channels", "Каналы"],
                  ["groups", "Группы"],
                  ["system", "Сервер"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  className={`btn btn-tab${aTab === key ? " on" : ""}`}
                  onClick={() => setATab(key)}
                >
                  {label}
                </button>
              ))}
            </div>

            {aMsg && <p className={`admin-msg ${aMsg.kind}`}>{aMsg.text}</p>}

            {aTab === "stats" && aStats && (
              <>
                <p className="admin-stats-note">
                  <i className="a-live-dot" aria-hidden="true" /> всё в Nova прямо сейчас
                </p>
                <div className="admin-stats">
                  {(
                    [
                      ["Люди", aStats.users],
                      ["Боты", aStats.bots],
                      ["Онлайн", aStats.online],
                      ["Всего чатов", aStats.chats],
                      ["Личные", aStats.dms],
                      ["Группы", aStats.groups],
                      ["Каналы", aStats.channels],
                      ["Избранное", aStats.saved],
                      ["Сообщения", aStats.messages],
                      ["Файлы", aStats.uploads],
                      ["Звёзд всего", aStats.berriesTotal],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="admin-stat">
                      <span className="admin-stat-value">{value}</span>
                      <span className="admin-stat-label">{label}</span>
                    </div>
                  ))}
                </div>
                <div className="admin-sys-strip">
                  <span>версия {aStats.version}</span>
                  <span>аптайм {fmtUptime(aStats.uptimeSec)}</span>
                  <span>память {aStats.memoryMB} МБ</span>
                  <span>WS: {aStats.wsConnections}</span>
                  <span>запущен {new Date(aStats.startedAt).toLocaleString("ru-RU")}</span>
                  {aStats.maintenance && <span className="sys-bad">обслуживание</span>}
                </div>
                <div className="admin-actions-row">
                  <button className="btn btn-ghost admin-btn" onClick={() => setATab("system")}>
                    Управление сервером →
                  </button>
                  <button className="btn btn-ghost admin-btn" onClick={() => setATab("moderation")}>
                    Модерация →
                  </button>
                  <button className="btn btn-ghost admin-btn" onClick={exportUsers}>
                    Выгрузить людей (JSON)
                  </button>
                </div>
                <AdminAnalytics token={token ?? ""} onOpenProfile={openProfile} />
              </>
            )}

            {aTab === "moderation" && (
              <AdminModeration
                token={token ?? ""}
                notify={(kind, text) => setAMsg({ kind, text })}
                onOpenProfile={openProfile}
              />
            )}

            {aTab === "gifts" && (
              <AdminGifts token={token ?? ""} notify={(kind, text) => setAMsg({ kind, text })} />
            )}

            {aTab === "economy" && (
              <AdminEconomy
                token={token ?? ""}
                notify={(kind, text) => setAMsg({ kind, text })}
                onOpenProfile={openProfile}
              />
            )}

            {aTab === "users" && (
              <>
                <div className="admin-search">
                  <span className="admin-search-ico" aria-hidden="true">
                    <Search width={16} height={16} />
                  </span>
                  <input
                    className="web-search-input"
                    value={aQ}
                    onChange={(e) => setAQ(e.target.value)}
                    placeholder="Поиск по имени или @логину…"
                  />
                </div>
                <div className="admin-filters">
                  {(
                    [
                      ["all", "Все"],
                      ["online", "В сети"],
                      ["premium", "Premium"],
                      ["verified", "Галочки"],
                      ["owner", "Владельцы"],
                      ["banned", "Бан"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      className={`admin-chip${aFilter === key ? " on" : ""}`}
                      onClick={() => setAFilter(key)}
                    >
                      {label}
                      <span className="admin-chip-n">{aFilterCount(key)}</span>
                    </button>
                  ))}
                </div>
                <div className="modal-list admin-list">
                  {aFilteredUsers().map((u) => (
                    <div key={u.id} className="admin-row admin-user">
                      <div className="admin-cell-main">
                        <span className="admin-u-av">
                          <Avatar user={u} size={42} />
                          {(u.id === me.id || online.has(u.id)) && (
                            <i className="admin-u-dot" title="Сейчас в сети" />
                          )}
                        </span>
                        <div className="admin-row-main">
                          <span className="user-row-name">
                            {u.displayName} <RoleBadge user={u} />
                            {u.isBanned && (
                              <span className="badge badge-ban" title="Заблокирован">
                                <Ban width={13} height={13} />
                              </span>
                            )}
                          </span>
                          <span className="admin-row-meta">
                            @{u.username}
                            {u.phone ? ` · ${u.phone}` : ""}
                          </span>
                          <span className="admin-row-meta">
                            {u.id === me.id || online.has(u.id) ? (
                              <span className="a-online">в сети</span>
                            ) : (
                              formatLastSeen(u.lastSeenAt)
                            )}
                            {" · с "}
                            {new Date(u.createdAt).toLocaleDateString("ru-RU", {
                              day: "numeric",
                              month: "short",
                            })}
                          </span>
                        </div>
                      </div>
                      <div className="admin-cell-actions">
                        <button
                          className="btn btn-ghost admin-btn"
                          title="Открыть профиль"
                          onClick={() => openProfile(u)}
                        >
                          Профиль
                        </button>
                        <span className="admin-balance">
                          {u.berries} <GlyphIcon id="star" size={12} />
                        </span>
                        <input
                          className="admin-amount"
                          type="number"
                          min={1}
                          value={aAmounts[u.id] ?? "10"}
                          onChange={(e) =>
                            setAAmounts((m) => ({ ...m, [u.id]: e.target.value }))
                          }
                          title="Сколько звёзд выдать или забрать"
                        />
                        <button
                          className="btn btn-ghost admin-btn"
                          title={`Выдать звезды: ${aAmount(u.id)}`}
                          onClick={() => aBerries(u, aAmount(u.id))}
                        >
                          +<GlyphIcon id="star" size={13} />
                        </button>
                        <button
                          className="btn btn-ghost admin-btn"
                          title={`Забрать звезды: ${aAmount(u.id)}`}
                          onClick={() => aBerries(u, -aAmount(u.id))}
                        >
                          −<GlyphIcon id="star" size={13} />
                        </button>
                        <i className="admin-act-sep" aria-hidden="true" />
                        <button
                          className={`btn btn-ghost admin-btn${u.isPremium ? " on" : ""}`}
                          title={u.isPremium ? "Убрать Premium" : "Выдать Premium"}
                          onClick={() => aPremium(u, !u.isPremium)}
                        >
                          <Sparkles width={15} height={15} />
                        </button>
                        <button
                          className={`btn btn-ghost admin-btn admin-verify${u.isVerified ? " on" : ""}`}
                          title={
                            u.isVerified
                              ? "Снять галочку верификации"
                              : "Выдать галочку (проверенный аккаунт)"
                          }
                          onClick={() => aVerify(u, !u.isVerified)}
                        >
                          <Check width={15} height={15} />
                        </button>
                        <button
                          className={`btn btn-ghost admin-btn admin-owner${u.isOwner ? " on" : ""}`}
                          title={
                            u.isOwner
                              ? "Снять роль владельца"
                              : "Сделать владельцем"
                          }
                          disabled={u.id === me.id || !!u.isBot}
                          onClick={() => aOwner(u, !u.isOwner)}
                        >
                          <Shield width={15} height={15} />
                        </button>
                        <button
                          className={`btn btn-ghost admin-btn${u.isBanned ? " on" : ""}`}
                          title={u.isBanned ? "Разбанить" : "Заблокировать"}
                          disabled={u.isOwner || !!u.isBot || u.id === me.id}
                          onClick={() => aBan(u, !u.isBanned)}
                        >
                          <Ban width={15} height={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {aFilteredUsers().length === 0 && (
                    <p className="auth-hint">Никого не нашлось — попробуй другой фильтр</p>
                  )}
                </div>
              </>
            )}

            {aTab === "bots" && (
              <>
                <div className="admin-bot-form">
                  <input
                    className="web-search-input"
                    value={aBotUser}
                    onChange={(e) => setABotUser(e.target.value)}
                    placeholder="Логин бота: латиница, 3–32"
                  />
                  <input
                    className="web-search-input"
                    value={aBotName}
                    onChange={(e) => setABotName(e.target.value)}
                    placeholder="Имя бота (необязательно)"
                  />
                  <button
                    className="btn btn-primary bot-create-btn"
                    disabled={aBusy || !aBotUser.trim()}
                    onClick={aCreateBot}
                  >
                    Создать бота
                  </button>
                </div>
                <div className="modal-list admin-list">
                  {aBots.map((b) => (
                    <div key={b.id} className="admin-row admin-bot-row">
                      <Avatar user={b} size={38} />
                      <div className="admin-row-main">
                        <span className="user-row-name">
                          {b.displayName} <RoleBadge user={b} />
                        </span>
                        <span className="admin-row-meta">@{b.username}</span>
                        <span className="admin-row-meta">
                          бот · работает с{" "}
                          {new Date(b.createdAt).toLocaleDateString("ru-RU", {
                            day: "numeric",
                            month: "short",
                          })}
                        </span>
                      </div>
                      <div className="admin-cell-actions admin-bot-actions">
                        {b.username === "nova" ? (
                          <span className="auth-hint">встроенный</span>
                        ) : (
                          <button
                            className={`btn btn-danger${aDanger === b.id ? " on" : ""}`}
                            onClick={() => aConfirmAction(b.id, () => aDeleteBot(b))}
                          >
                            {aDanger === b.id ? "Точно?" : "Удалить"}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {aBots.length === 0 && <p className="auth-hint">Ботов пока нет</p>}
                </div>
              </>
            )}

            {(aTab === "channels" || aTab === "groups") && (
              <>
                <div className="admin-search">
                  <span className="admin-search-ico" aria-hidden="true">
                    <Search width={16} height={16} />
                  </span>
                  <input
                    className="web-search-input"
                    value={aQ}
                    onChange={(e) => setAQ(e.target.value)}
                    placeholder="Поиск по названию или владельцу…"
                  />
                </div>
                <div className="modal-list admin-list">
                  {aChats.map((c) => (
                    <div key={c.id} className="admin-row admin-chat-row">
                      <span
                        className="admin-chat-avatar"
                        style={{ background: c.type === "channel" ? "#2f8def" : "#6d5bd0" }}
                      >
                        {c.title.slice(0, 1).toUpperCase()}
                      </span>
                      <div className="admin-row-main">
                        <span className="user-row-name">{c.title}</span>
                        <span className="admin-row-meta">
                          {c.type === "channel" ? "канал" : "группа"} · {c.memberCount} чел.
                          {c.ownerName ? ` · владелец: ${c.ownerName}` : ""}
                          {c.noCopy ? " · защита" : ""}
                        </span>
                        <span className="admin-row-meta admin-chat-last">
                          {c.lastMessageText || "пока тихо"}{" "}
                          {c.lastMessageAt ? `· ${formatListTime(c.lastMessageAt)}` : ""}
                        </span>
                      </div>
                      <div className="admin-cell-actions admin-bot-actions">
                        <button
                          className={`btn btn-ghost admin-btn${c.noCopy ? " on" : ""}`}
                          title={
                            c.noCopy
                              ? "Снять защиту от копирования"
                              : "Включить защиту от копирования и пересылки"
                          }
                          onClick={() => aNoCopy(c)}
                        >
                          <Lock width={15} height={15} />
                        </button>
                        <button
                          className={`btn btn-danger${aDanger === c.id ? " on" : ""}`}
                          onClick={() => aConfirmAction(c.id, () => aDeleteChat(c))}
                        >
                          {aDanger === c.id ? "Точно?" : "Удалить"}
                        </button>
                      </div>
                    </div>
                  ))}
                  {aChats.length === 0 && <p className="auth-hint">Ничего не нашлось</p>}
                </div>
              </>
            )}

            {aTab === "broadcast" && (
              <>
                <p className="admin-sub">
                  Уведомление всплывёт у всех в сети, а копия ляжет в чат Nova каждому
                  (даже офлайн).
                </p>
                <textarea
                  className="admin-bc-input"
                  value={bcText}
                  onChange={(e) => setBcText(e.target.value)}
                  rows={5}
                  maxLength={4000}
                  placeholder="Например: в Nova появились стикеры и звонки — обновись! 🚀"
                />
                <div className="admin-actions-row">
                  <button
                    className="btn btn-primary"
                    disabled={bcBusy || !bcText.trim()}
                    onClick={aBroadcast}
                  >
                    {bcBusy
                      ? "Отправляем…"
                      : `Отправить всем${aStats ? ` (${aStats.users} чел.)` : ""}`}
                  </button>
                  <button
                    className="btn btn-ghost"
                    disabled={!bcText}
                    onClick={() => setBcText("")}
                  >
                    Очистить
                  </button>
                  <span className="admin-chip-n">{bcText.length}/4000</span>
                </div>
              </>
            )}

            {aTab === "system" && aStats && (
              <>
                <p className="admin-stats-note">
                  <i className="a-live-dot" aria-hidden="true" /> сервер Nova{" "}
                  {aStats.version} ·{" "}
                  {aStats.maintenance ? "на обслуживании" : "работает штатно"}
                </p>
                <div className="admin-sys-grid">
                  <div className="admin-sys-card">
                    <span className="admin-sys-v">v{aStats.version}</span>
                    <span className="admin-sys-l">версия API</span>
                  </div>
                  <div className="admin-sys-card">
                    <span className="admin-sys-v">{fmtUptime(aStats.uptimeSec)}</span>
                    <span className="admin-sys-l">аптайм</span>
                  </div>
                  <div className="admin-sys-card">
                    <span className="admin-sys-v">{aStats.memoryMB} МБ</span>
                    <span className="admin-sys-l">память процесса</span>
                  </div>
                  <div className="admin-sys-card">
                    <span className="admin-sys-v">{aStats.wsConnections}</span>
                    <span className="admin-sys-l">WS-соединений</span>
                  </div>
                  <div className="admin-sys-card">
                    <span className="admin-sys-v">{aStats.online}</span>
                    <span className="admin-sys-l">в сети сейчас</span>
                  </div>
                  <div className="admin-sys-card">
                    <span className="admin-sys-v">
                      {new Date(aStats.startedAt).toLocaleString("ru-RU")}
                    </span>
                    <span className="admin-sys-l">время запуска</span>
                  </div>
                </div>
                <div className="admin-actions-row">
                  <button
                    className="btn btn-ghost admin-btn"
                    onClick={() => {
                      setAMsg(null);
                      setATab("stats");
                    }}
                  >
                    Обновить статистику
                  </button>
                  <button className="btn btn-ghost admin-btn" onClick={exportUsers}>
                    Выгрузить людей (JSON)
                  </button>
                </div>
                <div className={`admin-danger-zone${aStats.maintenance ? " on" : ""}`}>
                  <div className="admin-danger-text">
                    <b>{aStats.maintenance ? "Обслуживание включено" : "Режим обслуживания"}</b>
                    <span>
                      Вход и регистрация — только для владельца, остальные разлогиниваются.
                    </span>
                  </div>
                  <button
                    className={`btn ${aStats.maintenance ? "btn-primary" : "btn-danger"}`}
                    onClick={() => aConfirmAction("maintenance", () => aToggleMaintenance(!aStats.maintenance))}
                  >
                    {aDanger === "maintenance"
                      ? aStats.maintenance
                        ? "Снять режим?"
                        : "Включить?"
                      : aStats.maintenance
                        ? "Снять режим"
                        : "Включить режим"}
                  </button>
                </div>

                <AdminServer token={token ?? ""} notify={(kind, text) => setAMsg({ kind, text })} />
              </>
            )}
          </div>
        </section>
      )}

      {/* ---------------- баннер объявления (рассылка) ---------------- */}
      {notice && (
        <div className="app-notice" role="status">
          <Megaphone width={16} height={16} />
          <span>{notice}</span>
          <button className="app-notice-x" onClick={() => setNotice(null)} aria-label="Скрыть">
            <Close width={13} height={13} />
          </button>
        </div>
      )}

      {/* ---------------- режим «войти как пользователь» ---------------- */}
      {impersonating && (
        <div className="app-notice impersonate" role="status">
          <Shield width={16} height={16} />
          <span>
            Режим владельца: открыт аккаунт <b>@{me.username}</b> ({me.displayName})
          </span>
          <button className="btn btn-ghost" onClick={stopImpersonate}>
            Вернуться в свой аккаунт
          </button>
        </div>
      )}

      {/* ---------------- модал «Профиль пользователя» ---------------- */}
      {modal === "profile" && profileUser && (
        <div className="modal-overlay" onClick={() => setModal("none")}>
          <div className="modal-card profile-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Профиль</h3>
              <button className="btn btn-ghost btn-close" onClick={() => setModal("none")}>
                <Close width={14} height={14} />
                Закрыть
              </button>
            </div>

            <div className="profile-hero">
              <Avatar user={profileUser} size={84} />
              <div className="profile-hero-text">
                <span className="profile-name">
                  {profileUser.displayName}
                  <RoleBadge user={profileUser} />
                  {profileUser.isBanned && (
                    <span className="badge badge-ban" title="Заблокирован">
                      <Ban width={14} height={14} />
                    </span>
                  )}
                </span>
                <span className="profile-username">@{profileUser.username}</span>
                <span
                  className={`profile-status${
                    profileInfo?.online || profileUser.id === me.id ? " on" : ""
                  }`}
                >
                  {profileBusy
                    ? "загружаем…"
                    : profileInfo?.online || profileUser.id === me.id
                      ? "в сети"
                      : formatLastSeen(profileUser.lastSeenAt)}
                </span>
              </div>
            </div>

            {profileErr && <p className="admin-msg err">{profileErr}</p>}

            <div className="profile-tabs" role="tablist">
              <button
                role="tab"
                aria-selected={profileTab === "info"}
                className={`profile-tab${profileTab === "info" ? " on" : ""}`}
                onClick={() => setProfileTab("info")}
              >
                Инфо
              </button>
              <button
                role="tab"
                aria-selected={profileTab === "gifts"}
                className={`profile-tab${profileTab === "gifts" ? " on" : ""}`}
                onClick={() => setProfileTab("gifts")}
              >
                <GlyphIcon id="star" size={13} />
                Подарки
              </button>
            </div>

            {profileTab === "gifts" ? (
              <GiftShowcase token={tokenRef.current ?? ""} user={profileUser} />
            ) : (
              <>
            <div className="profile-grid">
              <div className="profile-field">
                <span>Телефон</span>
                <em>{profileUser.phone ?? "скрыт"}</em>
              </div>
              <div className="profile-field">
                <span>В Nova с</span>
                <em>{new Date(profileUser.createdAt).toLocaleDateString("ru-RU")}</em>
              </div>
              <div className="profile-field">
                <span>Premium</span>
                <em>
                  {profileUser.isPremium
                    ? profileUser.premiumUntil
                      ? `до ${new Date(profileUser.premiumUntil).toLocaleDateString("ru-RU")}`
                      : "включён"
                    : "нет"}
                </em>
              </div>
              <div className="profile-field">
                <span>Общих чатов</span>
                <em>{profileInfo ? profileInfo.sharedChats : "—"}</em>
              </div>
              {me.isOwner && (
                <>
                  <div className="profile-field">
                    <span>Звёзды</span>
                    <em>{profileUser.berries}</em>
                  </div>
                  <div className="profile-field">
                    <span>Сообщений</span>
                    <em>{profileDetail?.messagesSent ?? profileInfo?.messagesSent ?? "—"}</em>
                  </div>
                  <div className="profile-field">
                    <span>Переводов</span>
                    <em>{profileDetail?.transfers ?? "—"}</em>
                  </div>
                </>
              )}
            </div>

            <div className="profile-actions">
              <button className="btn btn-primary" onClick={() => startChat(profileUser)}>
                <ChatBubble width={16} height={16} />
                Написать
              </button>
              <button
                className="btn btn-ghost btn-gift"
                onClick={() => {
                  openGiftModal();
                }}
              >
                <GlyphIcon id="star" size={15} />
                Подарить
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setTransferTo(profileUser);
                  setTransferAmount("");
                  setTransferNote("");
                  setModal("transfer");
                }}
              >
                <Star width={16} height={16} />
                Передать звёзды
              </button>
            </div>

            {profileUser.id !== me.id &&
              (reportFor === profileUser.id ? (
                <div className="adm">
                  <textarea
                    className="adm-textarea"
                    rows={3}
                    autoFocus
                    value={reportText}
                    onChange={(e) => setReportText(e.target.value)}
                    placeholder="Что не так с этим пользователем?"
                  />
                  <div className="admin-actions-row">
                    <button
                      className="admin-btn btn-danger"
                      disabled={reportBusy}
                      onClick={() => void sendReportNow(profileUser.id)}
                    >
                      Отправить жалобу
                    </button>
                    <button
                      className="admin-btn"
                      onClick={() => {
                        setReportFor(null);
                        setReportText("");
                      }}
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setReportFor(profileUser.id);
                    setReportText("");
                  }}
                >
                  <Ban width={15} height={15} />
                  Пожаловаться
                </button>
              ))}
              </>
            )}

            {me.isOwner && profileDetail && profileDetail.chats.length > 0 && (
              <div className="profile-chats">
                <b>Его чаты · {profileDetail.chats.length}</b>
                <div className="profile-chats-list">
                  {profileDetail.chats.map((c) => (
                    <span key={c.id} className="admin-chip">
                      {c.type === "group"
                        ? "группа"
                        : c.type === "channel"
                          ? "канал"
                          : c.type === "saved"
                            ? "избранное"
                            : "лс"}
                      · {c.title}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {me.isOwner && profileUser.id !== me.id && (
              <div className="profile-owner">
                <div className="profile-owner-head">
                  <Shield width={15} height={15} />
                  Управление (владелец)
                </div>
                <div className="profile-actions profile-acts">
                  <input
                    className="admin-amount"
                    type="number"
                    min={1}
                    value={aAmounts[profileUser.id] ?? "10"}
                    onChange={(e) =>
                      setAAmounts((m) => ({ ...m, [profileUser.id]: e.target.value }))
                    }
                    title="Сколько звёзд выдать или забрать"
                  />
                  <button
                    className="btn btn-ghost admin-btn"
                    title={`Выдать ${aAmount(profileUser.id)} звёзд`}
                    onClick={async () => {
                      const u = await aBerries(profileUser, aAmount(profileUser.id));
                      if (u) {
                        setProfileUser(u);
                        void refreshProfile();
                      }
                    }}
                  >
                    +<GlyphIcon id="star" size={13} />
                  </button>
                  <button
                    className="btn btn-ghost admin-btn"
                    title={`Забрать ${aAmount(profileUser.id)} звёзд`}
                    onClick={async () => {
                      const u = await aBerries(profileUser, -aAmount(profileUser.id));
                      if (u) {
                        setProfileUser(u);
                        void refreshProfile();
                      }
                    }}
                  >
                    −<GlyphIcon id="star" size={13} />
                  </button>
                  <button
                    className={`btn btn-ghost admin-btn${profileUser.isPremium ? " on" : ""}`}
                    title={profileUser.isPremium ? "Убрать Premium" : "Выдать Premium"}
                    onClick={async () => {
                      const u = await aPremium(profileUser, !profileUser.isPremium);
                      if (u) {
                        setProfileUser(u);
                        void refreshProfile();
                      }
                    }}
                  >
                    <Sparkles width={15} height={15} />
                  </button>
                  <button
                    className={`btn btn-ghost admin-btn admin-verify${
                      profileUser.isVerified ? " on" : ""
                    }`}
                    title={profileUser.isVerified ? "Снять галочку" : "Выдать галочку"}
                    onClick={async () => {
                      const u = await aVerify(profileUser, !profileUser.isVerified);
                      if (u) {
                        setProfileUser(u);
                        void refreshProfile();
                      }
                    }}
                  >
                    <Check width={15} height={15} />
                  </button>
                  <button
                    className={`btn btn-ghost admin-btn admin-owner${
                      profileUser.isOwner ? " on" : ""
                    }`}
                    title={profileUser.isOwner ? "Снять владельца" : "Сделать владельцем"}
                    disabled={!!profileUser.isBot}
                    onClick={async () => {
                      const u = await aOwner(profileUser, !profileUser.isOwner);
                      if (u) {
                        setProfileUser(u);
                        void refreshProfile();
                      }
                    }}
                  >
                    <Shield width={15} height={15} />
                  </button>
                  <button
                    className={`btn btn-ghost admin-btn${profileUser.isBanned ? " on" : ""}`}
                    title={profileUser.isBanned ? "Разбанить" : "Заблокировать"}
                    disabled={profileUser.isOwner || !!profileUser.isBot}
                    onClick={async () => {
                      const u = await aBan(profileUser, !profileUser.isBanned);
                      if (u) {
                        setProfileUser(u);
                        void refreshProfile();
                      }
                    }}
                  >
                    <Ban width={15} height={15} />
                  </button>
                </div>

                {!profileUser.isBot && (
                  <div className="profile-reset">
                    <input
                      className="web-search-input"
                      type="text"
                      value={pResetPass}
                      onChange={(e) => setPResetPass(e.target.value)}
                      placeholder="Новый пароль (мин. 6 символов)"
                    />
                    <button
                      className="btn btn-ghost admin-btn"
                      disabled={pResetPass.length < 6}
                      onClick={() =>
                        aConfirmAction(`pass-${profileUser.id}`, async () => {
                          await aResetPassword(profileUser, pResetPass);
                        })
                      }
                    >
                      {aDanger === `pass-${profileUser.id}`
                        ? "Точно сбросить?"
                        : "Сбросить пароль"}
                    </button>
                  </div>
                )}

                {!profileUser.isBot && (
                  <AdminUserTools
                    token={token ?? ""}
                    user={profileUser}
                    notify={(kind, text) => setAMsg({ kind, text })}
                    onChanged={(u) => {
                      setProfileUser(u);
                      aPatchUser(u.id, u);
                      void refreshProfile();
                    }}
                    onImpersonate={startImpersonate}
                  />
                )}

                <button
                  className={`btn btn-danger profile-del${
                    aDanger === `del-${profileUser.id}` ? " on" : ""
                  }`}
                  onClick={() =>
                    aConfirmAction(`del-${profileUser.id}`, async () => {
                      await aDeleteUser(profileUser);
                    })
                  }
                >
                  {aDanger === `del-${profileUser.id}`
                    ? "Точно удалить аккаунт навсегда?"
                    : "Удалить аккаунт"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------------- модал «Подарить» ---------------- */}
      {modal === "gift" && profileUser && (
        <div className="modal-overlay" onClick={() => setModal("none")}>
          <div className="modal-card gift-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Подарить · {profileUser.displayName}</h3>
              <button className="btn btn-ghost btn-close" onClick={() => setModal("none")}>
                <Close width={14} height={14} />
                Закрыть
              </button>
            </div>

            <p className="gift-bal">
              Ваш баланс: <strong>★ {giftBal}</strong>
            </p>

            {giftErr && <p className="admin-msg err">{giftErr}</p>}

            {giftCatalog.length === 0 && !giftErr ? (
              <p className="admin-msg">Загружаем каталог…</p>
            ) : (
              <div className="gift-pick-grid">
                {giftCatalog.map((g) => (
                  <button
                    key={g.id}
                    className={`gift-pick${giftPick === g.id ? " on" : ""}`}
                    disabled={g.total > 0 && g.sold >= g.total}
                    title={
                      g.total > 0 ? `Тираж ${g.sold}/${g.total}` : g.category
                    }
                    onClick={() => setGiftPick(g.id)}
                  >
                    <span className="gp-glyph">{g.glyph}</span>
                    <span className="gp-name">{g.name}</span>
                    <span className="gp-price">
                      <GlyphIcon id="star" size={11} />
                      {g.price}
                    </span>
                    {g.total > 0 && (
                      <span className="gp-left">
                        {Math.max(0, g.total - g.sold)} шт.
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            <div className="gift-opts">
              <textarea
                className="gift-note-input"
                rows={2}
                maxLength={200}
                placeholder="Личное послание (необязательно)"
                value={giftNote}
                onChange={(e) => setGiftNote(e.target.value)}
              />
              <label className="gift-opt">
                <input
                  type="checkbox"
                  checked={giftAnon}
                  onChange={(e) => setGiftAnon(e.target.checked)}
                />
                Отправить анонимно
              </label>
              <label className="gift-opt">
                Запланировать дату:
                <input
                  type="date"
                  value={giftDate}
                  onChange={(e) => setGiftDate(e.target.value)}
                />
              </label>
            </div>

            <div className="profile-actions">
              <button
                className="btn btn-primary"
                disabled={!giftPick || giftBusy}
                onClick={() => void sendGiftNow()}
              >
                {giftBusy
                  ? "Отправляем…"
                  : giftPick
                    ? `Подарить (${giftCatalog.find((g) => g.id === giftPick)?.price} ★)`
                    : "Выбери подарок"}
              </button>
              <button className="btn btn-ghost" onClick={() => setModal("none")}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- модал «Передать звёзды» ---------------- */}
      {modal === "transfer" && (
        <div className="modal-overlay" onClick={() => setModal("none")}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Передать звёзды</h3>
              <button className="btn btn-ghost btn-close" onClick={() => setModal("none")}>
                <Close width={14} height={14} />
              </button>
            </div>
            {!transferTo && (
              <>
                <input
                  className="web-search-input"
                  value={xQ}
                  onChange={(e) => setXQ(e.target.value)}
                  placeholder="Кому передать? Найди пользователя…"
                  autoFocus
                />
                <div className="modal-list modal-list-sm">
                  {xUsers.map((u) => (
                    <button key={u.id} className="user-row" onClick={() => setTransferTo(u)}>
                      <Avatar user={u} size={32} />
                      <span className="user-row-text">
                        <span className="user-row-name">{u.displayName}</span>
                        <span className="user-row-login">@{u.username}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
            {transferTo && (
              <>
                <div className="transfer-to">
                  <Avatar user={transferTo} size={34} />
                  <span className="user-row-name">{transferTo.displayName}</span>
                  <button className="btn btn-ghost btn-close" onClick={() => setTransferTo(null)}>
                    <Close width={14} height={14} />
                  </button>
                </div>
                <label className="field">
                  <span>Сумма звёзд</span>
                  <input
                    type="number"
                    min={1}
                    value={transferAmount}
                    onChange={(e) => setTransferAmount(e.target.value)}
                    placeholder={`У тебя доступно ${berries}`}
                  />
                </label>
                <label className="field">
                  <span>Комментарий (необязательно)</span>
                  <input
                    value={transferNote}
                    onChange={(e) => setTransferNote(e.target.value)}
                    placeholder="например, «спасибо за помощь»"
                    maxLength={200}
                  />
                </label>
                <button
                  className="btn btn-primary btn-lg auth-submit"
                  onClick={submitTransfer}
                  disabled={!transferAmount || Math.floor(Number(transferAmount)) < 1}
                >
                  Перевести
                </button>
              </>
            )}
            <p className="auth-hint">
              Твой баланс: {berries} <GlyphIcon id="star" size={12} />
            </p>
          </div>
        </div>
      )}

      <CallOverlayUI
        call={call}
        remoteAudioRef={remoteAudioRef}
        onDecline={declineIncomingCall}
        onAccept={acceptIncomingCall}
        onHangup={hangUp}
      />
    </div>
  );
}

function peerOf(chat: ChatView): User | null {
  return chat.type === "dm" ? chat.peer : null;
}