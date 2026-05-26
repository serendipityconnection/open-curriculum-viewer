import type { ProgramManifest, ModuleEntry } from './manifest-reader';
import {
  getCompletedPhases, getPhaseScore, hasEngagementAttestation,
} from './progress-store';

// ── Types ─────────────────────────────────────────────────────────────────────

export type UnlockStatus = 'locked' | 'unlocked' | 'completed';

export interface ModuleUnlockState {
  moduleId: string;
  status: UnlockStatus;
  blockedBy?: string;   // human-readable reason if locked
}

export interface PhaseUnlockState {
  phaseId: string;
  phaseType: string;
  status: UnlockStatus;
  blockedBy?: string;
}

// ── Module-level unlock ───────────────────────────────────────────────────────
// A module is unlocked when all modules in the prior milestone are completed.

export async function getModuleUnlockStates(
  programLearnerId: string,
  manifest: ProgramManifest,
): Promise<ModuleUnlockState[]> {
  const completed = await getCompletedPhases(programLearnerId, manifest.program_id);
  const completedLessons = new Set(completed.map((p) => p.lessonId));

  // Build a milestone → modules map
  const byMilestone = new Map<number, ModuleEntry[]>();
  for (const mod of manifest.modules) {
    if (!byMilestone.has(mod.milestone)) byMilestone.set(mod.milestone, []);
    byMilestone.get(mod.milestone)!.push(mod);
  }

  const milestones = Array.from(byMilestone.keys()).sort((a, b) => a - b);
  const completedMilestones = new Set<number>();

  // A milestone is complete when all its modules have at least one completed lesson
  for (const ms of milestones) {
    const mods = byMilestone.get(ms)!;
    const allDone = mods.every((m) => completedLessons.has(m.id));
    if (allDone) completedMilestones.add(ms);
  }

  return manifest.modules.map((mod) => {
    const priorMilestone = mod.milestone - 1;
    const isFirstMilestone = mod.milestone === milestones[0];

    if (isFirstMilestone || completedMilestones.has(priorMilestone)) {
      const done = completedLessons.has(mod.id);
      return { moduleId: mod.id, status: done ? 'completed' : 'unlocked' };
    }

    return {
      moduleId: mod.id,
      status: 'locked',
      blockedBy: `Complete Milestone ${priorMilestone} first`,
    };
  });
}

// ── Phase-level unlock ────────────────────────────────────────────────────────
// Phases within a lesson unlock sequentially. Special gates for advisory sessions.

export async function getPhaseUnlockStates(params: {
  programLearnerId: string;
  programId: string;
  moduleId: string;
  lessonId: string;
  phases: Array<{ id: string; type: string; required?: boolean }>;
}): Promise<PhaseUnlockState[]> {
  const { programLearnerId, programId, moduleId, lessonId, phases } = params;
  const completed = await getCompletedPhases(programLearnerId, programId);
  const completedPhaseIds = new Set(
    completed.filter((p) => p.lessonId === lessonId).map((p) => p.phaseId),
  );

  const states: PhaseUnlockState[] = [];
  let allPriorComplete = true;

  for (const phase of phases) {
    const isDone = completedPhaseIds.has(phase.id);

    if (!allPriorComplete) {
      states.push({ phaseId: phase.id, phaseType: phase.type, status: 'locked', blockedBy: 'Complete prior phases first' });
      continue;
    }

    // Product engagement check gates the advisory session
    if (phase.type === 'advisory_session') {
      const engagementCheckId = `${moduleId}_engagement_check`;
      const attested = await hasEngagementAttestation(programLearnerId, engagementCheckId);
      if (!attested) {
        states.push({
          phaseId: phase.id,
          phaseType: phase.type,
          status: 'locked',
          blockedBy: 'Complete the product engagement check first',
        });
        // Don't advance — engagement check must come before advisory session
        continue;
      }
    }

    states.push({ phaseId: phase.id, phaseType: phase.type, status: isDone ? 'completed' : 'unlocked' });

    if (!isDone && phase.required !== false) {
      allPriorComplete = false;
    }
  }

  return states;
}

// ── Knowledge check score gate ────────────────────────────────────────────────

export async function meetsScoreRequirement(
  programLearnerId: string,
  lessonId: string,
  phaseId: string,
  minimumScore: number,
): Promise<boolean> {
  const score = await getPhaseScore(programLearnerId, lessonId, phaseId);
  if (score === null) return false;
  return score >= minimumScore;
}
