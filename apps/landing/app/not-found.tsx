import { site } from "@/lib/site";
import { DownloadButton } from "@/components/DownloadButton";
import { ArrowRight } from "@/components/Icons";

export default function NotFound() {
  return (
    <main
      className="container"
      style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "64px 24px", textAlign: "center" }}
    >
      <div style={{ maxWidth: 520 }}>
        <div
          className="gradient-text"
          style={{ fontSize: "clamp(72px, 16vw, 140px)", fontWeight: 800, lineHeight: 1 }}
        >
          404
        </div>
        <h1 style={{ fontSize: 28, marginBottom: 12 }}>Страница не найдена</h1>
        <p className="lead" style={{ marginBottom: 30 }}>
          Похоже, эта ссылка потерялась. Давай вернём тебя к {site.name}.
        </p>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
          <a className="btn btn-primary btn-lg" href="/">
            На главную
            <ArrowRight width={18} height={18} />
          </a>
          <DownloadButton size="sm" showDropdown={false} />
        </div>
      </div>
    </main>
  );
}
