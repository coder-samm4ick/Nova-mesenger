"use client";

// Дополнительные разделы панели владельца: аналитика, модерация, подарки,
// экономика и сервер. Вынесены из ChatApp, чтобы основной файл не разрастался.
// Каждый раздел сам грузит свои данные по токену и сообщает о результатах
// через колбэк notify.

import { useEffect, useState } from "react";

import { api } from "../../lib/api";
import type {
  AdminLog,
  AdminSession,
  BackupInfo,
  BerryTx,
  ExtendedAnalytics,
  GiftCatalogItem,
  GiftRarity,
  PromoCode,
  Report,
  ServerSettings,
  User,
} from "../../lib/chat-types";

type Notify = (kind: "ok" | "err", text: string) => void;

const RARITIES: GiftRarity[] = ["common", "rare", "epic", "legendary", "limited"];
const RARITY_LABELS: Record<GiftRarity, string> = {
  common: "обычный",
  rare: "редкий",
  epic: "эпик",
  legendary: "легенда",
  limited: "лимит",
};
const WEEK = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function errText(err: unknown, fallback = "Ошибка"): string {
  return err instanceof Error ? err.message : fallback;
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtSize(bytes: number): string {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
  if (bytes > 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${bytes} Б`;
}

/* ===================== Аналитика: DAU, воронка, карта ===================== */

export function AdminAnalytics({
  token,
  onOpenProfile,
}: {
  token: string;
  onOpenProfile: (user: User) => void;
}) {
  const [ext, setExt] = useState<ExtendedAnalytics | null>(null);
  const [top, setTop] = useState<{ userId: string; count: number; user: User }[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [e, t] = await Promise.all([
          api.adminAnalyticsExtended(token),
          api.adminAnalytics(token, 14),
        ]);
        if (!alive) return;
        setExt(e);
        setTop(t.top);
      } catch (error) {
        if (alive) setErr(errText(error, "Аналитика недоступна"));
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  if (err) return <p className="admin-msg err">{err}</p>;
  if (!ext) return <p className="admin-sub">Загружаю аналитику…</p>;

  const maxHeat = Math.max(1, ...ext.heatmap.flat());
  const funnelRows: [string, number][] = [
    ["Зарегистрировались", ext.funnel.registered],
    ["Открыли чат", ext.funnel.hasChat],
    ["Написали хотя бы раз", ext.funnel.sentAny],
    ["Пишут регулярно (5+)", ext.funnel.sent5],
    ["Оформили Premium", ext.funnel.premium],
  ];
  const base = Math.max(1, ext.funnel.registered);

  return (
    <div className="adm">
      <h4 className="adm-title">Аудитория</h4>
      <div className="admin-stats">
        {(
          [
            ["DAU", ext.totals.dau],
            ["WAU", ext.totals.wau],
            ["MAU", ext.totals.mau],
            ["Людей всего", ext.totals.users],
            ["Чатов", ext.totals.chats],
            ["Сообщений", ext.totals.messages],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="admin-stat">
            <span className="admin-stat-value">{value}</span>
            <span className="admin-stat-label">{label}</span>
          </div>
        ))}
      </div>

      <h4 className="adm-title">Воронка</h4>
      <div className="funnel">
        {funnelRows.map(([label, value]) => {
          const pct = Math.round((value / base) * 100);
          return (
            <div className="funnel-row" key={label}>
              <span className="funnel-label">{label}</span>
              <span className="funnel-track">
                <span className="funnel-bar" style={{ width: `${pct}%` }} />
              </span>
              <span className="funnel-val">
                {value} · {pct}%
              </span>
            </div>
          );
        })}
      </div>

      <h4 className="adm-title">Возвращаются после регистрации (14 дней)</h4>
      <div className="ret-bars">
        {ext.retention.map((d) => {
          const pct = d.users ? Math.round((d.returned / d.users) * 100) : 0;
          return (
            <div
              className="ret-col"
              key={d.date}
              title={`${d.date}: вернулось ${d.returned} из ${d.users}`}
            >
              <div className="ret-bar" style={{ height: `${Math.max(4, Math.min(100, pct))}%` }} />
              <span className="ret-day">{d.date.slice(8)}</span>
            </div>
          );
        })}
      </div>

      <h4 className="adm-title">Когда пишут (часы UTC)</h4>
      <div className="heat">
        {ext.heatmap.map((row, wd) => (
          <div className="heat-row" key={wd}>
            <span className="heat-day">{WEEK[wd]}</span>
            {row.map((v, h) => (
              <span
                key={h}
                className="heat-cell"
                title={`${WEEK[wd]}, ${h}:00 — сообщений: ${v}`}
                style={{
                  background: v
                    ? `rgba(94, 140, 255, ${(0.12 + 0.88 * (v / maxHeat)).toFixed(2)})`
                    : "var(--line, #26293a)",
                }}
              />
            ))}
          </div>
        ))}
        <div className="heat-row heat-hours">
          <span className="heat-day" />
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} className="heat-h">
              {h % 3 === 0 ? h : ""}
            </span>
          ))}
        </div>
      </div>

      <h4 className="adm-title">Топ по сообщениям</h4>
      <div className="admin-list">
        {top.length === 0 && <p className="admin-sub">Пока писать некому — сообщений нет.</p>}
        {top.map((t) => (
          <button
            key={t.userId}
            className="admin-row adm-link"
            onClick={() => onOpenProfile(t.user)}
          >
            <span className="admin-u-av" style={{ background: t.user.avatarColor }}>
              {t.user.displayName.slice(0, 1).toUpperCase()}
            </span>
            <span className="admin-row-main">
              <span className="admin-row-meta">
                <b>{t.user.displayName}</b> @{t.user.username}
              </span>
            </span>
            <span className="admin-balance">{t.count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ======================== Модерация: жалобы и логи ======================== */

export function AdminModeration({
  token,
  notify,
  onOpenProfile,
}: {
  token: string;
  notify: Notify;
  onOpenProfile: (user: User) => void;
}) {
  const [reports, setReports] = useState<Report[]>([]);
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [repFilter, setRepFilter] = useState<"open" | "all" | "resolved" | "dismissed">("open");
  const [blacklist, setBlacklist] = useState("");
  const [massChat, setMassChat] = useState("");
  const [massSender, setMassSender] = useState("");
  const [massHours, setMassHours] = useState("24");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try {
      const [r, l, s] = await Promise.all([
        api.adminReports(token),
        api.adminLogs(token),
        api.adminSettings(token),
      ]);
      setReports(r.reports);
      setLogs(l.logs);
      setBlacklist((s.settings.wordBlacklist ?? []).join("\n"));
      setErr(null);
    } catch (error) {
      setErr(errText(error, "Не удалось загрузить раздел"));
    }
  }

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [r, l, s] = await Promise.all([
          api.adminReports(token),
          api.adminLogs(token),
          api.adminSettings(token),
        ]);
        if (!alive) return;
        setReports(r.reports);
        setLogs(l.logs);
        setBlacklist((s.settings.wordBlacklist ?? []).join("\n"));
      } catch (error) {
        if (alive) setErr(errText(error, "Не удалось загрузить раздел"));
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  async function resolve(id: string, status: "resolved" | "dismissed") {
    setBusy(true);
    try {
      await api.adminResolveReport(token, id, status);
      setReports((list) => list.map((r) => (r.id === id ? { ...r, status } : r)));
      notify("ok", status === "resolved" ? "Жалоба принята" : "Жалоба отклонена");
      void load();
    } catch (error) {
      notify("err", errText(error));
    } finally {
      setBusy(false);
    }
  }

  async function saveBlacklist() {
    setBusy(true);
    try {
      const words = blacklist
        .split(/[\n,]+/)
        .map((w) => w.trim())
        .filter(Boolean);
      await api.adminUpdateSettings(token, { wordBlacklist: words });
      notify("ok", `Чёрный список: ${words.length} слов`);
    } catch (error) {
      notify("err", errText(error));
    } finally {
      setBusy(false);
    }
  }

  async function massDelete() {
    setBusy(true);
    try {
      const hours = Number(massHours) || 0;
      const res = await api.adminMassDelete(token, {
        chatId: massChat.trim() || undefined,
        senderId: massSender.trim() || undefined,
        before: hours > 0 ? Date.now() - hours * 3_600_000 : undefined,
      });
      notify("ok", `Удалено сообщений: ${res.removed}`);
      if (res.removed) setMassChat(""), setMassSender("");
    } catch (error) {
      notify("err", errText(error));
    } finally {
      setBusy(false);
    }
  }

  const shown = reports.filter((r) => repFilter === "all" || r.status === repFilter);

  return (
    <div className="adm">
      {err && <p className="admin-msg err">{err}</p>}

      <h4 className="adm-title">Жалобы</h4>
      <div className="admin-filters">
        {(
          [
            ["open", "Открытые"],
            ["resolved", "Принятые"],
            ["dismissed", "Отклонённые"],
            ["all", "Все"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            className={`admin-chip${repFilter === key ? " on" : ""}`}
            onClick={() => setRepFilter(key)}
          >
            {label}
            <span className="admin-chip-n">
              {key === "all" ? reports.length : reports.filter((r) => r.status === key).length}
            </span>
          </button>
        ))}
      </div>
      <div className="admin-list">
        {shown.length === 0 && <p className="admin-sub">Жалоб нет.</p>}
        {shown.map((r) => (
          <div className="admin-row adm-report" key={r.id}>
            <span className="admin-row-main">
              <span className="admin-row-meta">
                <b>
                  {r.targetType === "user"
                    ? "на пользователя"
                    : r.targetType === "message"
                      ? "на сообщение"
                      : "на чат"}
                </b>{" "}
                · {fmtDate(r.createdAt)}
                {r.status !== "open" && <em className={`adm-tag ${r.status}`}>{r.status === "resolved" ? "принята" : "отклонена"}</em>}
              </span>
              <span className="adm-report-text">{r.reason || "без причины"}</span>
              <span className="admin-row-meta adm-dim">цель: {r.targetId.slice(0, 8)}…</span>
            </span>
            <span className="admin-cell-actions">
              {r.status === "open" ? (
                <>
                  <button
                    className="admin-btn"
                    disabled={busy}
                    onClick={() => void resolve(r.id, "resolved")}
                  >
                    Принять
                  </button>
                  <button
                    className="admin-btn"
                    disabled={busy}
                    onClick={() => void resolve(r.id, "dismissed")}
                  >
                    Отклонить
                  </button>
                </>
              ) : (
                <span className="adm-tag">закрыта</span>
              )}
            </span>
          </div>
        ))}
      </div>

      <h4 className="adm-title">Чёрный список слов</h4>
      <p className="admin-sub">По одному слову в строке — сообщения с ними будут отклоняться.</p>
      <textarea
        className="adm-textarea"
        rows={4}
        value={blacklist}
        onChange={(e) => setBlacklist(e.target.value)}
        placeholder="слово1&#10;слово2"
      />
      <div className="admin-actions-row">
        <button className="admin-btn" disabled={busy} onClick={() => void saveBlacklist()}>
          Сохранить список
        </button>
      </div>

      <h4 className="adm-title">Массовое удаление сообщений</h4>
      <div className="adm-form">
        <label className="adm-field">
          <span>ID чата</span>
          <input
            className="adm-input"
            value={massChat}
            onChange={(e) => setMassChat(e.target.value)}
            placeholder="пусто = все чаты"
          />
        </label>
        <label className="adm-field">
          <span>ID автора</span>
          <input
            className="adm-input"
            value={massSender}
            onChange={(e) => setMassSender(e.target.value)}
            placeholder="пусто = любой автор"
          />
        </label>
        <label className="adm-field">
          <span>За последние часов</span>
          <input
            className="adm-input"
            value={massHours}
            onChange={(e) => setMassHours(e.target.value)}
            inputMode="numeric"
          />
        </label>
      </div>
      <div className="admin-actions-row">
        <button
          className="admin-btn btn-danger"
          disabled={busy || (!massChat.trim() && !massSender.trim())}
          onClick={() => void massDelete()}
        >
          Удалить сообщения
        </button>
      </div>

      <h4 className="adm-title">Журнал действий владельца</h4>
      <div className="admin-list">
        {logs.length === 0 && <p className="admin-sub">Журнал пуст.</p>}
        {logs.slice(0, 60).map((l) => (
          <div className="admin-row adm-log" key={l.id}>
            <span className="admin-row-main">
              <span className="admin-row-meta">
                <b>{l.action}</b>
                {l.meta ? ` — ${l.meta}` : ""}
              </span>
              <span className="admin-row-meta adm-dim">
                {l.adminName}
                {l.targetId ? ` → ${l.targetId.slice(0, 8)}…` : ""} · {fmtDate(l.createdAt)}
              </span>
            </span>
          </div>
        ))}
      </div>
      <div className="admin-actions-row">
        <button className="admin-btn" onClick={() => void load()}>
          Обновить
        </button>
      </div>
    </div>
  );
}

/* ========================== Подарки: каталог ============================== */

export function AdminGifts({ token, notify }: { token: string; notify: Notify }) {
  const [gifts, setGifts] = useState<GiftCatalogItem[]>([]);
  const [edits, setEdits] = useState<Record<string, Partial<GiftCatalogItem>>>({});
  const [form, setForm] = useState({
    name: "",
    glyph: "🎁",
    rarity: "common" as GiftRarity,
    category: "misc",
    price: "10",
    total: "0",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api.adminGifts(token);
        if (alive) setGifts(res.gifts);
      } catch (error) {
        if (alive) setErr(errText(error, "Каталог не загрузился"));
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  function setEdit(id: string, patch: Partial<GiftCatalogItem>) {
    setEdits((m) => ({ ...m, [id]: { ...m[id], ...patch } }));
  }

  async function save(gift: GiftCatalogItem) {
    setBusy(true);
    try {
      const patch = { ...edits[gift.id] };
      delete patch.id;
      delete patch.sold;
      delete patch.createdAt;
      const res = await api.adminUpdateGift(token, gift.id, patch);
      setGifts((list) => list.map((g) => (g.id === gift.id ? res.gift : g)));
      setEdits((m) => {
        const next = { ...m };
        delete next[gift.id];
        return next;
      });
      notify("ok", `«${res.gift.name}» обновлён`);
    } catch (error) {
      notify("err", errText(error));
    } finally {
      setBusy(false);
    }
  }

  async function remove(gift: GiftCatalogItem) {
    setBusy(true);
    try {
      await api.adminDeleteGift(token, gift.id);
      setGifts((list) => list.filter((g) => g.id !== gift.id));
      notify("ok", `«${gift.name}» удалён из каталога`);
    } catch (error) {
      notify("err", errText(error));
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    setBusy(true);
    try {
      const res = await api.adminCreateGift(token, {
        name: form.name.trim(),
        glyph: form.glyph.trim() || "🎁",
        rarity: form.rarity,
        category: form.category.trim() || "misc",
        price: Number(form.price) || 0,
        total: Number(form.total) || 0,
      });
      setGifts((list) => [...list, res.gift]);
      setForm({ ...form, name: "" });
      notify("ok", `Подарок «${res.gift.name}» добавлен`);
    } catch (error) {
      notify("err", errText(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="adm">
      {err && <p className="admin-msg err">{err}</p>}

      <h4 className="adm-title">Новый подарок</h4>
      <div className="adm-form">
        <label className="adm-field">
          <span>Название</span>
          <input
            className="adm-input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Уточка"
          />
        </label>
        <label className="adm-field">
          <span>Эмодзи</span>
          <input
            className="adm-input"
            value={form.glyph}
            onChange={(e) => setForm({ ...form, glyph: e.target.value })}
            maxLength={8}
          />
        </label>
        <label className="adm-field">
          <span>Редкость</span>
          <select
            className="adm-input"
            value={form.rarity}
            onChange={(e) => setForm({ ...form, rarity: e.target.value as GiftRarity })}
          >
            {RARITIES.map((r) => (
              <option key={r} value={r}>
                {RARITY_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
        <label className="adm-field">
          <span>Категория</span>
          <input
            className="adm-input"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            placeholder="misc"
          />
        </label>
        <label className="adm-field">
          <span>Цена, ★</span>
          <input
            className="adm-input"
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
            inputMode="numeric"
          />
        </label>
        <label className="adm-field">
          <span>Тираж (0 — бесконечный)</span>
          <input
            className="adm-input"
            value={form.total}
            onChange={(e) => setForm({ ...form, total: e.target.value })}
            inputMode="numeric"
          />
        </label>
      </div>
      <div className="admin-actions-row">
        <button
          className="admin-btn"
          disabled={busy || !form.name.trim()}
          onClick={() => void create()}
        >
          Добавить в каталог
        </button>
      </div>

      <h4 className="adm-title">Каталог · {gifts.length}</h4>
      <div className="admin-list">
        {gifts.map((gift) => {
          const e = edits[gift.id] ?? {};
          return (
            <div className="admin-row adm-gift" key={gift.id}>
              <span className="adm-gift-glyph">{e.glyph ?? gift.glyph}</span>
              <span className="admin-row-main">
                <input
                  className="adm-input adm-inline"
                  value={e.name ?? gift.name}
                  onChange={(ev) => setEdit(gift.id, { name: ev.target.value })}
                />
                <span className="admin-row-meta adm-dim">
                  {RARITY_LABELS[gift.rarity]} · {gift.category} · продано {gift.sold}
                  {gift.total ? ` из ${gift.total}` : ""} ·{" "}
                  {gift.active ? "в продаже" : "скрыт"}
                </span>
              </span>
              <span className="admin-cell-actions">
                <input
                  className="adm-input adm-narrow"
                  value={String(e.price ?? gift.price)}
                  onChange={(ev) => setEdit(gift.id, { price: Number(ev.target.value) || 0 })}
                  inputMode="numeric"
                  title="Цена"
                />
                <button className="admin-btn" disabled={busy} onClick={() => void save(gift)}>
                  Сохранить
                </button>
                <button
                  className={`admin-btn${gift.active ? " on" : ""}`}
                  disabled={busy}
                  onClick={() => void save({ ...gift, active: !gift.active })}
                  title="В продаже / скрыт"
                >
                  {gift.active ? "Скрыть" : "Показать"}
                </button>
                <button
                  className="admin-btn btn-danger"
                  disabled={busy}
                  onClick={() => void remove(gift)}
                >
                  Удалить
                </button>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================ Экономика ================================== */

export function AdminEconomy({
  token,
  notify,
  onOpenProfile,
}: {
  token: string;
  notify: Notify;
  onOpenProfile: (user: User) => void;
}) {
  const [total, setTotal] = useState(0);
  const [tx, setTx] = useState<BerryTx[]>([]);
  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [rewardAll, setRewardAll] = useState(false);
  const [rewardAmount, setRewardAmount] = useState("50");
  const [rewardReason, setRewardReason] = useState("");
  const [promoForm, setPromoForm] = useState({ code: "", berries: "100", maxUses: "100" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [e, p] = await Promise.all([api.adminEconomy(token), api.adminPromos(token)]);
        if (!alive) return;
        setTotal(e.total);
        setTx(e.transactions);
        setPromos(p.promos);
        // подтягиваем имена участников переводов
        const ids = Array.from(
          new Set(
            e.transactions
              .flatMap((t) => [t.fromId, t.toId])
              .filter(Boolean)
          )
        ).slice(0, 30);
        const map: Record<string, string> = {};
        await Promise.all(
          ids.map(async (id) => {
            try {
              const prof = await api.userProfile(token, id);
              map[id] = prof.user.displayName;
            } catch {
              map[id] = id.slice(0, 8);
            }
          })
        );
        if (alive) setNames(map);
      } catch (error) {
        if (alive) setErr(errText(error, "Экономика не загрузилась"));
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  async function massReward() {
    setBusy(true);
    try {
      const amount = Math.trunc(Number(rewardAmount) || 0);
      if (!amount) throw new Error("Сумма не может быть нулевой");
      const res = await api.adminRewardsMass(token, {
        all: rewardAll,
        amount,
        reason: rewardReason.trim() || undefined,
      });
      notify("ok", `${amount > 0 ? "Начислено" : "Списано"} ${res.amount} ★ ${res.updated} получателям`);
    } catch (error) {
      notify("err", errText(error));
    } finally {
      setBusy(false);
    }
  }

  async function createPromo() {
    setBusy(true);
    try {
      const res = await api.adminCreatePromo(token, {
        code: promoForm.code.trim(),
        berries: Number(promoForm.berries) || 0,
        maxUses: Number(promoForm.maxUses) || 0,
      });
      setPromos((list) => [res.promo, ...list]);
      setPromoForm({ ...promoForm, code: "" });
      notify("ok", `Промокод ${res.promo.code} создан`);
    } catch (error) {
      notify("err", errText(error));
    } finally {
      setBusy(false);
    }
  }

  async function togglePromo(promo: PromoCode) {
    try {
      const res = await api.adminUpdatePromo(token, promo.code, !promo.active);
      setPromos((list) => list.map((p) => (p.code === promo.code ? res.promo : p)));
    } catch (error) {
      notify("err", errText(error));
    }
  }

  return (
    <div className="adm">
      {err && <p className="admin-msg err">{err}</p>}

      <div className="admin-stats">
        <div className="admin-stat">
          <span className="admin-stat-value">★ {total}</span>
          <span className="admin-stat-label">Звёзд в обращении</span>
        </div>
        <div className="admin-stat">
          <span className="admin-stat-value">{tx.length}</span>
          <span className="admin-stat-label">Переводов в журнале</span>
        </div>
        <div className="admin-stat">
          <span className="admin-stat-value">{promos.length}</span>
          <span className="admin-stat-label">Промокодов</span>
        </div>
      </div>

      <h4 className="adm-title">Массовое начисление звёзд</h4>
      <div className="adm-form">
        <label className="adm-field">
          <span>Сумма (− для списания)</span>
          <input
            className="adm-input"
            value={rewardAmount}
            onChange={(e) => setRewardAmount(e.target.value)}
            inputMode="numeric"
          />
        </label>
        <label className="adm-field">
          <span>Причина (в журнал)</span>
          <input
            className="adm-input"
            value={rewardReason}
            onChange={(e) => setRewardReason(e.target.value)}
            placeholder="новогодний подарок"
          />
        </label>
        <label className="adm-check">
          <input
            type="checkbox"
            checked={rewardAll}
            onChange={(e) => setRewardAll(e.target.checked)}
          />
          Выдать всем пользователям
        </label>
      </div>
      <div className="admin-actions-row">
        <button
          className="admin-btn"
          disabled={busy || !rewardAll}
          title={!rewardAll ? "Отметь «всем пользователям»" : ""}
          onClick={() => void massReward()}
        >
          Выполнить
        </button>
      </div>

      <h4 className="adm-title">Промокоды</h4>
      <div className="adm-form">
        <label className="adm-field">
          <span>Код</span>
          <input
            className="adm-input"
            value={promoForm.code}
            onChange={(e) => setPromoForm({ ...promoForm, code: e.target.value })}
            placeholder="NOVA2026"
          />
        </label>
        <label className="adm-field">
          <span>Звёзд</span>
          <input
            className="adm-input"
            value={promoForm.berries}
            onChange={(e) => setPromoForm({ ...promoForm, berries: e.target.value })}
            inputMode="numeric"
          />
        </label>
        <label className="adm-field">
          <span>Активаций</span>
          <input
            className="adm-input"
            value={promoForm.maxUses}
            onChange={(e) => setPromoForm({ ...promoForm, maxUses: e.target.value })}
            inputMode="numeric"
          />
        </label>
      </div>
      <div className="admin-actions-row">
        <button
          className="admin-btn"
          disabled={busy || !promoForm.code.trim()}
          onClick={() => void createPromo()}
        >
          Создать промокод
        </button>
      </div>
      <div className="admin-list">
        {promos.length === 0 && <p className="admin-sub">Промокодов пока нет.</p>}
        {promos.map((p) => (
          <div className="admin-row" key={p.code}>
            <span className="admin-row-main">
              <span className="admin-row-meta">
                <b>{p.code}</b> · ★ {p.berries} · {p.uses}/{p.maxUses || "∞"}
              </span>
              <span className="admin-row-meta adm-dim">
                {p.active ? "активен" : "выключен"}
                {p.expiresAt ? ` до ${fmtDate(p.expiresAt)}` : ""}
              </span>
            </span>
            <span className="admin-cell-actions">
              <button className="admin-btn" onClick={() => void togglePromo(p)}>
                {p.active ? "Выключить" : "Включить"}
              </button>
            </span>
          </div>
        ))}
      </div>

      <h4 className="adm-title">Последние переводы</h4>
      <div className="admin-list">
        {tx.length === 0 && <p className="admin-sub">Переводов пока нет.</p>}
        {tx.slice(0, 40).map((t) => (
          <div className="admin-row" key={t.id}>
            <span className="admin-row-main">
              <span className="admin-row-meta">
                <b>{names[t.fromId] ?? t.fromId.slice(0, 8)}</b> →{" "}
                <b>{names[t.toId] ?? t.toId.slice(0, 8)}</b>
              </span>
              <span className="admin-row-meta adm-dim">
                {t.note ? `${t.note} · ` : ""}
                {fmtDate(t.createdAt)}
              </span>
            </span>
            <span className="admin-balance">★ {t.amount}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================ Сервер ==================================== */

export function AdminServer({ token, notify }: { token: string; notify: Notify }) {
  const [settings, setSettings] = useState<ServerSettings | null>(null);
  const [blacklist, setBlacklist] = useState("");
  const [links, setLinks] = useState("");
  const [ips, setIps] = useState("");
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [s, b] = await Promise.all([api.adminSettings(token), api.adminBackups(token)]);
        if (!alive) return;
        setSettings(s.settings);
        setBlacklist((s.settings.wordBlacklist ?? []).join("\n"));
        setLinks((s.settings.linkWhitelist ?? []).join("\n"));
        setIps((s.settings.bannedIps ?? []).join("\n"));
        setBackups(b.backups);
      } catch (error) {
        notify("err", errText(error, "Настройки не загрузились"));
      }
    })();
    return () => {
      alive = false;
    };
  }, [token, notify]);

  const list = (text: string) =>
    text
      .split(/[\n,]+/)
      .map((v) => v.trim())
      .filter(Boolean);

  async function save() {
    if (!settings) return;
    setBusy(true);
    try {
      const res = await api.adminUpdateSettings(token, {
        registrationOpen: settings.registrationOpen,
        rateLimitPerMin: Number(settings.rateLimitPerMin) || 30,
        wordBlacklist: list(blacklist),
        linkWhitelist: list(links),
        bannedIps: list(ips),
        features: settings.features ?? {},
      });
      setSettings(res.settings);
      notify("ok", "Настройки сервера сохранены");
    } catch (error) {
      notify("err", errText(error));
    } finally {
      setBusy(false);
    }
  }

  async function makeBackup() {
    setBusy(true);
    try {
      const res = await api.adminBackupCreate(token);
      setBackups((b) => [{ ...res.backup, createdAt: Date.now() }, ...b]);
      notify("ok", `Бэкап создан: ${res.backup.name}`);
    } catch (error) {
      notify("err", errText(error));
    } finally {
      setBusy(false);
    }
  }

  async function restore(name: string) {
    setBusy(true);
    try {
      await api.adminBackupRestore(token, name);
      notify("ok", `База восстановлена из ${name}. Перезайди, чтобы увидеть данные.`);
      setConfirmRestore(null);
    } catch (error) {
      notify("err", errText(error));
    } finally {
      setBusy(false);
    }
  }

  async function clearCache() {
    setBusy(true);
    try {
      const res = await api.adminCacheClear(token);
      notify("ok", `Сброшено счётчиков лимитов: ${res.cleared}`);
    } catch (error) {
      notify("err", errText(error));
    } finally {
      setBusy(false);
    }
  }

  async function download(format: "csv" | "json") {
    setBusy(true);
    try {
      const text = await api.adminExportText(token, format);
      const blob = new Blob([text], {
        type: format === "csv" ? "text/csv;charset=utf-8" : "application/json;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nova-users.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      notify("ok", `Выгрузка ${format.toUpperCase()} скачана`);
    } catch (error) {
      notify("err", errText(error));
    } finally {
      setBusy(false);
    }
  }

  if (!settings) return <p className="admin-sub">Загружаю настройки…</p>;

  return (
    <div className="adm">
      <h4 className="adm-title">Правила сервера</h4>
      <label className="adm-check">
        <input
          type="checkbox"
          checked={settings.registrationOpen}
          onChange={(e) => setSettings({ ...settings, registrationOpen: e.target.checked })}
        />
        Открыта регистрация новых пользователей
      </label>
      <div className="adm-form">
        <label className="adm-field">
          <span>Сообщений в минуту (лимит)</span>
          <input
            className="adm-input"
            value={String(settings.rateLimitPerMin)}
            onChange={(e) =>
              setSettings({ ...settings, rateLimitPerMin: Number(e.target.value) || 0 })
            }
            inputMode="numeric"
          />
        </label>
      </div>

      <h4 className="adm-title">Ссылки: белый список</h4>
      <p className="admin-sub">
        По одному домену в строке. Если список пуст — ссылки разрешены все.
      </p>
      <textarea
        className="adm-textarea"
        rows={3}
        value={links}
        onChange={(e) => setLinks(e.target.value)}
        placeholder="github.com&#10;t.me"
      />

      <h4 className="adm-title">Заблокированные IP</h4>
      <p className="admin-sub">Один IP в строке — вход и отправка с них будут закрыты.</p>
      <textarea
        className="adm-textarea"
        rows={3}
        value={ips}
        onChange={(e) => setIps(e.target.value)}
        placeholder="1.2.3.4"
      />

      <div className="admin-actions-row">
        <button className="admin-btn" disabled={busy} onClick={() => void save()}>
          Сохранить настройки
        </button>
      </div>

      <h4 className="adm-title">Бэкапы базы</h4>
      <div className="admin-actions-row">
        <button className="admin-btn" disabled={busy} onClick={() => void makeBackup()}>
          Создать бэкап сейчас
        </button>
        <button className="admin-btn" disabled={busy} onClick={() => void clearCache()}>
          Сбросить лимиты
        </button>
        <button className="admin-btn" disabled={busy} onClick={() => void download("csv")}>
          Выгрузка CSV
        </button>
        <button className="admin-btn" disabled={busy} onClick={() => void download("json")}>
          Выгрузка JSON
        </button>
      </div>
      <div className="admin-list">
        {backups.length === 0 && <p className="admin-sub">Бэкапов ещё нет.</p>}
        {backups.map((b) => (
          <div className="admin-row" key={b.name}>
            <span className="admin-row-main">
              <span className="admin-row-meta">
                <b>{b.name}</b>
              </span>
              <span className="admin-row-meta adm-dim">
                {fmtSize(b.size)}
                {b.createdAt ? ` · ${fmtDate(b.createdAt)}` : ""}
              </span>
            </span>
            <span className="admin-cell-actions">
              {confirmRestore === b.name ? (
                <>
                  <button
                    className="admin-btn btn-danger on"
                    disabled={busy}
                    onClick={() => void restore(b.name)}
                  >
                    Да, восстановить
                  </button>
                  <button className="admin-btn" onClick={() => setConfirmRestore(null)}>
                    Отмена
                  </button>
                </>
              ) : (
                <button className="admin-btn" onClick={() => setConfirmRestore(b.name)}>
                  Восстановить
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================ Инструменты модерации в карточке профиля ================ */

export function AdminUserTools({
  token,
  user,
  notify,
  onChanged,
  onImpersonate,
}: {
  token: string;
  user: User;
  notify: Notify;
  onChanged: (user: User) => void;
  onImpersonate: (token: string, user: User) => void;
}) {
  const [minutes, setMinutes] = useState("60");
  const [banReason, setBanReason] = useState("");
  const [banMinutes, setBanMinutes] = useState("0");
  const [sessions, setSessions] = useState<AdminSession[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function mute(min: number) {
    setBusy(true);
    try {
      const res = await api.adminMute(token, user.id, min, min ? "из панели" : "");
      onChanged(res.user);
      notify("ok", min ? `Мут на ${min} мин: ${res.user.displayName}` : "Мут снят");
    } catch (error) {
      notify("err", errText(error));
    } finally {
      setBusy(false);
    }
  }

  async function shadowban(on: boolean) {
    setBusy(true);
    try {
      const res = await api.adminShadowban(token, user.id, on);
      onChanged(res.user);
      notify("ok", on ? "Тихий бан включён" : "Тихий бан снят");
    } catch (error) {
      notify("err", errText(error));
    } finally {
      setBusy(false);
    }
  }

  async function ban(on: boolean) {
    setBusy(true);
    try {
      const res = await api.adminBan(
        token,
        user.id,
        on,
        on ? banReason.trim() : "",
        on ? Number(banMinutes) || 0 : 0
      );
      onChanged(res.user);
      notify("ok", on ? `Аккаунт заблокирован: ${res.user.displayName}` : "Бан снят");
    } catch (error) {
      notify("err", errText(error));
    } finally {
      setBusy(false);
    }
  }

  async function loadSessions() {
    setBusy(true);
    try {
      const res = await api.adminSessions(token, user.id);
      setSessions(res.sessions);
    } catch (error) {
      notify("err", errText(error));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(sessionToken: string) {
    try {
      await api.adminRevokeSession(token, user.id, sessionToken);
      setSessions((list) => (list ?? []).filter((s) => s.token !== sessionToken));
      notify("ok", "Сессия отозвана");
    } catch (error) {
      notify("err", errText(error));
    }
  }

  async function logoutAll() {
    setBusy(true);
    try {
      await api.adminLogoutAll(token, user.id);
      setSessions([]);
      notify("ok", "Пользователь выведен со всех устройств");
    } catch (error) {
      notify("err", errText(error));
    } finally {
      setBusy(false);
    }
  }

  async function impersonate() {
    setBusy(true);
    try {
      const res = await api.adminImpersonate(token, user.id);
      onImpersonate(res.token, res.user);
    } catch (error) {
      notify("err", errText(error));
    } finally {
      setBusy(false);
    }
  }

  const muted = Boolean(user.mutedUntil && user.mutedUntil > Date.now());

  return (
    <div className="adm adm-tools">
      <h4 className="adm-title">Модерация</h4>
      <div className="adm-form">
        <label className="adm-field">
          <span>Мут, минут (0 — навсегда)</span>
          <input
            className="adm-input"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            inputMode="numeric"
          />
        </label>
      </div>
      <div className="admin-actions-row">
        <button className="admin-btn" disabled={busy} onClick={() => void mute(Number(minutes) || 0)}>
          {muted ? "Продлить мут" : "Уткнуть мут"}
        </button>
        <button className="admin-btn" disabled={busy || !muted} onClick={() => void mute(0)}>
          Снять мут
        </button>
        <button
          className={`admin-btn${user.shadowBanned ? " on" : ""}`}
          disabled={busy}
          onClick={() => void shadowban(!user.shadowBanned)}
          title="Сообщения не доходят до других"
        >
          {user.shadowBanned ? "Тихий бан: вкл" : "Тихий бан: выкл"}
        </button>
      </div>

      <h4 className="adm-title">Бан</h4>
      <div className="adm-form">
        <label className="adm-field">
          <span>Причина</span>
          <input
            className="adm-input"
            value={banReason}
            onChange={(e) => setBanReason(e.target.value)}
            placeholder="спам"
          />
        </label>
        <label className="adm-field">
          <span>Срок, минут (0 — бессрочно)</span>
          <input
            className="adm-input"
            value={banMinutes}
            onChange={(e) => setBanMinutes(e.target.value)}
            inputMode="numeric"
          />
        </label>
      </div>
      <div className="admin-actions-row">
        <button
          className={`admin-btn ${user.isBanned ? "" : "btn-danger"}`}
          disabled={busy}
          onClick={() => void ban(!user.isBanned)}
        >
          {user.isBanned ? "Снять бан" : "Забанить"}
        </button>
      </div>

      <h4 className="adm-title">Сессии и вход</h4>
      <div className="admin-actions-row">
        <button className="admin-btn" disabled={busy} onClick={() => void loadSessions()}>
          Показать сессии
        </button>
        <button className="admin-btn" disabled={busy} onClick={() => void logoutAll()}>
          Выйти со всех устройств
        </button>
        <button
          className="admin-btn"
          disabled={busy}
          title="Открыть мессенджер глазами этого пользователя"
          onClick={() => void impersonate()}
        >
          Войти как пользователь
        </button>
      </div>
      {sessions && (
        <div className="admin-list">
          {sessions.length === 0 && <p className="admin-sub">Активных сессий нет.</p>}
          {sessions.map((s) => (
            <div className="admin-row" key={s.token}>
              <span className="admin-row-main">
                <span className="admin-row-meta">{fmtDate(s.createdAt)}</span>
                <span className="admin-row-meta adm-dim">
                  {s.ip || "ip неизвестен"} · {s.ua ? s.ua.slice(0, 60) : "браузер неизвестен"}
                </span>
              </span>
              <span className="admin-cell-actions">
                <button className="admin-btn" onClick={() => void revoke(s.token)}>
                  Завершить
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {user.mutedUntil && user.mutedUntil > Date.now() && (
        <p className="admin-sub">Мут до {fmtDate(user.mutedUntil)}</p>
      )}
      {user.bannedUntil && user.bannedUntil > Date.now() && (
        <p className="admin-sub">Бан до {fmtDate(user.bannedUntil)}</p>
      )}
    </div>
  );
}
