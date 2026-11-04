import React, { useState, useEffect } from 'react';
import { useAccessibility } from '../context/AccessibilityContext';
import { AudioToolbar } from '../components/AudioToolbar';
import { Award, Target, BookOpen, CheckCircle, ArrowRight, Zap, RefreshCw } from 'lucide-react';
import { updateBKT, getSkillLevel } from '../utils/bkt';

interface TopicMasteryItem {
  id: string;
  subject: string;
  topic: string;
  pMastery: number; // 0.0 to 1.0
  totalPracticed: number;
  lastPracticed: string;
  recommendedAction: string;
}

interface ApiMasteryRecord {
  topic: string;
  subject: string;
  totalQuestions: number;
  attemptsCount: number;
  correctCount: number;
  p_known: number;
  masteryPercentage: number;
  tier: string;
  lastUpdated: string | null;
}

function getRecommendedAction(tier: string): string {
  switch (tier) {
    case 'Novice':
      return 'Start with foundational practice questions for this topic.';
    case 'Developing':
      return 'Continue regular practice to build speed and accuracy.';
    case 'Proficient':
      return 'Maintain proficiency with weekly revision.';
    case 'Mastered':
      return 'Mastery maintained. Periodic revision recommended.';
    default:
      return 'Continue practicing to improve mastery.';
  }
}

function formatRelativeTime(lastUpdated: string | null): string {
  if (!lastUpdated) return 'Never practiced';
  const now = new Date();
  const updated = new Date(lastUpdated);
  const diffMs = now.getTime() - updated.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return `${diffDays} days ago`;
}

export const TopicMasteryScreen: React.FC = () => {
  const { setCurrentScreen, user } = useAccessibility();
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [topics, setTopics] = useState<TopicMasteryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMastery = async () => {
      setLoading(true);
      const uid = user?.id || 'usr_candidate_01';
      try {
        const res = await fetch(`/api/mastery?userId=${uid}`);
        const data: ApiMasteryRecord[] = await res.json();
        const mapped: TopicMasteryItem[] = (Array.isArray(data) ? data : []).map((item, idx) => ({
          id: `top-${idx + 1}`,
          subject: item.subject,
          topic: item.topic,
          pMastery: item.p_known,
          totalPracticed: item.attemptsCount,
          lastPracticed: formatRelativeTime(item.lastUpdated),
          recommendedAction: getRecommendedAction(item.tier)
        }));
        setTopics(mapped);
      } catch {
        setTopics([]);
      } finally {
        setLoading(false);
      }
    };
    fetchMastery();
  }, [user?.id]);

  const filteredTopics = selectedSubject === 'all' ? topics : topics.filter(t => t.subject === selectedSubject);

  const simulateBKTDrill = async (id: string, isCorrect: boolean) => {
    setTopics(prev => prev.map(t => {
      if (t.id === id) {
        const newProb = updateBKT(t.pMastery, isCorrect);
        return {
          ...t,
          pMastery: Number(newProb.toFixed(3)),
          totalPracticed: t.totalPracticed + 1,
          lastPracticed: 'Just now'
        };
      }
      return t;
    }));

    // Also POST to /api/practice/submit with a random question for the topic
    const topic = topics.find(t => t.id === id);
    if (topic) {
      try {
        await fetch('/api/practice/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic: topic.topic,
            subject: topic.subject,
            isCorrect
          })
        });
      } catch {
        // Ignore submit errors
      }
    }
  };

  const averageMastery = topics.length > 0
    ? (topics.reduce((acc, t) => acc + t.pMastery, 0) / topics.length) * 100
    : 0;

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Loading topic mastery data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6 border-b border-slate-300 dark:border-slate-700 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 px-3 py-1 rounded-sm border border-blue-200 dark:border-blue-800">
            <Award className="w-3.5 h-3.5" aria-hidden="true" />
            Screen 12 of 16 • Knowledge & Topic Mastery
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white mt-1">
            Bayesian Knowledge Tracing (BKT) Syllabus Mastery
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Latent skill mastery estimation $P(L_t)$ accounting for student slip ($s=0.10$), guess ($g=0.25$), and transit ($T=0.15$) parameters.
          </p>
        </div>

        <AudioToolbar
          textToRead={`Average syllabus topic mastery is ${averageMastery.toFixed(1)} percent across ${topics.length} tracked syllabus competencies.`}
          label="Mastery Status Audio"
        />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 p-4 rounded-sm shadow-sm">
          <div className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400">Mean Syllabus Mastery</div>
          <div className="text-3xl font-black text-blue-700 dark:text-blue-400 mt-1">{averageMastery.toFixed(1)}%</div>
          <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">Across {topics.length} core subtopics</div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 p-4 rounded-sm shadow-sm">
          <div className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400">Mastered Topics</div>
          <div className="text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
            {topics.filter(t => t.pMastery >= 0.85).length} / {topics.length}
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">$P(L_t) \ge 0.85$ threshold</div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 p-4 rounded-sm shadow-sm">
          <div className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400">Developing Topics</div>
          <div className="text-3xl font-black text-amber-600 dark:text-amber-400 mt-1">
            {topics.filter(t => t.pMastery < 0.70).length}
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">Recommended for targeted drill</div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 p-4 rounded-sm shadow-sm">
          <div className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400">Total Drill Questions</div>
          <div className="text-3xl font-black text-slate-900 dark:text-white mt-1">
            {topics.reduce((acc, t) => acc + t.totalPracticed, 0)}
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">Recorded audit entries</div>
        </div>
      </div>

      {/* Filter and Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-sm shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-blue-600" />
            Syllabus Topic Competency Registry
          </h2>

          <div className="flex items-center gap-2">
            <label htmlFor="mastery-filter" className="text-xs font-bold text-slate-600 dark:text-slate-300">
              Subject:
            </label>
            <select
              id="mastery-filter"
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="text-xs font-semibold p-1.5 rounded-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white"
            >
              <option value="all">All 4 Subjects</option>
              <option value="Numerical and Mathematical Ability">Numerical Ability</option>
              <option value="Reasoning Ability and Problem Solving">Reasoning Ability</option>
              <option value="General Awareness">General Awareness</option>
              <option value="English Language and Comprehension">English Language</option>
            </select>
          </div>
        </div>

        {topics.length === 0 ? (
          <div className="p-10 text-center text-slate-500 dark:text-slate-400">
            <Award className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm font-semibold">No mastery data yet.</p>
            <p className="text-xs mt-1">Start practicing questions to see your topic mastery.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" aria-label="BKT Topic Mastery Table">
              <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 uppercase font-bold border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="p-3">Topic / Subject</th>
                  <th className="p-3">Mastery Probability $P(L_t)$</th>
                  <th className="p-3">Skill Level</th>
                  <th className="p-3">Drills</th>
                  <th className="p-3">Recommended Pedagogical Action</th>
                  <th className="p-3 text-right">Interactive BKT Drill</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-medium">
                {filteredTopics.map((item) => {
                  const percent = Math.round(item.pMastery * 100);
                  const level = getSkillLevel(item.pMastery);
                  const isMaster = item.pMastery >= 0.85;
                  const isCompetent = item.pMastery >= 0.70 && item.pMastery < 0.85;

                  return (
                    <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="p-3">
                        <div className="font-bold text-slate-900 dark:text-white">{item.topic}</div>
                        <div className="text-[11px] text-slate-500">{item.subject}</div>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-900 dark:text-white w-10">
                            {percent}%
                          </span>
                          <div className="w-24 bg-slate-200 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                isMaster
                                  ? 'bg-emerald-600'
                                  : isCompetent
                                  ? 'bg-blue-600'
                                  : 'bg-amber-500'
                              }`}
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="p-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                            isMaster
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                              : isCompetent
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'
                          }`}
                        >
                          {level}
                        </span>
                      </td>
                      <td className="p-3 text-slate-600 dark:text-slate-400 font-mono">
                        {item.totalPracticed}
                      </td>
                      <td className="p-3 max-w-xs text-slate-700 dark:text-slate-300">
                        {item.recommendedAction}
                      </td>
                      <td className="p-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => simulateBKTDrill(item.id, true)}
                            title="Simulate correct attempt (+P)"
                            aria-label={`Drill correct response for ${item.topic}`}
                            className="px-2 py-1 text-[11px] font-bold rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 hover:bg-emerald-100 focus:ring-2 focus:ring-emerald-600"
                          >
                            + Correct
                          </button>
                          <button
                            onClick={() => simulateBKTDrill(item.id, false)}
                            title="Simulate incorrect attempt (-P)"
                            aria-label={`Drill incorrect response for ${item.topic}`}
                            className="px-2 py-1 text-[11px] font-bold rounded bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-300 hover:bg-rose-100 focus:ring-2 focus:ring-rose-600"
                          >
                            - Error
                          </button>
                          <button
                            onClick={() => setCurrentScreen('voice-practice')}
                            aria-label={`Launch voice practice for ${item.topic}`}
                            className="px-2.5 py-1 text-[11px] font-bold rounded bg-blue-700 text-white hover:bg-blue-800 focus:ring-2 focus:ring-blue-600 inline-flex items-center gap-1"
                          >
                            <span>Practice</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
