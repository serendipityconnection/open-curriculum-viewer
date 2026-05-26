import path from 'path';
import { notFound } from 'next/navigation';
import { readDiscoveredProgram } from '@/lib/manifest-reader';
import { readLesson, listLessons, findLessonVideos } from '@/lib/lesson-reader';
import {
  processContent,
  extractTtsScriptParts,
  classifySectionKind,
  loadVariables,
  parseQuizContent,
  type ProcessedSection,
} from '@/lib/content-processor';
import LessonView from '@/components/LessonView';

export default async function LessonPage({
  params,
}: {
  params: { folder: string; id: string; lessonId: string };
}) {
  const { folder, id, lessonId } = params;

  const program = readDiscoveredProgram(folder);
  if (!program) notFound();

  const { manifest } = program;
  const lesson = readLesson(program.contentPath, manifest, id, lessonId);
  if (!lesson) notFound();

  const allLessons = listLessons(program.contentPath, manifest, id);
  const mod = manifest.modules.find((m) => m.id.toLowerCase() === id.toLowerCase());
  const videos = findLessonVideos(program.contentPath, manifest, id, lessonId);

  const curriculumBase = path.join(
    program.contentPath,
    manifest.curriculum_root.replace(/\/$/, ''),
  );

  const vars = loadVariables(
    curriculumBase,
    mod?.title ?? manifest.display_name,
    lesson.frontmatter.title,
  );

  const processedSections: ProcessedSection[] = lesson.sections.map((section) => {
    const sectionKind = classifySectionKind(section.heading);
    const blocks = processContent(section.content, vars);
    const ttsScriptParts = extractTtsScriptParts(blocks);
    const quizQuestions = sectionKind === 'quiz'
      ? parseQuizContent(section.content, vars)
      : undefined;
    return { heading: section.heading, sectionKind, blocks, ttsScriptParts, quizQuestions };
  });

  return (
    <LessonView
      programFolder={folder}
      programName={manifest.display_name}
      moduleId={id}
      moduleName={mod?.title ?? `Module ${id}`}
      lesson={{
        lessonId,
        title: lesson.frontmatter.title,
        rtiHours: lesson.frontmatter.rti_hours,
        alignedCertifications: lesson.frontmatter.aligned_certifications,
        prevLessonId: lesson.prevLessonId,
        nextLessonId: lesson.nextLessonId,
      }}
      allLessons={allLessons}
      sections={processedSections}
      videos={videos}
    />
  );
}
