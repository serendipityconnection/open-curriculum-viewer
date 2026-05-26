import Link from 'next/link';
import { redirect } from 'next/navigation';
import { discoverPrograms } from '@/lib/manifest-reader';

export default async function LandingPage() {
  const programs = discoverPrograms();

  if (programs.length === 0) {
    return (
      <main className="max-w-2xl mx-auto px-6 py-20">
        <h1 className="text-2xl font-semibold text-white mb-4">Open Curriculum Viewer</h1>
        <div className="rounded-lg border border-amber-800 bg-amber-950/40 px-5 py-4 text-amber-300 text-sm mb-6">
          No curriculum content found.
        </div>
        <p className="text-gray-400 text-sm mb-4">
          The viewer searches for <code className="text-indigo-400">manifest.yml</code> files in the
          folders around it. Make sure your content is structured like this:
        </p>
        <pre className="rounded-lg bg-gray-900 border border-gray-800 px-4 py-3 text-xs text-gray-300 overflow-x-auto mb-6">{`open-curriculum/
  programs/
    my-program/
      manifest.yml   ← required
      curriculum/
        module-a/
          lesson-a1-....md`}</pre>
        <p className="text-gray-500 text-xs">
          Or set <code className="text-indigo-400">CONTENT_BASE_PATH</code> in a{' '}
          <code className="text-indigo-400">.env</code> file pointing to your{' '}
          <code className="text-indigo-400">programs/</code> directory.
          See <code className="text-indigo-400">.env.example</code> for details.
        </p>
      </main>
    );
  }

  if (programs.length === 1) {
    redirect(`/program/${programs[0].folder}`);
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-12">
      <div className="mb-10">
        <p className="text-xs uppercase tracking-widest text-indigo-400 mb-2">Open Curriculum Viewer</p>
        <h1 className="text-2xl font-semibold text-white mb-2">Choose a program</h1>
        <p className="text-gray-500 text-sm">{programs.length} programs found on this machine</p>
      </div>

      <div className="space-y-3">
        {programs.map((p) => (
          <Link
            key={p.folder}
            href={`/program/${p.folder}`}
            className="flex items-center gap-5 rounded-lg border border-gray-700 bg-gray-900 hover:border-indigo-600 px-5 py-4 transition-colors group"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white group-hover:text-indigo-200 transition-colors">
                {p.manifest.display_name}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {p.manifest.total_hours}h &middot; {p.manifest.modules.length} modules &middot; {p.manifest.program_type}
              </p>
              {p.manifest.description && (
                <p className="text-xs text-gray-600 mt-1 truncate">{p.manifest.description}</p>
              )}
            </div>
            <span className="text-indigo-400 text-sm group-hover:text-indigo-300 flex-shrink-0">
              Open →
            </span>
          </Link>
        ))}
      </div>
    </main>
  );
}
