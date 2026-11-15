import React, { useState, useEffect } from 'react';
import { useAccessibility } from '../context/AccessibilityContext';
import { AudioToolbar } from '../components/AudioToolbar';
import { History, Search, CheckCircle2, XCircle, Mic, Download } from 'lucide-react';

interface HistoryRecord {
  id: string;
  timestamp: string;
  type: 'Voice Practice' | 'Mock Exam' | 'Pilot Demo' | 'SM-2 Revision' | 'AI Tutor';
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
  title?: string;
  summary: string;
  score?: number;
  maxScore?: number;
  durationSeconds: number;
  questionId?: string;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso || 'Recent';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 0) return `Today, ${timeStr}`;
  if (diffDays === 1) return `Yesterday, ${timeStr}`;
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${timeStr}`;
}

function mapActivityType(type: string): HistoryRecord['type'] {
  switch (type) {
    case 'mock_exam':
    case 'Mock Exam':
      return 'Mock Exam';
    case 'diagnostic':
    case 'Pilot Demo':
      return 'Pilot Demo';
    case 'revision':
    case 'SM-2 Revision':
      return 'SM-2 Revision';
    case 'ai_tutor':
    case 'AI Tutor':
      return 'AI Tutor';
    case 'practice':
    case 'Voice Practice':
    default:
      return 'Voice Practice';
  }
}

function parseSubjectFromEntry(entry: LearningHistoryEntry): string {
  const text = `${entry.title || ''} ${entry.summary || ''}`.toLowerCase();
  if (text.includes('numerical') || text.includes('math')) return 'Numerical and Mathematical Ability';
  if (text.includes('reasoning')) return 'Reasoning Ability and Problem Solving';
  if (text.includes('general awareness') || text.includes('history') || text.includes('polity')) return 'General Awareness';
  if (text.includes('english') || text.includes('grammar') || text.includes('idiom')) return 'English Language and Comprehension';
  return 'All 4 SSC MTS Sections';
}

function mapEntryToRecord(raw: any): HistoryRecord {
  // Already normalized DetailedRecord
  if (raw && typeof raw.questionId === 'string' && typeof raw.candidateAnswer === 'string') {
    return {
      ...raw,
      timestamp: formatTimestamp(raw.timestamp),
      type: mapActivityType(raw.type)
    };
  }

  const entry = raw as LearningHistoryEntry;
  const summary = String(entry.summary || '');
  const title = String(entry.title || 'Learning Activity');
  const correctMatch = summary.match(/Result:\s*(Correct|Incorrect)/i);
  const selectedMatch = summary.match(/Selected:\s*([A-D])/i);
  const qidMatch = summary.match(/(SSC-MTS-[A-Z0-9-]+)/i) || title.match(/(SSC-MTS-[A-Z0-9-]+)/i);

  const hasScore = typeof entry.score === 'number' && typeof entry.maxScore === 'number' && entry.maxScore > 0;
  const isCorrect = correctMatch
    ? correctMatch[1].toLowerCase() === 'correct'
    : hasScore
    ? (entry.score! / entry.maxScore!) >= 0.5
    : true;

  const candidateAnswer = selectedMatch
    ? `Option ${selectedMatch[1]}`
    : hasScore
    ? `Score: ${entry.score} / ${entry.maxScore}`
    : summary.slice(0, 60) || 'Completed';

  const correctAnswer = correctMatch
    ? isCorrect
      ? selectedMatch
        ? `Option ${selectedMatch[1]}`
        : 'Matched Key'
      : 'Review Explanation'
    : hasScore
    ? `Max: ${entry.maxScore}`
    : 'Completed';

  return {
    id: entry.id,
    timestamp: formatTimestamp(entry.timestamp),
    type: mapActivityType(entry.type),
    subject: parseSubjectFromEntry(entry),
    questionId: entry.questionId || (qidMatch ? qidMatch[1] : title.slice(0, 26)),
    questionText: summary || title,
    candidateAnswer,
    correctAnswer,
    isCorrect,
    timeSpentSec: Number(entry.durationSeconds) || 0,
    inputMode: /voice/i.test(`${entry.type} ${summary} ${title}`) ? 'Voice' : 'Keyboard / Click'
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
        const res = await fetch(`/api/history/detailed?userId=${uid}`);
        if (res.ok) {
          const data = await res.json();
          const mapped = (Array.isArray(data) ? data : []).map(mapEntryToRecord);
          setHistoryRecords(mapped);
        } else {
          throw new Error('detailed not available');
        }
      } catch {
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

  const filtered = historyRecords.filter((r) => {
    if (filterType !== 'all' && r.type !== filterType) return false;
    if (filterSubject !== 'all' && r.subject !== filterSubject) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        r.questionText.toLowerCase().includes(q) ||
        r.questionId.toLowerCase().includes(q) ||
        r.subject.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleExportCSV = () => {
    const headers = [
      'Record ID',
      'Timestamp',
      'Type',
      'Subject',
      'Question ID',
      'Candidate Answer',
      'Correct Answer',
      'Is Correct',
      'Time Spent (s)',
      'Input Mode'
    ];
    const rows = filtered.map((r) => [
      r.id,
      `"${r.timestamp}"`,
      r.type,
      `"${r.subject}"`,
      `"${r.questionId}"`,
      `"${r.candidateAnswer.replace(/"/g, '""')}"`,
      `"${r.correctAnswer.replace(/"/g, '""')}"`,
      r.isCorrect ? 'YES' : 'NO',
      r.timeSpentSec,
      r.inputMode
    ]);
    const csvContent = [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
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
          <div className="w-8 h-8 border-4 border-[#1749E8] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-[#53627A]">Loading learning history...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* Title */}
      <div className="bg-white border border-[#E8EBF0] rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-2xs">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#1749E8] bg-[#EEF4FF] px-3 py-1 rounded-full border border-[#D0DEFF]">
            <History className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Screen 14 of 17 · Learning History Archive</span>
          </div>
          <h1 className="text-2xl font-extrabold text-[#172033]">
            Candidate Practice &amp; Examination Audit Log
          </h1>
          <p className="text-xs sm:text-sm text-[#64748B]">
            Immutable longitudinal log of all practice attempts, voice sessions, diagnostic evaluations, and mock examination responses.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <AudioToolbar
            textToRead={`Displaying ${filtered.length} candidate activity records in the learning history audit log.`}
            label="History Summary Audio"
          />
          <button
            type="button"
            onClick={handleExportCSV}
            className="px-3.5 py-2 text-xs font-bold rounded-lg border border-[#D9E1EF] bg-white hover:bg-[#F8F9FB] text-[#172033] flex items-center gap-1.5 focus:ring-2 focus:ring-[#1749E8] shadow-2xs transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-[#1749E8]" aria-hidden="true" />
            <span>Download CSV Audit</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white border border-[#E8EBF0] p-4 rounded-xl shadow-2xs flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#64748B]" aria-hidden="true" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by question text or ID..."
            aria-label="Search learning history"
            className="w-full pl-9 pr-3 py-2 text-xs font-medium rounded-lg border border-[#D9E1EF] bg-[#F8F9FB] text-[#172033] placeholder:text-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#1749E8]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="text-xs font-semibold px-3 py-2 rounded-lg bg-[#F8F9FB] border border-[#D9E1EF] text-[#172033] focus:outline-none focus:ring-2 focus:ring-[#1749E8]"
            aria-label="Filter by activity type"
          >
            <option value="all">All Activity Types</option>
            <option value="Voice Practice">Voice Practice</option>
            <option value="Pilot Demo">Pilot Demo</option>
            <option value="Mock Exam">Mock Exam</option>
            <option value="SM-2 Revision">SM-2 Revision</option>
            <option value="AI Tutor">AI Tutor</option>
          </select>

          <select
            value={filterSubject}
            onChange={(e) => setFilterSubject(e.target.value)}
            className="text-xs font-semibold px-3 py-2 rounded-lg bg-[#F8F9FB] border border-[#D9E1EF] text-[#172033] focus:outline-none focus:ring-2 focus:ring-[#1749E8]"
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

      {/* Audit Log Table */}
      <div className="bg-white border border-[#E8EBF0] rounded-xl shadow-2xs overflow-hidden">
        {historyRecords.length === 0 ? (
          <div className="p-10 text-center text-[#64748B]">
            <History className="w-10 h-10 mx-auto mb-3 opacity-40" aria-hidden="true" />
            <p className="text-sm font-semibold text-[#172033]">No learning history yet.</p>
            <p className="text-xs mt-1">Complete practice sessions or mock exams to see your history.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-[#64748B]">
            <Search className="w-10 h-10 mx-auto mb-3 opacity-40" aria-hidden="true" />
            <p className="text-sm font-semibold text-[#172033]">No records match your filters.</p>
            <p className="text-xs mt-1">Try adjusting the search or filter options.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <caption className="sr-only">Candidate Learning History Audit Log</caption>
              <thead className="bg-[#F8F9FB] text-[#53627A] uppercase text-[11px] font-bold border-b border-[#E8EBF0]">
                <tr>
                  <th scope="col" className="p-3.5">Timestamp / Mode</th>
                  <th scope="col" className="p-3.5">Activity Type</th>
                  <th scope="col" className="p-3.5">Question ID &amp; Subject</th>
                  <th scope="col" className="p-3.5">Candidate Response</th>
                  <th scope="col" className="p-3.5">Reference / Score</th>
                  <th scope="col" className="p-3.5">Result</th>
                  <th scope="col" className="p-3.5">Pace</th>
                  <th scope="col" className="p-3.5 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8EBF0] font-medium">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-[#F8F9FB] transition-colors">
                    <td className="p-3.5 whitespace-nowrap">
                      <div className="font-semibold text-[#172033]">{r.timestamp}</div>
                      <div className="text-[11px] text-[#64748B] flex items-center gap-1 mt-0.5">
                        {r.inputMode === 'Voice' && (
                          <Mic className="w-3 h-3 text-[#1749E8]" aria-hidden="true" />
                        )}
                        <span>{r.inputMode}</span>
                      </div>
                    </td>
                    <td className="p-3.5 whitespace-nowrap">
                      <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#EEF4FF] text-[#1749E8] border border-[#D0DEFF]">
                        {r.type}
                      </span>
                    </td>
                    <td className="p-3.5">
                      <div className="font-mono font-bold text-[#1749E8]">{r.questionId}</div>
                      <div className="text-[11px] text-[#64748B]">{r.subject}</div>
                    </td>
                    <td className="p-3.5 max-w-[200px] truncate text-[#172033]">
                      {r.candidateAnswer}
                    </td>
                    <td className="p-3.5 max-w-[160px] truncate font-semibold text-[#53627A]">
                      {r.correctAnswer}
                    </td>
                    <td className="p-3.5 whitespace-nowrap">
                      {r.isCorrect ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#15803D]">
                          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Completed / Correct</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#DC2626]">
                          <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Incorrect</span>
                        </span>
                      )}
                    </td>
                    <td className="p-3.5 font-mono text-[#53627A]">{r.timeSpentSec}s</td>
                    <td className="p-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedRecord(r)}
                        className="px-3 py-1 text-xs font-bold text-[#1749E8] bg-[#EEF4FF] border border-[#D0DEFF] rounded-lg hover:bg-[#1749E8] hover:text-white focus:ring-2 focus:ring-[#1749E8] transition-colors"
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
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="audit-inspect-title"
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white border border-[#E8EBF0] rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#E8EBF0] pb-3">
              <h2 id="audit-inspect-title" className="text-base font-bold text-[#172033]">
                Attempt Audit: {selectedRecord.questionId}
              </h2>
              <button
                type="button"
                onClick={() => setSelectedRecord(null)}
                className="text-[#64748B] hover:text-[#172033] text-sm font-bold px-2 py-1 rounded-lg hover:bg-[#F8F9FB]"
                aria-label="Close audit dialog"
              >
                ✕ Close
              </button>
            </div>

            <div className="text-xs space-y-1.5 text-[#53627A]">
              <div>
                Subject: <strong className="text-[#172033]">{selectedRecord.subject}</strong>
              </div>
              <div>
                Input Modality: <strong className="text-[#172033]">{selectedRecord.inputMode}</strong>
              </div>
              <div>
                Pace: <strong className="text-[#172033]">{selectedRecord.timeSpentSec} seconds</strong>
              </div>
            </div>

            <div className="p-3.5 bg-[#F8F9FB] rounded-xl border border-[#E8EBF0] text-xs">
              <div className="font-bold text-[#172033] mb-1">Summary / Question Details:</div>
              <p className="text-[#53627A] leading-relaxed">{selectedRecord.questionText}</p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-[#F8F9FB] border border-[#E8EBF0] rounded-xl">
                <div className="font-bold text-[#64748B]">Candidate Response:</div>
                <div className="font-mono font-bold mt-1 text-[#172033]">
                  {selectedRecord.candidateAnswer}
                </div>
              </div>
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                <div className="font-bold text-[#15803D]">Reference / Key:</div>
                <div className="font-mono font-bold mt-1 text-[#172033]">
                  {selectedRecord.correctAnswer}
                </div>
              </div>
            </div>

            <div className="text-right pt-2">
              <button
                type="button"
                onClick={() => setSelectedRecord(null)}
                className="px-4 py-2 bg-[#1749E8] hover:bg-[#123BB8] text-white font-bold text-xs rounded-lg focus:ring-2 focus:ring-[#1749E8]"
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
