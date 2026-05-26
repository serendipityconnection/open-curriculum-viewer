import {
  pgTable, pgEnum, uuid, text, integer, boolean,
  jsonb, timestamp, decimal, unique,
} from 'drizzle-orm/pg-core';

// ── Enums ─────────────────────────────────────────────────────────────────────

export const identityTypeEnum = pgEnum('identity_type', [
  'learner', 'sponsor', 'admin', 'avatar',
]);

export const programStatusEnum = pgEnum('program_status', [
  'pending_review', 'active', 'updated', 'invalid', 'disabled', 'archived',
]);

export const enrollmentStatusEnum = pgEnum('enrollment_status', [
  'active', 'suspended', 'completed', 'expired',
]);

export const dataAccessEnum = pgEnum('data_access', [
  'session_summaries', 'action_plans', 'scores', 'full_transcript',
]);

// ── Identities ────────────────────────────────────────────────────────────────
// All principals: learners, sponsors, admins, AI avatars

export const identities = pgTable('identities', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: identityTypeEnum('type').notNull(),
  displayName: text('display_name').notNull(),
  email: text('email'),
  passwordHash: text('password_hash'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ── Program Registry ──────────────────────────────────────────────────────────
// Written by the content scanner on startup.

export const programs = pgTable('programs', {
  programId: text('program_id').primaryKey(),
  displayName: text('display_name').notNull(),
  schemaVersion: integer('schema_version').notNull(),
  contentVersion: text('content_version').notNull(),
  status: programStatusEnum('status').notNull().default('pending_review'),
  manifestHash: text('manifest_hash'),
  contentPath: text('content_path').notNull(),
  installedAt: timestamp('installed_at', { withTimezone: true }).defaultNow(),
  lastScannedAt: timestamp('last_scanned_at', { withTimezone: true }),
  activatedAt: timestamp('activated_at', { withTimezone: true }),
});

// ── Avatars ───────────────────────────────────────────────────────────────────
// Derived from profile.md files by the Discovery Service.
// persona_spec JSONB is a runtime copy — profile.md is the source of truth.

export const avatars = pgTable('avatars', {
  id: uuid('id').primaryKey().defaultRandom(),
  uid: text('uid').notNull().unique(),
  stableUuid: uuid('stable_uuid').notNull().unique(), // from profile.md frontmatter — never changes
  programId: text('program_id').references(() => programs.programId),
  tier: integer('tier').notNull(),
  role: text('role').notNull(),
  personaSpec: jsonb('persona_spec').notNull(), // derived from profile.md narrative fields
  systemPromptBase: text('system_prompt_base').notNull(),
  active: boolean('active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ── Enrollments ───────────────────────────────────────────────────────────────

export const enrollments = pgTable('enrollments', {
  id: uuid('id').primaryKey().defaultRandom(),
  learnerId: uuid('learner_id').notNull().references(() => identities.id),
  programId: text('program_id').notNull().references(() => programs.programId),
  offeringId: text('offering_id').notNull(),
  status: enrollmentStatusEnum('status').notNull().default('active'),
  sponsorId: uuid('sponsor_id').references(() => identities.id),
  cohortId: text('cohort_id'),
  enrolledAt: timestamp('enrolled_at', { withTimezone: true }).defaultNow(),
  // Opaque cross-boundary key — the only identifier that crosses into program data.
  // Never contains PII. Generated at enrollment.
  programLearnerId: uuid('program_learner_id').notNull().defaultRandom(),
}, (t) => ({
  uniqLearnerProgram: unique().on(t.learnerId, t.programId),
}));

// ── Learner Progress ──────────────────────────────────────────────────────────
// One row per completed phase. The unlock rule engine reads this table.

export const learnerProgress = pgTable('learner_progress', {
  id: uuid('id').primaryKey().defaultRandom(),
  programLearnerId: uuid('program_learner_id').notNull(),
  programId: text('program_id').notNull(),
  moduleId: text('module_id').notNull(),
  lessonId: text('lesson_id').notNull(),
  // Phase types: video | knowledge_check | advisory_session |
  //              product_engagement_check | lab | capstone_submission
  phaseType: text('phase_type').notNull(),
  phaseId: text('phase_id').notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }).defaultNow(),
  score: decimal('score', { precision: 5, scale: 2 }),  // null if phase has no score
  metadata: jsonb('metadata'),                           // phase-specific extra data
}, (t) => ({
  uniqPhase: unique().on(t.programLearnerId, t.lessonId, t.phaseId),
}));

// ── Product Engagement Attestations ──────────────────────────────────────────
// Self-attestation gate before advisory sessions in Modules D, F, G.

export const productEngagementAttestations = pgTable('product_engagement_attestations', {
  id: uuid('id').primaryKey().defaultRandom(),
  programLearnerId: uuid('program_learner_id').notNull(),
  programId: text('program_id').notNull(),
  moduleId: text('module_id').notNull(),
  engagementCheckId: text('engagement_check_id').notNull(),
  // Options: watched_demo | tried_product | scheduled_call
  selectedOptions: text('selected_options').array().notNull(),
  attestedAt: timestamp('attested_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  uniqCheck: unique().on(t.programLearnerId, t.engagementCheckId),
}));

// ── AI Sessions ───────────────────────────────────────────────────────────────
// Full transcript + summary for every avatar session.

export const aiSessions = pgTable('ai_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  programLearnerId: uuid('program_learner_id').notNull(),
  avatarUid: text('avatar_uid').notNull().references(() => avatars.uid),
  programId: text('program_id').notNull(),
  sessionType: text('session_type').notNull(),
  moduleId: text('module_id'),
  lessonId: text('lesson_id'),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  transcript: jsonb('transcript').notNull().default([]),
  sessionSummary: text('session_summary'),   // written async by Inngest job after session
  actionPlan: text('action_plan'),
  scores: jsonb('scores'),
  tokenCount: integer('token_count'),
  modelUsed: text('model_used'),
});

// ── Avatar Memory ─────────────────────────────────────────────────────────────
// Per-learner memory profile for each avatar. Updated during sessions.

export const studentAvatarMemory = pgTable('student_avatar_memory', {
  id: uuid('id').primaryKey().defaultRandom(),
  programLearnerId: uuid('program_learner_id').notNull(),
  avatarUid: text('avatar_uid').notNull().references(() => avatars.uid),
  memoryProfile: jsonb('memory_profile').notNull().default({}),
  profileVersion: integer('profile_version').default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  uniqMemory: unique().on(t.programLearnerId, t.avatarUid),
}));

// ── Cross-Avatar Visibility Grants ────────────────────────────────────────────

export const avatarVisibilityGrants = pgTable('avatar_visibility_grants', {
  id: uuid('id').primaryKey().defaultRandom(),
  observerAvatarUid: text('observer_avatar_uid').notNull().references(() => avatars.uid),
  subjectAvatarUid: text('subject_avatar_uid').notNull().references(() => avatars.uid),
  dataAccess: dataAccessEnum('data_access').notNull(),
  grantedAt: timestamp('granted_at', { withTimezone: true }).defaultNow(),
});

// ── Inference Records ─────────────────────────────────────────────────────────
// All Model Gateway calls — enables cost tracking per program and learner.

export const inferenceRecords = pgTable('inference_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  programId: text('program_id').notNull(),
  programLearnerId: uuid('program_learner_id'),  // null for system-level calls
  useCase: text('use_case').notNull(),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  audioSeconds: decimal('audio_seconds', { precision: 8, scale: 2 }),
  costUsdEstimate: decimal('cost_usd_estimate', { precision: 10, scale: 6 }),
  durationMs: integer('duration_ms'),
  cached: boolean('cached').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ── Account Preferences ───────────────────────────────────────────────────────
// Per-learner UI preferences — TTS opt-in, interface mode.

export const accountPreferences = pgTable('account_preferences', {
  learnerId: uuid('learner_id').primaryKey().references(() => identities.id),
  ttsEnabled: boolean('tts_enabled').default(false),
  ttsProvider: text('tts_provider').default('openai'),
  // avatar_guided | traditional_lms
  learnerInterface: text('learner_interface').default('avatar_guided'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ── Type Exports ──────────────────────────────────────────────────────────────

export type Identity = typeof identities.$inferSelect;
export type NewIdentity = typeof identities.$inferInsert;
export type Program = typeof programs.$inferSelect;
export type Avatar = typeof avatars.$inferSelect;
export type Enrollment = typeof enrollments.$inferSelect;
export type LearnerProgress = typeof learnerProgress.$inferSelect;
export type NewLearnerProgress = typeof learnerProgress.$inferInsert;
export type AiSession = typeof aiSessions.$inferSelect;
export type NewAiSession = typeof aiSessions.$inferInsert;
export type StudentAvatarMemory = typeof studentAvatarMemory.$inferSelect;
export type AccountPreferences = typeof accountPreferences.$inferSelect;
