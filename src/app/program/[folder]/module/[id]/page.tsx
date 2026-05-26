import Link from 'next/link';
import { notFound } from 'next/navigation';
import { readDiscoveredProgram } from '@/lib/manifest-reader';
import { listLessons } from '@/lib/lesson-reader';

export default async function ModulePage({
  params,
}: {
  params: { folder: string; id: string };
}) {
  const { folder, id } = params;

  const program = readDiscoveredProgram(folder);
  if (!program) notFound();

  const { manifest } = program;
  const mod = manifest.modules.find((m) => m.id.toLowerCase() === id.toLowerCase());
  if (!mod) notFound();

  const lessons = listLessons(program.contentPath, manifest, id);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Top nav */}
      <nav className="border-b border-gray-800 px-6 py-3 flex items-center gap-3 text-sm">
        <Link href={`/program/${folder}`} className="text-indigo-400 hover:text-indigo-300">
          {manifest.display_name}
        </Link>
        <span className="text-gray-600">/</span>
        <span className="text-gray-400">Module {mod.id}</span>
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-12">
        {/* Module header */}
        <div className="mb-10">
          <span className="text-xs uppercase tracking-widest text-indigo-400">
            Module {mod.id} · {mod.hours} hours
          </span>
          <h1 className="text-2xl font-semibold text-white mt-2 mb-3">{mod.title}</h1>
          <p className="text-gray-400 text-sm">
            {lessons.length} lessons · Milestone {mod.milestone}
          </p>
        </div>

        {/* Module intro */}
        <div className="mb-8 rounded-lg border border-indigo-900 bg-indigo-950/30 px-5 py-4">
          <p className="text-sm text-gray-400">
            Welcome to Module {mod.id}: <em>{mod.title}</em>. This module contains{' '}
            {lessons.length} lessons. Work through them in order -- each builds on the previous.
          </p>
        </div>

        {/* Lesson list */}
        <div className="space-y-2">
          {lessons.map((lesson, idx) => (
            <Link
              key={lesson.lessonId}
              href={`/program/${folder}/module/${id}/lesson/${lesson.lessonId}`}
              className={`flex items-center gap-4 rounded-lg border px-5 py-4 transition-colors ${
                idx === 0
                  ? 'border-indigo-700 bg-indigo-950/30 hover:border-indigo-500'
                  : 'border-gray-800 bg-gray-900/40 hover:border-gray-600'
              }`}
            >
              <span className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-800 text-gray-400 text-xs font-bold flex items-center justify-center">
                {lesson.lessonId.toUpperCase()}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{lesson.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{lesson.hours} hours</p>
              </div>
              <span className={`text-xs ${idx === 0 ? 'text-indigo-400' : 'text-gray-600'}`}>
                {idx === 0 ? 'Start →' : 'Locked'}
              </span>
            </Link>
          ))}
        </div>

        <p className="mt-8 text-xs text-gray-600 text-center">
          Preview mode -- progress tracking not yet active
        </p>
      </main>
    </div>
  );
}
