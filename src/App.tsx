/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, MicOff, MessageSquare, FileText, Rocket, 
  Search, Copy, Check, AlertCircle, Phone, 
  User, Shield, BarChart3, Settings, Info, ThumbsUp, ThumbsDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { geminiService } from './services/gemini';
import ReactMarkdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { db } from './firebase';
import { collection, addDoc, query, orderBy, onSnapshot, where, updateDoc, doc } from 'firebase/firestore';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
interface Message {
  id: string;
  role: 'doctor' | 'assistant';
  text: string;
  timestamp: Date;
  feedback?: 'up' | 'down';
}

// --- Components ---

const TabButton = ({ active, icon: Icon, label, onClick }: { active: boolean, icon: any, label: string, onClick: () => void }) => (
  <button
    onClick={onClick}
    className={cn(
      "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all border-b-2",
      active 
        ? "text-emerald-400 border-emerald-400 bg-emerald-400/5" 
        : "text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-800/50"
    )}
  >
    <Icon size={18} />
    {label}
  </button>
);

export default function App() {
  const [userId, setUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'live' | 'que' | 'pitch' | 'docs'>('live');
  const [isListening, setIsListening] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [transcript, setTranscript] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [queDoctorInput, setQueDoctorInput] = useState('');
  const [queAssistantInput, setQueAssistantInput] = useState('');
  const [isQueDoctorFocused, setIsQueDoctorFocused] = useState(false);
  const [docContent, setDocContent] = useState('');
  const [docAnalysis, setDocAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [callSummary, setCallSummary] = useState<string | null>(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [lastHeard, setLastHeard] = useState<string | null>(null);
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);

  const recognitionRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const queScrollRef = useRef<HTMLDivElement>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const quickFireOptions = [
    { label: "Pricing?", icon: "💰", id: "pricing" },
    { label: "Have Biller", icon: "👤", id: "have-biller" },
    { label: "Collection %", icon: "📊", id: "collection" },
    { label: "Not Interested", icon: "🚫", id: "not-interested" },
    { label: "Why You?", icon: "⭐", id: "why-you" },
    { label: "Contract?", icon: "📋", id: "contract" },
    { label: "Free Audit", icon: "🔍", id: "free-audit" },
    { label: "Specialties?", icon: "🏥", id: "specialties" },
    { label: "Denials?", icon: "❌", id: "denials" },
    { label: "AR Recovery", icon: "🕒", id: "ar-recovery" },
    { label: "Prior Auth", icon: "📋", id: "prior-auth" },
    { label: "EHR Support", icon: "💻", id: "ehr-support" },
    { label: "Telehealth", icon: "📱", id: "telehealth" },
    { label: "HIPAA?", icon: "🔒", id: "hipaa" },
    { label: "Credentialing", icon: "💳", id: "credentialing" },
    { label: "Reporting", icon: "📈", id: "reporting" },
    { label: "Results?", icon: "⏱️", id: "results" },
    { label: "Transition?", icon: "🔄", id: "transition" },
    { label: "Location & Pricing?", icon: "📍", id: "location" },
  ];

  // Initialize User ID
  useEffect(() => {
    // Test Firestore Connection
    const testConnection = async () => {
      try {
        const { getDocFromServer, doc } = await import('firebase/firestore');
        await getDocFromServer(doc(db, '_connection_test_', 'test'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('offline')) {
          console.error("Firestore is offline. Please check your configuration or internet connection.");
        }
      }
    };
    testConnection();

    let storedUserId = localStorage.getItem('userId');
    if (!storedUserId) {
      storedUserId = crypto.randomUUID();
      localStorage.setItem('userId', storedUserId);
    }
    setUserId(storedUserId);
  }, []);

  useEffect(() => {
    if (!userId) {
      setMessages([]);
      return;
    }

    const q = query(
      collection(db, `users/${userId}/messages`),
      orderBy('timestamp', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs: Message[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp.toDate(),
      } as Message));
      setMessages(msgs);
    });

    return () => unsubscribe();
  }, [userId]);

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;

      recognitionRef.current.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
        
        // If we have a final transcript, process it and clear any pending silence timer
        if (finalTranscript.trim()) {
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
            setLastHeard(finalTranscript);
            setManualInput(finalTranscript);
            handleNewDoctorInput(finalTranscript, 'voice');
            return; // Processed final, no need to wait for silence
        }

        // If we only have interim results, set/reset the silence timer
        if (interimTranscript.trim()) {
            setTranscript(interimTranscript);
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = setTimeout(() => {
                handleNewDoctorInput(interimTranscript, 'voice');
                setTranscript('');
            }, 2000);
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        setIsListening(false);
      };
    }
    return () => {
      if (recognitionRef.current) recognitionRef.current.stop();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, []);

  // Auto-scroll messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    if (queScrollRef.current) {
      queScrollRef.current.scrollTop = queScrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      setTranscript('');
      recognitionRef.current?.start();
    }
    setIsListening(!isListening);
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } else {
      setRecordingTime(0);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const toggleRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        const chunks: Blob[] = [];
        mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
        mediaRecorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'audio/webm' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `call-recording-${new Date().toISOString()}.webm`;
          a.click();
          URL.revokeObjectURL(url);
          setAudioChunks([]);
          stream.getTracks().forEach(track => track.stop());
        };
        mediaRecorder.start();
        setIsRecording(true);
      } catch (error) {
        console.error('Recording error', error);
      }
    }
  };

  const handleNewDoctorInput = async (text: string, source: 'voice' | 'chip' | 'manual' = 'voice') => {
    if (!text.trim() || !userId) return;

    setManualInput(text);

    if (source === 'chip') {
      setLastHeard(`[chip] ${text}`);
    } else if (source === 'manual') {
      setLastHeard(`[manual] ${text}`);
    }

    const newMessage = {
      role: 'doctor',
      text,
      timestamp: new Date(),
      uid: userId,
    };

    addDoc(collection(db, `users/${userId}/messages`), newMessage);
    setIsLoading(true);

    let assistantText = "";
    const assistantMessageRef = await addDoc(collection(db, `users/${userId}/messages`), {
      role: 'assistant',
      text: '',
      timestamp: new Date(),
      uid: userId,
    });

    let lastUpdate = 0;
    try {
      await geminiService.getLiveResponse(text, (chunk) => {
        assistantText += chunk;
        const now = Date.now();
        if (now - lastUpdate > 100) {
          setMessages(prev => {
            const exists = prev.some(msg => msg.id === assistantMessageRef.id);
            if (!exists) {
              // If onSnapshot hasn't added it yet, we add it temporarily
              return [...prev, {
                id: assistantMessageRef.id,
                role: 'assistant',
                text: assistantText,
                timestamp: new Date(),
                uid: userId,
              }];
            }
            return prev.map(msg => msg.id === assistantMessageRef.id ? { ...msg, text: assistantText } : msg);
          });
          lastUpdate = now;
        }
      });
      setMessages(prev => prev.map(msg => msg.id === assistantMessageRef.id ? { ...msg, text: assistantText } : msg));
      await updateDoc(assistantMessageRef, { text: assistantText });
    } catch (error) {
      console.error('AI Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualAssistantResponse = async (text: string) => {
    if (!text.trim() || !userId) return;
    const newMessage = {
      role: 'assistant',
      text,
      timestamp: new Date(),
      uid: userId,
    };
    await addDoc(collection(db, `users/${userId}/messages`), newMessage);
  };

  const handleGenerateQuestion = async (topic: string) => {
    if (!topic.trim() || !userId) return;
    setIsLoading(true);
    try {
      const question = await geminiService.generateQuestion(topic);
      await handleManualAssistantResponse(`**Better Question:**\n${question}`);
    } catch (error) {
      console.error('Question Generation Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateAnswer = async (topic: string) => {
    if (!topic.trim() || !userId) return;
    setIsLoading(true);
    try {
      const answer = await geminiService.generateAnswer(topic);
      await handleManualAssistantResponse(`**Best Lines:**\n${answer}`);
    } catch (error) {
      console.error('Answer Generation Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnalyzeDocument = async () => {
    if (!docContent.trim()) return;
    setIsAnalyzing(true);
    setDocAnalysis(null);
    try {
      const result = await geminiService.analyzeDocument(docContent, 'text');
      setDocAnalysis(result || 'No insights found.');
    } catch (error) {
      console.error('Analysis Error:', error);
      setDocAnalysis('Failed to analyze document. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGenerateSummary = async () => {
    if (messages.length === 0) return;
    setIsGeneratingSummary(true);
    setCallSummary(null);
    try {
      const transcript = messages.map(m => `${m.role}: ${m.text}`).join('\n');
      const summary = await geminiService.generateSummary(transcript);
      setCallSummary(summary || 'No summary generated.');
    } catch (error) {
      console.error('Summary Error:', error);
      setCallSummary('Failed to generate summary. Please try again.');
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const updateFeedback = async (id: string, feedback: 'up' | 'down') => {
    if (!userId) return;
    const docRef = doc(db, `users/${userId}/messages`, id);
    await updateDoc(docRef, { feedback });
    setMessages(prev => prev.map(msg => msg.id === id ? { ...msg, feedback } : msg));
  };

  const lastAssistantMessage = [...messages].reverse().find(m => m.role === 'assistant');

  return (
    <div className="flex flex-col h-screen bg-[#060e1b] text-slate-200 font-sans selection:bg-cyan-500/30 overflow-hidden">
      {/* Header */}
      {isHeaderVisible && (
        <header className="px-4 py-3 border-b border-slate-800 bg-[#0a192f]/50 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-cyan-400 font-bold text-lg flex items-center gap-1">
                  <span className="text-sm">⚡</span> BD EXPERTO
                </span>
                <button 
                  onClick={() => setIsHeaderVisible(false)}
                  className="text-[10px] bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded text-slate-400 transition-colors"
                >
                  Hide
                </button>
              </div>
              <p className="text-[10px] text-slate-500 mt-0.5">
                "Hi, I'm calling from MD Claimo. We're a revenue cycle management firm, and I'd like to schedule a 15-minute meeting with the doctor."
              </p>
            </div>
            <div className="flex items-center gap-2">
            </div>
          </div>
        </header>
      )}

      {/* Status Bar */}
      <div className="px-4 py-2 bg-[#0d1a2d] border-b border-slate-800 flex items-center gap-2">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
          <span className="text-xs">🎙️</span> HEARD:
        </span>
        {lastHeard && (
          <span className="text-[10px] text-cyan-400 font-medium italic">
            {lastHeard}
          </span>
        )}
      </div>

      {/* Tabs */}
      <nav className="flex border-b border-slate-800 bg-[#0a192f]">
        <button 
          onClick={() => setActiveTab('live')}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-3 text-[10px] font-bold uppercase tracking-widest transition-all border-b-2",
            activeTab === 'live' ? "text-cyan-400 border-cyan-400 bg-cyan-400/5" : "text-slate-500 border-transparent"
          )}
        >
          <Mic size={14} /> LIVE
        </button>
        <button 
          onClick={() => setActiveTab('docs')}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-3 text-[10px] font-bold uppercase tracking-widest transition-all border-b-2",
            activeTab === 'docs' ? "text-cyan-400 border-cyan-400 bg-cyan-400/5" : "text-slate-500 border-transparent"
          )}
        >
          <FileText size={14} /> DOCS
        </button>
      </nav>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden flex flex-col md:flex-row">
        {/* Left Column: Input & Response */}
        <div className="flex-1 flex flex-col p-4 overflow-y-auto custom-scrollbar">
          <AnimatePresence mode="wait">
            {activeTab === 'live' && (
              <motion.div 
                key="live"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-4 flex flex-col h-full"
              >
                {/* Quick Fire Chips */}
                <div className="bg-[#112240] border border-slate-800 rounded-xl p-4 shadow-lg">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-orange-400">⚡</span>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Quick Fire:</span>
                  </div>
                  <div className="flex flex-wrap gap-2 overflow-y-auto max-h-40 custom-scrollbar">
                    {quickFireOptions.map((opt) => (
                      <button 
                        key={opt.id}
                        onClick={() => handleNewDoctorInput(opt.label, 'chip')}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all border border-slate-700 hover:border-cyan-500/50 flex items-center gap-1.5"
                      >
                        {opt.icon} {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Manual Input Boxes */}
                <div className="space-y-4">
                  {/* Q Input */}
                  <div className={cn(
                    "bg-[#112240] border border-slate-800 rounded-xl p-4 shadow-lg transition-all duration-500",
                    isQueDoctorFocused || isListening ? "ring-1 ring-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.2)]" : ""
                  )}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <MessageSquare size={14} className="text-slate-500" />
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Type anything you heard:</span>
                        {isListening && (
                          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <input 
                        type="text"
                        value={manualInput}
                        onChange={(e) => setManualInput(e.target.value)}
                        onFocus={() => setIsQueDoctorFocused(true)}
                        onBlur={() => setIsQueDoctorFocused(false)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && manualInput.trim()) {
                            handleNewDoctorInput(manualInput, 'manual');
                            setManualInput('');
                          }
                        }}
                        placeholder={isListening ? "Listening to doctor..." : "e.g. we already have a biller..."}
                        className="flex-1 bg-[#0a192f] border border-slate-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-cyan-500/50 transition-colors"
                      />
                      <button 
                        onClick={toggleListening}
                        className={cn(
                          "p-2 rounded-lg transition-all duration-300 border",
                          isListening 
                            ? "bg-red-600 border-red-500 text-white animate-pulse shadow-[0_0_15px_rgba(220,38,38,0.5)]" 
                            : "bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700"
                        )}
                      >
                        {isListening ? <MicOff size={16} /> : <Mic size={16} />}
                      </button>
                      <button 
                        onClick={() => {
                          if (manualInput.trim()) {
                            handleNewDoctorInput(manualInput, 'manual');
                            setManualInput('');
                          }
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-bold transition-colors uppercase tracking-wider"
                      >
                        Go
                      </button>
                    </div>
                  </div>

                  {/* A Input */}
                  {/* Removed */}

                </div>

                {/* Response Card */}
                <div className="bg-[#112240] border border-slate-800 rounded-xl p-5 shadow-lg relative min-h-[160px]">
                  {isLoading ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-[#112240]/50 backdrop-blur-sm rounded-xl z-10">
                      <div className="flex gap-1">
                        <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                        <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                        <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" />
                      </div>
                    </div>
                  ) : lastAssistantMessage ? (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between border-b border-slate-700 pb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">💡</span>
                          <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-widest">Recommended Pitch:</span>
                        </div>
                        <button 
                          onClick={() => copyToClipboard(lastAssistantMessage.text, lastAssistantMessage.id)}
                          className="text-[10px] bg-slate-800 hover:bg-slate-700 px-3 py-1 rounded-full text-slate-400 transition-all flex items-center gap-1.5"
                        >
                          {copiedId === lastAssistantMessage.id ? <Check size={12} /> : <Copy size={12} />}
                          Copy
                        </button>
                        <button 
                          onClick={() => handleGenerateQuestion(lastAssistantMessage.text)}
                          className="text-[10px] bg-cyan-900/30 hover:bg-cyan-900/50 px-3 py-1 rounded-full text-cyan-400 transition-all flex items-center gap-1.5"
                        >
                          <Rocket size={12} />
                          Generate Follow-up
                        </button>
                      </div>
                      
                      <div className="text-sm leading-relaxed text-slate-100 font-medium bg-slate-800/30 p-4 rounded-lg border border-slate-700/50">
                        <ReactMarkdown>{lastAssistantMessage.text}</ReactMarkdown>
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center opacity-30 py-6">
                      <Mic size={32} className="mb-2" />
                      <p className="text-[10px] uppercase tracking-widest font-bold">Waiting for doctor input...</p>
                    </div>
                  )}
                </div>

                {/* Conversation Log (Merged from QUE) */}
                <div className="bg-[#112240] border border-slate-800 rounded-xl p-4 flex flex-col flex-1 min-h-0">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                      Conversation History
                    </h3>
                    <div className="flex items-center gap-2">
                      <input 
                        type="text"
                        value={queAssistantInput}
                        onChange={(e) => setQueAssistantInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && queAssistantInput.trim()) {
                            handleManualAssistantResponse(queAssistantInput);
                            setQueAssistantInput('');
                          }
                        }}
                        placeholder="Log your response..."
                        className="bg-[#0a192f] border border-slate-700 rounded-lg px-3 py-1 text-[10px] focus:outline-none focus:border-emerald-500/50 transition-colors w-48"
                      />
                      <button 
                        onClick={() => {
                          if (queAssistantInput.trim()) {
                            handleManualAssistantResponse(queAssistantInput);
                            setQueAssistantInput('');
                          }
                        }}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded text-[9px] font-bold transition-colors uppercase tracking-wider"
                      >
                        Log
                      </button>
                    </div>
                  </div>
                  
                  <div 
                    ref={queScrollRef}
                    className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-4"
                  >
                    {messages.length > 0 ? (
                      messages.map((msg) => (
                        <motion.div 
                          key={msg.id} 
                          initial={{ opacity: 0, y: 10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          className={cn(
                            "p-4 rounded-xl text-sm border transition-all shadow-sm",
                            msg.role === 'doctor' 
                              ? "bg-slate-800/40 border-slate-700 ml-0 mr-12" 
                              : "bg-cyan-900/10 border-cyan-500/20 ml-12 mr-0"
                          )}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                "text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full",
                                msg.role === 'doctor' ? "bg-slate-700 text-slate-300" : "bg-cyan-800 text-cyan-200"
                              )}>
                                {msg.role === 'doctor' ? 'Doctor' : 'Assistant'}
                              </span>
                              <span className="text-[10px] text-slate-500">
                                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            {msg.role === 'assistant' && (
                              <div className="flex items-center gap-2">
                                <button 
                                  onClick={() => updateFeedback(msg.id, 'up')}
                                  className={cn(
                                    "p-1 rounded transition-colors",
                                    msg.feedback === 'up' ? "text-emerald-400" : "text-slate-500 hover:text-slate-300"
                                  )}
                                >
                                  <ThumbsUp size={12} />
                                </button>
                                <button 
                                  onClick={() => updateFeedback(msg.id, 'down')}
                                  className={cn(
                                    "p-1 rounded transition-colors",
                                    msg.feedback === 'down' ? "text-red-400" : "text-slate-500 hover:text-slate-300"
                                  )}
                                >
                                  <ThumbsDown size={12} />
                                </button>
                                <button 
                                  onClick={() => copyToClipboard(msg.text, msg.id)}
                                  className="text-[10px] bg-slate-800 hover:bg-slate-700 px-3 py-1 rounded-full text-slate-400 transition-all flex items-center gap-1.5"
                                >
                                  {copiedId === msg.id ? <Check size={10} /> : <Copy size={10} />}
                                  Copy
                                </button>
                              </div>
                            )}
                          </div>
                          <div className={cn(
                            "leading-relaxed prose prose-invert prose-sm max-w-none",
                            msg.role === 'doctor' ? "text-slate-300 italic" : "text-slate-100"
                          )}>
                            {msg.role === 'assistant' ? (
                              <ReactMarkdown>{msg.text}</ReactMarkdown>
                            ) : (
                              msg.text
                            )}
                          </div>
                        </motion.div>
                      ))
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center opacity-20">
                        <MessageSquare size={24} className="mb-2" />
                        <p className="text-[9px] uppercase tracking-widest font-bold">No history yet</p>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'docs' && (
              <motion.div 
                key="docs"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-6"
              >
                <div className="bg-[#112240] border border-slate-800 rounded-xl p-5 shadow-lg">
                  <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                    <FileText size={16} className="text-cyan-400" />
                    Document Analysis
                  </h3>
                  <p className="text-xs text-slate-400 mb-4">
                    Paste a practice's billing report or notes to identify revenue leaks and opportunities.
                  </p>
                  <textarea 
                    value={docContent}
                    onChange={(e) => setDocContent(e.target.value)}
                    placeholder="Paste document content here..."
                    className="w-full h-40 bg-[#0a192f] border border-slate-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-cyan-500/50 transition-colors custom-scrollbar mb-4"
                  />
                  <button 
                    onClick={handleAnalyzeDocument}
                    disabled={isAnalyzing || !docContent.trim()}
                    className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2"
                  >
                    {isAnalyzing ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Search size={16} />
                        Analyze Document
                      </>
                    )}
                  </button>
                </div>

                {docAnalysis && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-[#112240] border border-slate-800 rounded-xl p-5 shadow-lg"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-widest flex items-center gap-2">
                        <Info size={14} />
                        Analysis Insights
                      </h3>
                      <button 
                        onClick={() => copyToClipboard(docAnalysis, 'doc-analysis')}
                        className="text-[10px] bg-slate-800 hover:bg-slate-700 px-3 py-1 rounded text-slate-400 transition-colors flex items-center gap-1"
                      >
                        {copiedId === 'doc-analysis' ? <Check size={10} /> : <Copy size={10} />}
                        Copy Results
                      </button>
                    </div>
                    <div className="prose prose-invert prose-sm max-w-none">
                      <ReactMarkdown>{docAnalysis}</ReactMarkdown>
                    </div>
                  </motion.div>
                )}

                {callSummary && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-[#112240] border border-slate-800 rounded-xl p-5 shadow-lg mt-4"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-widest flex items-center gap-2">
                        <Info size={14} />
                        Call Summary
                      </h3>
                      <button 
                        onClick={() => copyToClipboard(callSummary, 'call-summary')}
                        className="text-[10px] bg-slate-800 hover:bg-slate-700 px-3 py-1 rounded text-slate-400 transition-colors flex items-center gap-1"
                      >
                        {copiedId === 'call-summary' ? <Check size={10} /> : <Copy size={10} />}
                        Copy Summary
                      </button>
                    </div>
                    <div className="prose prose-invert prose-sm max-w-none">
                      <ReactMarkdown>{callSummary}</ReactMarkdown>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </main>

      {/* Footer / Mic Trigger Area */}
      <div 
        className="h-12 border-t border-slate-800 bg-[#0d1a2d] flex items-center justify-center gap-6 cursor-pointer"
      >
        {!isRecording && messages.length > 0 && (
          <button 
            onClick={handleGenerateSummary}
            disabled={isGeneratingSummary}
            className="text-[10px] bg-cyan-900/30 hover:bg-cyan-900/50 px-3 py-1 rounded-lg text-cyan-400 transition-all flex items-center gap-2"
          >
            {isGeneratingSummary ? "Generating..." : "Generate Summary"}
          </button>
        )}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #1e293b;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #334155;
        }
      `}} />
    </div>
  );
}
