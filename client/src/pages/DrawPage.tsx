import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSocket } from "../lib/socket";
import type { GroupsState, Question } from "../lib/types";
import { STORAGE_KEYS } from "./JoinPage";

export default function DrawPage() {
  const navigate = useNavigate();
  const [roomCode] = useState(() => sessionStorage.getItem(STORAGE_KEYS.roomCode));
  const [participantId] = useState(() => sessionStorage.getItem(STORAGE_KEYS.participantId));
  const [nickname] = useState(() => sessionStorage.getItem(STORAGE_KEYS.nickname) ?? "");

  const [groupIndex, setGroupIndex] = useState<number>(-1);
  const [groups, setGroups] = useState<GroupsState | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [choosingGroup, setChoosingGroup] = useState<number | null>(null);

  const [question, setQuestion] = useState<Question | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const [submittedAnswer, setSubmittedAnswer] = useState<string | null>(null);
  const [draftAnswer, setDraftAnswer] = useState("");
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!roomCode || !participantId) {
      navigate("/join");
      return;
    }

    const socket = getSocket();

    function sync() {
      socket.emit(
        "participant:join",
        { code: roomCode, participantId, nickname },
        (res: {
          ok: boolean;
          participant?: {
            groupIndex: number;
            drawnQuestion: Question | null;
            answerText: string | null;
          };
          groups?: GroupsState;
          error?: string;
        }) => {
          if (!res.ok) {
            setError(res.error ?? "다시 입장해주세요.");
            return;
          }
          if (res.participant) {
            setGroupIndex(res.participant.groupIndex);
            if (res.participant.groupIndex < 0) setPickerOpen(true);
            if (res.participant.drawnQuestion) {
              setQuestion(res.participant.drawnQuestion);
              setRevealed(true);
            }
            if (res.participant.answerText) {
              setSubmittedAnswer(res.participant.answerText);
            }
          }
          if (res.groups) setGroups(res.groups);
        }
      );
    }

    function handleGroups(g: GroupsState) {
      setGroups(g);
      const myGroup = g.groups.find((group) =>
        group.members.some((m) => m.participantId === participantId)
      );
      if (myGroup) setGroupIndex(myGroup.index);
    }

    function handleReset() {
      setQuestion(null);
      setRevealed(false);
      setSubmittedAnswer(null);
      setDraftAnswer("");
      setEditing(false);
    }

    if (socket.connected) sync();
    socket.on("connect", sync);
    socket.on("room:groups", handleGroups);
    socket.on("participant:reset", handleReset);

    return () => {
      socket.off("connect", sync);
      socket.off("room:groups", handleGroups);
      socket.off("participant:reset", handleReset);
    };
  }, [roomCode, participantId, nickname, navigate]);

  function handleChooseGroup(index: number) {
    if (!roomCode || !participantId) return;
    setChoosingGroup(index);
    setError(null);
    getSocket().emit(
      "participant:choose-group",
      { code: roomCode, participantId, groupIndex: index },
      (res: { ok: boolean; groupIndex?: number; error?: string }) => {
        setChoosingGroup(null);
        if (!res.ok || res.groupIndex === undefined) {
          setError(res.error ?? "조를 선택하지 못했습니다.");
          return;
        }
        setGroupIndex(res.groupIndex);
        setPickerOpen(false);
      }
    );
  }

  function handleDraw() {
    if (!roomCode || !participantId) return;
    setDrawing(true);
    setError(null);
    getSocket().emit(
      "participant:draw",
      { code: roomCode, participantId },
      (res: { ok: boolean; question?: Question; error?: string }) => {
        setDrawing(false);
        if (!res.ok || !res.question) {
          setError(res.error ?? "카드를 뽑지 못했습니다.");
          return;
        }
        setQuestion(res.question);
        requestAnimationFrame(() => setRevealed(true));
      }
    );
  }

  function handleSubmitAnswer() {
    if (!roomCode || !participantId || !draftAnswer.trim()) return;
    setSubmitting(true);
    setError(null);
    getSocket().emit(
      "participant:answer",
      { code: roomCode, participantId, answerText: draftAnswer.trim() },
      (res: { ok: boolean; error?: string }) => {
        setSubmitting(false);
        if (!res.ok) {
          setError(res.error ?? "응답 제출에 실패했습니다.");
          return;
        }
        setSubmittedAnswer(draftAnswer.trim());
        setEditing(false);
      }
    );
  }

  const myGroup = groups?.groups.find((g) => g.index === groupIndex);

  return (
    <div
      style={{
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "24px 20px 40px",
        gap: 18,
        textAlign: "center",
      }}
    >
      <p className="text-dim" style={{ margin: 0 }}>
        {nickname}님 · 방 {roomCode}
      </p>

      {groups && pickerOpen ? (
        <div className="card" style={{ padding: "18px", width: "100%", maxWidth: 380 }}>
          <p style={{ margin: "0 0 12px", fontWeight: 700 }}>
            {groupIndex < 0 ? "참여할 조를 선택해주세요" : "조 변경"}
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 8 }}>
            {groups.groups.map((g) => (
              <button
                key={g.index}
                className="btn"
                style={{
                  padding: "10px 8px",
                  fontSize: "0.85rem",
                  background: g.index === groupIndex ? "var(--color-primary)" : "rgba(255,255,255,0.06)",
                  color: "var(--color-text)",
                  border: g.index === groupIndex ? "none" : "1px solid rgba(255,255,255,0.15)",
                }}
                onClick={() => handleChooseGroup(g.index)}
                disabled={choosingGroup !== null}
              >
                {choosingGroup === g.index ? "..." : `${g.index + 1}조 (${g.members.length})`}
              </button>
            ))}
          </div>
        </div>
      ) : (
        groupIndex >= 0 && (
          <div className="card" style={{ padding: "14px 18px", width: "100%", maxWidth: 380 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p style={{ margin: 0, fontWeight: 700, color: "var(--color-accent)" }}>
                내 조: {groupIndex + 1}조
              </p>
              <button
                className="btn btn-ghost"
                style={{ padding: "4px 10px", fontSize: "0.78rem" }}
                onClick={() => setPickerOpen(true)}
              >
                변경
              </button>
            </div>
            {myGroup && myGroup.members.length > 0 && (
              <p className="text-dim" style={{ margin: "8px 0 0", fontSize: "0.85rem", lineHeight: 1.6, textAlign: "left" }}>
                {myGroup.members
                  .map((m) => (m.participantId === participantId ? `${m.nickname} (나)` : m.nickname))
                  .join(", ")}
              </p>
            )}
          </div>
        )
      )}

      {!question ? (
        <>
          <div style={{ fontSize: "3.5rem", marginTop: 12 }}>🎴</div>
          <h1 style={{ fontSize: "1.4rem", margin: 0 }}>질문 카드를 뽑아보세요</h1>
          <button className="btn btn-primary" style={{ padding: "18px 40px", fontSize: "1.1rem" }} onClick={handleDraw} disabled={drawing}>
            {drawing ? "뽑는 중..." : "카드 뽑기"}
          </button>
        </>
      ) : (
        <div
          className="card"
          style={{
            padding: "32px 24px",
            maxWidth: 380,
            width: "100%",
            background: "linear-gradient(160deg, var(--color-primary), #4c2fc9)",
            transform: revealed ? "scale(1) rotateY(0deg)" : "scale(0.85) rotateY(90deg)",
            opacity: revealed ? 1 : 0,
            transition: "transform 0.4s ease, opacity 0.4s ease",
          }}
        >
          <p style={{ margin: 0, fontSize: "0.85rem", opacity: 0.8 }}>오늘의 질문</p>
          <p style={{ margin: "14px 0 0", fontSize: "1.3rem", fontWeight: 700, lineHeight: 1.5 }}>
            {question.text}
          </p>

          <div style={{ marginTop: 22, textAlign: "left" }}>
            {submittedAnswer && !editing ? (
              <>
                <p style={{ margin: 0, fontSize: "0.8rem", opacity: 0.8 }}>내 답변</p>
                <p style={{ margin: "8px 0 0", fontSize: "1rem", lineHeight: 1.5 }}>{submittedAnswer}</p>
                <button
                  className="btn btn-ghost"
                  style={{ marginTop: 14, width: "100%", background: "rgba(255,255,255,0.12)", border: "none" }}
                  onClick={() => {
                    setDraftAnswer(submittedAnswer);
                    setEditing(true);
                  }}
                >
                  수정하기
                </button>
              </>
            ) : (
              <>
                <textarea
                  className="input"
                  style={{ minHeight: 90, resize: "vertical", background: "rgba(255,255,255,0.12)", color: "white" }}
                  placeholder="답변을 입력하고 진행자 화면에 공유해보세요"
                  maxLength={500}
                  value={draftAnswer}
                  onChange={(e) => setDraftAnswer(e.target.value)}
                />
                <button
                  className="btn"
                  style={{ marginTop: 12, width: "100%", background: "white", color: "var(--color-primary)" }}
                  onClick={handleSubmitAnswer}
                  disabled={submitting || !draftAnswer.trim()}
                >
                  {submitting ? "제출 중..." : "답변 제출하기"}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {error && <p style={{ color: "#ff8080" }}>{error}</p>}
    </div>
  );
}
