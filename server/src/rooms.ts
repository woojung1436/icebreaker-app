import questions from "./questions.ko.json" with { type: "json" };
import type { AnswerInput, AnswerSummary } from "./claude.js";

export interface Question {
  id: string;
  text: string;
}

export interface Participant {
  participantId: string;
  nickname: string;
  socketId: string | null;
  groupIndex: number;
  drawnQuestion: Question | null;
  drawnAt: number | null;
  answerText: string | null;
  answeredAt: number | null;
}

export interface Room {
  code: string;
  createdAt: number;
  hostSocketId: string | null;
  participants: Map<string, Participant>;
  usedQuestionIds: Set<string>;
  groupCount: number;
  summary: AnswerSummary | null;
}

const DEFAULT_GROUP_COUNT = 4;

const rooms = new Map<string, Room>();

function generateRoomCode(): string {
  let code: string;
  do {
    code = String(Math.floor(1000 + Math.random() * 9000));
  } while (rooms.has(code));
  return code;
}

export function createRoom(): Room {
  const code = generateRoomCode();
  const room: Room = {
    code,
    createdAt: Date.now(),
    hostSocketId: null,
    participants: new Map(),
    usedQuestionIds: new Set(),
    groupCount: DEFAULT_GROUP_COUNT,
    summary: null,
  };
  rooms.set(code, room);
  return room;
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code);
}

export function ensureParticipant(
  room: Room,
  participantId: string,
  nickname: string,
  socketId: string
): Participant {
  const existing = room.participants.get(participantId);
  if (existing) {
    existing.socketId = socketId;
    if (nickname) existing.nickname = nickname;
    return existing;
  }
  const participant: Participant = {
    participantId,
    nickname,
    socketId,
    groupIndex: -1,
    drawnQuestion: null,
    drawnAt: null,
    answerText: null,
    answeredAt: null,
  };
  room.participants.set(participantId, participant);
  return participant;
}

export function chooseGroup(
  room: Room,
  participantId: string,
  groupIndex: number
): Participant | null {
  const participant = room.participants.get(participantId);
  if (!participant) return null;
  if (groupIndex < 0 || groupIndex >= room.groupCount) return null;
  participant.groupIndex = groupIndex;
  return participant;
}

export function setGroupCount(room: Room, groupCount: number): void {
  room.groupCount = groupCount;
  for (const participant of room.participants.values()) {
    if (participant.groupIndex >= groupCount) {
      participant.groupIndex = -1;
    }
  }
}

export function shuffleGroups(room: Room): void {
  const ids = Array.from(room.participants.keys());
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  ids.forEach((id, index) => {
    const participant = room.participants.get(id)!;
    participant.groupIndex = index % room.groupCount;
  });
}

export function drawQuestion(room: Room, participantId: string): Question | null {
  const participant = room.participants.get(participantId);
  if (!participant) return null;
  if (participant.drawnQuestion) return participant.drawnQuestion;

  const allQuestions = questions as Question[];
  let available = allQuestions.filter((q) => !room.usedQuestionIds.has(q.id));
  if (available.length === 0) {
    room.usedQuestionIds.clear();
    available = allQuestions;
  }
  const picked = available[Math.floor(Math.random() * available.length)];
  room.usedQuestionIds.add(picked.id);
  participant.drawnQuestion = picked;
  participant.drawnAt = Date.now();
  return picked;
}

export function submitAnswer(
  room: Room,
  participantId: string,
  answerText: string
): Participant | null {
  const participant = room.participants.get(participantId);
  if (!participant) return null;
  participant.answerText = answerText;
  participant.answeredAt = Date.now();
  return participant;
}

export function resetRoom(room: Room): void {
  room.usedQuestionIds.clear();
  room.summary = null;
  for (const participant of room.participants.values()) {
    participant.drawnQuestion = null;
    participant.drawnAt = null;
    participant.answerText = null;
    participant.answeredAt = null;
  }
}

export function collectAnswers(room: Room): AnswerInput[] {
  const answers: AnswerInput[] = [];
  for (const p of room.participants.values()) {
    if (p.drawnQuestion && p.answerText) {
      answers.push({
        nickname: p.nickname,
        groupIndex: p.groupIndex,
        question: p.drawnQuestion.text,
        answer: p.answerText,
      });
    }
  }
  return answers;
}

export function serializeRoom(room: Room) {
  return {
    code: room.code,
    groupCount: room.groupCount,
    summary: room.summary,
    participants: Array.from(room.participants.values()).map((p) => ({
      participantId: p.participantId,
      nickname: p.nickname,
      connected: p.socketId !== null,
      groupIndex: p.groupIndex,
      drawnQuestion: p.drawnQuestion,
      drawnAt: p.drawnAt,
      answerText: p.answerText,
      answeredAt: p.answeredAt,
    })),
  };
}

export function serializeGroups(room: Room) {
  const groups: { index: number; members: { participantId: string; nickname: string }[] }[] =
    Array.from({ length: room.groupCount }, (_, index) => ({ index, members: [] }));
  for (const p of room.participants.values()) {
    if (p.groupIndex >= 0 && p.groupIndex < room.groupCount) {
      groups[p.groupIndex].members.push({ participantId: p.participantId, nickname: p.nickname });
    }
  }
  return { groupCount: room.groupCount, groups };
}
