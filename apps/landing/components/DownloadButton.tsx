"use client";

import { useEffect, useMemo, useState } from "react";
import { releases, type PlatformId } from "@/lib/site";
import { Download, platformIcons } from "./Icons";

function detectOS(): PlatformId | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent.toLowerCase();
  const platform = (navigator as unknown as { userAgentData?: { platform?: string } })
    .userAgentData?.platform
    ?.toLowerCase();

  const hay = `${ua} ${platform ?? ""}`;
  if (/android/.test(hay)) return "android";
  if (/iphone|ipad|ipod|ios/.test(hay)) return "ios";
  if (/mac/.test(hay)) return "macos";
  if (/win/.test(hay)) return "windows";
  if (/linux|x11/.test(hay)) return "linux";
  return null;
}

export function DownloadButton({
  size = "lg",
  showDropdown = true,
}: {
  size?: "lg" | "sm";
  showDropdown?: boolean;
}) {
  const [os, setOs] = useState<PlatformId | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOs(detectOS());
  }, []);

  const current = useMemo(
    () => releases.find((r) => r.id === os) ?? releases[0],
    [os]
  );

  const available = current.href !== "#" && current.size !== "Скоро";
  const label =
    os === null
      ? "Скачать"
      : available
        ? `Скачать для ${current.name}`
        : `Скоро для ${current.name}`;

  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <a
        className={`btn btn-primary ${size === "lg" ? "btn-lg" : ""} ${
          available ? "" : "is-soon"
        }`}
        href={current.href}
        aria-disabled={!available}
        onClick={(event) => {
          if (!available) event.preventDefault();
        }}
        style={{ marginRight: showDropdown ? 8 : 0 }}
      >
        <Download width={20} height={20} />
        {label}
      </a>

      {showDropdown && (
        <>
          <button
            className={`btn btn-primary ${size === "lg" ? "btn-lg" : ""}`}
            style={{ paddingLeft: 14, paddingRight: 14 }}
            aria-label="Выбрать платформу"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="m6 9 6 6 6-6"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          {open && (
            <div
              onMouseLeave={() => setOpen(false)}
              style={{
                position: "absolute",
                top: "calc(100% + 10px)",
                left: 0,
                minWidth: 248,
                zIndex: 60,
                padding: 8,
                borderRadius: 16,
                border: "1px solid var(--border-strong)",
                background: "rgba(10,14,26,0.97)",
                backdropFilter: "blur(18px)",
                boxShadow: "var(--shadow)",
              }}
            >
              {releases.map((r) => {
                const Icon = platformIcons[r.id];
                const soon = r.href === "#";
                return (
                  <a
                    key={r.id}
                    href={soon ? undefined : r.href}
                    aria-disabled={soon}
                    onClick={(event) => {
                      if (soon) {
                        event.preventDefault();
                        return;
                      }
                      setOpen(false);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 12px",
                      borderRadius: 11,
                      color: "var(--text)",
                      opacity: soon ? 0.45 : 1,
                      cursor: soon ? "not-allowed" : "pointer",
                    }}
                  >
                    <span style={{ color: r.accent }}>
                      <Icon width={20} height={20} />
                    </span>
                    <span style={{ fontSize: 14.5, fontWeight: 600 }}>{r.name}</span>
                    <span
                      style={{
                        marginLeft: "auto",
                        fontSize: 12.5,
                        color: "var(--muted-2)",
                      }}
                    >
                      {r.size}
                    </span>
                  </a>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
