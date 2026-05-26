import path from 'path';
import fs from 'fs';
import matter from 'gray-matter';
import type { ProgramManifest } from './manifest-reader';

export interface LessonFrontmatter {
  module: string;
  lesson: number;
  title: string;
  module_title?: string;
  rti_hours: number;
  ojl_modules_supported?: number[];
  aligned_certifications?: string[];
}

export interface LessonSection {
  heading: string;
  content: string;
}

export interface LessonListEntry {
  lessonId: string;
  title: string;
  hours: number;
}

export interface ParsedLesson {
  frontmatter: LessonFrontmatter;
  sections: LessonSection[];
  lessonId: string;
  prevLessonId: string | null;
  nextLessonId: string | null;
}

export interface LessonVideos {
  intro: string | null;
  overview: string | null;
}

// Extract lessonId from a filename like "lesson-a1-what-is-ai.md" → "a1"
function filenameToLessonId(filename: string): string {
  return filename.replace(/^lesson-/, '').replace(/-[^-].*$/, '');
}

function curriculumDir(contentPath: string, manifest: ProgramManifest, moduleFolder: string): string {
  const root = manifest.curriculum_root.replace(/\/$/, '');
  return path.join(contentPath, root, moduleFolder);
}

export function listLessons(
  contentPath: string,
  manifest: ProgramManifest,
  moduleId: string,
): LessonListEntry[] {
  const mod = manifest.modules.find((m) => m.id.toLowerCase() === moduleId.toLowerCase());
  if (!mod) return [];

  const dir = curriculumDir(contentPath, manifest, mod.folder);
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir)
    .filter((f) => f.startsWith('lesson-') && f.endsWith('.md'))
    .sort();

  return files.map((f) => {
    const raw = fs.readFileSync(path.join(dir, f), 'utf-8');
    const { data } = matter(raw);
    return {
      lessonId: filenameToLessonId(f),
      title: (data.title as string) ?? f,
      hours: (data.rti_hours as number) ?? 0,
    };
  });
}

export function readLesson(
  contentPath: string,
  manifest: ProgramManifest,
  moduleId: string,
  lessonId: string,
): ParsedLesson | null {
  const mod = manifest.modules.find((m) => m.id.toLowerCase() === moduleId.toLowerCase());
  if (!mod) return null;

  const dir = curriculumDir(contentPath, manifest, mod.folder);
  if (!fs.existsSync(dir)) return null;

  const files = fs.readdirSync(dir).filter(
    (f) => f.startsWith(`lesson-${lessonId}-`) && f.endsWith('.md'),
  );
  if (files.length === 0) return null;

  const raw = fs.readFileSync(path.join(dir, files[0]), 'utf-8');
  const { data, content } = matter(raw);
  const sections = parseSections(content);

  const allLessons = listLessons(contentPath, manifest, moduleId);
  const idx = allLessons.findIndex((l) => l.lessonId === lessonId);
  const prevLessonId = idx > 0 ? allLessons[idx - 1].lessonId : null;
  const nextLessonId = idx < allLessons.length - 1 ? allLessons[idx + 1].lessonId : null;

  return {
    frontmatter: data as LessonFrontmatter,
    sections,
    lessonId,
    prevLessonId,
    nextLessonId,
  };
}

export function findLessonVideos(
  contentPath: string,
  manifest: ProgramManifest,
  moduleId: string,
  lessonId: string,
): LessonVideos {
  const mod = manifest.modules.find((m) => m.id.toLowerCase() === moduleId.toLowerCase());
  if (!mod) return { intro: null, overview: null };

  const mediaRoot = (manifest.media_root ?? '').replace(/\/$/, '');
  const mediaDir = path.join(contentPath, mediaRoot, mod.folder);

  function resolve(type: 'intro' | 'overview'): string | null {
    const filename = `lesson-${lessonId}-${type}.mp4`;
    if (fs.existsSync(path.join(mediaDir, filename))) {
      const programFolder = path.basename(contentPath);
      return `/api/media/${programFolder}/${mediaRoot}/${mod!.folder}/${filename}`;
    }
    return null;
  }

  return { intro: resolve('intro'), overview: resolve('overview') };
}

function parseSections(content: string): LessonSection[] {
  const sections: LessonSection[] = [];
  const lines = content.split('\n');
  let currentHeading = '';
  let currentLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (currentHeading || currentLines.some((l) => l.trim())) {
        sections.push({ heading: currentHeading, content: currentLines.join('\n').trim() });
      }
      currentHeading = line.slice(3).trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  if (currentHeading || currentLines.some((l) => l.trim())) {
    sections.push({ heading: currentHeading, content: currentLines.join('\n').trim() });
  }

  return sections.filter((s) => s.heading || s.content);
}
