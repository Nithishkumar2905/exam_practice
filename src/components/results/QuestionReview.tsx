import React, { useState, useMemo, useEffect } from 'react';
import {
  CheckCircle2,
  XCircle,
  MinusCircle,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Clock,
  Calendar,
  Brain,
} from 'lucide-react';
import { AudioToolbar } from '../AudioToolbar.tsx';
import { useAccessibility } from '../../context/AccessibilityContext.tsx';

export type QuestionReviewStatus = 'correct' | 'incorrect' | 'unattempted';
export type QuestionReviewFilter = 'all' | 'incorrect' | 'correct' | 'unattempted' | 'review';

export interface QuestionReviewItem {
  questionNumber: number;
  questionId: string;
  questionText: string;
  subject: string;
  topic?: string;
  options?: {
    A: string;
    B: string;
    C: string;
    D: string;
  };
  selectedOption: string | null;
  selectedOptionText?: string | null;
  correctOption: string;
  correctOptionText?: string;
  status: QuestionReviewStatus;
  marksDelta: number;
  timeSpentSeconds?: number | null;
  explanation?: string | null;
  sourceReference?: string;
  sourceName?: string;
  markedForReview?: boolean;
}

export interface QuestionReviewCounts {
  all: number;
  incorrect: number;
  correct: number;
  unattempted: number;
  review: number;
}

export function computeReviewCounts(items: QuestionReviewItem[]): QuestionReviewCounts {
  let incorrect = 0;
  let correct = 0;
  let unattempted = 0;
  let review = 0;

  for (const item of items) {
    if (item.status === 'correct') correct += 1;
    else if (item.status === 'incorrect') incorrect += 1;
    else unattempted += 1;

    if (item.markedForReview) review += 1;
  }

  return {
    all: items.length,
    incorrect,
    correct,
    unattempted,
    review,
  };
}

export function filterReviewQuestions(
  items: QuestionReviewItem[],
  filter: QuestionReviewFilter
): QuestionReviewItem[] {
  if (filter === 'all') return items;
  if (filter === 'review') return items.filter((item) => Boolean(item.markedForReview));
  return items.filter((item) => item.status === filter);
}

function formatMarksLabel(marksDelta: number): string {
  if (marksDelta > 0) return `+${marksDelta} Marks`;
  if (marksDelta < 0) return `${marksDelta} Mark${Math.abs(marksDelta) === 1 ? '' : 's'}`;
  return '0 Marks';
}

interface QuestionReviewProps {
  items: QuestionReviewItem[];
  title?: string;
  subtitle?: string;
  onAddToRevision?: (questionId: string) => void;
  onAskAiTutor?: () => void;
}

export const QuestionReview: React.FC<QuestionReviewProps> = ({
  items,
  title = 'Detailed Question-by-Question Review',
  subtitle = 'Filter by outcome, expand explanations, or step through questions one by one.',
  onAddToRevision,
  onAskAiTutor,
}) => {
  const { announce } = useAccessibility();
  const [filterType, setFilterType] = useState<QuestionReviewFilter>('all');
  const [activePosition, setActivePosition] = useState<number>(0);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const counts = useMemo(() => computeReviewCounts(items), [items]);
  const filteredItems = useMemo(
    () => filterReviewQuestions(items, filterType),
    [items, filterType]
  );

  // Reset active position and expand first card when filter or items list changes
  useEffect(() => {
    setActivePosition(0);
    if (filteredItems.length > 0) {
      setExpandedIds((prev) => {
        const firstId = filteredItems[0].questionId;
        if (prev[firstId] !== undefined) return prev;
        return { ...prev, [firstId]: true };
      });
    }
  }, [filterType, filteredItems.length]);

  const handleSelectFilter = (nextFilter: QuestionReviewFilter, label: string, count: number) => {
    setFilterType(nextFilter);
    setActivePosition(0);
    announce(`Showing ${count} ${label.toLowerCase()}`, 'polite');
  };

  const toggleExpanded = (questionId: string, questionNumber: number) => {
    setExpandedIds((prev) => {
      const nextVal = !(prev[questionId] ?? true);
      announce(
        `Question ${questionNumber} ${nextVal ? 'expanded' : 'collapsed'}`,
        'polite'
      );
      return { ...prev, [questionId]: nextVal };
    });
  };

  const handleStep = (direction: -1 | 1) => {
    if (filteredItems.length === 0) return;
    const nextPos = Math.max(0, Math.min(filteredItems.length - 1, activePosition + direction));
    if (nextPos === activePosition) return;
    setActivePosition(nextPos);
    const target = filteredItems[nextPos];
    setExpandedIds((prev) => ({ ...prev, [target.questionId]: true }));
    announce(
      `Viewing Question ${target.questionNumber}, ${nextPos + 1} of ${filteredItems.length} in current filter`,
      'polite'
    );
    const el = document.getElementById(`review-question-${target.questionId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  const filterTabs: Array<{
    id: QuestionReviewFilter;
    label: string;
    count: number;
    activeClass: string;
  }> = [
    {
      id: 'all',
      label: 'All Questions',
      count: counts.all,
      activeClass: 'bg-[#1749E8] text-white border-[#1749E8]',
    },
    {
      id: 'incorrect',
      label: 'Incorrect Questions',
      count: counts.incorrect,
      activeClass: 'bg-red-600 text-white border-red-600',
    },
    {
      id: 'correct',
      label: 'Correct Questions',
      count: counts.correct,
      activeClass: 'bg-emerald-600 text-white border-emerald-600',
    },
    {
      id: 'unattempted',
      label: 'Unattempted',
      count: counts.unattempted,
      activeClass: 'bg-slate-700 text-white border-slate-700',
    },
  ];

  if (counts.review > 0) {
    filterTabs.push({
      id: 'review',
      label: 'Marked for Review',
      count: counts.review,
      activeClass: 'bg-amber-600 text-white border-amber-600',
    });
  }

  return (
    <section
      aria-label={title}
      className="bg-white border border-[#D9E1EF] rounded-2xl p-6 shadow-xs space-y-5"
    >
      {/* Header + Filter Tabs */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#E8EBF0] pb-4">
        <div>
          <h2 className="text-lg font-extrabold text-[#172033]">{title}</h2>
          <p className="text-xs text-[#53627A] mt-0.5">{subtitle}</p>
        </div>

        <div
          role="tablist"
          aria-label="Question review filter"
          className="flex flex-wrap items-center gap-1.5"
        >
          {filterTabs.map((tab) => {
            const isActive = filterType === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => handleSelectFilter(tab.id, tab.label, tab.count)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-[#1749E8] ${
                  isActive
                    ? tab.activeClass
                    : 'bg-[#F8F9FB] text-[#172033] border-[#D9E1EF] hover:bg-slate-100'
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Previous / Next Navigator Preserving Active Filter */}
      {filteredItems.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-[#F8F9FB] border border-[#E8EBF0] rounded-xl text-xs">
          <span className="font-semibold text-[#53627A]">
            Viewing <strong className="text-[#172033]">{activePosition + 1}</strong> of{' '}
            <strong className="text-[#172033]">{filteredItems.length}</strong>{' '}
            {filterType === 'all' ? 'questions' : `${filterType} questions`}
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleStep(-1)}
              disabled={activePosition === 0}
              className="inline-flex items-center gap-1 px-3 py-1.5 font-bold text-[#172033] bg-white border border-[#D9E1EF] rounded-lg hover:bg-slate-50 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-[#1749E8]"
            >
              <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Previous Question</span>
            </button>
            <button
              type="button"
              onClick={() => handleStep(1)}
              disabled={activePosition >= filteredItems.length - 1}
              className="inline-flex items-center gap-1 px-3 py-1.5 font-bold text-[#172033] bg-white border border-[#D9E1EF] rounded-lg hover:bg-slate-50 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-[#1749E8]"
            >
              <span>Next Question</span>
              <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* Filtered Empty State */}
      {filteredItems.length === 0 ? (
        <div className="py-10 text-center text-sm text-[#53627A] bg-[#F8F9FB] border border-dashed border-[#D9E1EF] rounded-xl">
          No questions match the selected filter.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredItems.map((item, idx) => {
            const isExpanded = expandedIds[item.questionId] ?? true;
            const isFocused = idx === activePosition;
            const explanationText =
              item.explanation && item.explanation.trim().length > 0
                ? item.explanation.trim()
                : 'Detailed explanation is not available for this question.';

            const selectedDisplayText =
              item.selectedOption &&
              (item.selectedOptionText ||
                (item.options
                  ? item.options[item.selectedOption.toUpperCase() as 'A' | 'B' | 'C' | 'D']
                  : ''));

            const correctDisplayText =
              item.correctOptionText ||
              (item.options
                ? item.options[item.correctOption.toUpperCase() as 'A' | 'B' | 'C' | 'D']
                : '');

            const audioSummary =
              item.status === 'unattempted'
                ? `Question ${item.questionNumber}. ${item.questionText}. Not Attempted. Correct Answer is Option ${item.correctOption}${correctDisplayText ? `: ${correctDisplayText}` : ''}. Explanation: ${explanationText}`
                : `Question ${item.questionNumber}. ${item.questionText}. Your Answer was Option ${item.selectedOption}${selectedDisplayText ? `: ${selectedDisplayText}` : ''}, which was ${item.status}. Correct Answer is Option ${item.correctOption}${correctDisplayText ? `: ${correctDisplayText}` : ''}. Explanation: ${explanationText}`;

            return (
              <article
                key={item.questionId}
                id={`review-question-${item.questionId}`}
                className={`bg-white border-2 rounded-xl transition-all ${
                  isFocused ? 'ring-2 ring-[#1749E8]/20 ' : ''
                }${
                  item.status === 'correct'
                    ? 'border-emerald-300'
                    : item.status === 'incorrect'
                    ? 'border-red-300'
                    : 'border-slate-300'
                }`}
              >
                {/* Card Header */}
                <div className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-extrabold px-2.5 py-1 bg-[#F8F9FB] text-[#172033] rounded-md border border-[#D9E1EF]">
                      Q #{item.questionNumber}
                    </span>
                    <span className="text-xs font-bold px-2.5 py-1 bg-[#EEF4FF] text-[#1749E8] rounded-md border border-[#D9E1EF]">
                      {item.subject}
                    </span>
                    {item.topic && (
                      <span className="text-xs font-semibold text-[#53627A]">
                        Topic: {item.topic}
                      </span>
                    )}
                    {typeof item.timeSpentSeconds === 'number' && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#53627A] bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                        <Clock className="w-3 h-3" aria-hidden="true" />
                        {item.timeSpentSeconds}s
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {item.status === 'correct' && (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-md">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                        <span>Your Answer — Correct ({formatMarksLabel(item.marksDelta)})</span>
                      </span>
                    )}
                    {item.status === 'incorrect' && (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-red-800 bg-red-100 px-2.5 py-1 rounded-md">
                        <XCircle className="w-4 h-4 text-red-600" aria-hidden="true" />
                        <span>Your Answer — Incorrect ({formatMarksLabel(item.marksDelta)})</span>
                      </span>
                    )}
                    {item.status === 'unattempted' && (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-md">
                        <MinusCircle className="w-4 h-4 text-slate-500" aria-hidden="true" />
                        <span>Not Attempted ({formatMarksLabel(item.marksDelta)})</span>
                      </span>
                    )}

                    <AudioToolbar
                      textToRead={audioSummary}
                      label={`Read question ${item.questionNumber} review aloud`}
                    />

                    <button
                      type="button"
                      onClick={() => toggleExpanded(item.questionId, item.questionNumber)}
                      aria-expanded={isExpanded}
                      aria-label={`${isExpanded ? 'Collapse' : 'Expand'} Question ${item.questionNumber} details`}
                      className="p-1.5 rounded-lg border border-[#D9E1EF] text-[#53627A] hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#1749E8]"
                    >
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" aria-hidden="true" />
                      ) : (
                        <ChevronDown className="w-4 h-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Question Text Always Visible */}
                <div className="px-4 sm:px-5 pb-4">
                  <p className="text-sm sm:text-base font-bold text-[#172033] leading-relaxed">
                    {item.questionText}
                  </p>
                </div>

                {/* Expandable Details */}
                {isExpanded && (
                  <div className="px-4 sm:px-5 pb-5 space-y-4 border-t border-[#E8EBF0] pt-4">
                    {/* Answer Comparison */}
                    <div
                      className={`grid grid-cols-1 ${
                        item.status !== 'unattempted' ? 'sm:grid-cols-2' : ''
                      } gap-3`}
                    >
                      {item.status !== 'unattempted' && item.selectedOption && (
                        <div
                          className={`p-3.5 rounded-lg border-2 ${
                            item.status === 'correct'
                              ? 'bg-emerald-50 border-emerald-400 text-emerald-950'
                              : 'bg-red-50 border-red-400 text-red-950'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider mb-1">
                            {item.status === 'correct' ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-700" aria-hidden="true" />
                            ) : (
                              <XCircle className="w-4 h-4 text-red-700" aria-hidden="true" />
                            )}
                            <span>
                              {item.status === 'correct'
                                ? 'Your Answer — Correct'
                                : 'Your Answer — Incorrect'}
                            </span>
                          </div>
                          <p className="text-sm font-semibold">
                            Option {item.selectedOption}
                            {selectedDisplayText ? `: ${selectedDisplayText}` : ''}
                          </p>
                        </div>
                      )}

                      <div className="p-3.5 rounded-lg border-2 bg-emerald-50 border-emerald-500 text-emerald-950">
                        <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider mb-1">
                          <CheckCircle2 className="w-4 h-4 text-emerald-700" aria-hidden="true" />
                          <span>Correct Answer</span>
                        </div>
                        <p className="text-sm font-semibold">
                          Option {item.correctOption}
                          {correctDisplayText ? `: ${correctDisplayText}` : ''}
                        </p>
                      </div>
                    </div>

                    {/* Options Grid */}
                    {item.options && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        {(['A', 'B', 'C', 'D'] as const).map((optKey) => {
                          const optText = item.options?.[optKey] || '';
                          const isCorrectOpt =
                            item.correctOption.toUpperCase() === optKey;
                          const isUserSelection =
                            item.selectedOption?.toUpperCase() === optKey;

                          let style = 'bg-[#F8F9FB] border-[#E8EBF0] text-[#172033]';
                          if (isCorrectOpt) {
                            style =
                              'bg-emerald-100 border-emerald-500 text-emerald-950 font-bold';
                          } else if (isUserSelection && item.status === 'incorrect') {
                            style =
                              'bg-red-100 border-red-500 text-red-950 font-semibold';
                          }

                          return (
                            <div
                              key={optKey}
                              className={`p-2.5 rounded-lg border flex items-center gap-2.5 ${style}`}
                            >
                              <span className="w-5 h-5 rounded-full bg-white border border-slate-300 flex items-center justify-center font-bold text-[11px] shrink-0">
                                {optKey}
                              </span>
                              <span>{optText}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Explanation */}
                    <div className="p-4 bg-[#F8F9FB] border border-[#D9E1EF] rounded-lg space-y-1.5 text-xs text-[#172033]">
                      <span className="font-bold text-[#172033] block">Explanation:</span>
                      <p className="leading-relaxed">{explanationText}</p>
                      {(item.sourceName || item.sourceReference) && (
                        <div className="pt-1 text-[11px] text-[#53627A]">
                          Source: {item.sourceName || 'SSC MTS Bank'}
                          {item.sourceReference ? ` (${item.sourceReference})` : ''}
                        </div>
                      )}
                    </div>

                    {/* Optional Parent Action Buttons */}
                    {(onAddToRevision || onAskAiTutor) && (
                      <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
                        {onAddToRevision && (
                          <button
                            type="button"
                            onClick={() => onAddToRevision(item.questionId)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-purple-800 bg-purple-50 hover:bg-purple-100 border border-purple-300 rounded-md transition-colors"
                          >
                            <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Add to Spaced Revision Planner</span>
                          </button>
                        )}
                        {onAskAiTutor && (
                          <button
                            type="button"
                            onClick={onAskAiTutor}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#1749E8] bg-[#EEF4FF] hover:bg-blue-100 border border-blue-300 rounded-md transition-colors"
                          >
                            <Brain className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Ask AI Tutor to Clarify (Alt+T)</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};

