import type { ReactNode } from "react";

/**
 * Собственный набор стикеров Nova.
 *
 * Это фирменные векторные глифы (не эмодзи): у каждого свой акцентный цвет,
 * белая линейная графика и общий «плоский» стиль. Используется и в чате
 * (панель стикеров, сообщения), и в интерфейсе (иконки валюты, реакций).
 */

type StickerDef = { color: string; label: string };

/** Каталог стикеров: id → цвет подложки и подпись. */
export const STICKERS: Record<string, StickerDef> = {
  fire: { color: "#ff6a3d", label: "Огонь" },
  star: { color: "#ffb020", label: "Звезда" },
  like: { color: "#2fa8ff", label: "Класс" },
  heart: { color: "#ff4d6d", label: "Сердце" },
  laugh: { color: "#ffb020", label: "Смех" },
  cry: { color: "#4aa8ff", label: "Слёзы" },
  sad: { color: "#4aa8ff", label: "Грустно" },
  love: { color: "#ff4d6d", label: "Влюблён" },
  wow: { color: "#7c5cff", label: "Вау" },
  flower: { color: "#a86bff", label: "Цветок" },
  berry: { color: "#ff4d6d", label: "Ягода" },
  party: { color: "#23e6c3", label: "Праздник" },
  skull: { color: "#6b7690", label: "Череп" },
  alien: { color: "#5ad469", label: "Пришелец" },
  gem: { color: "#2fa8ff", label: "Кристалл" },
  moon: { color: "#7c5cff", label: "Луна" },
  cool: { color: "#1fb6c9", label: "Круто" },
  crown: { color: "#ffb020", label: "Корона" },
  glow: { color: "#ffd166", label: "Сияние" },
  rocket: { color: "#2fa8ff", label: "Ракета" },
  rainbow: { color: "#a45cff", label: "Радуга" },
};

/** Порядок стикеров в панели. */
export const STICKER_IDS = [
  "fire",
  "star",
  "like",
  "heart",
  "laugh",
  "cry",
  "love",
  "wow",
  "flower",
  "berry",
  "party",
  "skull",
  "alien",
  "gem",
  "moon",
  "cool",
];

/** Дополнительные стикеры для Premium. */
export const PREMIUM_STICKER_IDS = ["crown", "glow", "rocket", "rainbow"];

/** Быстрые реакции (короткий ряд под сообщением). */
export const REACTION_IDS = ["like", "love", "fire", "laugh", "wow", "sad", "party", "star"];

export const REACTION_LABELS: Record<string, string> = {
  like: "Класс",
  love: "Сердце",
  fire: "Огонь",
  laugh: "Смех",
  wow: "Вау",
  sad: "Грустно",
  party: "Праздник",
  star: "Звезда",
};

/** Глифы рисуются в системе координат 64×64 и наследуют цвет через currentColor. */
const GLYPHS: Record<string, ReactNode> = {
  fire: (
    <path d="M32 13c0 6.5 8.5 9.5 8.5 18.5a8.5 8.5 0 1 1-17 0c0-3 1.2-5.4 3.2-7.4.2 2.6 2 3.8 3.1 3.8 0-4.2-2.3-8.6 2.2-14.9Z" />
  ),
  star: (
    <path d="M32 14.5l5.4 11 12.1 1.7-8.8 8.6 2.1 12.1L32 42.2l-10.8 5.7 2.1-12.1-8.8-8.6 12.1-1.7Z" />
  ),
  like: (
    <>
      <path d="M22 30h-6v17h6" />
      <path d="M22 30l9-15c1-1.7 3.6-1.5 4.3.4.6 1.7.4 3.6-.3 5.2L32.5 27H45a3.8 3.8 0 0 1 3.7 4.6l-2.3 11.3A3.9 3.9 0 0 1 42.5 46H22Z" />
    </>
  ),
  heart: (
    <path d="M32 46S18 37.6 18 28.6A8 8 0 0 1 32 24a8 8 0 0 1 14 4.6C46 37.6 32 46 32 46Z" />
  ),
  laugh: (
    <>
      <circle cx="32" cy="33" r="15" />
      <path d="M24 30c1.3-2 3-2 4.3 0" />
      <path d="M35.7 30c1.3-2 3-2 4.3 0" />
      <path d="M23 36c2.6 5 15.4 5 18 0Z" />
    </>
  ),
  cry: (
    <>
      <circle cx="32" cy="33" r="15" />
      <circle cx="26.5" cy="30" r="1.9" fill="currentColor" stroke="none" />
      <circle cx="37.5" cy="30" r="1.9" fill="currentColor" stroke="none" />
      <path d="M24.5 41.5c2.4-4 12.6-4 15 0" />
      <path d="M22.5 33c-1.6 2.3-1.6 4.5 0 6.3.7-1.9.7-4.4 0-6.3Z" fill="currentColor" stroke="none" />
    </>
  ),
  sad: (
    <>
      <circle cx="32" cy="33" r="15" />
      <circle cx="26.5" cy="30" r="1.9" fill="currentColor" stroke="none" />
      <circle cx="37.5" cy="30" r="1.9" fill="currentColor" stroke="none" />
      <path d="M24.5 42.5c2.4-4 12.6-4 15 0" />
    </>
  ),
  love: (
    <>
      <circle cx="32" cy="33" r="15" />
      <path d="M26 27c-1.6-1.3-4 .2-4 2 0 1.8 4 4 4 4s4-2.2 4-4c0-1.8-2.4-3.3-4-2Z" fill="currentColor" stroke="none" />
      <path d="M38 27c-1.6-1.3-4 .2-4 2 0 1.8 4 4 4 4s4-2.2 4-4c0-1.8-2.4-3.3-4-2Z" fill="currentColor" stroke="none" />
      <path d="M25 38.5c2.4 3.6 11.6 3.6 14 0" />
    </>
  ),
  wow: (
    <>
      <circle cx="32" cy="33" r="15" />
      <circle cx="26.5" cy="28" r="2.5" fill="currentColor" stroke="none" />
      <circle cx="37.5" cy="28" r="2.5" fill="currentColor" stroke="none" />
      <ellipse cx="32" cy="40" rx="4.2" ry="5" fill="currentColor" stroke="none" />
    </>
  ),
  flower: (
    <>
      <circle cx="32" cy="22.5" r="6" />
      <circle cx="41.5" cy="32" r="6" />
      <circle cx="32" cy="41.5" r="6" />
      <circle cx="22.5" cy="32" r="6" />
      <circle cx="32" cy="32" r="3" fill="currentColor" stroke="none" />
    </>
  ),
  berry: (
    <>
      <path d="M32 46.5c-7.2 0-12.3-4.6-12.3-11.2 0-5.2 4.2-9 12.3-9s12.3 3.8 12.3 9c0 6.6-5.1 11.2-12.3 11.2Z" />
      <path d="M32 26.3V21M32 22c-2.8-2.6-6-2.4-7.8-.6M32 22c2.8-2.6 6-2.4 7.8-.6" />
    </>
  ),
  party: (
    <>
      <path d="M14.5 49.5 25 27l12 12-22.5 10.5Z" />
      <path d="M30 20.5c.2-2.4 1.9-4 4.2-4M40 12l1 3M46 22l3-1M43 30l3 1.5M33 11l.5 3" />
    </>
  ),
  skull: (
    <>
      <path d="M32 15c-9.4 0-15.5 6.2-15.5 14.4 0 4.4 1.6 7 3.2 9.2V45a3 3 0 0 0 3 3h18.6a3 3 0 0 0 3-3v-6.4c1.6-2.2 3.2-4.8 3.2-9.2C47.5 21.2 41.4 15 32 15Z" />
      <circle cx="25" cy="31" r="3.6" fill="currentColor" stroke="none" />
      <circle cx="39" cy="31" r="3.6" fill="currentColor" stroke="none" />
      <path d="M32 36.5 30 40h4l-2-3.5Z" fill="currentColor" stroke="none" />
      <path d="M27.5 42v3M36.5 42v3" />
    </>
  ),
  alien: (
    <>
      <path d="M32 15c-8.6 0-14 6.6-14 15.5 0 6.6 4.3 12.4 14 17.5 9.7-5.1 14-10.9 14-17.5C46 21.6 40.6 15 32 15Z" />
      <ellipse cx="26" cy="31" rx="4.4" ry="5.6" fill="currentColor" stroke="none" />
      <ellipse cx="38" cy="31" rx="4.4" ry="5.6" fill="currentColor" stroke="none" />
    </>
  ),
  gem: (
    <>
      <path d="M22 21h20l6 8.5L32 49 16 29.5Z" />
      <path d="M16 29.5h32" />
      <path d="M26.5 21 24 29.5 32 49" />
      <path d="M37.5 21 40 29.5 32 49" />
    </>
  ),
  moon: <path d="M42 17a16 16 0 1 0 0 30 13 13 0 0 1 0-30Z" />,
  cool: (
    <>
      <circle cx="32" cy="33" r="15" />
      <rect x="21" y="28" width="10" height="7" rx="3.2" fill="currentColor" stroke="none" />
      <rect x="33" y="28" width="10" height="7" rx="3.2" fill="currentColor" stroke="none" />
      <path d="M31 30.5h2" />
      <path d="M25 40.5c2.6 3.2 11.4 3.2 14 0" />
    </>
  ),
  crown: (
    <>
      <path d="M15 42.5 12.5 23l9 7L32 15.5 42.5 30l9-7L49 42.5Z" />
      <path d="M15 42.5h34" />
    </>
  ),
  glow: (
    <>
      <path d="M32 12.5l4.2 15.3 15.3 4.2-15.3 4.2L32 51.5l-4.2-15.3L12.5 32l15.3-4.2Z" />
      <path d="M45 13.5l1.3 3.7 3.7 1.3-3.7 1.3L45 23.5l-1.3-3.7-3.7-1.3 3.7-1.3Z" />
    </>
  ),
  rocket: (
    <>
      <path d="M32 14c6 4.2 9 10.4 9 17.6L38 38H26l-3-6.4C23 24.4 26 18.2 32 14Z" />
      <circle cx="32" cy="27" r="3.4" />
      <path d="M26 38l-5.5 6.5M38 38l5.5 6.5" />
      <path d="M32 38v7" />
    </>
  ),
  rainbow: (
    <>
      <path d="M13 44a19 19 0 0 1 38 0" />
      <path d="M20 44a12 12 0 0 1 24 0" />
      <path d="M27 44a5 5 0 0 1 10 0" />
    </>
  ),
};

/** Старые эмодзи из уже сохранённых сообщений показываем новыми стикерами. */
const EMOJI_TO_ID: Record<string, string> = {
  "🔥": "fire",
  "⭐": "star",
  "👍": "like",
  "❤️": "love",
  "❤": "love",
  "😂": "laugh",
  "😭": "cry",
  "😢": "sad",
  "😍": "love",
  "🤯": "wow",
  "😮": "wow",
  "🦄": "flower",
  "🍓": "berry",
  "🎉": "party",
  "💀": "skull",
  "👾": "alien",
  "💎": "gem",
  "🌚": "moon",
  "✌️": "cool",
  "👑": "crown",
  "🌟": "glow",
  "🚀": "rocket",
  "🌈": "rainbow",
  "👏": "party",
};

function resolveId(id: string): string {
  return EMOJI_TO_ID[id] ?? id;
}

export function stickerLabel(id: string): string {
  return STICKERS[resolveId(id)]?.label ?? id;
}

/** Стикер: цветная подложка + белый фирменный глиф. */
export function Sticker({
  id,
  size = 76,
  className,
}: {
  id: string;
  size?: number;
  className?: string;
}) {
  const key = resolveId(id);
  const def = STICKERS[key];
  if (!def) {
    return (
      <span className={className} style={{ fontSize: size * 0.8, lineHeight: 1 }}>
        {id}
      </span>
    );
  }
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={def.label}
    >
      <rect x="3" y="3" width="58" height="58" rx="17" fill={def.color} />
      <g
        style={{ color: "#fff" }}
        fill="none"
        stroke="currentColor"
        strokeWidth={3.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {GLYPHS[key]}
      </g>
    </svg>
  );
}

/** Монохромный глиф стикера — для реакций и иконок интерфейса. */
export function GlyphIcon({
  id,
  size = 18,
  className,
}: {
  id: string;
  size?: number;
  className?: string;
}) {
  const key = resolveId(id);
  const glyph = GLYPHS[key];
  if (!glyph) {
    return (
      <span className={className} style={{ fontSize: size, lineHeight: 1 }}>
        {id}
      </span>
    );
  }
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth={4.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {glyph}
    </svg>
  );
}
