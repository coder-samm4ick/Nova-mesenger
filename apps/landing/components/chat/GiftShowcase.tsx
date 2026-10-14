"use client";

import { useEffect, useState } from "react";
import { GlyphIcon } from "@/components/Stickers";
import { api } from "@/lib/api";
import type { CollectorInfo, User, UserGift } from "@/lib/chat-types";

/** Цвет рамки по редкости подарка. */
const RARITY: Record<string, { ring: string; glow: string; label: string }> = {
  common: { ring: "rgba(150,160,180,.5)", glow: "rgba(150,160,180,.25)", label: "обычный" },
  rare: { ring: "rgba(47,168,255,.7)", glow: "rgba(47,168,255,.4)", label: "редкий" },
  epic: { ring: "rgba(155,108,255,.8)", glow: "rgba(155,108,255,.45)", label: "эпический" },
  legendary: { ring: "rgba(255,196,64,.9)", glow: "rgba(255,196,64,.5)", label: "легендарный" },
  limited: { ring: "rgba(255,90,150,.9)", glow: "rgba(255,90,150,.5)", label: "лимитированный" },
};

const UNPACK_KEY = "nova.gifts.seen";

/**
 * Витрина подарков на странице профиля: топ-3 крупно + карусель остальных,
 * цвет рамки по редкости, серийники, уровень коллекционера и счётчик.
 */
export function GiftShowcase({ token, user }: { token: string; user: User }) {
  const [gifts, setGifts] = useState<UserGift[]>([]);
  const [collector, setCollector] = useState<CollectorInfo | null>(null);
  const [expandAll, setExpandAll] = useState(false);
  const [open, setOpen] = useState<UserGift | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .userGifts(token, user.id)
      .then((res) => {
        if (!alive) return;
        setGifts(res.gifts);
        setCollector(res.collector);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [token, user.id]);

  if (gifts.length === 0) return null;

  const top = gifts.slice(0, 3);
  const rest = gifts.slice(3);

  return (
    <div className="gifts-section">
      <div className="gifts-head">
        <span className="gifts-title">
          <GlyphIcon id="star" size={14} /> Подарки · {gifts.length}
        </span>
        {collector && (
          <span className="collector-badge" title={`Всего ценность: ${collector.totalValue}`}>
            Ур. коллекционера {collector.level}
            <i>до след. {collector.nextIn}</i>
          </span>
        )}
      </div>

      <div className="gifts-top">
        {top.map((g) => (
          <button
            key={g.serial}
            className="gift-card big"
            style={{
              borderColor: RARITY[g.rarity]?.ring,
              boxShadow: `0 14px 34px -18px ${RARITY[g.rarity]?.glow}, inset 0 0 0 1px ${RARITY[g.rarity]?.ring}`,
            }}
            onClick={() => setOpen(g)}
          >
            <span className="gift-glyph">{g.glyph}</span>
            <span className="gift-name">{g.name}</span>
            <span className="gift-serial">#{String(g.serial).padStart(4, "0")}</span>
            <span className="gift-from">
              от {g.fromId ? g.fromName : "анонима"}
            </span>
          </button>
        ))}
      </div>

      {rest.length > 0 && (
        <>
          <div className={`gifts-grid${expandAll ? " open" : ""}`}>
            {rest.map((g) => (
              <button
                key={g.serial}
                className="gift-cell"
                style={{ borderColor: RARITY[g.rarity]?.ring }}
                title={`${g.name} · ${RARITY[g.rarity]?.label} · от ${g.fromId ? g.fromName : "анонима"}`}
                onClick={() => setOpen(g)}
              >
                {g.glyph}
              </button>
            ))}
          </div>
          <button className="gifts-more" onClick={() => setExpandAll((v) => !v)}>
            {expandAll ? "Свернуть" : `Показать все (${rest.length})`}
          </button>
        </>
      )}

      {open && (
        <div className="modal-overlay" onClick={() => setOpen(null)}>
          <div
            className="modal-card gift-detail"
            style={{ borderColor: RARITY[open.rarity]?.ring }}
            onClick={(e) => e.stopPropagation()}
          >
            <span
              className="gift-detail-glyph"
              style={{ boxShadow: `0 0 60px -6px ${RARITY[open.rarity]?.glow}` }}
            >
              {open.glyph}
            </span>
            <h3>{open.name}</h3>
            <p className="gift-detail-rarity">{RARITY[open.rarity]?.label}</p>
            <p className="gift-detail-serial">Серийный № {String(open.serial).padStart(4, "0")}</p>
            <p className="gift-detail-from">
              Подарил {open.fromId ? open.fromName : "аноним"} ·{" "}
              {new Date(open.createdAt).toLocaleDateString("ru-RU")}
            </p>
            {open.note && <p className="gift-detail-note">«{open.note}»</p>}
            <button className="btn btn-ghost" onClick={() => setOpen(null)}>
              Закрыть
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
