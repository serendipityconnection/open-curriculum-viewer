'use client';

import { useState } from 'react';
import type { ContentBlock, Segment, DirectiveInfo, QuizQuestion } from '@/lib/content-processor';

export type ViewMode = 'learner' | 'instructor';

// ── Inline markdown ───────────────────────────────────────────────────────────

function renderInlineMarkdown(text: string, key: number): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let pk = 0;

  const patterns = [
    { re: /\*\*(.+?)\*\*/, tag: 'strong' },
    { re: /\*(.+?)\*/, tag: 'em' },
    { re: /`(.+?)`/, tag: 'code' },
    { re: /\[(.+?)\]\((.+?)\)/, tag: 'a' },
  ] as const;

  while (remaining.length > 0) {
    let earliest: { index: number; match: RegExpMatchArray; tag: string } | null = null;
    for (const { re, tag } of patterns) {
      const m = remaining.match(re);
      if (m && m.index !== undefined && (!earliest || m.index < earliest.index)) {
        earliest = { index: m.index, match: m, tag };
      }
    }

    if (!earliest) {
      parts.push(<span key={pk++}>{remaining}</span>);
      break;
    }
    if (earliest.index > 0) {
      parts.push(<span key={pk++}>{remaining.slice(0, earliest.index)}</span>);
    }

    const m = earliest.match;
    switch (earliest.tag) {
      case 'a':
        parts.push(
          <a key={pk++} href={m[2]} className="text-indigo-400 hover:underline" target="_blank" rel="noreferrer">
            {m[1]}
          </a>,
        );
        break;
      case 'strong':
        parts.push(<strong key={pk++} className="font-semibold text-white">{m[1]}</strong>);
        break;
      case 'em':
        parts.push(<em key={pk++} className="italic">{m[1]}</em>);
        break;
      case 'code':
        parts.push(
          <code key={pk++} className="bg-gray-800 px-1 py-0.5 rounded text-xs font-mono text-indigo-300">
            {m[1]}
          </code>,
        );
        break;
    }
    remaining = remaining.slice(earliest.index + m[0].length);
  }

  return <span key={key}>{parts}</span>;
}

// ── Inline directive rendering ────────────────────────────────────────────────

function InlineDirective({ directive, viewMode }: { directive: DirectiveInfo; viewMode: ViewMode }) {
  if (directive.kind === 'pause') {
    if (viewMode === 'instructor') {
      return (
        <span className="inline-flex items-center mx-1 px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-500 text-xs align-middle">
          ⏸
        </span>
      );
    }
    return null; // hidden in learner view
  }

  if (directive.kind === 'ask-yourself') {
    if (viewMode === 'instructor') {
      return (
        <span className="inline-flex items-center mx-1 px-1.5 py-0.5 rounded bg-amber-900/40 border border-amber-800 text-amber-400 text-xs align-middle">
          ↳ pose: {directive.text}
        </span>
      );
    }
    // Learner: rendered as block elsewhere; inline version just shows the question
    return (
      <span className="inline-flex items-center mx-1 px-1.5 py-0.5 rounded bg-amber-950/60 border border-amber-900 text-amber-300 text-xs align-middle">
        {directive.text}
      </span>
    );
  }

  if (directive.kind === 'may-change') {
    if (viewMode === 'instructor') {
      return (
        <span className="inline-flex items-center mx-1 px-1.5 py-0.5 rounded bg-orange-900/40 border border-orange-800 text-orange-400 text-xs align-middle">
          ⚠ may change
        </span>
      );
    }
    return (
      <span className="inline-flex items-center mx-1 px-1.5 py-0.5 rounded bg-orange-950/60 border border-orange-900 text-orange-300 text-xs align-middle">
        ⚠ may change
      </span>
    );
  }

  // instructor directive — hidden from learner
  if (viewMode === 'learner') return null;
  return (
    <span className="inline-flex items-center mx-1 px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-500 text-xs align-middle">
      {directive.text}
    </span>
  );
}

// ── Segment renderer ──────────────────────────────────────────────────────────

function renderSegments(segments: Segment[], viewMode: ViewMode): React.ReactNode {
  return segments.map((seg, i) => {
    if (seg.type === 'text') return renderInlineMarkdown(seg.text, i);
    return <InlineDirective key={i} directive={seg.directive} viewMode={viewMode} />;
  });
}

// ── Block directive renderer ──────────────────────────────────────────────────

function BlockDirective({ directive, viewMode }: { directive: DirectiveInfo; viewMode: ViewMode }) {
  if (directive.kind === 'pause') {
    if (viewMode === 'instructor') {
      return (
        <div className="flex items-center gap-2 my-2 text-gray-600">
          <span className="text-base">⏸</span>
          <span className="text-xs italic">pause</span>
          <div className="flex-1 border-t border-dashed border-gray-800" />
        </div>
      );
    }
    return null;
  }

  if (directive.kind === 'ask-yourself') {
    if (viewMode === 'learner') {
      return (
        <div className="my-3 rounded-lg border border-amber-800 bg-amber-950/30 px-4 py-3">
          <p className="text-xs font-semibold text-amber-400 mb-1 uppercase tracking-wide">
            Ask yourself
          </p>
          <p className="text-sm text-amber-200 leading-relaxed">{directive.text}</p>
        </div>
      );
    }
    return (
      <div className="my-3 rounded-lg border border-amber-800/60 bg-amber-950/20 px-4 py-3">
        <p className="text-xs font-semibold text-amber-500 mb-1 uppercase tracking-wide">
          Pose to learner
        </p>
        <p className="text-sm text-amber-300 leading-relaxed">{directive.text}</p>
      </div>
    );
  }

  if (directive.kind === 'may-change') {
    if (viewMode === 'learner') {
      return (
        <div className="my-3 rounded-lg border border-orange-900 bg-orange-950/20 px-4 py-2.5 flex items-start gap-2">
          <span className="text-orange-400 text-sm flex-shrink-0 mt-0.5">⚠</span>
          <p className="text-xs text-orange-300 leading-relaxed">
            This content reflects the current state of the field and may change as AI evolves.
          </p>
        </div>
      );
    }
    // Instructor sees full flag
    return (
      <div className="my-3 rounded-lg border border-orange-800 bg-orange-950/20 px-4 py-3">
        <p className="text-xs font-semibold text-orange-400 mb-1 uppercase tracking-wide">
          Content currency flag
        </p>
        <p className="text-xs text-orange-300 leading-relaxed">{directive.text}</p>
      </div>
    );
  }

  // instructor directive
  if (viewMode === 'learner') return null;
  return (
    <div className="my-3 rounded-lg border border-gray-700 bg-gray-900/60 px-4 py-3">
      <p className="text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
        Instructor cue
      </p>
      <p className="text-xs text-gray-400 leading-relaxed italic">{directive.text}</p>
    </div>
  );
}

// ── Blockquote renderer ───────────────────────────────────────────────────────

function BlockquoteBlock({
  label,
  text,
  viewMode,
}: {
  label: string | null;
  text: string;
  viewMode: ViewMode;
}) {
  const lbl = label?.toLowerCase() ?? '';

  // Instructor-only blockquotes hidden from learner
  if (lbl.includes('instructor') && viewMode === 'learner') return null;

  if (lbl.includes('ask yourself')) {
    if (viewMode === 'learner') {
      return (
        <div className="my-3 rounded-lg border border-amber-800 bg-amber-950/30 px-4 py-3">
          <p className="text-xs font-semibold text-amber-400 mb-1 uppercase tracking-wide">
            Ask yourself
          </p>
          <p className="text-sm text-amber-200 leading-relaxed">{text}</p>
        </div>
      );
    }
    return (
      <div className="my-3 rounded-lg border border-amber-800/60 bg-amber-950/20 px-4 py-3">
        <p className="text-xs font-semibold text-amber-500 mb-1 uppercase tracking-wide">
          Pose to learner
        </p>
        <p className="text-sm text-amber-300 leading-relaxed">{text}</p>
      </div>
    );
  }

  if (lbl.includes('instructor') && viewMode === 'instructor') {
    return (
      <div className="my-3 rounded-lg border border-gray-700 bg-gray-900/60 px-4 py-3">
        <p className="text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
          {label}
        </p>
        <p className="text-xs text-gray-400 leading-relaxed italic">{text}</p>
      </div>
    );
  }

  // Generic blockquote
  return (
    <blockquote className="my-3 border-l-2 border-indigo-800 pl-4">
      {label && (
        <p className="text-xs font-semibold text-indigo-400 mb-1">{label}</p>
      )}
      <p className="text-sm text-gray-300 leading-relaxed italic">{text}</p>
    </blockquote>
  );
}

// ── Table renderer ────────────────────────────────────────────────────────────

function TableBlock({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="my-4 overflow-x-auto rounded-lg border border-gray-700">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-700 bg-gray-900">
            {headers.map((h, i) => (
              <th key={i} className="px-4 py-2.5 text-left font-semibold text-gray-300 whitespace-nowrap">
                {renderInlineMarkdown(h, i)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className={`border-b border-gray-800 ${ri % 2 === 0 ? 'bg-gray-950/40' : ''}`}>
              {row.map((cell, ci) => (
                <td key={ci} className="px-4 py-2 text-gray-400 align-top">
                  {renderInlineMarkdown(cell, ci)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Quiz renderer ─────────────────────────────────────────────────────────────

function QuizQuestionCard({ q, viewMode }: { q: QuizQuestion; viewMode: ViewMode }) {
  const [revealed, setRevealed] = useState(false);
  const showAnswer = viewMode === 'instructor' || revealed;

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-900 p-5 mb-4">
      <p className="text-sm font-medium text-white mb-4">
        <span className="text-indigo-400 mr-2">Q{q.number}.</span>
        {q.question}
      </p>

      <div className="space-y-2 mb-4">
        {q.options.map((opt) => {
          const isCorrect = opt.letter === q.correctLetter;
          return (
            <div
              key={opt.letter}
              className={`flex items-start gap-3 rounded-lg px-4 py-3 border text-sm transition-colors ${
                showAnswer && isCorrect
                  ? 'border-emerald-800 bg-emerald-950/40 text-emerald-300'
                  : 'border-gray-800 bg-gray-950 text-gray-400'
              }`}
            >
              <span className={`flex-shrink-0 font-bold uppercase ${showAnswer && isCorrect ? 'text-emerald-400' : 'text-gray-600'}`}>
                {opt.letter})
              </span>
              <span>{opt.text}</span>
              {showAnswer && isCorrect && (
                <span className="ml-auto text-xs text-emerald-500 flex-shrink-0">✓ correct</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Reveal / hide button — learner only */}
      {viewMode === 'learner' && (
        <button
          onClick={() => setRevealed((v) => !v)}
          className="px-3 py-1.5 rounded-lg border border-gray-700 text-xs text-gray-400 hover:text-white hover:border-gray-600 transition-colors"
        >
          {revealed ? 'Hide answer' : 'Reveal answer'}
        </button>
      )}

      {/* Explanation */}
      {showAnswer && q.explanation && (
        <div className="rounded-lg bg-gray-950 border border-gray-800 px-4 py-3 mt-3">
          <p className="text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide">Explanation</p>
          <p className="text-xs text-gray-400 leading-relaxed">{q.explanation}</p>
        </div>
      )}
    </div>
  );
}

export function QuizRenderer({ questions, viewMode }: { questions: QuizQuestion[]; viewMode: ViewMode }) {
  if (questions.length === 0) return null;
  return (
    <div className="space-y-2">
      {questions.map((q) => (
        <QuizQuestionCard key={q.number} q={q} viewMode={viewMode} />
      ))}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function BlockRenderer({
  blocks,
  viewMode,
  className = '',
}: {
  blocks: ContentBlock[];
  viewMode: ViewMode;
  className?: string;
}) {
  const elements: React.ReactNode[] = [];

  blocks.forEach((block, bi) => {
    switch (block.kind) {
      case 'heading':
        if (block.level === 3) {
          elements.push(
            <h3 key={bi} className="text-sm font-semibold text-white mt-5 mb-2">
              {renderInlineMarkdown(block.text, 0)}
            </h3>,
          );
        } else {
          elements.push(
            <h4 key={bi} className="text-xs font-semibold uppercase tracking-wide text-indigo-400 mt-4 mb-1">
              {renderInlineMarkdown(block.text, 0)}
            </h4>,
          );
        }
        break;

      case 'paragraph':
        elements.push(
          <p key={bi} className="text-sm text-gray-300 leading-relaxed mb-3">
            {renderSegments(block.segments, viewMode)}
          </p>,
        );
        break;

      case 'list':
        if (block.ordered) {
          elements.push(
            <ol key={bi} className="list-decimal list-inside space-y-1 mb-3 text-sm text-gray-300">
              {block.items.map((item, ii) => (
                <li key={ii}>{renderInlineMarkdown(item, ii)}</li>
              ))}
            </ol>,
          );
        } else {
          elements.push(
            <ul key={bi} className="list-disc list-inside space-y-1 mb-3 text-sm text-gray-300">
              {block.items.map((item, ii) => (
                <li key={ii}>{renderInlineMarkdown(item, ii)}</li>
              ))}
            </ul>,
          );
        }
        break;

      case 'table':
        elements.push(<TableBlock key={bi} headers={block.headers} rows={block.rows} />);
        break;

      case 'blockquote':
        elements.push(
          <BlockquoteBlock key={bi} label={block.label} text={block.text} viewMode={viewMode} />,
        );
        break;

      case 'directive':
        elements.push(
          <BlockDirective key={bi} directive={block.directive} viewMode={viewMode} />,
        );
        break;

      case 'hr':
        elements.push(<hr key={bi} className="border-gray-800 my-4" />);
        break;
    }
  });

  return <div className={className}>{elements}</div>;
}
