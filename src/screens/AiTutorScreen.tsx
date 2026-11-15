import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAccessibility } from '../context/AccessibilityContext';
import { VoiceInputButton } from '../components/VoiceInputButton';
import { AudioToolbar } from '../components/AudioToolbar';
import { Bot, Send, Sparkles, BookOpen, HelpCircle, CheckCircle, Lightbulb, Mic } from 'lucide-react';
import { parseAnswer } from '../utils/answerParser';

interface Message {
  id: string;
  sender: 'user' | 'tutor';
  text: string;
  topic?: string;
  timestamp: string;
}

export const AiTutorScreen: React.FC = () => {
  const {
    speakText,
    stopSpeaking,
    pauseSpeaking,
    resumeSpeaking,
    slowDownSpeech,
    user,
    settings,
    isBlindMode,
    playBeacon,
    startVoiceListening,
    registerVoiceHandler,
    announce
  } = useAccessibility();

  const [selectedTopic, setSelectedTopic] = useState('Numerical and Mathematical Ability');
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      sender: 'tutor',
      text: 'Namaste candidate! I am your ACCESSPREP-X AI Tutor. I can break down any SSC MTS concept into simple, step-by-step explanations, demonstrate math shortcuts, or help with reasoning puzzles. What topic would you like to explore today?',
      topic: 'General Guidance',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);

  const messagesRef = useRef<Message[]>(messages);
  messagesRef.current = messages;

  const loadingRef = useRef<boolean>(loading);
  loadingRef.current = loading;

  const sampleQuestions = [
    'How do I calculate compound interest vs simple interest quickly?',
    'Explain the shortcut for syllogism questions (Some A are B, All B are C).',
    'What are the Fundamental Rights in the Indian Constitution?',
    'What is the rule for "neither... nor" subject-verb agreement?'
  ];

  // Automated Spoken Greeting on mount
  useEffect(() => {
    if (isBlindMode || settings.autoReadAloud) {
      const greeting =
        'Namaste candidate! I am your ACCESSPREP-X AI Tutor. Ask me any question on SSC MTS math, reasoning, English, or general awareness.';
      speakText(greeting, () => {
        playBeacon('listening');
        startVoiceListening();
      });
    }
  }, [isBlindMode, settings.autoReadAloud, speakText, playBeacon, startVoiceListening]);

  const handleSend = useCallback(async (queryText?: string) => {
    const textToSend = (queryText || inputText).trim();
    if (!textToSend || loadingRef.current) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: textToSend,
      topic: selectedTopic,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setLoading(true);

    try {
      const res = await fetch('/api/tutor/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: textToSend,
          message: textToSend,
          subject: selectedTopic,
          topic: selectedTopic,
          userId: user?.id || 'usr_candidate_01'
        })
      });
      const data = await res.json();
      const reply = data.reply || 'Here is the step-by-step explanation based on the SSC MTS syllabus guidelines.';

      const tutorMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'tutor',
        text: reply,
        topic: selectedTopic,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages((prev) => [...prev, tutorMsg]);

      // Speak response back hands-free and re-listen for candidate's next doubt
      playBeacon('success');
      speakText(reply, () => {
        playBeacon('listening');
        startVoiceListening();
      });
    } catch {
      const fallback = `Here is the explanation for "${textToSend}" under ${selectedTopic}:\n\n1. Core Concept: In SSC MTS, questions test foundational rules and calculation speed.\n2. Key Formula/Rule: Break down the problem into known parameters.\n3. Step-by-Step Calculation: Apply standard substitution.\n4. Verification: Check constraints and verify with answer options.`;
      const fallbackMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'tutor',
        text: fallback,
        topic: selectedTopic,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages((prev) => [...prev, fallbackMsg]);

      speakText(fallback, () => {
        playBeacon('listening');
        startVoiceListening();
      });
    } finally {
      setLoading(false);
    }
  }, [inputText, selectedTopic, user?.id, speakText, playBeacon, startVoiceListening]);

  // Register screen voice listener for candidate doubts & audio playback controls
  useEffect(() => {
    const unregister = registerVoiceHandler((transcript: string) => {
      const clean = transcript.toLowerCase().trim();
      const parsedCmd = parseAnswer(clean);

      // Repeat latest explanation
      if (
        parsedCmd === 'repeat' ||
        clean === 'repeat' ||
        clean.includes('repeat question') ||
        clean.includes('repeat explanation') ||
        clean.includes('repeat that') ||
        clean.includes('read again')
      ) {
        const lastTutorMsg = [...messagesRef.current].reverse().find((m) => m.sender === 'tutor');
        if (lastTutorMsg) {
          speakText(lastTutorMsg.text);
          return true;
        }
      }

      if (parsedCmd === 'read_slower' || clean.includes('read slower') || clean.includes('slower')) {
        slowDownSpeech();
        return true;
      }

      if (parsedCmd === 'pause_reading' || clean.includes('pause reading') || clean.includes('pause audio')) {
        pauseSpeaking();
        return true;
      }

      if (parsedCmd === 'resume_reading' || clean.includes('resume reading') || clean.includes('resume audio')) {
        resumeSpeaking();
        return true;
      }

      if (parsedCmd === 'stop_speaking' || clean.includes('stop reading') || clean.includes('stop speaking') || clean === 'be quiet') {
        stopSpeaking();
        return true;
      }

      // If candidate asked a genuine question or spoke text
      if (clean.length > 2) {
        handleSend(transcript);
        return true;
      }
      return false;
    });

    return () => unregister();
  }, [
    registerVoiceHandler,
    handleSend,
    speakText,
    slowDownSpeech,
    pauseSpeaking,
    resumeSpeaking,
    stopSpeaking
  ]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* Screen Title */}
      <div className="bg-white border border-[#E8EBF0] rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-2xs">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#1749E8] bg-[#EEF4FF] px-3 py-1 rounded-full border border-[#D0DEFF]">
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Screen 9 of 17 · Accessible AI Tutor</span>
            </div>
            {isBlindMode && (
              <span className="text-xs px-2.5 py-0.5 bg-amber-50 text-[#B45309] border border-amber-200 font-bold rounded-full flex items-center gap-1">
                <Mic className="w-3 h-3 text-[#DC2626] animate-pulse" aria-hidden="true" />
                Hands-Free Voice Dialogue Active
              </span>
            )}
          </div>
          <h1 className="text-2xl font-extrabold text-[#172033]">
            SSC MTS AI Scribe &amp; Subject Tutor
          </h1>
          <p className="text-xs sm:text-sm text-[#64748B]">
            Structured step-by-step conceptual explanations aligned with the official Staff Selection Commission syllabus.
          </p>
        </div>

        {/* Global Read Aloud */}
        <AudioToolbar
          textToRead={messages[messages.length - 1]?.text || 'No message'}
          label="Tutor Response Audio"
        />
      </div>

      {/* Main Grid: Subject Select & Chat Log */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Sidebar: Topic context & suggested prompts */}
        <aside className="lg:col-span-1 space-y-4" aria-label="Tutor Subject Selector">
          <div className="bg-white border border-[#E8EBF0] rounded-xl p-4 shadow-2xs">
            <label htmlFor="topic-select" className="block text-[11px] font-bold uppercase tracking-wider text-[#64748B] mb-2">
              Current Syllabus Subject
            </label>
            <select
              id="topic-select"
              value={selectedTopic}
              onChange={(e) => setSelectedTopic(e.target.value)}
              className="w-full text-xs sm:text-sm font-semibold p-2.5 rounded-lg bg-[#F8F9FB] border border-[#D9E1EF] focus:outline-none focus:ring-2 focus:ring-[#1749E8] text-[#172033]"
            >
              <option value="Numerical and Mathematical Ability">Numerical &amp; Math Ability (Session I)</option>
              <option value="Reasoning Ability and Problem Solving">Reasoning &amp; Problem Solving (Session I)</option>
              <option value="General Awareness">General Awareness (Session II)</option>
              <option value="English Language and Comprehension">English Language &amp; Comprehension (Session II)</option>
            </select>
          </div>

          <div className="bg-white border border-[#E8EBF0] rounded-xl p-4 shadow-2xs">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-[#1749E8] flex items-center gap-1.5 mb-3">
              <Lightbulb className="w-4 h-4 text-[#1749E8]" aria-hidden="true" />
              <span>Frequently Asked MTS Queries</span>
            </h2>
            <div className="space-y-2">
              {sampleQuestions.map((q, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSend(q)}
                  disabled={loading}
                  className="w-full text-left text-xs font-medium p-2.5 rounded-lg bg-[#F8F9FB] text-[#172033] border border-[#E8EBF0] hover:border-[#1749E8] hover:bg-[#EEF4FF] hover:text-[#1749E8] transition-colors focus:ring-2 focus:ring-[#1749E8]"
                >
                  "{q}"
                </button>
              ))}
            </div>
          </div>

          <div className="p-4 bg-[#EEF4FF]/60 border border-[#D0DEFF] rounded-xl text-xs space-y-1.5">
            <div className="font-bold text-[#172033] flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-[#15803D]" aria-hidden="true" />
              <span>Voice-First Supported</span>
            </div>
            <p className="text-[#53627A] leading-relaxed">
              Speak your doubt hands-free. The AI tutor listens automatically, explains concepts, and speaks answers aloud.
            </p>
          </div>
        </aside>

        {/* Chat Window */}
        <section className="lg:col-span-3 flex flex-col bg-white border border-[#E8EBF0] rounded-xl shadow-2xs min-h-[550px] overflow-hidden" aria-label="Conversation Log">
          {/* Chat Messages */}
          <div className="flex-1 p-4 md:p-6 space-y-4 overflow-y-auto max-h-[500px]" role="log" aria-live="polite">
            {messages.map((msg, idx) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div className="flex items-center gap-2 mb-1 text-xs text-[#64748B]">
                  <span className="font-bold text-[#172033]">
                    {msg.sender === 'user' ? 'Candidate' : 'AI Tutor'}
                  </span>
                  <span>•</span>
                  <span>{msg.timestamp}</span>
                  {msg.topic && (
                    <span className="px-2 py-0.5 bg-[#EEF4FF] text-[#1749E8] text-[10px] rounded-full font-semibold border border-[#D0DEFF]">
                      {msg.topic}
                    </span>
                  )}
                </div>

                <div
                  className={`max-w-[85%] rounded-xl p-4 text-sm font-medium leading-relaxed whitespace-pre-wrap ${
                    msg.sender === 'user'
                      ? 'bg-[#1749E8] text-white'
                      : 'bg-[#F8F9FB] text-[#172033] border border-[#E8EBF0]'
                  }`}
                >
                  {msg.text}
                </div>

                {msg.sender === 'tutor' && (
                  <button
                    type="button"
                    onClick={() => speakText(msg.text)}
                    data-action={
                      !messages.slice(idx + 1).some((m) => m.sender === 'tutor')
                        ? 'repeat-question'
                        : undefined
                    }
                    aria-label={`Listen to tutor response: ${msg.text.slice(0, 40)}`}
                    className="mt-1.5 text-xs font-bold text-[#1749E8] hover:underline inline-flex items-center gap-1 focus:ring-2 focus:ring-[#1749E8] rounded px-1"
                  >
                    <span aria-hidden="true">🔊</span>
                    <span>Listen to explanation</span>
                  </button>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-3 text-[#53627A] p-3.5 bg-[#F8F9FB] rounded-xl border border-[#E8EBF0] animate-pulse">
                <Bot className="w-5 h-5 text-[#1749E8] animate-spin" aria-hidden="true" />
                <span className="text-sm font-semibold">Tutor is analyzing syllabus concepts &amp; drafting explanation...</span>
              </div>
            )}
          </div>

          {/* Input Box with Voice Input */}
          <div className="p-4 border-t border-[#E8EBF0] bg-[#F8F9FB]">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="space-y-3"
            >
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Ask any question, formula, or concept doubt..."
                    disabled={loading}
                    className="w-full p-3 text-sm rounded-lg bg-white border border-[#D9E1EF] text-[#172033] placeholder:text-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#1749E8]"
                    aria-label="Ask AI Tutor"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <VoiceInputButton
                    onTranscriptConfirmed={(transcript) => {
                      setInputText(transcript);
                    }}
                    label="Voice Input"
                  />

                  <button
                    type="submit"
                    disabled={loading || !inputText.trim()}
                    className="px-5 py-3 rounded-lg font-bold text-sm bg-[#1749E8] hover:bg-[#123BB8] text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-[#1749E8] transition-colors shadow-xs"
                  >
                    <Send className="w-4 h-4" aria-hidden="true" />
                    <span>Send</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-[#64748B]">
                <span>Tip: Press Enter to submit. Use microphone for voice questions.</span>
                <span className="font-mono font-bold text-[#1749E8]">Alt+T Focus Chat</span>
              </div>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
};
