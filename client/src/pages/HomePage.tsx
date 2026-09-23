import { useNavigate } from "react-router-dom";

export default function HomePage() {
  const navigate = useNavigate();

  return (
    <div
      style={{
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        textAlign: "center",
        gap: 32,
      }}
    >
      <div>
        <div style={{ fontSize: "2.75rem", marginBottom: 8 }}>🎴</div>
        <h1 style={{ fontSize: "1.8rem", margin: 0 }}>아이스브레이킹 카드</h1>
        <p className="text-dim" style={{ marginTop: 12, lineHeight: 1.6 }}>
          교육 오프닝을 위한 질문 카드 뽑기
          <br />
          진행자는 화면을, 참가자는 휴대폰을 사용하세요.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14, width: "100%", maxWidth: 320 }}>
        <button className="btn btn-primary" onClick={() => navigate("/host")}>
          진행자로 시작하기
        </button>
        <button className="btn btn-ghost" onClick={() => navigate("/join")}>
          참가자로 입장하기
        </button>
      </div>
    </div>
  );
}
