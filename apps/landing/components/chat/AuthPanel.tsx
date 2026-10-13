"use client";

import { useEffect, useState, type FormEvent } from "react";

import { LogoMark } from "@/components/Icons";
import {
  API_BASE,
  api,
  getStoredApiBase,
  setStoredApiBase,
  type AuthResult,
} from "@/lib/api";
import { isNativeApp } from "@/lib/shell";

type Mode = "login" | "register";

export function AuthPanel({
  onAuth,
}: {
  onAuth: (result: AuthResult) => void;
}) {
  const [mode, setMode] = useState<Mode>("login");
  const [login, setLogin] = useState("");
  const [phone, setPhone] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [serverValue, setServerValue] = useState("");
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    setServerValue(getStoredApiBase() ?? API_BASE);
  }, []);

  function saveServer() {
    setStoredApiBase(serverValue.trim() || null);
    window.location.reload();
  }

  function normalizePhone(value: string): string {
    return value.replace(/[^\d+]/g, "");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setHint(null);
    setLoading(true);
    try {
      if (mode === "login") {
        const result = await api.login(login.trim(), password);
        onAuth(result);
      } else {
        const digitsOnly = phone.replace(/\D/g, "");
        if (digitsOnly.length < 8) {
          throw new Error("Введи номер телефона полностью (минимум 8 цифр)");
        }
        const result = await api.register(digitsOnly, displayName.trim(), password);
        if (result.user.isOwner) {
          setHint("Ты зарегистрировался как владелец Nova!");
        }
        onAuth(result);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось войти");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <span className="brand-mark auth-logo">
          <LogoMark size={30} />
        </span>
        <h1 className="auth-title">
          {mounted && isNativeApp() ? (
            "Nova"
          ) : (
            <>
              Nova <span className="gradient-text">в браузере</span>
            </>
          )}
        </h1>
        <p className="auth-subtitle">
          {mode === "login"
            ? "Войди по номеру телефона или логину."
            : "Регистрация по номеру телефона — займёт секунду."}
        </p>

        <div className="auth-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "login"}
            className={`auth-tab ${mode === "login" ? "active" : ""}`}
            onClick={() => {
              setMode("login");
              setError(null);
            }}
          >
            Вход
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "register"}
            className={`auth-tab ${mode === "register" ? "active" : ""}`}
            onClick={() => {
              setMode("register");
              setError(null);
            }}
          >
            Регистрация
          </button>
        </div>

        {mode === "register" ? (
          <>
            <label className="field">
              <span>Номер телефона</span>
              <input
                value={phone}
                onChange={(e) => setPhone(normalizePhone(e.target.value))}
                placeholder="+7 900 000-00-00"
                inputMode="tel"
                autoComplete="tel"
                required
              />
            </label>
            <label className="field">
              <span>Отображаемое имя (необязательно)</span>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Александр"
                autoComplete="name"
              />
            </label>
            <label className="field">
              <span>Пароль</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="минимум 6 символов"
                autoComplete="new-password"
                required
              />
            </label>
            <p className="auth-hint">
              Логин создастся автоматически. Номер телефона владельца даёт роль
              владельца Nova навсегда
            </p>
          </>
        ) : (
          <>
            <label className="field">
              <span>Телефон или логин</span>
              <input
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                placeholder="например, +7 900 000-00-00 или alex"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
              />
            </label>
            <label className="field">
              <span>Пароль</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="твой пароль"
                autoComplete="current-password"
                required
              />
            </label>
          </>
        )}

        {error && <div className="auth-error">{error}</div>}
        {hint && <div className="auth-error auth-success">{hint}</div>}

        <button className="btn btn-primary btn-lg auth-submit" type="submit" disabled={loading}>
          {loading ? "Подожди…" : mode === "login" ? "Войти" : "Создать аккаунт"}
        </button>

        <p className="auth-hint">
          Данные хранятся на сервере Nova. По умолчанию — твой локальный сервер.
        </p>

        {mounted && (
          <details className="server-settings">
            <summary>Сервер подключения</summary>
            <p className="server-settings-note">
              Адрес API Nova. Сейчас используется <code>{API_BASE}</code>.
            </p>
            <div className="server-settings-row">
              <input
                value={serverValue}
                onChange={(e) => setServerValue(e.target.value)}
                placeholder="https://api.example.com"
                autoCapitalize="none"
                spellCheck={false}
              />
              <button type="button" className="btn btn-primary" onClick={saveServer}>
                Сохранить
              </button>
            </div>
          </details>
        )}
      </form>
    </div>
  );
}