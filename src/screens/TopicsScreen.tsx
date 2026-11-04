import React, { useState, useEffect } from 'react';
import { Compass, Search, Filter, BookOpen, ArrowRight, Mic, CheckCircle2, ChevronRight } from 'lucide-react';
import { useAccessibility } from '../context/AccessibilityContext.tsx';
import { AudioToolbar } from '../components/AudioToolbar.tsx';
import { Question } from '../db/database.ts';

export function TopicsScreen() {
  const { navigateTo, announce } = useAccessibility();

  const [selectedSubject, setSelectedSubject] = useState<string>('Numerical and Mathematical Ability');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);

  const subjects = [
    { name: 'Numerical and Mathematical Ability', code: 'NUM', session: 'Session-I', color: 'blue' },
    { name: 'Reasoning Ability and Problem Solving', code: 'REA', session: 'Session-I', color: 'indigo' },
    { name: 'General Awareness', code: 'GA', session: 'Session-II', color: 'purple' },
    { name: 'English Language and Comprehension', code: 'ENG', session: 'Session-II', color: 'emerald' }
  ];

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({
      subject: selectedSubject,
      limit: '100'
    });
    if (selectedDifficulty !== 'all') {
      params.append('difficulty', selectedDifficulty);
    }
    if (searchQuery.trim()) {
      params.append('search', searchQuery.trim());
    }

    fetch(`/api/questions?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        setQuestions(data.questions || []);
      })
      .catch((e) => console.warn('Questions fetch error:', e))
      .finally(() => setLoading(false));
  }, [selectedSubject, selectedDifficulty, searchQuery]);

  // Aggregate questions by topic
  const topicsMap: Record<string, { topic: string; subtopics: Set<string>; questions: Question[] }> = {};
  questions.forEach((q) => {
    if (!topicsMap[q.topic]) {
      topicsMap[q.topic] = { topic: q.topic, subtopics: new Set(), questions: [] };
    }
    topicsMap[q.topic].questions.push(q);
    if (q.subtopic) topicsMap[q.topic].subtopics.add(q.subtopic);
  });

  const topicsList = Object.values(topicsMap);

  const overviewText = `Subject and Topic Explorer for ${selectedSubject}. Showing ${topicsList.length} syllabus topics with ${questions.length} verified questions.`;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8" id="main-content">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-300">
        <div>
          <span className="text-xs font-bold text-blue-700 uppercase tracking-wider">
            Screen 5 of 16 · Curriculum Exploration
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1">
            Subject &amp; Topic Explorer
          </h1>
          <p className="text-sm text-slate-600">
            Browse the official 4-subject SSC MTS syllabus and launch targeted voice practice by topic.
          </p>
        </div>

        <div className="shrink-0">
          <AudioToolbar textToRead={overviewText} label="Listen to topic overview" />
        </div>
      </div>

      {/* 2. Subject Tabs (4 Core Subjects) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {subjects.map((sub) => {
          const isSelected = selectedSubject === sub.name;
          return (
            <button
              key={sub.name}
              type="button"
              onClick={() => {
                setSelectedSubject(sub.name);
                announce(`Switched to ${sub.name}`, 'polite');
              }}
              aria-pressed={isSelected}
              className={`p-4 text-left rounded-xl border-2 transition-all flex flex-col justify-between ${
                isSelected
                  ? 'border-blue-700 bg-blue-50/70 shadow-sm ring-2 ring-blue-600'
                  : 'border-slate-300 bg-white hover:border-slate-400'
              }`}
            >
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {sub.session}
                </span>
                <h2 className="text-sm font-bold text-slate-900 mt-0.5 leading-snug">{sub.name}</h2>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs font-semibold text-blue-700">
                <span>100 Questions</span>
                {isSelected && <CheckCircle2 className="w-4 h-4" />}
              </div>
            </button>
          );
        })}
      </div>

      {/* 3. Search & Difficulty Filters */}
      <div className="p-4 bg-white border border-slate-300 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-2xs">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search topics, questions, formulas..."
            className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-700"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <label htmlFor="diff-filter" className="text-xs font-semibold text-slate-600 whitespace-nowrap">
            Difficulty:
          </label>
          <select
            id="diff-filter"
            value={selectedDifficulty}
            onChange={(e) => setSelectedDifficulty(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-800 focus:border-blue-700 focus:outline-hidden"
          >
            <option value="all">All Difficulties</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
      </div>

      {/* 4. Topics List */}
      <div className="space-y-4">
        <h2 className="text-base font-bold text-slate-900 flex items-center justify-between">
          <span>Topics in {selectedSubject}</span>
          <span className="text-xs font-normal text-slate-500">
            {questions.length} Verified Questions Total
          </span>
        </h2>

        {loading ? (
          <div className="p-12 text-center text-slate-500 text-sm">Loading curriculum topics...</div>
        ) : topicsList.length === 0 ? (
          <div className="p-8 text-center bg-white border border-slate-200 rounded-xl text-slate-600 text-sm">
            No questions matched your search criteria.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {topicsList.map((t) => {
              const subtopicsArray = Array.from(t.subtopics);
              return (
                <div
                  key={t.topic}
                  className="p-5 bg-white border border-slate-300 rounded-xl shadow-2xs hover:border-blue-400 transition-all flex flex-col justify-between space-y-4"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-base font-bold text-slate-900">{t.topic}</h3>
                      <span className="text-xs font-bold px-2 py-0.5 bg-blue-100 text-blue-900 rounded shrink-0">
                        {t.questions.length} Qs
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 mt-1">
                      Subtopics: {subtopicsArray.slice(0, 3).join(', ')}
                      {subtopicsArray.length > 3 ? ` +${subtopicsArray.length - 3} more` : ''}
                    </p>

                    {/* Sample Question Preview */}
                    {t.questions[0] && (
                      <div className="mt-3 p-2.5 bg-slate-50 rounded border border-slate-200 text-xs text-slate-700">
                        <span className="font-semibold text-slate-900">Sample: </span>
                        {t.questions[0].question_text.slice(0, 90)}...
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[11px] text-slate-500">
                      Provenance: {t.questions[0]?.source_name || 'SSC MTS Official'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          sessionStorage.setItem('practice_filter_subject', selectedSubject);
                          sessionStorage.setItem('practice_filter_topic', t.topic);
                        } catch {}
                        navigateTo('voice_practice');
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 rounded-md transition-colors"
                    >
                      <Mic className="w-3.5 h-3.5" />
                      <span>Practice Topic</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
