import path from 'path';
import fs from 'fs';
import yaml from 'js-yaml';
import matter from 'gray-matter';

const CONTENT_BASE = process.env.CONTENT_BASE_PATH
  ? path.resolve(process.cwd(), process.env.CONTENT_BASE_PATH)
  : path.join(process.cwd(), '..', 'programs');

const PLATFORM_AVATARS_BASE = process.env.PLATFORM_AVATARS_PATH
  ? path.resolve(process.cwd(), process.env.PLATFORM_AVATARS_PATH)
  : path.join(process.cwd(), '..', 'avatars');

// Directories to skip during filesystem discovery
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', '.cache',
  'coverage', 'out', '.turbo', '.vercel', 'tmp', 'temp',
]);

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ModuleEntry {
  id: string;
  folder: string;
  title: string;
  hours: number;
  milestone: number;
  dynamic?: boolean;
}

export interface AvatarAssignment {
  uid: string;
  scope?: 'program_wide';
  modules?: string[];
}

export interface TTSConfig {
  provider: 'openai' | 'elevenlabs' | 'local';
  enabled_by_default: boolean;
  streaming: boolean;
  interruptible: boolean;
  chunk_strategy: string;
  max_first_chunk_latency_ms: number;
  fallback_provider: string;
}

export interface LearnerInterfaceConfig {
  default: 'avatar_guided' | 'traditional_lms';
  learner_can_switch: boolean;
}

export interface ProgramManifest {
  program_id: string;
  display_name: string;
  schema_version: number;
  content_version: string;
  publisher: string;
  description: string;
  program_type: string;
  curriculum_root: string;
  media_root?: string;
  delivery_scripts_root?: string;
  config_root: string;
  reference_root: string;
  milestone_labels?: Record<number, string>;
  modules: ModuleEntry[];
  avatars: AvatarAssignment[];
  tts?: TTSConfig;
  learner_interface?: LearnerInterfaceConfig;
  total_hours: number;
  tags: string[];
}

export interface AvatarProfileFrontmatter {
  uid: string;
  uuid: string;
  role: string;
  program?: string;
  modules?: string[];
}

export interface AvatarProfile {
  frontmatter: AvatarProfileFrontmatter;
  content: string;
  ttsVoices: {
    openai?: string;
    elevenlabs?: string;
    local?: string;
  };
}

export interface ResolvedProgram {
  manifest: ProgramManifest;
  contentPath: string;
  avatarProfiles: Map<string, AvatarProfile>;
}

export interface DiscoveredProgram {
  folder: string;       // directory name, e.g. "ai-project-manager"
  contentBase: string;  // absolute path of the parent directory containing folder
  manifest: ProgramManifest;
}

// ── Caches ────────────────────────────────────────────────────────────────────

const resolvedCache = new Map<string, ResolvedProgram>();
let discoveryCache: DiscoveredProgram[] | null = null;

// ── Discovery ─────────────────────────────────────────────────────────────────

export function discoverPrograms(): DiscoveredProgram[] {
  if (discoveryCache !== null) return discoveryCache;

  const results: DiscoveredProgram[] = [];
  const seenIds = new Set<string>();
  const visited = new Set<string>();

  if (process.env.CONTENT_BASE_PATH) {
    // Explicit path set — only look there
    const base = path.resolve(process.cwd(), process.env.CONTENT_BASE_PATH);
    scanForManifests(base, 2, visited, results, seenIds);
  } else {
    // Auto-discover: walk upward from cwd, scanning at each ancestor level
    let current = process.cwd();
    for (let level = 0; level < 4; level++) {
      const parent = path.dirname(current);
      if (parent === current) break; // reached filesystem root
      scanForManifests(parent, 4, visited, results, seenIds);
      if (results.length > 0) break; // stop once we find something
      current = parent;
    }
  }

  discoveryCache = results;
  return discoveryCache;
}

export function getDiscoveredProgram(folder: string): DiscoveredProgram | null {
  return discoverPrograms().find((p) => p.folder === folder) ?? null;
}

export function readDiscoveredProgram(folder: string): ResolvedProgram | null {
  const discovered = getDiscoveredProgram(folder);
  if (!discovered) return null;
  return readProgram(folder, discovered.contentBase);
}

function scanForManifests(
  dir: string,
  maxDepth: number,
  visited: Set<string>,
  results: DiscoveredProgram[],
  seenIds: Set<string>,
): void {
  if (maxDepth < 0 || visited.size > 600) return;

  const resolved = path.resolve(dir);
  if (visited.has(resolved)) return;
  visited.add(resolved);

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(resolved, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;

    const subDir = path.join(resolved, entry.name);
    const manifestPath = path.join(subDir, 'manifest.yml');

    if (fs.existsSync(manifestPath)) {
      try {
        const raw = fs.readFileSync(manifestPath, 'utf-8');
        const manifest = yaml.load(raw) as ProgramManifest;
        if (manifest?.program_id && Array.isArray(manifest?.modules)) {
          if (!seenIds.has(manifest.program_id)) {
            seenIds.add(manifest.program_id);
            results.push({ folder: entry.name, contentBase: resolved, manifest });
          }
        }
      } catch {
        // Not a valid manifest — skip
      }
    } else {
      scanForManifests(subDir, maxDepth - 1, visited, results, seenIds);
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function listPrograms(): string[] {
  return discoverPrograms().map((p) => p.folder);
}

export function readProgram(programFolder: string, contentBase?: string): ResolvedProgram {
  const base = contentBase ?? CONTENT_BASE;
  const manifestPath = path.join(base, programFolder, 'manifest.yml');
  const raw = fs.readFileSync(manifestPath, 'utf-8');
  const manifest = yaml.load(raw) as ProgramManifest;

  const cacheKey = `${base}::${manifest.program_id}@${manifest.content_version}`;
  if (resolvedCache.has(cacheKey)) return resolvedCache.get(cacheKey)!;

  const contentPath = path.join(base, programFolder);
  const avatarProfiles = resolveAvatarProfiles(manifest, contentPath);

  const resolved: ResolvedProgram = { manifest, contentPath, avatarProfiles };
  resolvedCache.set(cacheKey, resolved);
  return resolved;
}

export function readProgramById(programId: string): ResolvedProgram | null {
  const discovered = discoverPrograms().find((p) => p.manifest.program_id === programId);
  if (!discovered) return null;
  return readProgram(discovered.folder, discovered.contentBase);
}

export function readDeliveryScript(
  contentPath: string,
  moduleFolder: string,
  lessonId: string,
  manifest?: ProgramManifest,
): unknown {
  const filename = `lesson-${lessonId.toLowerCase()}-delivery-script.yml`;

  if (manifest?.delivery_scripts_root) {
    const primaryPath = path.join(contentPath, manifest.delivery_scripts_root, filename);
    if (fs.existsSync(primaryPath)) {
      return yaml.load(fs.readFileSync(primaryPath, 'utf-8'));
    }
  }

  const curriculumRoot = manifest?.curriculum_root ?? 'curriculum';
  const fallbackPath = path.join(contentPath, curriculumRoot, moduleFolder, filename);
  if (fs.existsSync(fallbackPath)) {
    return yaml.load(fs.readFileSync(fallbackPath, 'utf-8'));
  }

  return null;
}

export function invalidateCache(programId?: string): void {
  discoveryCache = null;
  if (programId) {
    for (const key of resolvedCache.keys()) {
      if (key.includes(`::${programId}@`)) resolvedCache.delete(key);
    }
  } else {
    resolvedCache.clear();
  }
}

// ── Internal ──────────────────────────────────────────────────────────────────

function resolveAvatarProfiles(
  manifest: ProgramManifest,
  contentPath: string,
): Map<string, AvatarProfile> {
  const profiles = new Map<string, AvatarProfile>();
  const avatarsDir = path.join(contentPath, manifest.config_root, 'avatars');

  for (const assignment of manifest.avatars) {
    const uid = assignment.uid;
    if (!uid) {
      console.warn(`[manifest-reader] Avatar assignment missing "uid" field:`, JSON.stringify(assignment));
      continue;
    }
    const slug = uid.includes('.') ? uid.split('.')[1] : uid;

    const programProfilePath = path.join(avatarsDir, slug, 'profile.md');
    const platformSlug = uidToPlatformSlug(uid);
    const platformProfilePath = platformSlug
      ? path.join(PLATFORM_AVATARS_BASE, platformSlug, 'profile.md')
      : null;

    let profilePath: string | null = null;
    if (fs.existsSync(programProfilePath)) {
      profilePath = programProfilePath;
    } else if (platformSlug && platformProfilePath && fs.existsSync(platformProfilePath)) {
      profilePath = platformProfilePath;
    }

    if (!profilePath) {
      console.warn(`Avatar profile not found for UID: ${uid}`);
      continue;
    }

    const raw = fs.readFileSync(profilePath, 'utf-8');
    const parsed = matter(raw);
    const frontmatter = parsed.data as AvatarProfileFrontmatter;
    const ttsVoices = extractTtsVoices(parsed.content);
    profiles.set(uid, { frontmatter, content: parsed.content, ttsVoices });
  }

  return profiles;
}

function uidToPlatformSlug(uid: string): string | null {
  if (uid.startsWith('platform.')) return uid.replace('platform.', '');
  return null;
}

function extractTtsVoices(content: string): AvatarProfile['ttsVoices'] {
  const voices: AvatarProfile['ttsVoices'] = {};
  const ttsBlock = content.match(/\*\*TTS Voice:\*\*\s*\n([\s\S]*?)(?=\n\*\*|\n---|\n#|$)/);
  if (!ttsBlock) return voices;

  const openai = ttsBlock[1].match(/openai:\s*(\w+)/);
  const elevenlabs = ttsBlock[1].match(/elevenlabs:\s*(?!~)(\S+)/);
  const local = ttsBlock[1].match(/local:\s*(?!~)(\S+)/);

  if (openai) voices.openai = openai[1];
  if (elevenlabs) voices.elevenlabs = elevenlabs[1];
  if (local) voices.local = local[1];

  return voices;
}
