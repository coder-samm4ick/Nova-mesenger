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

/** Сессии в памяти: токен → id пользователя. */
const sessions = new Map<string, string>();

export function createSession(userId: string): string {
  const token = randomBytes(24).toString("base64url");
  sessions.set(token, userId);
  return token;
}

export function userIdFromToken(token: string | undefined | null): string | null {
  if (!token) return null;
  return sessions.get(token) ?? null;
}

export function destroySession(token: string): void {
  sessions.delete(token);
}

/** Полный выход: удаляет все активные сессии пользователя. */
export function destroyUserSessions(userId: string): void {
  for (const [token, id] of sessions.entries()) {
    if (id === userId) sessions.delete(token);
  }
}
