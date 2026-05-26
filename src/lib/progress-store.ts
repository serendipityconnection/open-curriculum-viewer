import { eq, and } from 'drizzle-orm';
import { db } from '@/db';
import {
  learnerProgress, productEngagementAttestations,
  aiSessions, studentAvatarMemory,
  type NewLearnerProgress, type NewAiSession,
} from '@/db/schema';

// ── Progress reads ────────────────────────────────────────────────────────────

export async function getCompletedPhases(
  programLearnerId: string,
  programId: string,
): Promise<Array<{ lessonId: string; phaseId: string; phaseType: string; score: string | null }>> {
  return db
    .select({
      lessonId: learnerProgress.lessonId,
      phaseId: learnerProgress.phaseId,
      phaseType: learnerProgress.phaseType,
      score: learnerProgress.score,
    })
    .from(learnerProgress)
    .where(
      and(
        eq(learnerProgress.programLearnerId, programLearnerId),
        eq(learnerProgress.programId, programId),
      ),
    );
}

export async function isPhaseComplete(
  programLearnerId: string,
  lessonId: string,
  phaseId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: learnerProgress.id })
    .from(learnerProgress)
    .where(
      and(
        eq(learnerProgress.programLearnerId, programLearnerId),
        eq(learnerProgress.lessonId, lessonId),
        eq(learnerProgress.phaseId, phaseId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function getPhaseScore(
  programLearnerId: string,
  lessonId: string,
  phaseId: string,
): Promise<number | null> {
  const rows = await db
    .select({ score: learnerProgress.score })
    .from(learnerProgress)
    .where(
      and(
        eq(learnerProgress.programLearnerId, programLearnerId),
        eq(learnerProgress.lessonId, lessonId),
        eq(learnerProgress.phaseId, phaseId),
      ),
    )
    .limit(1);
  if (!rows.length || rows[0].score === null) return null;
  return parseFloat(rows[0].score);
}

// ── Progress writes ───────────────────────────────────────────────────────────

export async function markPhaseComplete(
  entry: Omit<NewLearnerProgress, 'id' | 'completedAt'>,
): Promise<void> {
  await db
    .insert(learnerProgress)
    .values(entry)
    .onConflictDoNothing(); // idempotent — completing twice is a no-op
}

// ── Product engagement attestations ──────────────────────────────────────────

export async function hasEngagementAttestation(
  programLearnerId: string,
  engagementCheckId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: productEngagementAttestations.id })
    .from(productEngagementAttestations)
    .where(
      and(
        eq(productEngagementAttestations.programLearnerId, programLearnerId),
        eq(productEngagementAttestations.engagementCheckId, engagementCheckId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function saveEngagementAttestation(params: {
  programLearnerId: string;
  programId: string;
  moduleId: string;
  engagementCheckId: string;
  selectedOptions: string[];
}): Promise<void> {
  await db
    .insert(productEngagementAttestations)
    .values(params)
    .onConflictDoNothing();
}

// ── Session management ────────────────────────────────────────────────────────

export async function createSession(
  entry: Omit<NewAiSession, 'id' | 'startedAt' | 'transcript'>,
): Promise<string> {
  const rows = await db
    .insert(aiSessions)
    .values({ ...entry, transcript: [] })
    .returning({ id: aiSessions.id });
  return rows[0].id;
}

export async function appendSessionTurn(
  sessionId: string,
  turn: { role: 'user' | 'assistant'; content: string; timestamp: string },
): Promise<void> {
  // Append to transcript JSONB array
  await db.execute(
    `UPDATE ai_sessions
     SET transcript = transcript || $1::jsonb
     WHERE id = $2`,
    [JSON.stringify([turn]), sessionId],
  );
}

export async function closeSession(
  sessionId: string,
  params: { tokenCount?: number; modelUsed?: string },
): Promise<void> {
  await db
    .update(aiSessions)
    .set({ endedAt: new Date(), ...params })
    .where(eq(aiSessions.id, sessionId));
}

// ── Avatar memory ─────────────────────────────────────────────────────────────

export async function getAvatarMemory(
  programLearnerId: string,
  avatarUid: string,
): Promise<Record<string, unknown>> {
  const rows = await db
    .select({ memoryProfile: studentAvatarMemory.memoryProfile })
    .from(studentAvatarMemory)
    .where(
      and(
        eq(studentAvatarMemory.programLearnerId, programLearnerId),
        eq(studentAvatarMemory.avatarUid, avatarUid),
      ),
    )
    .limit(1);
  return (rows[0]?.memoryProfile as Record<string, unknown>) ?? {};
}

export async function updateAvatarMemory(
  programLearnerId: string,
  avatarUid: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await db
    .insert(studentAvatarMemory)
    .values({
      programLearnerId,
      avatarUid,
      memoryProfile: patch,
      profileVersion: 1,
    })
    .onConflictDoUpdate({
      target: [studentAvatarMemory.programLearnerId, studentAvatarMemory.avatarUid],
      set: {
        memoryProfile: patch,
        profileVersion: db.execute(`profile_version + 1`) as unknown as number,
        updatedAt: new Date(),
      },
    });
}
