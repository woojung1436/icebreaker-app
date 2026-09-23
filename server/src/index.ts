import "dotenv/config";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import cors from "cors";
import {
  createRoom,
  getRoom,
  ensureParticipant,
  chooseGroup,
  drawQuestion,
  submitAnswer,
  resetRoom,
  setGroupCount,
  shuffleGroups,
  collectAnswers,
  serializeRoom,
  serializeGroups,
} from "./rooms.js";
import { claudeEnabled, summarizeAnswers } from "./claude.js";

const PORT = Number(process.env.PORT ?? 4000);
const MIN_GROUPS = 1;
const MAX_GROUPS = 20;
const SUMMARY_DEBOUNCE_MS = 4000;

const summaryTimers = new Map<string, NodeJS.Timeout>();

async function runSummary(code: string) {
  const room = getRoom(code);
  if (!room) return;
  const answers = collectAnswers(room);
  if (answers.length === 0) return;
  try {
    const summary = await summarizeAnswers(answers);
    if (summary) {
      room.summary = summary;
      broadcastRoomState(code);
    }
  } catch (err) {
    console.error(`[claude] summary failed for room ${code}:`, err);
  }
}

function scheduleSummary(code: string) {
  if (!claudeEnabled) return;
  const existing = summaryTimers.get(code);
  if (existing) clearTimeout(existing);
  summaryTimers.set(
    code,
    setTimeout(() => {
      summaryTimers.delete(code);
      void runSummary(code);
    }, SUMMARY_DEBOUNCE_MS)
  );
}

const app = express();
app.use(cors());
app.get("/health", (_req, res) => res.json({ ok: true }));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" },
});

function broadcastRoomState(code: string) {
  const room = getRoom(code);
  if (!room) return;
  io.to(`host:${code}`).emit("room:state", serializeRoom(room));
}

function broadcastGroups(code: string) {
  const room = getRoom(code);
  if (!room) return;
  io.to(`room:${code}`).emit("room:groups", serializeGroups(room));
}

io.on("connection", (socket) => {
  socket.on("host:create", (_payload, callback) => {
    const room = createRoom();
    room.hostSocketId = socket.id;
    socket.join(`host:${room.code}`);
    callback({ ok: true, state: serializeRoom(room), claudeEnabled });
  });

  socket.on("host:rejoin", ({ code }: { code: string }, callback) => {
    const room = getRoom(code);
    if (!room) {
      callback({ ok: false, error: "존재하지 않는 방 코드입니다." });
      return;
    }
    room.hostSocketId = socket.id;
    socket.join(`host:${room.code}`);
    callback({ ok: true, state: serializeRoom(room), claudeEnabled });
  });

  socket.on("host:summarize-now", ({ code }: { code: string }, callback) => {
    const room = getRoom(code);
    if (!room) {
      callback({ ok: false, error: "존재하지 않는 방 코드입니다." });
      return;
    }
    if (!claudeEnabled) {
      callback({ ok: false, error: "Claude API 키가 설정되지 않았습니다." });
      return;
    }
    const existing = summaryTimers.get(code);
    if (existing) {
      clearTimeout(existing);
      summaryTimers.delete(code);
    }
    runSummary(code)
      .then(() => callback({ ok: true }))
      .catch(() => callback({ ok: false, error: "요약 생성에 실패했습니다." }));
  });

  socket.on(
    "host:reset",
    ({ code }: { code: string }, callback) => {
      const room = getRoom(code);
      if (!room) {
        callback({ ok: false, error: "존재하지 않는 방 코드입니다." });
        return;
      }
      resetRoom(room);
      const existingTimer = summaryTimers.get(code);
      if (existingTimer) {
        clearTimeout(existingTimer);
        summaryTimers.delete(code);
      }
      io.to(`room:${code}`).emit("participant:reset");
      broadcastRoomState(code);
      callback({ ok: true });
    }
  );

  socket.on(
    "host:set-group-count",
    ({ code, groupCount }: { code: string; groupCount: number }, callback) => {
      const room = getRoom(code);
      if (!room) {
        callback({ ok: false, error: "존재하지 않는 방 코드입니다." });
        return;
      }
      const clamped = Math.min(MAX_GROUPS, Math.max(MIN_GROUPS, Math.floor(groupCount)));
      setGroupCount(room, clamped);
      broadcastRoomState(code);
      broadcastGroups(code);
      callback({ ok: true });
    }
  );

  socket.on("host:shuffle-groups", ({ code }: { code: string }, callback) => {
    const room = getRoom(code);
    if (!room) {
      callback({ ok: false, error: "존재하지 않는 방 코드입니다." });
      return;
    }
    shuffleGroups(room);
    broadcastRoomState(code);
    broadcastGroups(code);
    callback({ ok: true });
  });

  socket.on(
    "participant:join",
    (
      {
        code,
        participantId,
        nickname,
      }: { code: string; participantId: string; nickname: string },
      callback
    ) => {
      const room = getRoom(code);
      if (!room) {
        callback({ ok: false, error: "존재하지 않는 방 코드입니다." });
        return;
      }
      const participant = ensureParticipant(room, participantId, nickname, socket.id);
      socket.join(`room:${code}`);
      broadcastRoomState(code);
      broadcastGroups(code);
      callback({
        ok: true,
        participant: {
          participantId: participant.participantId,
          nickname: participant.nickname,
          groupIndex: participant.groupIndex,
          drawnQuestion: participant.drawnQuestion,
          answerText: participant.answerText,
        },
        groups: serializeGroups(room),
      });
    }
  );

  socket.on(
    "participant:choose-group",
    (
      { code, participantId, groupIndex }: { code: string; participantId: string; groupIndex: number },
      callback
    ) => {
      const room = getRoom(code);
      if (!room) {
        callback({ ok: false, error: "존재하지 않는 방 코드입니다." });
        return;
      }
      const participant = chooseGroup(room, participantId, groupIndex);
      if (!participant) {
        callback({ ok: false, error: "선택할 수 없는 조입니다." });
        return;
      }
      broadcastRoomState(code);
      broadcastGroups(code);
      callback({ ok: true, groupIndex: participant.groupIndex });
    }
  );

  socket.on(
    "participant:draw",
    (
      { code, participantId }: { code: string; participantId: string },
      callback
    ) => {
      const room = getRoom(code);
      if (!room) {
        callback({ ok: false, error: "존재하지 않는 방 코드입니다." });
        return;
      }
      const question = drawQuestion(room, participantId);
      if (!question) {
        callback({ ok: false, error: "참가자를 찾을 수 없습니다. 다시 입장해주세요." });
        return;
      }
      broadcastRoomState(code);
      callback({ ok: true, question });
    }
  );

  socket.on(
    "participant:answer",
    (
      { code, participantId, answerText }: { code: string; participantId: string; answerText: string },
      callback
    ) => {
      const room = getRoom(code);
      if (!room) {
        callback({ ok: false, error: "존재하지 않는 방 코드입니다." });
        return;
      }
      const trimmed = answerText.trim().slice(0, 500);
      const participant = submitAnswer(room, participantId, trimmed);
      if (!participant) {
        callback({ ok: false, error: "참가자를 찾을 수 없습니다. 다시 입장해주세요." });
        return;
      }
      broadcastRoomState(code);
      scheduleSummary(code);
      callback({ ok: true });
    }
  );

  socket.on("disconnect", () => {
    for (const code of Array.from(socket.rooms)) {
      if (code.startsWith("room:")) {
        const roomCode = code.slice("room:".length);
        const room = getRoom(roomCode);
        if (!room) continue;
        for (const participant of room.participants.values()) {
          if (participant.socketId === socket.id) {
            participant.socketId = null;
          }
        }
        broadcastRoomState(roomCode);
      }
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`[server] listening on http://0.0.0.0:${PORT}`);
});
