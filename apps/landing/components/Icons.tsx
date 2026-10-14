import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;

const base = (p: P): P => ({
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  ...p,
});

export function LogoMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 2 3 6.5v11L12 22l9-4.5v-11L12 2Z"
        stroke="#04121f"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M12 6.5 7 9v6l5 2.5 5-2.5V9l-5-2.5Z"
        fill="#04121f"
        opacity="0.85"
      />
    </svg>
  );
}

export function Download(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M12 3v12" />
      <path d="m7 11 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

export function ArrowRight(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

export function Play(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M6 4.5 19 12 6 19.5v-15Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function Plus(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/* платформы */
export function Windows(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M3 6.2 10.5 5v6.2H3V6.2Z" fill="currentColor" stroke="none" />
      <path d="M12 4.8 21 3.4v7.8h-9V4.8Z" fill="currentColor" stroke="none" />
      <path d="M3 12.8h7.5V19L3 17.8v-5Z" fill="currentColor" stroke="none" />
      <path d="M12 12.8h9v7.8L12 19.2v-6.4Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function Apple(p: P) {
  return (
    <svg {...base(p)}>
      <path
        d="M16.4 12.9c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.8-3.5.8-.7 0-1.8-.8-3-.8-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.2 0 2-1.1 2.8-2.2.9-1.3 1.3-2.5 1.3-2.6-.1 0-2.5-1-2.5-3.8Z"
        fill="currentColor"
        stroke="none"
      />
      <path
        d="M14.3 5.9c.6-.8 1-1.8.9-2.9-.9.1-1.9.6-2.5 1.4-.6.7-1 1.7-.9 2.7 1 .1 1.9-.4 2.5-1.2Z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

export function Linux(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M9 3.5c0-1.1.9-2 2-2s2 .9 2 2v1.2c0 .8.4 1.5 1 1.9 1.5 1 2.3 2.9 2.3 5v6.9c0 .8-.6 1.5-1.4 1.6-1.9.4-4.3.4-6.2 0-.8-.1-1.4-.8-1.4-1.6V11.5c0-2.1.8-4 2.3-5 .6-.4 1-.9 1-1.9V3.5Z" />
      <circle cx="9.6" cy="5" r=".6" fill="currentColor" stroke="none" />
      <circle cx="12.4" cy="5" r=".6" fill="currentColor" stroke="none" />
      <path d="M10.4 8.5 11 9.7l1.6-1.2" />
    </svg>
  );
}

export function Android(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M4 10.5c0-3.6 3.6-6.5 8-6.5s8 2.9 8 6.5v3c0 2.2-3.6 4-8 4s-8-1.8-8-4v-3Z" />
      <path d="m6.5 3.8 1.4 2.3M17.5 3.8l-1.4 2.3" />
      <circle cx="9.3" cy="9.5" r=".7" fill="currentColor" stroke="none" />
      <circle cx="14.7" cy="9.5" r=".7" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function Phone(p: P) {
  return (
    <svg {...base(p)}>
      <rect x="6" y="2.5" width="12" height="19" rx="3" />
      <path d="M11 5.5h2" />
      <path d="M11.5 18.5h1" />
    </svg>
  );
}

/* возможности */
export function Bolt(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
    </svg>
  );
}

export function Lock(p: P) {
  return (
    <svg {...base(p)}>
      <rect x="4.5" y="10" width="15" height="10" rx="2.5" />
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
      <path d="M12 14v2.5" />
    </svg>
  );
}

export function Folder(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h3.2c.7 0 1.3.3 1.8.8l1 1.2h6A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-12A2.5 2.5 0 0 1 3 16.5v-10Z" />
    </svg>
  );
}

export function Users(p: P) {
  return (
    <svg {...base(p)}>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3.5 20c0-3.1 2.5-5.5 5.5-5.5s5.5 2.4 5.5 5.5" />
      <path d="M16 5.6a3.2 3.2 0 0 1 0 6M17.5 14.9c1.8.7 3 2.4 3 4.3" />
    </svg>
  );
}

export function Bot(p: P) {
  return (
    <svg {...base(p)}>
      <rect x="4" y="8" width="16" height="11" rx="3" />
      <path d="M12 4.5V8M9 3.5h6" />
      <circle cx="9" cy="13" r=".9" fill="currentColor" stroke="none" />
      <circle cx="15" cy="13" r=".9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function Devices(p: P) {
  return (
    <svg {...base(p)}>
      <rect x="2.5" y="5" width="13" height="9.5" rx="2" />
      <path d="M6 18h6" />
      <rect x="17" y="9" width="4.5" height="10" rx="1.5" />
    </svg>
  );
}

export function Sparkles(p: P) {
  return (
    <svg {...base(p)}>
      <path d="m12 3 1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3Z" />
      <path d="M18.5 15.5 19.4 18l2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9.9-2.5Z" />
    </svg>
  );
}

export function Shield(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M12 3 5 5.5v5.2c0 4.2 2.9 7.9 7 9.3 4.1-1.4 7-5.1 7-9.3V5.5L12 3Z" />
      <path d="m9.2 12 2 2 3.6-3.7" />
    </svg>
  );
}

export function Github(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M9 19c-4 1.3-4-2.1-6-2.5m12 5v-3.6c0-1 .1-1.4-.5-2 2.3-.3 4.5-1.1 4.5-5.1a4 4 0 0 0-1.1-2.8c.1-.3.5-1.3-.1-2.7 0 0-.9-.3-3 1.1a10.4 10.4 0 0 0-5.6 0C7.1 2.9 6.2 3.2 6.2 3.2c-.6 1.4-.2 2.4-.1 2.7A4 4 0 0 0 5 8.7c0 4 2.2 4.8 4.5 5.1-.5.6-.5 1.1-.5 2V19" />
    </svg>
  );
}

export function Check(p: P) {
  return (
    <svg {...base(p)}>
      <path d="m5 12.5 4.5 4.5L19 7" />
    </svg>
  );
}

export function CheckDouble(p: P) {
  return (
    <svg {...base(p)}>
      <path d="m2.5 12.5 3.8 3.8L14.5 8" />
      <path d="m10.5 15.5 1.8 1.8L21 9" />
    </svg>
  );
}

/* ------------------------- интерфейс чата ------------------------- */

export function Close(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </svg>
  );
}

export function Reply(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M20 20v-5.5a5 5 0 0 0-5-5H5.5" />
      <path d="m10 4.5-5 5 5 5" />
    </svg>
  );
}

export function Forward(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M14 4.5l5.5 5.5L14 15.5" />
      <path d="M19.5 10H10a5 5 0 0 0-5 5v5" />
    </svg>
  );
}

export function Edit(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M4 20h4L19.2 8.8a2.8 2.8 0 0 0-4-4L4 16v4Z" />
      <path d="m14 6 4 4" />
    </svg>
  );
}

export function Trash(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M4 7h16" />
      <path d="M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7" />
      <path d="M6 7l1 12.8a1.2 1.2 0 0 0 1.2 1.2h7.6a1.2 1.2 0 0 0 1.2-1.2L18 7" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

export function Paperclip(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M20 11.5 12 19.5a5 5 0 0 1-7-7l8.6-8.6a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9" />
    </svg>
  );
}

export function Smile(p: P) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" />
      <path d="M9 9.5h.01M15 9.5h.01" />
    </svg>
  );
}

export function Photo(p: P) {
  return (
    <svg {...base(p)}>
      <rect x="3" y="4.5" width="18" height="15" rx="3" />
      <circle cx="8.5" cy="10" r="1.6" />
      <path d="m4.5 17 4.5-4.5L12.5 16l3-3 4 4" />
    </svg>
  );
}

export function Star(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M12 3.5l2.7 5.5 6 .9-4.3 4.2 1 6-5.4-2.8-5.4 2.8 1-6L3.3 9.9l6-.9Z" />
    </svg>
  );
}

export function Megaphone(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M4 10.2v3.6a1 1 0 0 0 1 1h2.2l7.8 4V5.2L7.2 9.2H5a1 1 0 0 0-1 1Z" />
      <path d="M18.2 9.5a4 4 0 0 1 0 5M8.6 15v4.2" />
    </svg>
  );
}

export function Crown(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M3.5 18.5 2.5 8l4.8 3.3L12 4.8l4.7 6.5L21.5 8l-1 10.5Z" />
      <path d="M4 18.5h16" />
    </svg>
  );
}

export function Ban(p: P) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="9" />
      <path d="m6.3 6.3 11.4 11.4" />
    </svg>
  );
}

export function Unlock(p: P) {
  return (
    <svg {...base(p)}>
      <rect x="4.5" y="10" width="15" height="10" rx="2.5" />
      <path d="M8 10V7.5a4 4 0 0 1 7.6-1.7" />
      <path d="M12 14v2.5" />
    </svg>
  );
}

export function Search(p: P) {
  return (
    <svg {...base(p)}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-3.8-3.8" />
    </svg>
  );
}

export function ChatBubble(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H5.2L3 22l1.3-3.6A8.5 8.5 0 1 1 21 11.5Z" />
      <path d="M8.5 11h.01M12 11h.01M15.5 11h.01" />
    </svg>
  );
}

export function Gear(p: P) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.1 14.2a1.5 1.5 0 0 0 .3 1.7l.1.1a1.8 1.8 0 1 1-2.6 2.6l-.1-.1a1.5 1.5 0 0 0-2.6 1.1v.3a1.8 1.8 0 1 1-3.6 0v-.2a1.5 1.5 0 0 0-2.7-1.1l-.1.1a1.8 1.8 0 1 1-2.6-2.6l.1-.1a1.5 1.5 0 0 0-1.1-2.6h-.2a1.8 1.8 0 1 1 0-3.6h.2a1.5 1.5 0 0 0 1.1-2.7l-.1-.1a1.8 1.8 0 1 1 2.6-2.6l.1.1a1.5 1.5 0 0 0 1.7.3h.1a1.5 1.5 0 0 0 .9-1.4v-.2a1.8 1.8 0 1 1 3.6 0v.2a1.5 1.5 0 0 0 2.6 1.1l.1-.1a1.8 1.8 0 1 1 2.6 2.6l-.1.1a1.5 1.5 0 0 0 1.1 2.6h.2a1.8 1.8 0 1 1 0 3.6h-.2a1.5 1.5 0 0 0-1.4.9Z" />
    </svg>
  );
}

export const platformIcons = {
  windows: Windows,
  macos: Apple,
  linux: Linux,
  android: Android,
  ios: Phone,
} as const;

export const featureIcons = {
  bolt: Bolt,
  lock: Lock,
  folder: Folder,
  phone: Phone,
  users: Users,
  bot: Bot,
  devices: Devices,
  sparkles: Sparkles,
  star: Star,
  smile: Smile,
  shield: Shield,
  search: Search,
  reply: Reply,
  chat: ChatBubble,
  crown: Crown,
} as const;
