import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { getSocket } from "../lib/socket";
import type { RoomState } from "../lib/types";

const HOST_STORAGE_KEY = "ib_hostRoomCode";

function formatRelativeTime(ts: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 5) return "방금 전";
  if (diffSec < 60) return `${diffSec}초 전`;
  const diffMin = Math.floor(diffSec / 60);
  return `${diffMin}분 전`;
}

export default function HostPage() {
  const [state, setState] = useState<RoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [shuffling, setShuffling] = useState(false);
  const [groupCountInput, setGroupCountInput] = useState<number>(4);
  const [claudeEnabled, setClaudeEnabled] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  useEffect(() => {
    const socket = getSocket();

    function applyState(s: RoomState) {
      setState(s);
      setError(null);
      setGroupCountInput(s.groupCount);
      sessionStorage.setItem(HOST_STORAGE_KEY, s.code);
    }

    function join() {
      const savedCode = sessionStorage.getItem(HOST_STORAGE_KEY);
      if (savedCode) {
        socket.emit(
          "host:rejoin",
          { code: savedCode },
          (res: { ok: boolean; state?: RoomState; claudeEnabled?: boolean; error?: string }) => {
            if (res.ok && res.state) {
              applyState(res.state);
              setClaudeEnabled(Boolean(res.claudeEnabled));
            } else {
              socket.emit(
                "host:create",
                {},
                (createRes: { ok: boolean; state: RoomState; claudeEnabled: boolean }) => {
                  applyState(createRes.state);
                  setClaudeEnabled(createRes.claudeEnabled);
                }
              );
            }
          }
        );
      } else {
        socket.emit(
          "host:create",
          {},
          (createRes: { ok: boolean; state: RoomState; claudeEnabled: boolean }) => {
            applyState(createRes.state);
            setClaudeEnabled(createRes.claudeEnabled);
          }
        );
      }
    }

    if (socket.connected) {
      join();
    } else {
      socket.once("connect", join);
    }

    socket.on("room:state", applyState);
    socket.on("connect", join);

    return () => {
      socket.off("room:state", applyState);
      socket.off("connect", join);
    };
  }, []);

  function handleReset() {
    if (!state) return;
    setResetting(true);
    getSocket().emit("host:reset", { code: state.code }, () => {
      setResetting(false);
    });
  }

  function handleApplyGroupCount() {
    if (!state) return;
    getSocket().emit("host:set-group-count", { code: state.code, groupCount: groupCountInput }, () => {});
  }

  function handleShuffle() {
    if (!state) return;
    setShuffling(true);
    getSocket().emit("host:shuffle-groups", { code: state.code }, () => {
      setShuffling(false);
    });
  }

  function handleSummarizeNow() {
    if (!state) return;
    setSummarizing(true);
    setSummaryError(null);
    getSocket().emit(
      "host:summarize-now",
      { code: state.code },
      (res: { ok: boolean; error?: string }) => {
        setSummarizing(false);
        if (!res.ok) setSummaryError(res.error ?? "요약 생성에 실패했습니다.");
      }
    );
  }

  if (error) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        <p>{error}</p>
      </div>
    );
  }

  if (!state) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        <p className="text-dim">연결 중...</p>
      </div>
    );
  }

  const joinUrl = `${window.location.origin}/join?room=${state.code}`;
  const drawnCount = state.participants.filter((p) => p.drawnQuestion).length;
  const answeredCount = state.participants.filter((p) => p.answerText).length;

  const groups = Array.from({ length: state.groupCount }, (_, index) => ({
    index,
    members: state.participants.filter((p) => p.groupIndex === index),
  }));
  const unassigned = state.participants.filter((p) => p.groupIndex < 0);
  const displayGroups = unassigned.length > 0 ? [{ index: -1, members: unassigned }, ...groups] : groups;

  return (
    <div style={{ minHeight: "100%", padding: "32px 24px", maxWidth: 1400, margin: "0 auto" }}>
      <div
        className="card"
        style={{
          padding: 20,
          marginBottom: 24,
          background: "linear-gradient(135deg, rgba(124,92,255,0.12), rgba(255,184,72,0.08))",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <strong style={{ display: "flex", alignItems: "center", gap: 8 }}>
            ✨ AI 실시간 요약
            {state.summary && (
              <span className="text-dim" style={{ fontWeight: 400, fontSize: "0.78rem" }}>
                {formatRelativeTime(state.summary.generatedAt)} 업데이트
              </span>
            )}
          </strong>
          {claudeEnabled && (
            <button className="btn btn-ghost" style={{ padding: "6px 14px", fontSize: "0.82rem" }} onClick={handleSummarizeNow} disabled={summarizing}>
              {summarizing ? "요약 생성 중..." : "지금 다시 요약"}
            </button>
          )}
        </div>

        {!claudeEnabled ? (
          <p className="text-dim" style={{ margin: "12px 0 0", fontSize: "0.88rem", lineHeight: 1.6 }}>
            Claude API 키가 설정되지 않아 요약 기능을 사용할 수 없어요. <code>server/.env</code>에{" "}
            <code>ANTHROPIC_API_KEY</code>를 추가하고 서버를 재시작하세요.
          </p>
        ) : !state.summary ? (
          <p className="text-dim" style={{ margin: "12px 0 0", fontSize: "0.88rem" }}>
            참가자들이 답변을 제출하면 몇 초 후 자동으로 AI 요약이 생성돼요.
          </p>
        ) : (
          <div style={{ marginTop: 14 }}>
            <p style={{ margin: 0, fontSize: "0.98rem", lineHeight: 1.6 }}>{state.summary.text}</p>

            {state.summary.keywords.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
                {state.summary.keywords.map((kw) => (
                  <span
                    key={kw}
                    style={{
                      fontSize: "0.78rem",
                      padding: "4px 10px",
                      borderRadius: 999,
                      background: "rgba(124,92,255,0.18)",
                      color: "var(--color-primary-light)",
                    }}
                  >
                    #{kw}
                  </span>
                ))}
              </div>
            )}

            {state.summary.highlights.length > 0 && (
              <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
                {state.summary.highlights.map((h, i) => (
                  <p key={i} style={{ margin: 0, fontSize: "0.85rem" }}>
                    <strong style={{ color: "var(--color-accent)" }}>{h.nickname}</strong>
                    <span className="text-dim"> — {h.note}</span>
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {summaryError && (
          <p style={{ margin: "10px 0 0", fontSize: "0.82rem", color: "#ff8080" }}>{summaryError}</p>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "300px 1fr",
          gap: 28,
          alignItems: "start",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div className="card" style={{ padding: 24, textAlign: "center" }}>
            <p className="text-dim" style={{ margin: 0, fontSize: "0.9rem" }}>
              참가 코드
            </p>
            <div
              style={{
                fontSize: "2.6rem",
                fontWeight: 800,
                letterSpacing: "0.1em",
                margin: "6px 0 16px",
                color: "var(--color-accent)",
              }}
            >
              {state.code}
            </div>
            <div
              style={{
                background: "white",
                padding: 14,
                borderRadius: 16,
                display: "inline-block",
              }}
            >
              <QRCodeSVG value={joinUrl} size={180} />
            </div>
            <p className="text-dim" style={{ marginTop: 14, fontSize: "0.8rem", wordBreak: "break-all" }}>
              {joinUrl}
            </p>
          </div>

          <div className="card" style={{ padding: 20 }}>
            <p style={{ margin: "0 0 10px", fontWeight: 600 }}>조 편성</p>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                className="input"
                type="number"
                min={1}
                max={20}
                value={groupCountInput}
                onChange={(e) => setGroupCountInput(Number(e.target.value))}
                style={{ width: 80, padding: "10px 12px" }}
              />
              <span className="text-dim" style={{ fontSize: "0.9rem" }}>조</span>
              <button className="btn btn-ghost" style={{ padding: "10px 14px" }} onClick={handleApplyGroupCount}>
                적용
              </button>
            </div>
            <button
              className="btn btn-ghost"
              style={{ marginTop: 12, width: "100%" }}
              onClick={handleShuffle}
              disabled={shuffling}
            >
              🔀 조 다시 섞기
            </button>
          </div>

          <button className="btn btn-danger" onClick={handleReset} disabled={resetting}>
            덱 리셋 / 새 라운드
          </button>
        </div>

        <div className="card" style={{ padding: 28 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 20, flexWrap: "wrap", gap: 8 }}>
            <h2 style={{ margin: 0 }}>참가자 ({state.participants.length}명)</h2>
            <span className="text-dim">
              카드 뽑음 {drawnCount} / {state.participants.length} · 응답 완료 {answeredCount} / {state.participants.length}
            </span>
          </div>

          {state.participants.length === 0 ? (
            <p className="text-dim">QR코드를 스캔해서 입장을 기다리는 중...</p>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: 18,
              }}
            >
              {displayGroups.map((group) => (
                <div
                  key={group.index}
                  className="card"
                  style={{
                    padding: 16,
                    background: group.index < 0 ? "rgba(255,184,72,0.08)" : "rgba(255,255,255,0.03)",
                    border: group.index < 0 ? "1px dashed rgba(255,184,72,0.4)" : undefined,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <strong style={{ color: group.index < 0 ? "var(--color-accent)" : "var(--color-primary-light)" }}>
                      {group.index < 0 ? "미배정" : `${group.index + 1}조`}
                    </strong>
                    <span className="text-dim" style={{ fontSize: "0.8rem" }}>
                      {group.members.length}명
                    </span>
                  </div>

                  {group.members.length === 0 ? (
                    <p className="text-dim" style={{ fontSize: "0.85rem", margin: 0 }}>
                      아직 배정된 인원이 없어요
                    </p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {group.members.map((p) => (
                        <div
                          key={p.participantId}
                          style={{
                            padding: "10px 12px",
                            borderRadius: 10,
                            background: "rgba(255,255,255,0.04)",
                            opacity: p.connected ? 1 : 0.5,
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <strong style={{ fontSize: "0.92rem" }}>{p.nickname}</strong>
                            <span style={{ fontSize: "0.7rem" }}>{p.connected ? "🟢" : "⚪"}</span>
                          </div>
                          {p.drawnQuestion && (
                            <p className="text-dim" style={{ margin: "6px 0 0", fontSize: "0.78rem" }}>
                              Q. {p.drawnQuestion.text}
                            </p>
                          )}
                          {p.answerText ? (
                            <p
                              style={{
                                margin: "6px 0 0",
                                fontSize: "0.88rem",
                                color: "var(--color-success)",
                                lineHeight: 1.45,
                              }}
                            >
                              💬 {p.answerText}
                            </p>
                          ) : p.drawnQuestion ? (
                            <p style={{ margin: "6px 0 0", fontSize: "0.8rem" }} className="text-dim">
                              응답 대기중...
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
