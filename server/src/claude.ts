import Anthropic from "@anthropic-ai/sdk";

const apiKey = process.env.ANTHROPIC_API_KEY;
export const claudeEnabled = Boolean(apiKey);

const client = apiKey ? new Anthropic({ apiKey }) : null;

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

export interface AnswerInput {
  nickname: string;
  groupIndex: number;
  question: string;
  answer: string;
}

const SUMMARY_TOOL = {
  name: "provide_summary",
  description: "아이스브레이킹 답변들에 대한 요약을 구조화된 형태로 제공합니다.",
  input_schema: {
    type: "object" as const,
    properties: {
      text: {
        type: "string" as const,
        description: "전체적인 분위기와 흐름을 2문장 이내 한국어로 요약",
      },
      keywords: {
        type: "array" as const,
        items: { type: "string" as const },
        description: "답변들에서 반복되거나 눈에 띄는 핵심 키워드 3~6개",
      },
      highlights: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            nickname: { type: "string" as const },
            note: { type: "string" as const, description: "왜 흥미로운지 한 줄 설명" },
          },
          required: ["nickname", "note"],
        },
        description: "특히 재미있거나 눈에 띄는 답변 1~3개",
      },
    },
    required: ["text", "keywords", "highlights"],
  },
};

export async function summarizeAnswers(answers: AnswerInput[]): Promise<AnswerSummary | null> {
  if (!client || answers.length === 0) return null;

  const transcript = answers
    .map((a, i) => `${i + 1}. [${a.groupIndex + 1}조] ${a.nickname} - Q: ${a.question} / A: ${a.answer}`)
    .join("\n");

  const message = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 700,
    tools: [SUMMARY_TOOL],
    tool_choice: { type: "tool", name: "provide_summary" },
    messages: [
      {
        role: "user",
        content: `다음은 기업 교육 오프닝 아이스브레이킹 세션에서 참가자들이 제출한 질문-답변 목록입니다. 진행자가 강의를 시작하기 전 화면에서 바로 참고할 수 있도록 요약해주세요.\n\n${transcript}`,
      },
    ],
  });

  const toolUse = message.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );
  if (!toolUse) return null;

  const input = toolUse.input as { text: string; keywords: string[]; highlights: AnswerHighlight[] };
  return { ...input, generatedAt: Date.now() };
}
