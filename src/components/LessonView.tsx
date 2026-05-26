'use client';

import { useState } from 'react';
import Link from 'next/link';
import TTSPlayer from '@/components/TTSPlayer';
import { BlockRenderer, QuizRenderer } from '@/components/BlockRenderer';
import type { ProcessedSection } from '@/lib/content-processor';

// ── Types shared between server (page.tsx) and this client component ──────────

export interface LessonMeta {
  lessonId: string;
  title: string;
  rtiHours: number;
  alignedCertifications?: string[];
  prevLessonId: string | null;
  nextLessonId: string | null;
}

export interface LessonListEntry {
  lessonId: string;
  title: string;
  hours: number;
}

export interface LessonVideos {
  intro: string | null;
  overview: string | null;
}

export interface LessonViewProps {
  programFolder: string;
  programName: string;
  moduleId: string;
  moduleName: string;
  lesson: LessonMeta;
  allLessons: LessonListEntry[];
  sections: ProcessedSection[];
  videos: LessonVideos;
}

// ── Section icons ─────────────────────────────────────────────────────────────

const SECTION_ICONS: Record<string, string> = {
  lecture: '▶',
  avatar: '💬',
  objectives: '🎯',
  quiz: '✅',
  assignment: '📋',
  exercise: '🔬',
  concepts: '📚',
  discussion: '💭',
  resources: '🔗',
  content: '📖',
};

// Sections whose TTS reads instructor script vs learner content
const INSTRUCTOR_SCRIPT_SECTIONS = new Set(['lecture', 'avatar']);

// ── Section panel (used in both panes) ───────────────────────────────────────

function SectionPanel({
  section,
  viewMode,
  videos,
}: {
  section: ProcessedSection;
  viewMode: 'learner' | 'instructor';
  videos: LessonVideos;
}) {
  const [showTranscript, setShowTranscript] = useState(false);

  const isScriptSection = INSTRUCTOR_SCRIPT_SECTIONS.has(section.sectionKind);
  const isQuizSection = section.sectionKind === 'quiz';

  // Video applies only to the avatar (Interactive Session Structure) section
  const videoUrl = videos.overview ?? videos.intro ?? null;
  const showVideoInLearner =
    viewMode === 'learner' && section.sectionKind === 'avatar' && !!videoUrl;

  // TTS: script sections only; learner sees it when no video, or transcript is toggled on
  const showTTS =
    isScriptSection &&
    section.ttsScriptParts.length > 0 &&
    (viewMode === 'instructor' || !showVideoInLearner || showTranscript);

  // Content blocks: always visible in instructor pane, and in learner pane when
  // there's no covering video OR transcript is toggled on
  const showContent = viewMode === 'instructor' || !showVideoInLearner || showTranscript;

  return (
    <div className="space-y-3">
      {/* Video — learner pane, avatar section only */}
      {showVideoInLearner && (
        <div className="space-y-2">
          <div className="rounded-xl overflow-hidden border border-indigo-800">
            <video controls preload="metadata" className="w-full aspect-video bg-black">
              <source src={videoUrl!} type="video/mp4" />
            </video>
          </div>

          {/* Transcript toggle — lives under the video */}
          <button
            onClick={() => setShowTranscript((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors ${
              showTranscript
                ? 'border-indigo-700 bg-indigo-900/40 text-indigo-300'
                : 'border-gray-700 text-gray-600 hover:text-gray-300 hover:border-gray-600'
            }`}
          >
            <span>📄</span>
            {showTranscript ? 'Hide lesson content' : 'Show lesson content'}
          </button>
        </div>
      )}

      {/* TTS controls */}
      {showTTS && (
        <div className="flex items-center gap-2 py-2">
          <span className="text-xs text-gray-500 mr-1">
            {viewMode === 'instructor' ? 'Read aloud:' : showVideoInLearner ? 'Audio only:' : 'Listen:'}
          </span>
          <TTSPlayer scriptParts={section.ttsScriptParts} />
        </div>
      )}

      {/* Quiz: structured reveal renderer */}
      {isQuizSection && section.quizQuestions && section.quizQuestions.length > 0 ? (
        <QuizRenderer questions={section.quizQuestions} viewMode={viewMode} />
      ) : (
        showContent && <BlockRenderer blocks={section.blocks} viewMode={viewMode} />
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function LessonView({
  programFolder,
  programName,
  moduleId,
  moduleName,
  lesson,
  allLessons,
  sections,
  videos,
}: LessonViewProps) {
  // On narrow screens, which pane is visible
  const [activePaneNarrow, setActivePaneNarrow] = useState<'learner' | 'instructor'>('learner');

  const visibleSections = sections.filter((s) => s.sectionKind !== 'meta');

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      {/* Top nav */}
      <nav className="border-b border-gray-800 px-6 py-3 flex items-center gap-3 text-sm flex-shrink-0">
        <Link href={`/program/${programFolder}`} className="text-indigo-400 hover:text-indigo-300">
          {programName}
        </Link>
        <span className="text-gray-600">/</span>
        <Link href={`/program/${programFolder}/module/${moduleId}`} className="text-indigo-400 hover:text-indigo-300">
          Module {moduleId}
        </Link>
        <span className="text-gray-600">/</span>
        <span className="text-gray-400 truncate max-w-[30ch]">{lesson.title}</span>
      </nav>

      {/* Narrow-screen pane tabs */}
      <div className="lg:hidden border-b border-gray-800 flex">
        <button
          onClick={() => setActivePaneNarrow('learner')}
          className={`flex-1 py-2 text-xs font-medium transition-colors ${
            activePaneNarrow === 'learner'
              ? 'border-b-2 border-indigo-500 text-indigo-300'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Learner
        </button>
        <button
          onClick={() => setActivePaneNarrow('instructor')}
          className={`flex-1 py-2 text-xs font-medium transition-colors ${
            activePaneNarrow === 'instructor'
              ? 'border-b-2 border-indigo-500 text-indigo-300'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Instructor
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        <aside className="w-56 flex-shrink-0 border-r border-gray-800 bg-gray-900/50 overflow-y-auto hidden lg:block">
          <div className="p-4">
            <p className="text-xs uppercase tracking-widest text-gray-500 mb-3">
              Module {moduleId} Lessons
            </p>
            <div className="space-y-1">
              {allLessons.map((l, idx) => {
                const isActive = l.lessonId === lesson.lessonId;
                const unlocked = idx === 0 || isActive;
                return (
                  <div key={l.lessonId}>
                    {unlocked ? (
                      <Link
                        href={`/program/${programFolder}/module/${moduleId}/lesson/${l.lessonId}`}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors ${
                          isActive
                            ? 'bg-indigo-900/60 text-indigo-200 border border-indigo-800'
                            : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                        }`}
                      >
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-800 text-gray-500 text-xs font-bold flex items-center justify-center">
                          {l.lessonId.replace(/[a-z]/g, '').toUpperCase()}
                        </span>
                        <span className="truncate">{l.title.split(':')[0]}</span>
                      </Link>
                    ) : (
                      <div className="flex items-center gap-2 px-3 py-2 text-xs text-gray-700 cursor-not-allowed">
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-900 text-gray-700 text-xs font-bold flex items-center justify-center">
                          {l.lessonId.replace(/[a-z]/g, '').toUpperCase()}
                        </span>
                        <span className="truncate">{l.title.split(':')[0]}</span>
                        <span className="ml-auto text-gray-800">🔒</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {/* ── Learner pane ─────────────────────────────────────────────────── */}
        <main
          className={`flex-[3] overflow-y-auto border-r border-gray-800 ${
            activePaneNarrow !== 'learner' ? 'hidden lg:flex lg:flex-col' : ''
          }`}
        >
          {/* Pane label */}
          <div className="border-b border-gray-800 px-6 py-3 flex items-center gap-2 bg-gray-900/40">
            <span className="text-xs font-semibold uppercase tracking-widest text-indigo-400">Learner&apos;s View</span>
          </div>

          {/* Lesson header */}
          <div className="border-b border-gray-800 px-6 py-5 bg-gray-900/30">
            <p className="text-xs uppercase tracking-widest text-indigo-400 mb-1.5">
              Lesson {lesson.lessonId.toUpperCase()} · {lesson.rtiHours} RTI hours
            </p>
            <h1 className="text-lg font-semibold text-white mb-3">{lesson.title}</h1>
            {lesson.alignedCertifications && lesson.alignedCertifications.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {lesson.alignedCertifications.map((cert) => (
                  <span key={cert} className="px-2 py-0.5 rounded bg-gray-800 text-gray-400 text-xs">
                    {cert}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Section jump bar */}
          <div className="border-b border-gray-800 px-6 py-2 flex items-center gap-1 overflow-x-auto bg-gray-900/20">
            {visibleSections.map((s) => {
              const icon = SECTION_ICONS[s.sectionKind] ?? '•';
              const anchorId = s.heading.toLowerCase().replace(/[^a-z0-9]+/g, '-');
              return (
                <a
                  key={s.heading}
                  href={`#learner-${anchorId}`}
                  className="flex-shrink-0 px-3 py-1.5 rounded text-xs text-gray-400 hover:bg-gray-800 hover:text-white transition-colors flex items-center gap-1"
                >
                  <span>{icon}</span>
                  <span>{s.heading.split('—')[0].trim()}</span>
                </a>
              );
            })}
          </div>

          {/* Sections */}
          <div className="px-6 py-6 space-y-8 max-w-2xl">
            {visibleSections.map((section) => {
              const anchorId = section.heading.toLowerCase().replace(/[^a-z0-9]+/g, '-');
              return (
                <section key={section.heading} id={`learner-${anchorId}`}>
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-indigo-400 mb-3">
                    {SECTION_ICONS[section.sectionKind] ?? '•'} {section.heading}
                  </h2>
                  <SectionPanel
                    section={section}
                    viewMode="learner"
                    videos={videos}
                  />
                </section>
              );
            })}
          </div>

          {/* Lesson footer */}
          <div className="border-t border-gray-800 px-6 py-5 flex justify-between items-center max-w-2xl">
            {lesson.prevLessonId ? (
              <Link
                href={`/program/${programFolder}/module/${moduleId}/lesson/${lesson.prevLessonId}`}
                className="px-4 py-2 rounded-lg border border-gray-700 text-sm text-gray-400 hover:text-white hover:border-gray-600 transition-colors"
              >
                ← Previous lesson
              </Link>
            ) : (
              <Link
                href={`/program/${programFolder}/module/${moduleId}`}
                className="px-4 py-2 rounded-lg border border-gray-700 text-sm text-gray-400 hover:text-white hover:border-gray-600 transition-colors"
              >
                ← Module overview
              </Link>
            )}
            {lesson.nextLessonId ? (
              <Link
                href={`/program/${programFolder}/module/${moduleId}/lesson/${lesson.nextLessonId}`}
                className="px-4 py-2 rounded-lg bg-indigo-700 hover:bg-indigo-600 text-sm text-white transition-colors"
              >
                Next lesson →
              </Link>
            ) : (
              <button className="px-4 py-2 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-sm text-white transition-colors">
                Complete module ✓
              </button>
            )}
          </div>
        </main>

        {/* ── Instructor pane ──────────────────────────────────────────────── */}
        <aside
          className={`flex-[2] overflow-y-auto bg-gray-900/20 ${
            activePaneNarrow !== 'instructor' ? 'hidden lg:flex lg:flex-col' : ''
          }`}
        >
          {/* Header */}
          <div className="border-b border-gray-800 px-5 py-4 flex items-center gap-2 bg-gray-900/40">
            <span className="text-xs font-semibold uppercase tracking-widest text-gray-500">
              Instructor
            </span>
            <span className="text-gray-700">·</span>
            <span className="text-xs text-gray-600">Script + delivery cues</span>
          </div>

          {/* Sections */}
          <div className="px-5 py-5 space-y-7">
            {visibleSections.map((section) => {
              const anchorId = section.heading.toLowerCase().replace(/[^a-z0-9]+/g, '-');
              return (
                <section key={section.heading} id={`instructor-${anchorId}`}>
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
                    {SECTION_ICONS[section.sectionKind] ?? '•'} {section.heading}
                  </h2>
                  <SectionPanel
                    section={section}
                    viewMode="instructor"
                    videos={videos}
                  />
                </section>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}
