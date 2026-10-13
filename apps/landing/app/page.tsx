import { site, releases, features, comparison, faq } from "@/lib/site";
import {
  Download,
  ArrowRight,
  Play,
  Github,
  Check,
  LogoMark,
  platformIcons,
  featureIcons,
} from "@/components/Icons";
import { DownloadButton } from "@/components/DownloadButton";
import { Accordion } from "@/components/Accordion";
import { AppMock } from "@/components/AppMock";
import { Effects } from "@/components/Effects";

export default function HomePage() {
  return (
    <>
      <Effects />

      {/* ---------------- НАВИГАЦИЯ ---------------- */}
      <header className="nav">
        <div className="container nav-inner">
          <a className="brand" href="#top">
            <span className="brand-mark">
              <LogoMark size={20} />
            </span>
            {site.name}
          </a>

          <nav className="nav-links">
            <a href="#download">Скачать</a>
            <a href="#features">Возможности</a>
            <a href="#compare">Сравнение</a>
            <a href="#faq">Вопросы</a>
            <a href={site.github} target="_blank" rel="noreferrer">
              GitHub
            </a>
          </nav>

          <div className="nav-cta">
            <a className="btn btn-ghost" href="/web">
              <Play width={16} height={16} />
              Веб-версия
            </a>
          </div>
        </div>
      </header>

      <main id="top">
        {/* ---------------- ГЕРОЙ ---------------- */}
        <section className="container hero">
          <span className="eyebrow reveal">Бесплатно · Без рекламы · С открытым кодом</span>

          <h1 className="reveal">
            Общайся <span className="gradient-text">быстрее и безопаснее</span>,
            чем где-либо
          </h1>

          <p className="lead reveal">
            {site.name} — это скорость, приватность и красота в одном приложении.
            Для телефона, компьютера и веба. Твои сообщения шифруются, а файлы
            летают.
          </p>

          <div className="hero-actions reveal">
            <DownloadButton />
            <a className="btn btn-ghost btn-lg" href="/web">
              <Play width={18} height={18} />
              Открыть в браузере
            </a>
          </div>

          <p className="hero-note reveal">
            Windows · macOS · Linux · Android · iOS &nbsp;·&nbsp; установка за 30
            секунд
          </p>

          <div className="hero-stats reveal">
            <div className="stat">
              <b className="gradient-text">1.2 млн</b>
              <span>активных пользователей</span>
            </div>
            <div className="stat">
              <b className="gradient-text">99.99%</b>
              <span>аптайм сервиса</span>
            </div>
            <div className="stat">
              <b className="gradient-text">&lt; 40 мс</b>
              <span>доставка сообщения</span>
            </div>
          </div>

          <div className="mock-wrap reveal">
            <AppMock />
          </div>
        </section>

        {/* ---------------- СКАЧАТЬ ---------------- */}
        <section className="section container" id="download">
          <div className="section-head">
            <span className="eyebrow reveal">Скачать</span>
            <h2 className="reveal">
              Одна учётная запись — <span className="gradient-text">все платформы</span>
            </h2>
            <p className="lead reveal">
              Начни на любом устройстве, продолжи на другом. Выбери свою систему —
              всё синхронизируется автоматически.
            </p>
          </div>

          <div className="dl-grid">
            {releases.map((r) => {
              const Icon = platformIcons[r.id];
              const soon = r.size === "Скоро";
              return (
                <div
                  key={r.id}
                  className="dl-card reveal"
                  style={{ ["--accent-card" as string]: r.accent }}
                >
                  <div className="dl-icon" style={{ color: r.accent }}>
                    <Icon width={26} height={26} />
                  </div>
                  <h3>{r.name}</h3>
                  <p>{r.requirement}</p>
                  <div className="dl-meta">
                    <span className="dl-size">{r.size}</span>
                    <a
                      className={`dl-btn ${soon ? "disabled" : ""}`}
                      href={r.href}
                      aria-disabled={soon}
                    >
                      {soon ? (
                        "Скоро"
                      ) : (
                        <>
                          <Download width={16} height={16} /> Скачать
                        </>
                      )}
                    </a>
                  </div>
                </div>
              );
            })}
          </div>

          <p
            className="hero-note reveal"
            style={{ textAlign: "center", marginTop: 26 }}
          >
            Нужна веб-версия без установки?{" "}
            <a href="/web" style={{ color: "var(--accent)" }}>
              Открыть {site.name} в браузере →
            </a>
          </p>
        </section>

        {/* ---------------- ВОЗМОЖНОСТИ ---------------- */}
        <section className="section container" id="features">
          <div className="section-head">
            <span className="eyebrow reveal">Возможности</span>
            <h2 className="reveal">
              Всё, что нужно. <span className="gradient-text">И даже больше</span>
            </h2>
            <p className="lead reveal">
              Мы взяли лучшее из современных мессенджеров и довели до идеала.
            </p>
          </div>

          <div className="feat-grid">
            {features.map((f) => {
              const Icon = featureIcons[f.icon];
              return (
                <div key={f.title} className="feat reveal">
                  <div className="feat-icon">
                    <Icon width={24} height={24} />
                  </div>
                  <h3>{f.title}</h3>
                  <p>{f.text}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* ---------------- СРАВНЕНИЕ ---------------- */}
        <section className="section container" id="compare">
          <div className="section-head">
            <span className="eyebrow reveal">Сравнение</span>
            <h2 className="reveal">
              Почему <span className="gradient-text">{site.name} лучше</span>
            </h2>
            <p className="lead reveal">
              Честно сравнили с популярными мессенджерами.
            </p>
          </div>

          <div className="table-wrap reveal">
            <table>
              <thead>
                <tr>
                  <th>Возможность</th>
                  <th style={{ color: "var(--accent)" }}>{site.name}</th>
                  <th>Telegram</th>
                  <th>Другие</th>
                </tr>
              </thead>
              <tbody>
                {comparison.map((row) => (
                  <tr key={row.feature}>
                    <td>{row.feature}</td>
                    <td className="nova-col">{row.nova}</td>
                    <td>{row.telegram}</td>
                    <td>{row.others}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div
            className="reveal"
            style={{
              display: "flex",
              gap: 14,
              justifyContent: "center",
              flexWrap: "wrap",
              marginTop: 32,
            }}
          >
            {[
              "E2E-шифрование",
              "Файлы до 4 ГБ",
              "Без рекламы",
              "Свой сервер",
            ].map((t) => (
              <span
                key={t}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 16px",
                  borderRadius: 999,
                  border: "1px solid var(--border)",
                  background: "var(--panel)",
                  fontSize: 14.5,
                  fontWeight: 550,
                  color: "var(--muted)",
                }}
              >
                <Check width={16} height={16} style={{ color: "var(--accent-3)" }} />
                {t}
              </span>
            ))}
          </div>
        </section>

        {/* ---------------- FAQ ---------------- */}
        <section className="section container" id="faq">
          <div className="section-head">
            <span className="eyebrow reveal">Вопросы</span>
            <h2 className="reveal">Частые вопросы</h2>
          </div>
          <div className="reveal">
            <Accordion items={faq} />
          </div>
        </section>

        {/* ---------------- CTA ---------------- */}
        <section className="container" style={{ paddingBottom: 40 }}>
          <div className="cta-banner reveal">
            <h2>
              Готов начать? <span className="gradient-text">Скачай {site.name}</span>
            </h2>
            <p>{site.description}</p>
            <div
              style={{
                display: "flex",
                gap: 14,
                justifyContent: "center",
                flexWrap: "wrap",
              }}
            >
              <DownloadButton />
              <a
                className="btn btn-ghost btn-lg"
                href={site.github}
                target="_blank"
                rel="noreferrer"
              >
                <Github width={18} height={18} />
                Исходный код
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* ---------------- ПОДВАЛ ---------------- */}
      <footer className="footer">
        <div className="container">
          <div className="footer-grid">
            <div>
              <a className="brand" href="#top" style={{ marginBottom: 14 }}>
                <span className="brand-mark">
                  <LogoMark size={20} />
                </span>
                {site.name}
              </a>
              <p style={{ color: "var(--muted)", fontSize: 14.5, maxWidth: 320 }}>
                {site.tagline}. Быстрый, приватный и бесплатный — на всех твоих
                устройствах.
              </p>
            </div>

            <div>
              <h4>Продукт</h4>
              <a href="#download">Скачать</a>
              <a href="#features">Возможности</a>
              <a href="#compare">Сравнение</a>
              <a href="/web">Веб-версия</a>
            </div>

            <div>
              <h4>Сообщество</h4>
              <a href={site.github} target="_blank" rel="noreferrer">
                GitHub
              </a>
              <a href="/blog">Блог</a>
              <a href="/docs">Документация</a>
              <a href="/status">Статус сервиса</a>
            </div>

            <div>
              <h4>Компания</h4>
              <a href="/about">О нас</a>
              <a href="/privacy">Приватность</a>
              <a href="/terms">Условия</a>
              <a href={`mailto:${site.email}`}>{site.email}</a>
            </div>
          </div>

          <div className="footer-bottom">
            <span>
              © {new Date().getFullYear()} {site.name}. Все права защищены.
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              Сделано с заботой о приватности
            </span>
          </div>
        </div>
      </footer>
    </>
  );
}
