import path from 'path';
import fs from 'fs';
import yaml from 'js-yaml';

// ── Types ─────────────────────────────────────────────────────────────────────

export type DirectiveKind = 'pause' | 'ask-yourself' | 'may-change' | 'instructor';

export interface DirectiveInfo {
  kind: DirectiveKind;
  text: string;
}

export type Segment =
  | { type: 'text'; text: string }
  | { type: 'directive'; directive: DirectiveInfo };

export type ContentBlock =
  | { kind: 'paragraph'; segments: Segment[] }
  | { kind: 'heading'; level: 3 | 4; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'table'; headers: string[]; rows: string[][] }
  | { kind: 'blockquote'; label: string | null; text: string }
  | { kind: 'directive'; directive: DirectiveInfo }
  | { kind: 'hr' };

export interface QuizOption {
  letter: string;
  text: string;
}

export interface QuizQuestion {
  number: number;
  question: string;
  options: QuizOption[];
  correctLetter: string | null;
  explanation: string | null;
}

export interface ProcessedSection {
  heading: string;
  sectionKind: string;
  blocks: ContentBlock[];
  // TTS script split at {pause} points — each entry is one SpeechSynthesisUtterance
  ttsScriptParts: string[];
  // Populated only for quiz sections
  quizQuestions?: QuizQuestion[];
}

// ── Variable loading ──────────────────────────────────────────────────────────

export function loadVariables(
  curriculumBasePath: string,
  moduleTitle?: string,
  lessonTitle?: string,
): Record<string, string> {
  const configPath = path.join(curriculumBasePath, 'delivery-config.yml');
  const defaults: Record<string, string> = {
    instructor_name: 'Joe Instructor',
    modules_covered: moduleTitle ?? 'this module',
    lesson_title: lessonTitle ?? '',
    program_name: 'AI Project Manager Apprenticeship',
  };

  if (!fs.existsSync(configPath)) return defaults;

  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = yaml.load(raw) as Record<string, unknown>;

    // Support both flat key: value and variables: { key: { default: value } } shapes
    const source = (parsed?.variables ?? parsed) as Record<string, unknown>;
    const overrides: Record<string, string> = {};
    for (const [k, v] of Object.entries(source)) {
      if (typeof v === 'string') {
        overrides[k] = v;
      } else if (v && typeof v === 'object' && 'default' in v && typeof (v as Record<string, unknown>).default === 'string') {
        overrides[k] = (v as Record<string, string>).default;
      }
    }
    return { ...defaults, ...overrides };
  } catch {
    return defaults;
  }
}

// ── Pre-processing ────────────────────────────────────────────────────────────

function stripHtmlComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, '');
}

function substituteVariables(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    vars[key] !== undefined ? vars[key] : `[${key.replace(/_/g, ' ')}]`,
  );
}

// ── Directive classification ──────────────────────────────────────────────────

function classifyDirective(inner: string): DirectiveInfo {
  const t = inner.trim();
  if (t.toLowerCase() === 'pause') return { kind: 'pause', text: '' };

  const askMatch = t.match(/^ask yourself:\s*(.*)/i);
  if (askMatch) return { kind: 'ask-yourself', text: askMatch[1].trim() };

  const mayMatch = t.match(/^may change:\s*(.*)/i);
  if (mayMatch) return { kind: 'may-change', text: mayMatch[1].trim() };

  return { kind: 'instructor', text: t };
}

// ── Inline segment parser ─────────────────────────────────────────────────────
// Splits a line into text runs and inline directives.

function parseInlineSegments(line: string): Segment[] {
  const segments: Segment[] = [];
  let remaining = line;

  while (remaining.length > 0) {
    const openIdx = remaining.indexOf('{');
    if (openIdx === -1) {
      segments.push({ type: 'text', text: remaining });
      break;
    }

    // Skip {{ variable }} — not a directive
    if (remaining[openIdx + 1] === '{') {
      const dblClose = remaining.indexOf('}}', openIdx);
      if (dblClose !== -1) {
        segments.push({ type: 'text', text: remaining.slice(0, dblClose + 2) });
        remaining = remaining.slice(dblClose + 2);
        continue;
      }
      segments.push({ type: 'text', text: remaining });
      break;
    }

    if (openIdx > 0) {
      segments.push({ type: 'text', text: remaining.slice(0, openIdx) });
    }

    const closeIdx = remaining.indexOf('}', openIdx + 1);
    if (closeIdx === -1) {
      segments.push({ type: 'text', text: remaining.slice(openIdx) });
      break;
    }

    const inner = remaining.slice(openIdx + 1, closeIdx);
    segments.push({ type: 'directive', directive: classifyDirective(inner) });
    remaining = remaining.slice(closeIdx + 1);
  }

  return segments.filter((s) => !(s.type === 'text' && s.text === ''));
}

// ── Table parser ──────────────────────────────────────────────────────────────

function parseTable(lines: string[]): ContentBlock {
  const parseRow = (line: string): string[] =>
    line
      .split('|')
      .map((c) => c.trim())
      .filter((_, i, arr) => i > 0 && i < arr.length - 1);

  const headers = parseRow(lines[0]);
  // lines[1] is the separator (|---|---|); skip it
  const rows = lines.slice(2).map(parseRow);
  return { kind: 'table', headers, rows };
}

// ── Main block parser ─────────────────────────────────────────────────────────

export function processContent(raw: string, vars: Record<string, string>): ContentBlock[] {
  let text = stripHtmlComments(raw);
  text = substituteVariables(text, vars);

  const blocks: ContentBlock[] = [];
  const lines = text.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // H3
    if (line.startsWith('### ')) {
      blocks.push({ kind: 'heading', level: 3, text: line.slice(4).trim() });
      i++;
      continue;
    }

    // H4
    if (line.startsWith('#### ')) {
      blocks.push({ kind: 'heading', level: 4, text: line.slice(5).trim() });
      i++;
      continue;
    }

    // HR
    if (trimmed.match(/^---+$/)) {
      blocks.push({ kind: 'hr' });
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      const bqLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        bqLines.push(lines[i].slice(2));
        i++;
      }
      const content = bqLines.join(' ').trim();
      const labelMatch = content.match(/^\*\*([^*]+):\*\*\s*([\s\S]*)/);
      if (labelMatch) {
        blocks.push({ kind: 'blockquote', label: labelMatch[1].trim(), text: labelMatch[2].trim() });
      } else {
        blocks.push({ kind: 'blockquote', label: null, text: content });
      }
      continue;
    }

    // Table
    if (line.startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      if (tableLines.length >= 2) {
        blocks.push(parseTable(tableLines));
      }
      continue;
    }

    // Ordered list
    if (trimmed.match(/^\d+\. /)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].trim().match(/^\d+\. /)) {
        items.push(lines[i].replace(/^\d+\. /, '').trim());
        i++;
      }
      blocks.push({ kind: 'list', ordered: true, items });
      continue;
    }

    // Unordered list
    if (trimmed.match(/^[-*] /)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].trim().match(/^[-*] /)) {
        items.push(lines[i].replace(/^[-*] /, '').trim());
        i++;
      }
      blocks.push({ kind: 'list', ordered: false, items });
      continue;
    }

    // Block directive — starts with { but not {{.
    // A line is a block directive ONLY when the { closes with nothing after it on the
    // same line (single-line), or when there is no closing } on the line at all
    // (start of a multi-line directive).
    // Lines like "{pause} Some text..." are paragraphs with an inline directive.
    if (trimmed.startsWith('{') && !trimmed.startsWith('{{')) {
      const firstClose = trimmed.indexOf('}');
      const isBlockDirective =
        firstClose === -1 ||                                 // no } on this line → multi-line start
        trimmed.slice(firstClose + 1).trim() === '';         // } closes at end of line → single-line

      if (isBlockDirective) {
        if (firstClose !== -1) {
          // Single-line: {text}
          blocks.push({ kind: 'directive', directive: classifyDirective(trimmed.slice(1, firstClose)) });
          i++;
          continue;
        }
        // Multi-line: collect until a line ends with }
        const directiveLines: string[] = [trimmed.slice(1)];
        i++;
        while (i < lines.length) {
          const dl = lines[i].trim();
          if (dl.endsWith('}')) {
            directiveLines.push(dl.slice(0, -1));
            i++;
            break;
          }
          directiveLines.push(dl);
          i++;
        }
        const inner = directiveLines.join(' ').trim();
        blocks.push({ kind: 'directive', directive: classifyDirective(inner) });
        continue;
      }
      // Not a block directive — fall through to paragraph handler below
    }

    // Empty line
    if (trimmed === '') {
      i++;
      continue;
    }

    // Paragraph — collect consecutive non-structural lines.
    // Only treat a { line as a break if it is actually a block directive.
    const paraLines: string[] = [];
    while (i < lines.length) {
      const pl = lines[i];
      const pt = pl.trim();
      const firstClose = pt.indexOf('}');
      const isLineBlockDirective =
        pt.startsWith('{') &&
        !pt.startsWith('{{') &&
        (firstClose === -1 || pt.slice(firstClose + 1).trim() === '');
      if (
        !pt ||
        pl.startsWith('### ') ||
        pl.startsWith('#### ') ||
        pl.startsWith('> ') ||
        pl.startsWith('|') ||
        pt.match(/^[-*] /) ||
        pt.match(/^\d+\. /) ||
        pt.match(/^---+$/) ||
        isLineBlockDirective
      ) {
        break;
      }
      paraLines.push(pl);
      i++;
    }

    if (paraLines.length > 0) {
      const combined = paraLines.join(' ').trim();
      if (combined) {
        blocks.push({ kind: 'paragraph', segments: parseInlineSegments(combined) });
      }
    }
  }

  return blocks;
}

// ── TTS script extraction ─────────────────────────────────────────────────────
// Returns the script split into parts at each {pause} point.
// Each part is one SpeechSynthesisUtterance; a pause gap is inserted between them.

export function extractTtsScriptParts(blocks: ContentBlock[]): string[] {
  const parts: string[] = [];
  let current = '';

  const flush = () => {
    const t = current.trim();
    if (t) parts.push(t);
    current = '';
  };

  const append = (text: string) => {
    const t = text.trim();
    if (t) current += (current ? ' ' : '') + t;
  };

  for (const block of blocks) {
    switch (block.kind) {
      case 'paragraph': {
        for (const seg of block.segments) {
          if (seg.type === 'text') {
            append(seg.text);
          } else {
            const d = seg.directive;
            if (d.kind === 'pause') {
              flush();
            } else if (d.kind === 'ask-yourself') {
              append(`Ask yourself: ${d.text}`);
            }
            // instructor / may-change inline directives → skip
          }
        }
        break;
      }

      case 'blockquote': {
        const lbl = block.label?.toLowerCase() ?? '';
        if (lbl.includes('ask yourself')) {
          append(`Ask yourself: ${block.text}`);
        } else if (!lbl.includes('instructor')) {
          append(block.text);
        }
        break;
      }

      case 'directive': {
        const d = block.directive;
        if (d.kind === 'pause') {
          flush();
        } else if (d.kind === 'ask-yourself') {
          append(`Ask yourself: ${d.text}`);
        }
        // instructor / may-change block directives → skip
        break;
      }

      case 'list': {
        // Read list items as prose for non-lecture sections
        block.items.forEach((item) => append(item));
        break;
      }

      default:
        // headings, tables, hr → skip from TTS
        break;
    }
  }

  flush();
  return parts;
}

// ── Quiz parser ───────────────────────────────────────────────────────────────
// Parses the raw content of a Knowledge Check section into structured questions.

export function parseQuizContent(raw: string, vars: Record<string, string>): QuizQuestion[] {
  const text = substituteVariables(stripHtmlComments(raw), vars);
  const lines = text.split('\n');
  const questions: QuizQuestion[] = [];
  let i = 0;

  while (i < lines.length) {
    const t = lines[i].trim();

    // Question start: **Q1.** text
    const qMatch = t.match(/^\*\*Q(\d+)\.\*\*\s*(.*)/);
    if (!qMatch) { i++; continue; }

    const number = parseInt(qMatch[1], 10);
    const questionLines: string[] = [qMatch[2]];
    i++;

    // Collect continuation lines until blank or first option
    while (i < lines.length && lines[i].trim() && !lines[i].trim().match(/^[a-d]\)/i)) {
      questionLines.push(lines[i].trim());
      i++;
    }
    // Skip blank lines before options
    while (i < lines.length && !lines[i].trim()) i++;

    // Collect answer options a) b) c) d)
    const options: QuizOption[] = [];
    while (i < lines.length && lines[i].trim().match(/^[a-d]\)/i)) {
      const optLine = lines[i].trim();
      const letter = optLine[0].toLowerCase();
      let optText = optLine.slice(2).trim();
      i++;
      // Continuation lines (indented / no option prefix)
      while (
        i < lines.length &&
        lines[i].trim() &&
        !lines[i].trim().match(/^[a-d]\)/i) &&
        !lines[i].trim().startsWith('**')
      ) {
        optText += ' ' + lines[i].trim();
        i++;
      }
      options.push({ letter, text: optText });
    }
    // Skip blank lines
    while (i < lines.length && !lines[i].trim()) i++;

    // **Correct Answer: c**
    let correctLetter: string | null = null;
    if (i < lines.length) {
      const cm = lines[i].trim().match(/^\*\*Correct Answer:\s*([a-d])\*\*/i);
      if (cm) { correctLetter = cm[1].toLowerCase(); i++; }
    }

    // **Explanation:** text (may span multiple lines until ---, blank line, or next Q)
    const explanationLines: string[] = [];
    // Skip to explanation line
    while (i < lines.length && !lines[i].trim().match(/^\*\*Explanation:/i) && !lines[i].trim().match(/^---/) && !lines[i].trim().match(/^\*\*Q\d/)) {
      i++;
    }
    if (i < lines.length) {
      const em = lines[i].trim().match(/^\*\*Explanation:\*\*\s*(.*)/i);
      if (em) {
        if (em[1]) explanationLines.push(em[1]);
        i++;
        while (
          i < lines.length &&
          lines[i].trim() &&
          !lines[i].trim().match(/^---/) &&
          !lines[i].trim().match(/^\*\*Q\d/)
        ) {
          explanationLines.push(lines[i].trim());
          i++;
        }
      }
    }

    questions.push({
      number,
      question: questionLines.join(' ').trim(),
      options,
      correctLetter,
      explanation: explanationLines.length > 0 ? explanationLines.join(' ').trim() : null,
    });
  }

  return questions;
}

// ── Section classifier (mirrors page.tsx logic) ───────────────────────────────

export function classifySectionKind(heading: string): string {
  const h = heading.toLowerCase();
  if (h.includes('video') || h.includes('lecture') || h.includes('script')) return 'lecture';
  if (h.includes('knowledge check') || h.includes('quiz')) return 'quiz';
  if (h.includes('hands-on') || h.includes('exercise')) return 'exercise';
  if (h.includes('assignment') || h.includes('deliverable') || h.includes('portfolio')) return 'assignment';
  if (h.includes('learning objective')) return 'objectives';
  if (h.includes('key concept')) return 'concepts';
  if (h.includes('interactive session')) return 'avatar';
  if (h.includes('discussion')) return 'discussion';
  if (h.includes('reading') || h.includes('resource')) return 'resources';
  if (h.includes('next lesson') || h.includes('connection to ojl') || h.includes('program reference')) return 'meta';
  return 'content';
}
