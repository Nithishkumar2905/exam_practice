import React, { useState, useEffect } from 'react';
import { useAccessibility } from '../context/AccessibilityContext';
import { AudioToolbar } from '../components/AudioToolbar';
import { History, Search, Filter, CheckCircle2, XCircle, Mic, BookOpen, Download, Calendar } from 'lucide-react';

interface HistoryRecord {
  id: string;
  timestamp: string;
  type: 'Voice Practice' | 'Mock Exam' | 'SM-2 Revision';
  subject: string;
  questionId: string;
  questionText: string;
  candidateAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  timeSpentSec: number;
  inputMode: 'Voice' | 'Keyboard / Click';
}

interface LearningHistoryEntry {
  id: string;
  timestamp: string;
  type: string;
  summary: string;
  durationSeconds: number;
  questionId?: string;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 0) return `Today, ${timeStr}`;
  if (diffDays === 1) return `Yesterday, ${timeStr}`;
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${timeStr}`;
}

function mapActivityType(type: string): 'Voice Practice' | 'Mock Exam' | 'SM-2 Revision' {
  switch (type) {
    case 'mock_exam': return 'Mock Exam';
    case 'revision': return 'SM-2 Revision';
    case 'practice':
    case 'ai_tutor':
    default:
      return 'Voice Practice';
  }
}

function parseSubjectFromSummary(summary: string): string {
  // Summary may contain subject info: try to extract
  if (summary.toLowerCase().includes('numerical') || summary.toLowerCase().includes('math')) {
    return 'Numerical and Mathematical Ability';
  }
  if (summary.toLowerCase().includes('reasoning')) {
    return 'Reasoning Ability and Problem Solving';
  }
  if (summary.toLowerCase().includes('general awareness') || summary.toLowerCase().includes('history') || summary.toLowerCase().includes('polity')) {
    return 'General Awareness';
  }
  if (summary.toLowerCase().includes('english') || summary.toLowerCase().includes('grammar') || summary.toLowerCase().includes('idiom')) {
    return 'English Language and Comprehension';
  }
  return 'General';
}

function parseQuestionTextFromSummary(summary: string): string {
  const qMatch = summary.match(/Q:\s*(.+?)(?:\.{3}|$)/);
  if (qMatch) return qMatch[1].trim();
  // Fallback: return up to 100 chars of summary
  return summary.length > 100 ? summary.slice(0, 100) + '...' : summary;
}

function isCorrectFromSummary(summary: string): boolean {
  return summary.toLowerCase().includes('result: correct');
}

function mapEntryToRecord(entry: LearningHistoryEntry): HistoryRecord {
  const correct = isCorrectFromSummary(entry.summary);
  const answerText = correct ? 'Correct answer selected' : 'Incorrect answer selected';
  return {
    id: entry.id,
    timestamp: formatTimestamp(entry.timestamp),
    type: mapActivityType(entry.type),
    subject: parseSubjectFromSummary(entry.summary),
    questionId: entry.questionId || entry.id.split('_').slice(0, 2).join('-').toUpperCase() || 'N/A',
    questionText: parseQuestionTextFromSummary(entry.summary),
    candidateAnswer: answerText,
    correctAnswer: correct ? 'Correct answer selected' : 'N/A',
    isCorrect: correct,
    timeSpentSec: entry.durationSeconds || 0,
    inputMode: 'Keyboard / Click'
  };
}

export const LearningHistoryScreen: React.FC = () => {
  const { user } = useAccessibility();
  const [filterType, setFilterType] = useState<string>('all');
  const [filterSubject, setFilterSubject] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<HistoryRecord | null>(null);
  const [historyRecords, setHistoryRecords] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true);
      const uid = user?.id || 'usr_candidate_01';
      try {
        // First try the enriched endpoint
        const detailedRes = await fetch(`/api/history/detailed?userId=${uid}`);
        if (detailedRes.ok) {
          const data = await detailedRes.json();
          setHistoryRecords(Array.isArray(data) ? data : []);
        } else {
          throw new Error('detailed not available');
        }
      } catch {
        // Fall back to /api/history and map manually
        try {
          const res = await fetch(`/api/history?userId=${uid}`);
          if (res.ok) {
            const data: LearningHistoryEntry[] = await res.json();
            const mapped = (Array.isArray(data) ? data : []).map(mapEntryToRecord);
            setHistoryRecords(mapped);
          } else {
            setHistoryRecords([]);
          }
        } catch {
          setHistoryRecords([]);
        }
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, [user?.id]);

  const filtered = historyRecords.filter(r => {
    if (filterType !== 'all' && r.type !== filterType) return false;
    if (filterSubject !== 'all' && r.subject !== filterSubject) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return r.questionText.toLowerCase().includes(q) || r.questionId.toLowerCase().includes(q);
    }
    return true;
  });

  const handleExportCSV = () => {
    const headers = ['Record ID', 'Timestamp', 'Type', 'Subject', 'Question ID', 'Candidate Answer', 'Correct Answer', 'Is Correct', 'Time Spent (s)', 'Input Mode'];
    const rows = filtered.map(r => [
      r.id,
      r.timestamp,
      r.type,
      `"${r.subject}"`,
      r.questionId,
      `"${r.candidateAnswer}"`,
      `"${r.correctAnswer}"`,
      r.isCorrect ? 'YES' : 'NO',
      r.timeSpentSec,
      r.inputMode
    ]);
    const csvContent = [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `SSC_MTS_Audit_Log_${user?.rollNumber || 'Candidate'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Loading learning history...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Title */}
      <div className="mb-6 border-b border-slate-300 dark:border-slate-700 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 px-3 py-1 rounded-sm border border-blue-200 dark:border-blue-800">
            <History className="w-3.5 h-3.5" aria-hidden="true" />
            Screen 14 of 16 • Learning History Archive
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white mt-1">
            Candidate Practice & Examination Audit Log
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Immutable longitudinal log of all practice attempts, voice transcripts, and mock examination responses.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <AudioToolbar
            textToRead={`Displaying ${filtered.length} candidate activity records in the learning history audit log.`}
            label="History Summary Audio"
          />
          <button
            onClick={handleExportCSV}
            className="px-3.5 py-2 text-xs font-bold rounded-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 flex items-center gap-1.5 focus:ring-2 focus:ring-blue-600 shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            Download CSV Audit
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 p-4 rounded-sm shadow-sm mb-6 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by question text or ID..."
            className="w-full pl-9 pr-3 py-2 text-xs font-medium rounded-sm border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="text-xs font-semibold p-2 rounded-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white"
              aria-label="Filter by activity type"
            >
              <option value="all">All Activity Types</option>
              <option value="Voice Practice">Voice Practice</option>
              <option value="Mock Exam">Mock Exam</option>
              <option value="SM-2 Revision">SM-2 Revision</option>
            </select>
          </div>

          <div>
            <select
              value={filterSubject}
              onChange={(e) => setFilterSubject(e.target.value)}
              className="text-xs font-semibold p-2 rounded-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white"
              aria-label="Filter by subject"
            >
              <option value="all">All 4 Subjects</option>
              <option value="Numerical and Mathematical Ability">Numerical Ability</option>
              <option value="Reasoning Ability and Problem Solving">Reasoning Ability</option>
              <option value="General Awareness">General Awareness</option>
              <option value="English Language and Comprehension">English Language</option>
            </select>
          </div>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-sm shadow-sm overflow-hidden mb-6">
        {historyRecords.length === 0 ? (
          <div className="p-10 text-center text-slate-500 dark:text-slate-400">
            <History className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm font-semibold">No learning history yet.</p>
            <p className="text-xs mt-1">Complete practice sessions or mock exams to see your history.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-slate-500 dark:text-slate-400">
            <Search className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm font-semibold">No records match your filters.</p>
            <p className="text-xs mt-1">Try adjusting the search or filter options.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" aria-label="Candidate Learning History Audit Table">
              <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 uppercase font-bold border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="p-3">Timestamp / Mode</th>
                  <th className="p-3">Activity Type</th>
                  <th className="p-3">Question ID & Subject</th>
                  <th className="p-3">Candidate Answer</th>
                  <th className="p-3">Correct Answer</th>
                  <th className="p-3">Result</th>
                  <th className="p-3">Pace</th>
                  <th className="p-3 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-medium">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="p-3 whitespace-nowrap">
                      <div className="font-semibold text-slate-900 dark:text-white">{r.timestamp}</div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-1">
                        {r.inputMode === 'Voice' ? <Mic className="w-3 h-3 text-blue-600" /> : null}
                        <span>{r.inputMode}</span>
                      </div>
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                        {r.type}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="font-mono font-bold text-blue-700 dark:text-blue-300">{r.questionId}</div>
                      <div className="text-[11px] text-slate-500">{r.subject}</div>
                    </td>
                    <td className="p-3 max-w-[200px] truncate text-slate-800 dark:text-slate-200">
                      {r.candidateAnswer}
                    </td>
                    <td className="p-3 max-w-[160px] truncate font-semibold text-slate-800 dark:text-slate-200">
                      {r.correctAnswer}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {r.isCorrect ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Correct
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 dark:text-rose-400">
                          <XCircle className="w-3.5 h-3.5" /> Incorrect
                        </span>
                      )}
                    </td>
                    <td className="p-3 font-mono">{r.timeSpentSec}s</td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => setSelectedRecord(r)}
                        className="px-2.5 py-1 text-xs font-bold text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700 rounded hover:bg-blue-50 dark:hover:bg-blue-950 focus:ring-2 focus:ring-blue-600"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Inspect Modal */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border-2 border-slate-700 rounded-sm max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Attempt Audit: {selectedRecord.questionId}
              </h2>
              <button
                onClick={() => setSelectedRecord(null)}
                className="text-slate-500 hover:text-slate-900 dark:hover:text-white text-sm font-bold"
              >
                ✕ Close
              </button>
            </div>

            <div className="text-xs space-y-2">
              <div className="text-slate-500">Subject: <strong className="text-slate-800 dark:text-slate-200">{selectedRecord.subject}</strong></div>
              <div className="text-slate-500">Input Modality: <strong className="text-slate-800 dark:text-slate-200">{selectedRecord.inputMode}</strong></div>
              <div className="text-slate-500">Pace: <strong className="text-slate-800 dark:text-slate-200">{selectedRecord.timeSpentSec} seconds</strong></div>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-xs">
              <div className="font-bold text-slate-700 dark:text-slate-300 mb-1">Question Stem:</div>
              <p className="text-slate-900 dark:text-white">{selectedRecord.questionText}</p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded">
                <div className="font-bold text-slate-600 dark:text-slate-400">Candidate Answer:</div>
                <div className="font-mono font-bold mt-1 text-slate-900 dark:text-white">{selectedRecord.candidateAnswer}</div>
              </div>
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded border border-emerald-300 dark:border-emerald-800">
                <div className="font-bold text-emerald-800 dark:text-emerald-300">Official Key:</div>
                <div className="font-mono font-bold mt-1 text-emerald-900 dark:text-emerald-100">{selectedRecord.correctAnswer}</div>
              </div>
            </div>

            <div className="text-right pt-2">
              <button
                onClick={() => setSelectedRecord(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-sm focus:ring-2 focus:ring-blue-600"
              >
                Close Audit Dialog
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
