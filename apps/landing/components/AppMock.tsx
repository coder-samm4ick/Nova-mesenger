const chats = [
  { name: "Друзья", text: "Аня: го в кино в субботу?", color: "#2fa8ff", active: false },
  { name: "Работа", text: "Ты: отчёт готов, смотрите", color: "#7c5cff", active: true },
  { name: "Nova", text: "Добро пожаловать в Nova", color: "#23e6c3", active: false },
  { name: "Семья", text: "Мама: не забудь позвонить", color: "#ff7ac6", active: false },
];

export function AppMock() {
  return (
    <div className="mock">
      <div className="mock-bar">
        <span className="dot" style={{ background: "#ff5f57" }} />
        <span className="dot" style={{ background: "#febc2e" }} />
        <span className="dot" style={{ background: "#28c840" }} />
        <span
          style={{
            marginLeft: 14,
            fontSize: 13,
            color: "var(--muted-2)",
            fontWeight: 600,
          }}
        >
          Nova — Чаты
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 12,
            color: "var(--accent-3)",
            fontWeight: 700,
          }}
        >
          ● онлайн
        </span>
      </div>

      <div className="mock-body">
        <div className="mock-side">
          {chats.map((c) => (
            <div
              key={c.name}
              className={`mock-chat-row ${c.active ? "active" : ""}`}
            >
              <span className="avatar" style={{ background: c.color }}>
                {c.name[0]}
              </span>
              <span style={{ overflow: "hidden" }}>
                <span
                  style={{
                    display: "block",
                    fontWeight: 650,
                    fontSize: 14.5,
                  }}
                >
                  {c.name}
                </span>
                <span
                  style={{
                    display: "block",
                    color: "var(--muted-2)",
                    fontSize: 12.5,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: 168,
                  }}
                >
                  {c.text}
                </span>
              </span>
            </div>
          ))}
        </div>

        <div className="mock-chat-main">
          <div className="bubble in">Привет! Как прошла презентация?</div>
          <div className="bubble out">
            Всё огонь! Клиент подписал договор на год
          </div>
          <div className="bubble in">
            Вау, поздравляю! Отмечаем сегодня?
          </div>
          <div className="typing" aria-label="печатает">
            <i />
            <i />
            <i />
          </div>
        </div>
      </div>
    </div>
  );
}
