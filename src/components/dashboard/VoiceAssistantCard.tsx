import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Mic, MicOff, Square, Volume2 } from 'lucide-react';
import { useAccessibility } from '../../context/AccessibilityContext.tsx';

interface VoiceAssistantCardProps {
  onNavigate: (screen: string) => void;
}

type VoiceStatus = 'idle' | 'requesting' | 'listening' | 'processing' | 'error';

export function VoiceAssistantCard({ onNavigate }: VoiceAssistantCardProps) {
  const { startVoiceListening, stopVoiceListening, isVoiceListening, speakText, announce } = useAccessibility();
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>('idle');
  const [transcript, setTranscript] = useState('');
  const [permError, setPermError] = useState('');
  const recognitionRef = useRef<any>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch {}
      }
    };
  }, []);

  const handleStartListening = useCallback(async () => {
    setPermError('');
    setTranscript('');
    setVoiceStatus('requesting');

    try {
      // Check microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop()); // release immediately, we'll use SpeechRecognition

      const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRec) {
        setVoiceStatus('error');
        setPermError('Voice recognition is not supported in your browser. Please use Chrome or Edge.');
        return;
      }

      const rec = new SpeechRec();
      rec.continuous = false;
      rec.interimResults = true;
      rec.lang = 'en-IN';
      rec.maxAlternatives = 3;

      rec.onstart = () => {
        setVoiceStatus('listening');
        announce('Listening. Please speak your command.', 'polite');
      };

      rec.onresult = (event: any) => {
        const last = event.results[event.results.length - 1];
        const text = last[0].transcript;
        setTranscript(text);
        if (last.isFinal) {
          setVoiceStatus('processing');
          processCommand(text.toLowerCase().trim());
        }
      };

      rec.onerror = (e: any) => {
        if (e.error === 'not-allowed') {
          setPermError('Microphone access was denied. Please allow microphone access in your browser settings.');
        } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
          setPermError(`Voice recognition error: ${e.error}.`);
        }
        setVoiceStatus('error');
      };

      rec.onend = () => {
        if (voiceStatus === 'listening') setVoiceStatus('idle');
      };

      recognitionRef.current = rec;
      rec.start();
    } catch (err: any) {
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        setPermError('Microphone access was denied. Please allow microphone permission in your browser settings to use voice commands.');
      } else {
        setPermError('Could not access microphone. Please check your device settings.');
      }
      setVoiceStatus('error');
    }
  }, [announce]);

  const handleStopListening = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
    }
    setVoiceStatus('idle');
    setTranscript('');
    announce('Voice assistant stopped.', 'polite');
  }, [announce]);

  const processCommand = useCallback((text: string) => {
    let responded = false;

    const navigateWithSpeech = (screen: string, message: string) => {
      responded = true;
      speakText(message, () => onNavigate(screen));
      setVoiceStatus('idle');
    };

    if (text.includes('start practice') || text.includes('voice practice') || text === 'practice') {
      navigateWithSpeech('voice_practice', 'Opening Voice Practice Session.');
    } else if (text.includes('mock exam') || text.includes('mock test') || text.includes('start test') || text.includes('start exam')) {
      navigateWithSpeech('mock_exam', 'Opening Mock Examination.');
    } else if (text.includes('ai tutor') || text.includes('tutor') || text.includes('ask tutor')) {
      navigateWithSpeech('ai_tutor', 'Connecting to AI Tutor.');
    } else if (text.includes('revision') || text.includes('revision planner')) {
      navigateWithSpeech('revision_planner', 'Opening Revision Planner.');
    } else if (text.includes('my progress') || text.includes('progress') || text.includes('scorecard')) {
      navigateWithSpeech('progress', 'Opening Progress Dashboard.');
    } else if (text.includes('topic mastery') || text.includes('mastery')) {
      navigateWithSpeech('topic_mastery', 'Opening Topic Mastery.');
    } else if (text.includes('learning history') || text.includes('history')) {
      navigateWithSpeech('learning_history', 'Opening Learning History.');
    } else if (text.includes('read dashboard') || text.includes('read aloud') || text.includes('summarise') || text.includes('summarize')) {
      // This will be handled by parent
      responded = true;
      setVoiceStatus('idle');
      const dashBtn = document.querySelector('[data-action="read-dashboard"]') as HTMLButtonElement;
      dashBtn?.click();
    } else if (!responded) {
      speakText(`I didn't recognise that command. You can say: Start Practice, Mock Exam, AI Tutor, Revision Planner, My Progress, or Read Dashboard.`);
      setVoiceStatus('idle');
    }
  }, [speakText, onNavigate]);

  const isActive = voiceStatus === 'listening' || voiceStatus === 'requesting';

  return (
    <section
      aria-labelledby="voice-assistant-heading"
      className="bg-white border border-[#E8EBF0] rounded-xl p-5"
    >
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        {/* Text */}
        <div className="flex-1 min-w-0">
          <h2 id="voice-assistant-heading" className="text-sm font-semibold text-[#172033] mb-0.5">
            What would you like to do today?
          </h2>
          <p className="text-xs text-[#64748B]">
            Your accessible learning companion is ready.
          </p>

          {/* Transcript */}
          {transcript && (
            <div
              className="mt-2 px-3 py-2 bg-[#F8F9FB] border border-[#E8EBF0] rounded-lg text-xs text-[#172033] font-medium"
              aria-live="polite"
              aria-label="Recognised speech"
            >
              <span className="text-[#64748B] mr-1">Heard:</span>
              {transcript}
            </div>
          )}

          {/* Error */}
          {permError && voiceStatus === 'error' && (
            <div
              className="mt-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700"
              role="alert"
              aria-live="assertive"
            >
              {permError}
            </div>
          )}

          {/* Status */}
          {voiceStatus === 'listening' && (
            <div className="mt-2 flex items-center gap-2" aria-live="polite">
              <span className="inline-flex gap-0.5" aria-hidden="true">
                {[0, 1, 2].map(i => (
                  <span
                    key={i}
                    className="w-1 h-3 bg-[#1749E8] rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </span>
              <span className="text-xs font-medium text-[#1749E8]">Listening…</span>
            </div>
          )}
          {voiceStatus === 'processing' && (
            <p className="mt-2 text-xs text-[#64748B]" aria-live="polite">Processing command…</p>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {isActive ? (
            <button
              type="button"
              onClick={handleStopListening}
              aria-label="Stop listening"
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            >
              <Square className="w-3.5 h-3.5 fill-red-600 text-red-600" aria-hidden="true" />
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStartListening}
              aria-label="Start voice command — press to speak"
              aria-pressed={isActive}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-[#1749E8] text-white hover:bg-[#123BB8] transition-colors focus:outline-none focus:ring-2 focus:ring-[#1749E8] focus:ring-offset-2"
            >
              <Mic className="w-3.5 h-3.5" aria-hidden="true" />
              Speak a command
            </button>
          )}
        </div>
      </div>

      {/* Voice command hints — keyboard accessible list */}
      <div className="mt-4 pt-4 border-t border-[#E8EBF0]">
        <p className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wide mb-2">
          Voice commands
        </p>
        <ul className="flex flex-wrap gap-2" aria-label="Available voice commands">
          {[
            'Start Practice',
            'Mock Exam',
            'AI Tutor',
            'Revision Planner',
            'My Progress',
            'Read Dashboard',
          ].map(cmd => (
            <li key={cmd}>
              <span className="inline-block px-2.5 py-1 text-[11px] font-medium text-[#172033] bg-[#F8F9FB] border border-[#E8EBF0] rounded-md">
                &ldquo;{cmd}&rdquo;
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

