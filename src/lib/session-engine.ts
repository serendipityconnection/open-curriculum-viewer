import type { AvatarProfile } from './manifest-reader';
import { appendSessionTurn } from './progress-store';
import { streamChat, complete as gatewayComplete } from './model-gateway';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SessionMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface SessionContext {
  sessionId: string;
  programLearnerId: string;
  programDisplayName: string;
  avatarProfile: AvatarProfile;
  sessionType: string;
  moduleId?: string;
  lessonId?: string;
  deliveryScript?: unknown;
  memoryProfile?: Record<string, unknown>;
  history: SessionMessage[];
}

// ── System prompt assembly ─────────────────────────────────────────────────────

function buildSystemPrompt(ctx: SessionContext): string {
  const { avatarProfile, sessionType, memoryProfile, deliveryScript, programDisplayName } = ctx;

  // Layer 1 — Persistent persona (same across all sessions for this avatar)
  const layer1 = `${avatarProfile.content.trim()}

HARD RULES:
- You are ${extractName(avatarProfile.content)}. Stay completely in character at all times.
- Never reveal that you are an AI language model or mention Claude, Anthropic, or any AI system.
- Never give answers directly — guide through questions, scenarios, and Socratic dialogue.
- Never discuss learners other than the one you are currently speaking with.
- If asked about another learner, decline and redirect to the current learner's context.`;

  // Layer 2 — Session mode (who you're talking to, what context you have)
  const memory = memoryProfile && Object.keys(memoryProfile).length > 0
    ? `\nLEARNER MEMORY PROFILE:\n${JSON.stringify(memoryProfile, null, 2)}`
    : '';

  const layer2 = `SESSION MODE: ${sessionType}
You are speaking with a ${programDisplayName} learner.${memory}`;

  // Layer 3 — Session-type instructions (conduct rules for this specific session)
  const layer3 = buildLayer3(sessionType, deliveryScript);

  return [layer1, layer2, layer3].join('\n\n---\n\n');
}

function buildLayer3(sessionType: string, deliveryScript: unknown): string {
  switch (sessionType) {
    case 'advisory_session':
      return `SESSION CONDUCT — Advisory Session:
- Open by asking the learner where they are in their organization's AI journey before introducing any frameworks.
- Use Socratic method throughout — never lecture, always question.
- Reference your specific professional experience (from your background) as the primary frame for advice.
- Challenge assumptions that assume unlimited organizational authority.
- Close with a specific, actionable next step the learner can take this week.
${deliveryScript ? `\nDELIVERY CONTEXT:\n${JSON.stringify(deliveryScript, null, 2)}` : ''}`;

    case 'module_debrief':
      return `SESSION CONDUCT — Module Debrief:
- Open with a scenario that surfaces whether the learner understood the core concept — not a recap question.
- Score responses internally on depth of understanding (surface / applied / integrated).
- Produce an action plan at the close: 3 specific things to do before the next module.
- End positively — name what the learner demonstrated well before naming gaps.`;

    case 'onboarding':
      return `SESSION CONDUCT — Onboarding:
- Build the learner's memory profile: ask about their current role, organization size, AI maturity, primary challenge, and 90-day goal.
- Be warm and curious — this is the first impression.
- Close by telling them what their first lesson covers and what to expect.`;

    default:
      return `SESSION CONDUCT: Engage helpfully and stay in character.`;
  }
}

function extractName(content: string): string {
  const match = content.match(/^#\s+(.+?)\s+—/m);
  return match ? match[1] : 'the advisor';
}

// ── Streaming chat ────────────────────────────────────────────────────────────

export async function* streamAvatarResponse(
  ctx: SessionContext,
  userMessage: string,
): AsyncIterable<string> {
  const systemPrompt = buildSystemPrompt(ctx);
  const messages = [
    ...ctx.history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user' as const, content: userMessage },
  ];

  let fullResponse = '';
  for await (const token of streamChat({
    useCase: 'avatar_session',
    systemPrompt,
    messages,
    programId: ctx.sessionId,  // progress-store has the real programId; sessionId is fine for cost tracking here
    programLearnerId: ctx.programLearnerId,
  })) {
    fullResponse += token;
    yield token;
  }

  const now = new Date().toISOString();
  await appendSessionTurn(ctx.sessionId, { role: 'user', content: userMessage, timestamp: now });
  await appendSessionTurn(ctx.sessionId, { role: 'assistant', content: fullResponse, timestamp: now });
}

// ── Single-turn completion (grading, summaries) ───────────────────────────────

export async function complete(params: {
  useCase: 'artifact_grading' | 'session_summary' | 'feedback_analysis';
  systemPrompt: string;
  userPrompt: string;
  programId: string;
}): Promise<string> {
  return gatewayComplete({
    useCase: params.useCase,
    systemPrompt: params.systemPrompt,
    userPrompt: params.userPrompt,
    programId: params.programId,
  });
}
