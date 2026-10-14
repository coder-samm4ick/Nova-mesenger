"use client";

import { useState } from "react";
import { ChatBubble, Gear, Shield, Star, Check } from "@/components/Icons";

type Tab = "chats" | "settings" | "admin";

const TABS: Array<{ id: Tab; label: string; Icon: typeof ChatBubble }> = [
  { id: "chats", label: "Чаты", Icon: ChatBubble },
  { id: "settings", label: "Настройки", Icon: Gear },
  { id: "admin", label: "Админ", Icon: Shield },
];

const chats = [
  { name: "Друзья", text: "Аня: го в кино в субботу?", color: "#2fa8ff", badge: 2, active: true },
  { name: "Работа", text: "Ты: отчёт готов, смотрите", color: "#7c5cff", badge: 0, active: false },
  { name: "Nova", text: "Добро пожаловать в Nova", color: "#23e6c3", badge: 1, active: false },
  { name: "Семья", text: "Мама: не забудь позвонить", color: "#ff7ac6", badge: 0, active: false },
];

const stats: Array<[string, string]> = [
  ["128", "онлайн сейчас"],
  ["4 512", "сообщений сегодня"],
  ["36", "активных ботов"],
  ["12", "регионов"],
];

/** Интерактивная витрина вкладок приложения (Чаты / Настройки / Админ). */
export function Showcase() {
  const [tab, setTab] = useState<Tab>("chats");

  return (
    <div className="sc reveal">
      <div className="sc-frame">
        <div className="sc-bar">
          <span className="dot" style={{ background: "#ff5f57" }} />
          <span className="dot" style={{ background: "#febc2e" }} />
          <span className="dot" style={{ background: "#28c840" }} />
          <span className="sc-title">Nova — {TABS.find((t) => t.id === tab)?.label}</span>
          <span className="sc-live">● в сети</span>
        </div>

        <div className="sc-body">
          <nav className="sc-rail">
            {TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                className={`sc-tab ${tab === id ? "on" : ""}`}
                onClick={() => setTab(id)}
                type="button"
              >
                <Icon width={20} height={20} />
                <span>{label}</span>
              </button>
            ))}
          </nav>

          <div className="sc-pane" key={tab}>
            {tab === "chats" && (
              <div className="sc-chats">
                <div className="sc-list">
                  {chats.map((c) => (
                    <div key={c.name} className={`sc-row ${c.active ? "active" : ""}`}>
                      <span className="sc-ava" style={{ background: c.color }}>
                        {c.name[0]}
                      </span>
                      <span className="sc-row-text">
                        <b>{c.name}</b>
                        <i>{c.text}</i>
                      </span>
                      {c.badge > 0 && <span className="sc-badge">{c.badge}</span>}
                    </div>
                  ))}
                </div>
                <div className="sc-thread">
                  <div className="bubble in">Привет! Как прошла презентация?</div>
                  <div className="bubble out">Всё огонь! Клиент подписал договор</div>
                  <div className="bubble in">Вау, отмечаем сегодня? 🎉</div>
                  <div className="typing" aria-label="печатает">
                    <i />
                    <i />
                    <i />
                  </div>
                </div>
              </div>
            )}

            {tab === "settings" && (
              <div className="sc-settings">
                <div className="sc-profile">
                  <span className="sc-ava big">Д</span>
                  <span>
                    <b>dima Kvezov</b>
                    <i>@dima · +888 222 9922</i>
                  </span>
                  <span className="sc-owner">Владелец</span>
                </div>
                <div className="sc-card">
                  <b>Профиль</b>
                  <div className="sc-field">
                    <span>Отображаемое имя</span>
                    <em>dima Kvezov</em>
                  </div>
                  <div className="sc-pills">
                    <span className="sc-pill accent">Premium за 100 ★</span>
                    <span className="sc-pill">Передать звёзды</span>
                  </div>
                </div>
                <div className="sc-card">
                  <b>Звёзды</b>
                  <div className="sc-balance">
                    <Star width={15} height={15} /> Баланс: <strong>240</strong>
                  </div>
                </div>
                <div className="sc-card">
                  <b>О приложении</b>
                  <div className="sc-info">
                    <span>Сервер</span>
                    <code>nova-mesenger.onrender.com</code>
                  </div>
                </div>
              </div>
            )}

            {tab === "admin" && (
              <div className="sc-admin">
                <div className="sc-admin-head">
                  <span className="sc-shield">
                    <Shield width={16} height={16} />
                  </span>
                  <span>
                    <b>Панель владельца</b>
                    <i>права, звёзды и порядок</i>
                  </span>
                </div>
                <div className="sc-stats">
                  {stats.map(([v, l]) => (
                    <div key={l} className="sc-stat">
                      <strong>{v}</strong>
                      <span>{l}</span>
                    </div>
                  ))}
                </div>
                <div className="sc-admin-list">
                  {[
                    ["Аня Ковалёва", "пользователь"],
                    ["NovaBot", "бот"],
                    ["Друзья", "группа · 42"],
                  ].map(([name, role]) => (
                    <div key={name} className="sc-admin-row">
                      <span>
                        <b>{name}</b>
                        <i>{role}</i>
                      </span>
                      <span className="sc-admin-acts">
                        <em className="ok">
                          <Check width={12} height={12} /> Premium
                        </em>
                        <em className="star">+10 ★</em>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="sc-hints">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={`sc-hint ${tab === id ? "on" : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
            <span>
              {id === "chats"
                ? "список, чаты, статусы и непрочитанное"
                : id === "settings"
                  ? "профиль, звёзды, Premium и скачивание"
                  : "статистика, права и управление всем"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
