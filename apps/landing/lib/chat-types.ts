// Типы веб-клиента Nova.
// Зеркалят apps/server/src/types.ts. Когда появится packages/shared,
// эти типы переедут туда и будут использоваться обеими частями.

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
  /** Для каналов, где писать может только владелец. */
  banned?: boolean;
  /** Защита от копирования и пересылки. */
  noCopy?: boolean;
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
  | { type: "error"; error: string };