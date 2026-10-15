import { randomBytes, randomUUID, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(_scrypt) as (
  password: string,
  salt: string,
  keylen: number
) => Promise<Buffer>;

const KEYLEN = 64;

export function newId(): string {
  return randomUUID();
}

export function makeSalt(): string {
  return randomBytes(16).toString("hex");
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  const buf = await scrypt(password, salt, KEYLEN);
  return buf.toString("hex");
}

export async function verifyPassword(
  password: string,
  salt: string,
  expectedHash: string
): Promise<boolean> {
  const actual = Buffer.from(await hashPassword(password, salt), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

/** Сессии в памяти: токен → данные (владелец, время, IP, браузер). */
export type SessionInfo = {
  token: string;
  userId: string;
  createdAt: number;
  ua?: string;
  ip?: string;
};

const sessions = new Map<string, SessionInfo>();

export function createSession(userId: string, info?: { ua?: string; ip?: string }): string {
  const token = randomBytes(24).toString("base64url");
  sessions.set(token, {
    token,
    userId,
    createdAt: Date.now(),
    ua: info?.ua,
    ip: info?.ip,
  });
  return token;
}

export function userIdFromToken(token: string | undefined | null): string | null {
  if (!token) return null;
  return sessions.get(token)?.userId ?? null;
}

export function destroySession(token: string): void {
  sessions.delete(token);
}

/** Полный выход: удаляет все активные сессии пользователя. */
export function destroyUserSessions(userId: string): void {
  for (const [token, info] of sessions.entries()) {
    if (info.userId === userId) sessions.delete(token);
  }
}

/** Все живые сессии пользователя (для панели владельца). */
export function listUserSessions(userId: string): SessionInfo[] {
  return [...sessions.values()]
    .filter((s) => s.userId === userId)
    .sort((a, b) => b.createdAt - a.createdAt);
}
