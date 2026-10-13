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

/** Выбор страны: флаг, название, код и допустимая длина национальной части номера. */
type Region = { id: string; flag: string; name: string; code: string; min: number; max: number };

const REGIONS: Region[] = [
  { id: "ru", flag: "🇷🇺", name: "Россия", code: "7", min: 10, max: 10 },
  { id: "kz", flag: "🇰🇿", name: "Казахстан", code: "7", min: 10, max: 10 },
  { id: "by", flag: "🇧🇾", name: "Беларусь", code: "375", min: 9, max: 9 },
  { id: "ua", flag: "🇺🇦", name: "Украина", code: "380", min: 9, max: 9 },
  { id: "uz", flag: "🇺🇿", name: "Узбекистан", code: "998", min: 9, max: 9 },
  { id: "kg", flag: "🇰🇬", name: "Киргизия", code: "996", min: 9, max: 9 },
  { id: "tj", flag: "🇹🇯", name: "Таджикистан", code: "992", min: 9, max: 9 },
  { id: "tm", flag: "🇹🇲", name: "Туркменистан", code: "993", min: 8, max: 8 },
  { id: "am", flag: "🇦🇲", name: "Армения", code: "374", min: 8, max: 8 },
  { id: "ge", flag: "🇬🇪", name: "Грузия", code: "995", min: 9, max: 9 },
  { id: "az", flag: "🇦🇿", name: "Азербайджан", code: "994", min: 9, max: 9 },
  { id: "lv", flag: "🇱🇻", name: "Латвия", code: "371", min: 8, max: 8 },
  { id: "lt", flag: "🇱🇹", name: "Литва", code: "370", min: 8, max: 8 },
  { id: "ee", flag: "🇪🇪", name: "Эстония", code: "372", min: 7, max: 8 },
  { id: "tr", flag: "🇹🇷", name: "Турция", code: "90", min: 10, max: 10 },
  { id: "de", flag: "🇩🇪", name: "Германия", code: "49", min: 10, max: 11 },
  { id: "us", flag: "🇺🇸", name: "США", code: "1", min: 10, max: 10 },
  { id: "gb", flag: "🇬🇧", name: "Великобритания", code: "44", min: 10, max: 10 },
  { id: "il", flag: "🇮🇱", name: "Израиль", code: "972", min: 9, max: 9 },
  { id: "cn", flag: "🇨🇳", name: "Китай", code: "86", min: 11, max: 11 },
  { id: "in", flag: "🇮🇳", name: "Индия", code: "91", min: 10, max: 10 },
  { id: "fr", flag: "🇫🇷", name: "Франция", code: "33", min: 9, max: 9 },
  { id: "it", flag: "🇮🇹", name: "Италия", code: "39", min: 9, max: 10 },
  { id: "es", flag: "🇪🇸", name: "Испания", code: "34", min: 9, max: 9 },
  { id: "nova", flag: "🚀", name: "Nova", code: "888", min: 7, max: 7 },
];

const REGION_KEY = "nova.region";

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
  const [regionId, setRegionId] = useState("ru");

  useEffect(() => {
    setMounted(true);
    setServerValue(getStoredApiBase() ?? API_BASE);
    try {
      const saved = window.localStorage.getItem(REGION_KEY);
      if (saved && REGIONS.some((r) => r.id === saved)) setRegionId(saved);
    } catch {
      /* localStorage может быть недоступен */
    }
  }, []);

  const region = REGIONS.find((r) => r.id === regionId) ?? REGIONS[0];
  const fullPhone = region.code + phone;
  const phoneLen = phone.length;
  const phoneOk = phoneLen >= region.min && phoneLen <= region.max;
  const phoneError = phoneLen > 0 && !phoneOk
    ? region.min === region.max
      ? `Для ${region.name} (+${region.code}) нужно ровно ${region.max} цифр, у тебя ${phoneLen}`
      : `Для ${region.name} (+${region.code}) нужно ${region.min}–${region.max} цифр, у тебя ${phoneLen}`
    : null;

  function changeRegion(nextId: string) {
    setRegionId(nextId);
    setPhone("");
    try {
      window.localStorage.setItem(REGION_KEY, nextId);
    } catch {
      /* localStorage может быть недоступен */
    }
  }

  function changePhone(value: string) {
    let digits = value.replace(/\D/g, "");
    // Если номер ввели целиком вместе с кодом страны — оставляем национальную часть.
    if (digits.length === region.code.length + region.max && digits.startsWith(region.code)) {
      digits = digits.slice(region.code.length);
    }
    setPhone(digits.slice(0, region.max));
  }

  function saveServer() {
    setStoredApiBase(serverValue.trim() || null);
    window.location.reload();
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
        if (!phoneOk) {
          throw new Error(phoneError ?? "Введи номер телефона полностью");
        }
        if (fullPhone.length < 8 || fullPhone.length > 15) {
          throw new Error("Номер должен содержать от 8 до 15 цифр");
        }
        const result = await api.register(fullPhone, displayName.trim(), password);
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
              <span>Страна и код</span>
              <select
                className="region-select"
                value={regionId}
                onChange={(e) => changeRegion(e.target.value)}
                required
              >
                {REGIONS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.flag} {r.name} +{r.code}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Номер телефона</span>
              <div className="phone-row">
                <span className="phone-dial">+{region.code}</span>
                <input
                  value={phone}
                  onChange={(e) => changePhone(e.target.value)}
                  placeholder={
                    region.min === region.max
                      ? `${region.max} цифр`
                      : `${region.min}–${region.max} цифр`
                  }
                  inputMode="numeric"
                  autoComplete="tel"
                  maxLength={region.code.length + region.max}
                  required
                />
              </div>
              {phoneLen > 0 ? (
                <span className={`field-note ${phoneOk ? "ok" : "err"}`}>
                  {phoneOk ? `Номер: +${fullPhone} ✓` : phoneError}
                </span>
              ) : (
                <span className="field-note">
                  {region.min === region.max
                    ? `${region.max} цифр после +${region.code}`
                    : `${region.min}–${region.max} цифр после +${region.code}`}
                </span>
              )}
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