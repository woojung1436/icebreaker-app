import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getSocket } from "../lib/socket";

export const STORAGE_KEYS = {
  participantId: "ib_participantId",
  roomCode: "ib_roomCode",
  nickname: "ib_nickname",
};

function getOrCreateParticipantId(): string {
  const existing = sessionStorage.getItem(STORAGE_KEYS.participantId);
  if (existing) return existing;
  const id = crypto.randomUUID();
  sessionStorage.setItem(STORAGE_KEYS.participantId, id);
  return id;
}

export default function JoinPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [roomCode, setRoomCode] = useState(searchParams.get("room") ?? "");
  const [nickname, setNickname] = useState(sessionStorage.getItem(STORAGE_KEYS.nickname) ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = roomCode.trim();
    const name = nickname.trim();
    if (code.length !== 4 || !/^\d{4}$/.test(code)) {
      setError("4자리 참가 코드를 입력해주세요.");
      return;
    }
    if (!name) {
      setError("닉네임을 입력해주세요.");
      return;
    }

    setSubmitting(true);
    setError(null);
    const participantId = getOrCreateParticipantId();

    getSocket().emit(
      "participant:join",
      { code, participantId, nickname: name },
      (res: { ok: boolean; error?: string }) => {
        setSubmitting(false);
        if (!res.ok) {
          setError(res.error ?? "입장에 실패했습니다.");
          return;
        }
        sessionStorage.setItem(STORAGE_KEYS.roomCode, code);
        sessionStorage.setItem(STORAGE_KEYS.nickname, name);
        navigate("/draw");
      }
    );
  }

  return (
    <div
      style={{
        minHeight: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="card"
        style={{ padding: 28, width: "100%", maxWidth: 380, display: "flex", flexDirection: "column", gap: 16 }}
      >
        <div style={{ textAlign: "center", marginBottom: 4 }}>
          <div style={{ fontSize: "2.2rem" }}>🎴</div>
          <h1 style={{ fontSize: "1.4rem", margin: "8px 0 0" }}>세션 입장하기</h1>
        </div>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="text-dim" style={{ fontSize: "0.9rem" }}>
            참가 코드
          </span>
          <input
            className="input"
            inputMode="numeric"
            maxLength={4}
            placeholder="예: 1234"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.replace(/\D/g, ""))}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="text-dim" style={{ fontSize: "0.9rem" }}>
            닉네임
          </span>
          <input
            className="input"
            placeholder="이름 또는 별명"
            maxLength={20}
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
          />
        </label>

        {error && (
          <p style={{ color: "#ff8080", margin: 0, fontSize: "0.9rem" }}>{error}</p>
        )}

        <button className="btn btn-primary" type="submit" disabled={submitting}>
          {submitting ? "입장 중..." : "입장하기"}
        </button>
      </form>
    </div>
  );
}
