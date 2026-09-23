export interface Question {
  id: string;
  text: string;
}

export interface ParticipantView {
  participantId: string;
  nickname: string;
  connected: boolean;
  groupIndex: number;
  drawnQuestion: Question | null;
  drawnAt: number | null;
  answerText: string | null;
  answeredAt: number | null;
}

export interface AnswerHighlight {
  nickname: string;
  note: string;
}

export interface AnswerSummary {
  text: string;
  keywords: string[];
  highlights: AnswerHighlight[];
  generatedAt: number;
}

export interface RoomState {
  code: string;
  groupCount: number;
  summary: AnswerSummary | null;
  participants: ParticipantView[];
}

export interface GroupMember {
  participantId: string;
  nickname: string;
}

export interface GroupInfo {
  index: number;
  members: GroupMember[];
}

export interface GroupsState {
  groupCount: number;
  groups: GroupInfo[];
}
