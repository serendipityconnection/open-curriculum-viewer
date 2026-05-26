import Link from 'next/link';
import { notFound } from 'next/navigation';
import { readDiscoveredProgram } from '@/lib/manifest-reader';

export default async function ProgramPage({ params }: { params: { folder: string } }) {
  const program = readDiscoveredProgram(params.folder);
  if (!program) notFound();

  const { manifest } = program;
  const { folder } = params;

  const byMilestone = new Map<number, typeof manifest.modules>();
  for (const mod of manifest.modules) {
    if (!byMilestone.has(mod.milestone)) byMilestone.set(mod.milestone, []);
    byMilestone.get(mod.milestone)!.push(mod);
  }
  const milestones = Array.from(byMilestone.keys()).sort((a, b) => a - b);

  return (
    <main className="max-w-4xl mx-auto px-6 py-12">
      {/* Header */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-2">
          <Link href="/" className="text-xs text-gray-600 hover:text-gray-400 transition-colors">
            ← All programs
          </Link>
        </div>
        <p className="text-xs uppercase tracking-widest text-indigo-400 mb-2">
          {manifest.publisher}
        </p>
        <h1 className="text-3xl font-semibold text-white mb-2">{manifest.display_name}</h1>
        <p className="text-gray-400 text-sm">
          {manifest.total_hours} hours &middot; {manifest.modules.length} modules &middot; {manifest.program_type}
        </p>
      </div>

      {/* Preview notice */}
      <div className="mb-8 rounded-lg border border-amber-800 bg-amber-950/40 px-4 py-3 text-amber-300 text-sm">
        <strong>Preview mode</strong> -- all lessons are accessible. Progress tracking is not yet active.
      </div>

      {/* Module map */}
      <div className="space-y-10">
        {milestones.map((ms) => (
          <section key={ms}>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-indigo-400 mb-4">
              {manifest.milestone_labels?.[ms] ?? `Milestone ${ms}`}
            </h2>
            <div className="space-y-2">
              {byMilestone.get(ms)!.map((mod) => (
                <Link
                  key={mod.id}
                  href={`/program/${folder}/module/${mod.id.toLowerCase()}`}
                  className="flex items-center gap-4 rounded-lg border border-gray-700 bg-gray-900 hover:border-indigo-600 px-5 py-4 transition-colors group"
                >
                  <span className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-900 text-indigo-300 text-xs font-bold flex items-center justify-center">
                    {mod.id}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{mod.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {mod.hours}h{mod.dynamic ? ' · live content' : ''}
                    </p>
                  </div>
                  <span className="text-indigo-400 text-xs group-hover:text-indigo-300 flex-shrink-0">
                    Start →
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Advisory team -- only shown if avatars are configured */}
      {manifest.avatars.length > 0 && (
        <section className="mt-14">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-indigo-400 mb-4">
            Your Advisory Team
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {manifest.avatars
              .filter((a) => a.scope === 'program_wide')
              .map((a, i) => {
                const uid: string | undefined = a.uid ?? (a as unknown as Record<string, unknown>)['id'] as string;
                const profile = uid ? program.avatarProfiles.get(uid) : undefined;
                const name = profile
                  ? extractName(profile.content)
                  : uid?.split('.').pop()?.replace(/_/g, ' ') ?? 'Advisor';
                return (
                  <div key={uid ?? i} className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-3">
                    <p className="text-sm font-medium text-white capitalize">{name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {profile?.frontmatter.role?.replace(/_/g, ' ') ?? 'advisor'}
                    </p>
                  </div>
                );
              })}
          </div>
        </section>
      )}
    </main>
  );
}

function extractName(content: string): string {
  const match = content.match(/^#\s+(.+?)\s+--/m);
  return match ? match[1] : 'Advisor';
}
