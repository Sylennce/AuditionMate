/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  Mic, 
  Play, 
  ChevronRight, 
  Trash2, 
  Video, 
  Type, 
  ArrowLeft,
  Pause,
  Volume2,
  Maximize2,
  Settings
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Scene, Line, TeleprompterSettings } from './types';
import { api } from './api';
import { CreateSceneModal } from './components/CreateSceneModal';
import { ConfirmDialog } from './components/ConfirmDialog';
import { Modal } from './components/Modal';
import { ToastContainer, ToastType } from './components/Toast';

// --- Components ---

const MAX_LINES_PER_SCENE = 100;

const toSafeInt = (value: string | null, fallback: number, min: number, max: number) => {
  const n = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

const extractCueWord = (text: string) => {
  const normalized = text
    .toLowerCase()
    .replace(/[^\w\s']|_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = normalized.split(/\s+/);
  return words.length > 0 ? words[words.length - 1] : "";
};

export default function App() {
  const [view, setView] = useState<'HOME' | 'SCENE_DETAIL' | 'RECORD' | 'REHEARSE' | 'SELF_TAPE'>('HOME');
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [currentScene, setCurrentScene] = useState<Scene | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Settings State
  const [rehearseFontPx, setRehearseFontPx] = useState(() => 
    toSafeInt(localStorage.getItem('auditionMate.rehearseFontPx'), 28, 18, 44)
  );

  const [scrollSpeed, setScrollSpeed] = useState(() => 
    toSafeInt(localStorage.getItem('auditionMate.scrollSpeed'), 35, 10, 120)
  );

  const [scrollDelaySec, setScrollDelaySec] = useState(() => {
    const saved = localStorage.getItem('auditionMate.scrollDelaySec');
    const n = saved ? parseFloat(saved) : 0;
    return Number.isFinite(n) ? Math.min(Math.max(n, 0), 10) : 0;
  });

  // Modal States
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    type?: 'danger' | 'primary';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  // Toast State
  const [toasts, setToasts] = useState<{ id: string; message: string; type: ToastType }[]>([]);

  // Orientation Detection
  const [isLandscape, setIsLandscape] = useState(false);

  useEffect(() => {
    const getIsLandscape = () => window.matchMedia("(orientation: landscape)").matches;
    const update = () => setIsLandscape(getIsLandscape());
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  const addToast = (message: string, type: ToastType = 'success') => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  useEffect(() => {
    loadScenes();
    // Overwrite potentially corrupted localStorage on first mount
    localStorage.setItem('auditionMate.rehearseFontPx', rehearseFontPx.toString());
    localStorage.setItem('auditionMate.scrollSpeed', scrollSpeed.toString());
    localStorage.setItem('auditionMate.scrollDelaySec', scrollDelaySec.toString());
    localStorage.removeItem('auditionMate.autoScroll'); // Cleanup old key
  }, []);

  useEffect(() => {
    localStorage.setItem('auditionMate.rehearseFontPx', rehearseFontPx.toString());
  }, [rehearseFontPx]);

  useEffect(() => {
    localStorage.setItem('auditionMate.scrollSpeed', scrollSpeed.toString());
  }, [scrollSpeed]);

  useEffect(() => {
    localStorage.setItem('auditionMate.scrollDelaySec', scrollDelaySec.toString());
  }, [scrollDelaySec]);

  const loadScenes = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getScenes();
      setScenes(data);
    } catch (err) {
      console.error(err);
      setError('Can\'t reach local server');
      addToast('Couldn\'t load scenes. Is the server running?', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateScene = async (title: string) => {
    try {
      const newScene = await api.createScene(title);
      setScenes([newScene, ...scenes]);
      addToast('Scene created');
    } catch (err) {
      console.error(err);
      addToast('Couldn\'t create scene. Is the server running?', 'error');
      throw err; // Re-throw for the modal to handle
    }
  };

  const handleOpenScene = async (scene: Scene) => {
    try {
      setCurrentScene(scene);
      const sceneLines = await api.getLines(scene.id);
      setLines(sceneLines);
      setView('SCENE_DETAIL');
    } catch (err) {
      console.error(err);
      addToast('Couldn\'t load scene lines.', 'error');
    }
  };

  const handleDeleteScene = (id: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete scene?',
      message: 'This can\'t be undone. All recorded lines will be lost.',
      confirmText: 'Delete',
      type: 'danger',
      onConfirm: async () => {
        try {
          await api.deleteScene(id);
          setScenes((prev) => prev.filter((s) => s.id !== id));
          addToast('Scene deleted');
        } catch (err) {
          console.error(err);
          addToast('Failed to delete scene.', 'error');
        }
      },
    });
  };

  return (
    <div className="h-full overflow-hidden bg-[#151619] text-white font-sans selection:bg-emerald-500/30 flex flex-col">
      <AnimatePresence mode="wait">
        {view === 'HOME' && (
          <HomeView 
            scenes={scenes} 
            onOpen={handleOpenScene} 
            onCreate={() => setIsCreateModalOpen(true)} 
            onDelete={handleDeleteScene}
            loading={loading}
            error={error}
            onRetry={loadScenes}
          />
        )}
        {view === 'SCENE_DETAIL' && currentScene && (
          <SceneDetailView 
            scene={currentScene} 
            lines={lines} 
            onBack={() => setView('HOME')} 
            onRecord={() => setView('RECORD')}
            onRehearse={() => setView('REHEARSE')}
            onSelfTape={() => setView('SELF_TAPE')}
            onOpenSettings={() => setIsSettingsModalOpen(true)}
            onRefresh={async () => {
              try {
                const updated = await api.getLines(currentScene.id);
                setLines(updated);
              } catch (err) {
                addToast('Failed to refresh lines.', 'error');
              }
            }}
            onDeleteLine={(lineId) => {
              setConfirmDialog({
                isOpen: true,
                title: 'Delete line?',
                message: 'This will permanently remove the recorded audio and transcription.',
                confirmText: 'Delete',
                type: 'danger',
                onConfirm: async () => {
                  try {
                    await api.deleteLine(lineId);
                    setLines((prev) => prev.filter((l) => l.id !== lineId));
                    addToast('Line deleted');
                  } catch (err) {
                    addToast('Failed to delete line.', 'error');
                  }
                }
              });
            }}
          />
        )}
        {view === 'RECORD' && currentScene && (
          <RecordView 
            scene={currentScene} 
            onBack={() => {
              api.getLines(currentScene.id).then(setLines).catch(() => addToast('Failed to load lines.', 'error'));
              setView('SCENE_DETAIL');
            }}
            lineCount={lines.length}
            addToast={addToast}
          />
        )}
        {view === 'REHEARSE' && currentScene && (
          <RehearseView 
            scene={currentScene} 
            lines={lines} 
            onBack={() => setView('SCENE_DETAIL')} 
            rehearseFontPx={rehearseFontPx}
            onOpenSettings={() => setIsSettingsModalOpen(true)}
            scrollSpeed={scrollSpeed}
            isLandscape={isLandscape}
            scrollDelaySec={scrollDelaySec}
          />
        )}
        {view === 'SELF_TAPE' && currentScene && (
          <SelfTapeView 
            scene={currentScene} 
            lines={lines} 
            onBack={() => setView('SCENE_DETAIL')} 
            rehearseFontPx={rehearseFontPx}
            scrollSpeed={scrollSpeed}
            isLandscape={isLandscape}
            scrollDelaySec={scrollDelaySec}
          />
        )}
      </AnimatePresence>

      {/* Modals & Toasts */}
      <CreateSceneModal 
        isOpen={isCreateModalOpen} 
        onClose={() => setIsCreateModalOpen(false)} 
        onCreate={handleCreateScene} 
      />
      <RehearsalSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        rehearseFontPx={rehearseFontPx}
        setRehearseFontPx={(v) => setRehearseFontPx(clamp(v, 18, 44))}
        scrollSpeed={scrollSpeed}
        setScrollSpeed={(v) => setScrollSpeed(clamp(v, 5, 120))}
        scrollDelaySec={scrollDelaySec}
        setScrollDelaySec={setScrollDelaySec}
      />
      <ConfirmDialog 
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText={confirmDialog.confirmText}
        type={confirmDialog.type}
      />
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}

// --- Views ---

function HomeView({ scenes, onOpen, onCreate, onDelete, loading, error, onRetry }: { 
  scenes: Scene[], 
  onOpen: (s: Scene) => void, 
  onCreate: () => void,
  onDelete: (id: string) => void,
  loading: boolean,
  error: string | null,
  onRetry: () => void
}) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="w-full max-w-none md:max-w-md mx-auto p-6"
    >
      <header className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-emerald-500">Audition Mate</h1>
          <p className="text-zinc-500 text-sm">Your digital reader</p>
        </div>
        <button 
          onClick={onCreate}
          className="w-12 h-12 rounded-full bg-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-900/20 active:scale-95 transition-transform"
        >
          <Plus size={24} />
        </button>
      </header>

      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-12 text-zinc-600">Loading scenes...</div>
        ) : error ? (
          <div className="text-center py-12 border-2 border-dashed border-red-900/30 rounded-2xl text-zinc-500 bg-red-950/10">
            <p className="mb-4">{error}</p>
            <button 
              onClick={onRetry}
              className="px-4 py-2 bg-zinc-800 rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-zinc-700 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : scenes.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-zinc-800 rounded-2xl text-zinc-600">
            No scenes yet. Create one to start.
          </div>
        ) : (
          scenes.map(scene => (
            <div 
              key={scene.id}
              className="group relative bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 hover:bg-zinc-800/50 transition-colors cursor-pointer"
              onClick={() => onOpen(scene)}
            >
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-semibold text-lg">{scene.title}</h3>
                  <p className="text-zinc-500 text-xs mt-1">
                    {new Date(scene.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(scene.id);
                    }}
                    className="p-2 text-zinc-600 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                  <ChevronRight size={20} className="text-zinc-700" />
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <p className="text-center text-zinc-700 text-[10px] font-mono mt-8">v1.8</p>
    </motion.div>
  );
}

function SceneDetailView({ scene, lines, onBack, onRecord, onRehearse, onSelfTape, onRefresh, onDeleteLine, onOpenSettings }: { 
  scene: Scene, 
  lines: Line[], 
  onBack: () => void,
  onRecord: () => void,
  onRehearse: () => void,
  onSelfTape: () => void,
  onRefresh: () => void,
  onDeleteLine: (id: string) => void,
  onOpenSettings: () => void
}) {
  const remainingLines = MAX_LINES_PER_SCENE - lines.length;

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="w-full max-w-none md:max-w-md mx-auto h-full flex flex-col overflow-hidden"
    >
      <header className="p-6 border-b border-zinc-800 flex items-center gap-4 sticky top-0 bg-[#151619] z-10">
        <button onClick={onBack} className="p-2 -ml-2 text-zinc-400"><ArrowLeft size={24} /></button>
        <div className="flex-1">
          <h2 className="text-xl font-bold truncate">{scene.title}</h2>
          <p className="text-xs text-zinc-500 uppercase tracking-widest font-bold">
            {lines.length} Lines • {remainingLines} Left
          </p>
        </div>
        <button onClick={onOpenSettings} className="p-2 text-zinc-400 hover:text-white transition-colors">
          <Settings size={20} />
        </button>
      </header>

      <div className="flex-1 p-4 space-y-3 overflow-y-auto overscroll-contain">
        {lines.length === 0 ? (
          <div className="text-center py-20 text-zinc-600">
            <Mic size={48} className="mx-auto mb-4 opacity-20" />
            <p>No lines recorded yet.</p>
          </div>
        ) : (
          lines.map((line, idx) => (
            <div key={line.id} className="bg-zinc-900/30 border border-zinc-800/50 rounded-xl p-3 flex gap-4 items-start">
              <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-500">
                {idx + 1}
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-center mb-1">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                    line.speakerRole === 'MYSELF' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-blue-500/10 text-blue-500'
                  }`}>
                    {line.speakerRole}
                  </span>
                  <span className="text-[10px] text-zinc-600 font-mono">{(line.durationMs / 1000).toFixed(1)}s</span>
                </div>
                <p className="text-sm text-zinc-300 line-clamp-2 italic">"{line.text}"</p>
                {line.speakerRole === 'MYSELF' && (
                  <div className="mt-2 text-[10px] text-zinc-500 flex items-center gap-1">
                    <span className="font-bold uppercase">Cue:</span>
                    <span className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300">{line.cueWord}</span>
                  </div>
                )}
              </div>
              <button 
                onClick={() => onDeleteLine(line.id)}
                className="p-2 text-zinc-700 hover:text-red-400"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="p-6 bg-zinc-900/80 backdrop-blur-md border-t border-zinc-800 grid grid-cols-3 gap-4 sticky bottom-0">
        <button 
          onClick={onRecord}
          disabled={remainingLines <= 0}
          className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-zinc-800 hover:bg-zinc-700 transition-colors disabled:opacity-50"
        >
          <Mic size={24} className="text-emerald-500" />
          <span className="text-[10px] font-bold uppercase tracking-widest">Record</span>
        </button>
        <button 
          onClick={onRehearse}
          disabled={lines.length === 0}
          className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 transition-colors disabled:opacity-50"
        >
          <Play size={24} />
          <span className="text-[10px] font-bold uppercase tracking-widest">Rehearse</span>
        </button>
        <button 
          onClick={onSelfTape}
          disabled={lines.length === 0}
          className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-zinc-800 hover:bg-zinc-700 transition-colors disabled:opacity-50"
        >
          <Video size={24} className="text-blue-500" />
          <span className="text-[10px] font-bold uppercase tracking-widest">Tape</span>
        </button>
      </div>
    </motion.div>
  );
}

function RecordView({ scene, onBack, lineCount, addToast }: { scene: Scene, onBack: () => void, lineCount: number, addToast: (m: string, t?: ToastType) => void }) {
  const [isRecording, setIsRecording] = useState(false);
  const [role, setRole] = useState<'MYSELF' | 'READER'>('MYSELF');
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [transcription, setTranscription] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const startTime = useRef<number>(0);
  const recognitionRef = useRef<any>(null);
  const finalTranscriptRef = useRef('');
  const streamRef = useRef<MediaStream | null>(null);

  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      mediaRecorder.current = new MediaRecorder(stream);
      // Capture the actual MIME type the browser chose (e.g. audio/mp4 on iOS, audio/webm elsewhere).
      // Using the wrong type causes iOS Safari to fail to decode the blob on playback.
      const recMimeType = mediaRecorder.current.mimeType || 'audio/mp4';
      audioChunks.current = [];
      startTime.current = Date.now();

      mediaRecorder.current.ondataavailable = (e) => audioChunks.current.push(e.data);
      mediaRecorder.current.onstop = async () => {
        const blob = new Blob(audioChunks.current, { type: recMimeType });
        setRecordedBlob(blob);
        
        if (recognitionRef.current) {
          recognitionRef.current.stop();
        }

        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      };

      // Start Speech Recognition
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognitionRef.current = recognition;
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        finalTranscriptRef.current = '';
        recognition.onresult = (event: any) => {
          let interimTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscriptRef.current += event.results[i][0].transcript;
            } else {
              interimTranscript += event.results[i][0].transcript;
            }
          }
          setTranscription(finalTranscriptRef.current + interimTranscript);
        };

        recognition.onstart = () => setIsTranscribing(true);
        recognition.onend = () => {
          if (mediaRecorder.current?.state === 'recording') {
            // Safari auto-stops recognition sometimes. Restart it if we're still recording audio.
            setTimeout(() => {
              try {
                if (mediaRecorder.current?.state === 'recording') {
                  recognition.start();
                }
              } catch (e) {
                // Ignore restart errors
              }
            }, 150);
            return;
          }

          setIsTranscribing(false);
          setTranscription(finalTranscriptRef.current.trim());
          if (finalTranscriptRef.current.trim() === '') {
            addToast('No speech detected — type the line manually.', 'info');
          }
        };
        recognition.onerror = () => {
          // Errors often trigger onend, so we don't necessarily want to set transcribing to false here
          // if we're going to attempt a restart in onend.
        };

        recognition.start();
      } else {
        addToast('Speech recognition not supported in this browser.', 'info');
      }

      mediaRecorder.current.start();
      setIsRecording(true);
    } catch (err) {
      addToast('Microphone access denied.', 'error');
    }
  };

  const stopRecording = () => {
    mediaRecorder.current?.stop();
    setIsRecording(false);
  };

  const handleSave = async () => {
    if (!recordedBlob) return;

    try {
      const formData = new FormData();
      formData.append('id', crypto.randomUUID());
      formData.append('sceneId', scene.id);
      formData.append('orderIndex', lineCount.toString());
      formData.append('speakerRole', role);
      formData.append('text', transcription);
      formData.append('cueWord', role === 'MYSELF' ? extractCueWord(transcription) : '');
      formData.append('durationMs', (Date.now() - startTime.current).toString());
      formData.append('audio', recordedBlob, 'line.wav');

      await api.createLine(formData);
      addToast('Line saved');
      onBack();
    } catch (err) {
      addToast('Failed to save line.', 'error');
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="w-full max-w-none md:max-w-md mx-auto h-full flex flex-col overflow-hidden p-6"
    >
      <header className="flex items-center justify-between mb-12">
        <button onClick={onBack} className="text-zinc-500"><ArrowLeft size={24} /></button>
        <h2 className="text-lg font-bold">Record Line {lineCount + 1}</h2>
        <div className="w-6" />
      </header>

      <div className="flex-1 flex flex-col items-center justify-center gap-8">
        <div className="flex bg-zinc-900 p-1 rounded-xl w-full max-w-[320px]">
          <button 
            onClick={() => setRole('MYSELF')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${role === 'MYSELF' ? 'bg-emerald-600 text-white shadow-lg' : 'text-zinc-500'}`}
          >
            MYSELF
          </button>
          <button 
            onClick={() => setRole('READER')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${role === 'READER' ? 'bg-blue-600 text-white shadow-lg' : 'text-zinc-500'}`}
          >
            READER
          </button>
        </div>

        <div className="relative">
          <motion.button
            animate={isRecording ? { scale: [1, 1.1, 1] } : {}}
            transition={{ repeat: Infinity, duration: 1.5 }}
            onClick={isRecording ? stopRecording : startRecording}
            className={`w-32 h-32 rounded-full flex items-center justify-center shadow-2xl transition-colors ${
              isRecording ? 'bg-red-500 shadow-red-500/20' : 'bg-emerald-600 shadow-emerald-500/20'
            }`}
          >
            {isRecording ? <Pause size={48} /> : <Mic size={48} />}
          </motion.button>
          {isRecording && (
            <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 text-red-500 font-mono text-sm font-bold animate-pulse">
              RECORDING...
            </div>
          )}
        </div>

        <div className="w-full space-y-4 mt-10">
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 min-h-[120px]">
            <label className="text-[10px] uppercase tracking-widest font-bold text-zinc-600 mb-2 block">Transcription</label>
            {isTranscribing ? (
              <div className="flex items-center gap-2 text-zinc-500 text-sm italic">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" />
                Transcribing...
              </div>
            ) : (
              <textarea 
                value={transcription}
                onChange={(e) => setTranscription(e.target.value)}
                placeholder="Recording will appear here..."
                className="w-full bg-transparent border-none focus:ring-0 text-zinc-300 italic resize-none"
                rows={3}
              />
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-8">
        <button 
          onClick={() => {
            setRecordedBlob(null);
            setTranscription('');
          }}
          className="py-4 rounded-2xl bg-zinc-800 text-zinc-400 font-bold uppercase tracking-widest text-xs"
        >
          Reset
        </button>
        <button 
          onClick={handleSave}
          disabled={!recordedBlob || isTranscribing}
          className="py-4 rounded-2xl bg-emerald-600 text-white font-bold uppercase tracking-widest text-xs disabled:opacity-50"
        >
          Save Line
        </button>
      </div>
    </motion.div>
  );
}

// --- Shared Components ---

function TeleprompterText({ 
  line, 
  rehearseFontPx, 
  isPlaying,
  textScrollRef,
  scrollSpeed,
  isLandscape,
  scrollDelaySec
}: { 
  line: Line | undefined, 
  rehearseFontPx: number, 
  isPlaying: boolean,
  textScrollRef: React.RefObject<HTMLDivElement | null>,
  scrollSpeed: number,
  isLandscape?: boolean,
  scrollDelaySec: number
}) {
  const isMyself = line?.speakerRole === 'MYSELF';
  const scrollRemainderRef = useRef(0);
  const lineStartTimeRef = useRef(0);

  const normalize = (text: string) => {
    return text
      .toLowerCase()
      .replace(/[^\w\s']|_/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  };

  const renderLineWithCueHighlight = (text: string, cueWord: string, isMyself: boolean) => {
    if (!isMyself) return text;

    const words = text.trim().split(/\s+/);
    if (words.length === 0) return text;

    const lastWordRaw = words[words.length - 1];
    const match = lastWordRaw.match(/^([\w']+)([^\w']*)$/);
    
    let wordToHighlight = lastWordRaw;
    let punctuation = "";

    if (match) {
      wordToHighlight = match[1];
      punctuation = match[2];
    }

    const targetCue = cueWord ? normalize(cueWord) : normalize(wordToHighlight);
    const normalizedLast = normalize(wordToHighlight);

    if (normalizedLast === targetCue || !cueWord) {
      const before = words.slice(0, -1).join(" ");
      return (
        <>
          {before}{before ? " " : ""}
          <span className="text-yellow-400">{wordToHighlight}</span>
          {punctuation}
        </>
      );
    }

    return text;
  };

  // Reset scroll when line changes
  useEffect(() => {
    if (textScrollRef.current) {
      textScrollRef.current.scrollTop = 0;
    }
    scrollRemainderRef.current = 0;
    lineStartTimeRef.current = performance.now();
  }, [line?.id, textScrollRef]);

  // Restart delay timer when playback resumes
  useEffect(() => {
    if (isPlaying) {
      lineStartTimeRef.current = performance.now();
    }
  }, [isPlaying]);

  // Auto-scroll logic with requestAnimationFrame
  const requestRef = useRef<number>();
  const lastTimeRef = useRef<number>();

  useEffect(() => {
    if (!isPlaying || !isMyself) {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      lastTimeRef.current = undefined;
      return;
    }

    const animate = (time: number) => {
      const container = textScrollRef.current;
      if (!container) return;

      const now = performance.now();
      const elapsedSec = (now - lineStartTimeRef.current) / 1000;

      if (elapsedSec < scrollDelaySec) {
        // Continue loop but don't scroll yet
        lastTimeRef.current = time;
        requestRef.current = requestAnimationFrame(animate);
        return;
      }

      if (lastTimeRef.current !== undefined) {
        const dt = time - lastTimeRef.current;
        const speed = Number.isFinite(scrollSpeed) ? scrollSpeed : 35;
        
        // Fractional accumulation for smooth movement at all speeds
        const deltaFloat = (speed * dt) / 1000 + scrollRemainderRef.current;
        const deltaInt = Math.floor(deltaFloat);
        scrollRemainderRef.current = deltaFloat - deltaInt;
        
        const maxScroll = container.scrollHeight - container.clientHeight;

        if (maxScroll > 1 && deltaInt > 0 && container.scrollTop < maxScroll) {
          container.scrollTop = Math.min(container.scrollTop + deltaInt, maxScroll);
        }
      }
      lastTimeRef.current = time;
      requestRef.current = requestAnimationFrame(animate);
    };

    // Delay starting by 2 ticks to ensure layout is ready
    lastTimeRef.current = undefined;
    requestAnimationFrame(() => {
      requestAnimationFrame((time) => {
        const container = textScrollRef.current;
        if (container) {
          const maxScroll = container.scrollHeight - container.clientHeight;
          const speed = Number.isFinite(scrollSpeed) ? scrollSpeed : 35;
          console.log("AutoScroll start", { maxScroll, speed, isPlaying, isMyself, lineId: line?.id });
        }
        requestRef.current = requestAnimationFrame(animate);
      });
    });

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      lastTimeRef.current = undefined;
    };
  }, [isPlaying, isMyself, textScrollRef, scrollSpeed, line?.id]);

  if (!line) return null;

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`w-full text-center overflow-y-auto px-5 scrollbar-hide ${isLandscape ? 'max-h-[65vh]' : 'max-h-[55vh]'}`}
      ref={textScrollRef}
      style={{ fontSize: `${rehearseFontPx}px` }}
    >
      <div className={`mb-4 text-[10px] font-bold uppercase tracking-[0.2em] ${
        isMyself ? 'text-emerald-500' : 'text-blue-500'
      }`}>
        {line.speakerRole}
      </div>
      <p className="leading-relaxed font-medium text-zinc-100">
        {renderLineWithCueHighlight(
          line.text || "", 
          line.cueWord || "", 
          isMyself
        )}
      </p>
    </motion.div>
  );
}

function RehearseView({ scene, lines, onBack, rehearseFontPx, onOpenSettings, scrollSpeed, isLandscape, scrollDelaySec }: { 
  scene: Scene, 
  lines: Line[], 
  onBack: () => void, 
  rehearseFontPx: number,
  onOpenSettings: () => void,
  scrollSpeed: number,
  isLandscape: boolean,
  scrollDelaySec: number
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [countdownValue, setCountdownValue] = useState<number | null>(null);
  const [isCountingDown, setIsCountingDown] = useState(false);
  
  const audioCtxRef = useRef<any>(null);
  const readerAudioRef = useRef<HTMLAudioElement>(new Audio());
  const playSessionRef = useRef(0);
  const recognitionRef = useRef<any>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const textScrollRef = useRef<HTMLDivElement>(null);

  const currentIndexRef = useRef(currentIndex);
  const isPlayingRef = useRef(isPlaying);
  const hasTriggeredRef = useRef(false);
  const linesRef = useRef(lines);
  const spokenFinalRef = useRef("");
  const didFinishRef = useRef(false);

  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const isSpeechSupported = !!SpeechRecognition;
  const consecutiveMatchesRef = useRef(0);
  const lastTriggerAtRef = useRef(0);

  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
    // Reset scroll when line changes
    if (textScrollRef.current) {
      textScrollRef.current.scrollTop = 0;
    }
  }, [currentIndex]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  const normalize = (text: string) => {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  };

  // iOS requires audio to be unlocked within a user-gesture.
  // Play a silent buffer via AudioContext AND prime the <audio> element so
  // subsequent programmatic plays work regardless of timing.
  const unlockAudio = () => {
    if (!audioCtxRef.current) {
      const AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AudioContext) {
        audioCtxRef.current = new AudioContext();
        audioCtxRef.current.resume().catch(() => {});
      }
    }
    // Prime the <audio> element with a blob: URL — NOT a data: URI.
    // On iOS, the first transition from a data: URI to a blob: URL resets the
    // element's "allowed to play" state, causing the first real play() to fail
    // silently. Using a blob: URL here means all subsequent transitions are
    // blob: → blob:, which preserves the unlock across src changes.
    const audio = readerAudioRef.current;
    if (!audio.dataset.unlocked) {
      // 0-sample WAV — header only, no audio data. Fires 'ended' immediately,
      // establishing the per-element iOS unlock without leaving a real "ended"
      // play state behind. In the onended callback we immediately transition the
      // element to the first reader line's src so that when playReader() fires
      // it sees a "loading real content" state rather than a "0-sample ended"
      // state — iOS requires the latter to be explicitly load()-ed, which resets
      // the unlock. This pre-load avoids both pitfalls.
      const silentWav = new Uint8Array([
        0x52,0x49,0x46,0x46,0x24,0x00,0x00,0x00,0x57,0x41,0x56,0x45,
        0x66,0x6d,0x74,0x20,0x10,0x00,0x00,0x00,0x01,0x00,0x01,0x00,
        0x44,0xac,0x00,0x00,0x88,0x58,0x01,0x00,0x02,0x00,0x10,0x00,
        0x64,0x61,0x74,0x61,0x00,0x00,0x00,0x00,
      ]);
      const silentUrl = URL.createObjectURL(new Blob([silentWav], { type: 'audio/wav' }));
      audio.addEventListener('ended', function onUnlockEnded() {
        audio.removeEventListener('ended', onUnlockEnded);
        URL.revokeObjectURL(silentUrl);
        // Move element out of "0-sample ended" state by pre-loading the first
        // reader line. playReader() will re-assign the same src, triggering a
        // fresh load cycle from a clean non-ended state.
        const firstReader = linesRef.current.find(l => l.speakerRole === 'READER');
        if (firstReader?.audioPath) {
          audio.src = firstReader.audioPath;
        }
      });
      audio.src = silentUrl;
      audio.play().catch(() => {});
      audio.dataset.unlocked = '1';
    }
  };

  const stopEverything = () => {
    setIsPlaying(false);
    isPlayingRef.current = false;
    setIsCountingDown(false);
    setCountdownValue(null);
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    const audio = readerAudioRef.current;
    audio.onended = null;
    audio.pause();
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
    }
  };

  const stepTo = (i: number) => {
    if (i >= linesRef.current.length) {
      if (!didFinishRef.current) {
        didFinishRef.current = true;
        stopEverything();
        onBack();
      }
      return;
    }

    setCurrentIndex(i);
    currentIndexRef.current = i;
    hasTriggeredRef.current = false;

    const line = linesRef.current[i];

    if (line.speakerRole === 'READER') {
      playReader(i);
    } else {
      if (isSpeechSupported) {
        startListening(i);
      }
    }
  };

  const playReader = (index: number) => {
    const session = ++playSessionRef.current;
    const line = linesRef.current[index];

    // Stop any in-flight audio
    const audio = readerAudioRef.current;
    audio.onended = null;
    audio.pause();

    // If no audio recorded for this line, skip forward after a short pause
    if (!line.audioPath) {
      setTimeout(() => {
        if (currentIndexRef.current === index && isPlayingRef.current) {
          stepTo(index + 1);
        }
      }, 600);
      return;
    }

    const doPlay = () => {
      if (playSessionRef.current !== session || currentIndexRef.current !== index || !isPlayingRef.current) return;
      audio.onended = () => {
        if (playSessionRef.current === session && currentIndexRef.current === index && isPlayingRef.current) {
          stepTo(index + 1);
        }
      };
      audio.play().catch(() => {
        setTimeout(() => {
          if (playSessionRef.current === session && currentIndexRef.current === index && isPlayingRef.current) {
            audio.play().catch(() => {
              if (playSessionRef.current === session && currentIndexRef.current === index && isPlayingRef.current) {
                setTimeout(() => stepTo(index + 1), 600);
              }
            });
          }
        }, 400);
      });
    };

    // Two-gate approach: doPlay fires only after BOTH conditions are met.
    // Gate 1 — canplay: audio element has buffered the new blob and is ready.
    // Gate 2 — recSettled: iOS has released the audio session from SpeechRecognition.
    //
    // IMPORTANT: do NOT call audio.load() here. On iOS, load() resets the
    // element's unlock state acquired in unlockAudio(), causing play() to fail
    // silently for every reader line except the last. Setting audio.src alone
    // triggers automatic loading while preserving the unlock.
    //
    // Add the canplay listener BEFORE setting audio.src so we never miss the event.
    let canPlayFired = false;
    let recSettled = false;
    const tryPlay = () => { if (canPlayFired && recSettled) doPlay(); };

    let canPlayHandled = false;
    const onCanPlay = () => {
      if (canPlayHandled) return;
      canPlayHandled = true;
      audio.removeEventListener('canplay', onCanPlay);
      canPlayFired = true;
      tryPlay();
    };
    audio.addEventListener('canplay', onCanPlay);
    setTimeout(() => {
      if (!canPlayHandled) {
        canPlayHandled = true;
        audio.removeEventListener('canplay', onCanPlay);
        canPlayFired = true;
        tryPlay();
      }
    }, 500);

    audio.src = line.audioPath;

    const rec = recognitionRef.current;
    if (rec) {
      // Wait for SpeechRecognition.onend — fires when iOS releases the audio
      // session, switching output back to the loudspeaker. 150ms buffer after
      // onend for iOS to finish flipping the audio route. 500ms fallback if
      // onend never fires (e.g. recognition was already stopped).
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        setTimeout(() => { recSettled = true; tryPlay(); }, 150);
      };
      rec.onend = settle;
      setTimeout(settle, 500);
      try { rec.stop(); } catch (_) {}
    } else {
      recSettled = true;
    }
  };

  const startListening = (index: number) => {
    if (!SpeechRecognition) return;

    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
    }

    spokenFinalRef.current = "";
    hasTriggeredRef.current = false;
    consecutiveMatchesRef.current = 0;

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 3;

    recognition.onresult = (event: any) => {
      if (!isPlayingRef.current) return;
      if (currentIndexRef.current !== index) return;

      const lineData = linesRef.current[index];
      const cue = normalize(lineData.cueWord || "") ||
                  normalize(lineData.text || "").split(/\s+/).filter(Boolean).slice(-1)[0] || "";
      if (!cue) return;

      // Accumulate finals (top alternative); track latest interim from all alternatives
      let latestInterim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const t = normalize(result[0].transcript);
          spokenFinalRef.current = (spokenFinalRef.current + " " + t).trim();
        } else {
          // Collect interim text from all alternatives — cue may appear in a lower-ranked one
          for (let alt = 0; alt < result.length; alt++) {
            latestInterim += " " + normalize(result[alt].transcript);
          }
          latestInterim = latestInterim.trim();
        }
      }

      const fullSpoken = (spokenFinalRef.current + " " + latestInterim).trim();
      const lastWordsList = fullSpoken.split(/\s+/).filter(Boolean).slice(-12);
      if (lastWordsList.includes(cue)) {
        const now = Date.now();
        if (!hasTriggeredRef.current && now - lastTriggerAtRef.current > 650) {
          hasTriggeredRef.current = true;
          lastTriggerAtRef.current = now;
          recognition.onend = null;
          recognition.stop();
          stepTo(index + 1);
        }
      }
    };

    recognition.onend = () => {
      if (isPlayingRef.current &&
          linesRef.current[currentIndexRef.current]?.speakerRole === 'MYSELF' &&
          !hasTriggeredRef.current) {
        setTimeout(() => {
          if (isPlayingRef.current &&
              linesRef.current[currentIndexRef.current]?.speakerRole === 'MYSELF' &&
              !hasTriggeredRef.current) {
            try {
              recognition.start();
            } catch (e) {}
          }
        }, 200);
      }
    };

    try {
      recognition.start();
    } catch (e) {}
  };

  const togglePlay = () => {
    unlockAudio();
    if (isPlaying || isCountingDown) {
      stopEverything();
    } else {
      if (currentIndex === 0 && !isPlaying) {
        startCountdown();
      } else {
        if (!isSpeechSupported && lines[currentIndex].speakerRole === 'MYSELF') {
          stepTo(currentIndex + 1);
          setIsPlaying(true);
          isPlayingRef.current = true;
        } else {
          setIsPlaying(true);
          isPlayingRef.current = true;
          stepTo(currentIndexRef.current);
        }
      }
    }
  };

  const startCountdown = () => {
    setIsCountingDown(true);
    let count = 3;
    setCountdownValue(count);
    
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);

    countdownTimerRef.current = setInterval(() => {
      if (count > 1) {
        count--;
        setCountdownValue(count);
      } else {
        if (countdownTimerRef.current) {
          clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
        }
        setCountdownValue(null);
        setIsCountingDown(false);
        
        requestAnimationFrame(() => {
          setIsPlaying(true);
          isPlayingRef.current = true;
          stepTo(currentIndexRef.current);
        });
      }
    }, 1000);
  };

  useEffect(() => {
    const releaseMedia = () => {
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        try { recognitionRef.current.stop(); } catch (_) {}
      }
      readerAudioRef.current.pause();
    };
    const onVisibility = () => { if (document.hidden) releaseMedia(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', releaseMedia);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', releaseMedia);
      releaseMedia();
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
      }
    };
  }, []);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="h-full w-full bg-[#050505] flex flex-col overflow-hidden"
    >
      <header className="p-6 flex items-center justify-between z-20">
        <button onClick={onBack} className="p-2 bg-white/10 rounded-full"><ArrowLeft size={20} /></button>
        <div className="flex-1 text-center">
          <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{scene.title}</h3>
        </div>
        <button onClick={onOpenSettings} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors">
          <Settings size={20} />
        </button>
      </header>

      {!isSpeechSupported && (
        <div className="bg-amber-500/10 border-y border-amber-500/20 py-2 px-4 text-center">
          <p className="text-[10px] text-amber-500 font-bold uppercase tracking-widest">
            Voice cue isn’t supported in this browser. Use Safari (iPhone) or Chrome.
          </p>
        </div>
      )}

      <div className={`flex-1 relative flex flex-col items-center justify-center px-5 ${isLandscape ? 'py-4 pb-32' : 'py-8 pb-52'}`}>
        <TeleprompterText 
          line={lines[currentIndex]}
          rehearseFontPx={rehearseFontPx}
          isPlaying={isPlaying}
          textScrollRef={textScrollRef}
          scrollSpeed={scrollSpeed}
          isLandscape={isLandscape}
          scrollDelaySec={scrollDelaySec}
        />

        <div className={`absolute ${isLandscape ? 'bottom-8' : 'bottom-16'} left-0 right-0 px-8 flex justify-center items-center`}>
          <button
            onClick={togglePlay}
            className="w-24 h-24 rounded-full bg-emerald-600 flex items-center justify-center shadow-2xl shadow-emerald-500/20 active:scale-95 transition-transform"
          >
            {isPlaying ? <Pause size={40} /> : <Play size={40} />}
          </button>
        </div>

        <AnimatePresence>
          {isCountingDown && countdownValue !== null && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 z-50 flex items-center justify-center"
            >
              <motion.div 
                key={countdownValue}
                initial={{ scale: 2, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.5, opacity: 0 }}
                className="text-9xl font-bold text-white"
              >
                {countdownValue}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <footer className="p-8 bg-gradient-to-t from-black to-transparent flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Volume2 size={20} className="text-zinc-500" />
          <div className="w-24 h-1 bg-zinc-800 rounded-full overflow-hidden">
            <div className="w-2/3 h-full bg-emerald-500" />
          </div>
        </div>
        <div className="text-[10px] font-mono text-zinc-600">
          LINE {currentIndex + 1} OF {lines.length}
        </div>
        <button className="text-zinc-500"><Maximize2 size={20} /></button>
      </footer>
    </motion.div>
  );
}

function RehearsalSettingsModal({ 
  isOpen, 
  onClose, 
  rehearseFontPx,
  setRehearseFontPx,
  scrollSpeed,
  setScrollSpeed,
  scrollDelaySec,
  setScrollDelaySec
}: {
  isOpen: boolean;
  onClose: () => void;
  rehearseFontPx: number;
  setRehearseFontPx: (v: number) => void;
  scrollSpeed: number;
  setScrollSpeed: (v: number) => void;
  scrollDelaySec: number;
  setScrollDelaySec: (v: number) => void;
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Rehearsal Settings">
      <div className="space-y-8 py-4">
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h4 className="font-semibold text-zinc-200">Text Size</h4>
            <span className="text-xs font-mono text-emerald-500">{rehearseFontPx}px</span>
          </div>
          <input 
            type="range" 
            min="18" 
            max="44" 
            step="1"
            value={rehearseFontPx}
            onChange={(e) => setRehearseFontPx(parseInt(e.target.value, 10))}
            className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
          />
          <div className="flex justify-between text-[10px] text-zinc-600 font-bold uppercase tracking-widest">
            <span>Small</span>
            <span>Large</span>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h4 className="font-semibold text-zinc-200">Scroll Speed</h4>
            <span className="text-xs font-mono text-emerald-500">{scrollSpeed} px/s</span>
          </div>
          <input 
            type="range" 
            min="10" 
            max="120" 
            step="1"
            value={scrollSpeed}
            onChange={(e) => setScrollSpeed(parseInt(e.target.value, 10))}
            className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
          />
          <div className="flex justify-between text-[10px] text-zinc-600 font-bold uppercase tracking-widest">
            <span>Slow</span>
            <span>Fast</span>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h4 className="font-semibold text-zinc-200">Scroll Delay</h4>
            <span className="text-xs font-mono text-emerald-500">{scrollDelaySec.toFixed(1)}s</span>
          </div>
          <input 
            type="range" 
            min="0" 
            max="10" 
            step="0.5"
            value={scrollDelaySec}
            onChange={(e) => setScrollDelaySec(parseFloat(e.target.value))}
            className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
          />
          <div className="flex justify-between text-[10px] text-zinc-600 font-bold uppercase tracking-widest">
            <span>0s</span>
            <span>10s</span>
          </div>
        </div>
      </div>
      <div className="pt-6">
        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl bg-zinc-800 text-zinc-400 font-bold uppercase tracking-widest text-xs hover:bg-zinc-700 transition-colors"
        >
          Done
        </button>
      </div>
    </Modal>
  );
}

function SelfTapeView({ scene, lines, onBack, rehearseFontPx, scrollSpeed, isLandscape, scrollDelaySec }: { 
  scene: Scene, 
  lines: Line[], 
  onBack: () => void,
  rehearseFontPx: number,
  scrollSpeed: number,
  isLandscape: boolean,
  scrollDelaySec: number
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const videoChunks = useRef<Blob[]>([]);

  const audioCtxRef = useRef<any>(null);
  const readerAudioRef = useRef<HTMLAudioElement>(new Audio());
  const playSessionRef = useRef(0);
  const recognitionRef = useRef<any>(null);
  const textScrollRef = useRef<HTMLDivElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  const currentIndexRef = useRef(currentIndex);
  const isPlayingRef = useRef(isPlaying);
  const hasTriggeredRef = useRef(false);
  const linesRef = useRef(lines);
  const spokenFinalRef = useRef("");
  const didFinishRef = useRef(false);

  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const isSpeechSupported = !!SpeechRecognition;
  const consecutiveMatchesRef = useRef(0);
  const lastTriggerAtRef = useRef(0);

  const intentionalStopRef = useRef(false);

  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
    if (textScrollRef.current) {
      textScrollRef.current.scrollTop = 0;
    }
  }, [currentIndex]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    const releaseMedia = () => {
      cameraStreamRef.current?.getTracks().forEach(track => track.stop());
      cameraStreamRef.current = null;
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        try { recognitionRef.current.stop(); } catch (_) {}
      }
      readerAudioRef.current.pause();
    };

    async function setupCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        cameraStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Camera access denied", err);
      }
    }
    setupCamera();

    const onVisibility = () => { if (document.hidden) releaseMedia(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', releaseMedia);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', releaseMedia);
      releaseMedia();
      stopEverything();
    };
  }, []);


  const normalize = (text: string) => {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  };

  const stopEverything = () => {
    setIsPlaying(false);
    isPlayingRef.current = false;
    const audio = readerAudioRef.current;
    audio.onended = null;
    audio.pause();
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
    }
  };

  const stepTo = (i: number) => {
    if (i >= linesRef.current.length) {
      if (!didFinishRef.current) {
        didFinishRef.current = true;
        stopEverything();
      }
      return;
    }

    setCurrentIndex(i);
    currentIndexRef.current = i;
    hasTriggeredRef.current = false;

    const line = linesRef.current[i];

    if (line.speakerRole === 'READER') {
      playReader(i);
    } else {
      if (isSpeechSupported) {
        startListening(i);
      }
    }
  };

  const unlockAudio = () => {
    if (!audioCtxRef.current) {
      const AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AudioContext) {
        audioCtxRef.current = new AudioContext();
        audioCtxRef.current.resume().catch(() => {});
      }
    }
    // Prime the <audio> element with a blob: URL — NOT a data: URI.
    // On iOS, the first transition from a data: URI to a blob: URL resets the
    // element's "allowed to play" state, causing the first real play() to fail
    // silently. Using a blob: URL here means all subsequent transitions are
    // blob: → blob:, which preserves the unlock across src changes.
    const audio = readerAudioRef.current;
    if (!audio.dataset.unlocked) {
      const silentWav = new Uint8Array([
        0x52,0x49,0x46,0x46,0x24,0x00,0x00,0x00,0x57,0x41,0x56,0x45,
        0x66,0x6d,0x74,0x20,0x10,0x00,0x00,0x00,0x01,0x00,0x01,0x00,
        0x44,0xac,0x00,0x00,0x88,0x58,0x01,0x00,0x02,0x00,0x10,0x00,
        0x64,0x61,0x74,0x61,0x00,0x00,0x00,0x00,
      ]);
      const silentUrl = URL.createObjectURL(new Blob([silentWav], { type: 'audio/wav' }));
      audio.addEventListener('ended', function onUnlockEnded() {
        audio.removeEventListener('ended', onUnlockEnded);
        URL.revokeObjectURL(silentUrl);
        const firstReader = linesRef.current.find(l => l.speakerRole === 'READER');
        if (firstReader?.audioPath) {
          audio.src = firstReader.audioPath;
        }
      });
      audio.src = silentUrl;
      audio.play().catch(() => {});
      audio.dataset.unlocked = '1';
    }
  };

  const playReader = (index: number) => {
    const session = ++playSessionRef.current;
    const line = linesRef.current[index];

    const audio = readerAudioRef.current;
    audio.onended = null;
    audio.pause();

    if (!line.audioPath) {
      setTimeout(() => {
        if (currentIndexRef.current === index && isPlayingRef.current) {
          stepTo(index + 1);
        }
      }, 600);
      return;
    }

    const doPlay = () => {
      if (playSessionRef.current !== session || currentIndexRef.current !== index || !isPlayingRef.current) return;
      audio.onended = () => {
        if (playSessionRef.current === session && currentIndexRef.current === index && isPlayingRef.current) {
          stepTo(index + 1);
        }
      };
      audio.play().catch(() => {
        setTimeout(() => {
          if (playSessionRef.current === session && currentIndexRef.current === index && isPlayingRef.current) {
            audio.play().catch(() => {
              if (playSessionRef.current === session && currentIndexRef.current === index && isPlayingRef.current) {
                setTimeout(() => stepTo(index + 1), 600);
              }
            });
          }
        }, 400);
      });
    };

    // Two-gate approach: doPlay fires only after BOTH conditions are met.
    // Gate 1 — canplay: audio element has buffered the new blob and is ready.
    // Gate 2 — recSettled: iOS has released the audio session from SpeechRecognition.
    //
    // IMPORTANT: do NOT call audio.load() here. On iOS, load() resets the
    // element's unlock state acquired in unlockAudio(), causing play() to fail
    // silently for every reader line except the last. Setting audio.src alone
    // triggers automatic loading while preserving the unlock.
    //
    // Add the canplay listener BEFORE setting audio.src so we never miss the event.
    let canPlayFired = false;
    let recSettled = false;
    const tryPlay = () => { if (canPlayFired && recSettled) doPlay(); };

    let canPlayHandled = false;
    const onCanPlay = () => {
      if (canPlayHandled) return;
      canPlayHandled = true;
      audio.removeEventListener('canplay', onCanPlay);
      canPlayFired = true;
      tryPlay();
    };
    audio.addEventListener('canplay', onCanPlay);
    setTimeout(() => {
      if (!canPlayHandled) {
        canPlayHandled = true;
        audio.removeEventListener('canplay', onCanPlay);
        canPlayFired = true;
        tryPlay();
      }
    }, 500);

    audio.src = line.audioPath;

    const rec = recognitionRef.current;
    if (rec) {
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        setTimeout(() => { recSettled = true; tryPlay(); }, 150);
      };
      rec.onend = settle;
      setTimeout(settle, 500);
      try { rec.stop(); } catch (_) {}
    } else {
      recSettled = true;
    }
  };

  const startListening = (index: number) => {
    if (!SpeechRecognition) return;

    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
    }

    spokenFinalRef.current = "";
    hasTriggeredRef.current = false;
    consecutiveMatchesRef.current = 0;

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 3;

    recognition.onresult = (event: any) => {
      if (!isPlayingRef.current) return;
      if (currentIndexRef.current !== index) return;

      const lineData = linesRef.current[index];
      const cue = normalize(lineData.cueWord || "") ||
                  normalize(lineData.text || "").split(/\s+/).filter(Boolean).slice(-1)[0] || "";
      if (!cue) return;

      let latestInterim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const t = normalize(result[0].transcript);
          spokenFinalRef.current = (spokenFinalRef.current + " " + t).trim();
        } else {
          for (let alt = 0; alt < result.length; alt++) {
            latestInterim += " " + normalize(result[alt].transcript);
          }
          latestInterim = latestInterim.trim();
        }
      }

      const fullSpoken = (spokenFinalRef.current + " " + latestInterim).trim();
      const lastWordsList = fullSpoken.split(/\s+/).filter(Boolean).slice(-12);
      if (lastWordsList.includes(cue)) {
        const now = Date.now();
        if (!hasTriggeredRef.current && now - lastTriggerAtRef.current > 650) {
          hasTriggeredRef.current = true;
          lastTriggerAtRef.current = now;
          recognition.onend = null;
          recognition.stop();
          stepTo(index + 1);
        }
      }
    };

    recognition.onend = () => {
      if (isPlayingRef.current &&
          linesRef.current[currentIndexRef.current]?.speakerRole === 'MYSELF' &&
          !hasTriggeredRef.current) {
        setTimeout(() => {
          if (isPlayingRef.current &&
              linesRef.current[currentIndexRef.current]?.speakerRole === 'MYSELF' &&
              !hasTriggeredRef.current) {
            try {
              recognition.start();
            } catch (e) {}
          }
        }, 200);
      }
    };

    try {
      recognition.start();
    } catch (e) {}
  };

  const startTape = () => {
    unlockAudio();
    let count = 3;
    setCountdown(count);
    const timer = setInterval(() => {
      count--;
      setCountdown(count);
      if (count === 0) {
        clearInterval(timer);
        startRecording();
        setIsPlaying(true);
        isPlayingRef.current = true;
        stepTo(0);
      }
    }, 1000);
  };

  const startRecording = () => {
    const stream = cameraStreamRef.current as MediaStream;
    mediaRecorder.current = new MediaRecorder(stream);
    videoChunks.current = [];
    mediaRecorder.current.ondataavailable = (e) => videoChunks.current.push(e.data);
    mediaRecorder.current.onstop = async () => {
      // If the MediaRecorder stopped unexpectedly (e.g. iOS audio session conflict
      // when SpeechRecognition activates), ignore — don't share and don't navigate.
      if (!intentionalStopRef.current) return;
      intentionalStopRef.current = false;

      const blob = new Blob(videoChunks.current, { type: 'video/mp4' });
      const safeName = scene.title.replace(/[^\w\-]+/g, '_');
      const file = new File([blob], `SelfTape-${safeName}.mp4`, { type: 'video/mp4' });
      const navAny = navigator as any;
      if (navAny.share && navAny.canShare?.({ files: [file] })) {
        try {
          await navAny.share({
            files: [file],
            title: `SelfTape - ${scene.title}`,
            text: 'Save to Photos / Files',
          });
        } catch (_) {
          // User dismissed — still navigate back
        }
      } else {
        // Fallback: trigger download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        a.click();
      }

      onBack();
    };
    mediaRecorder.current.start();
    setIsRecording(true);
  };

  const stopTape = () => {
    setIsRecording(false);
    stopEverything();
    if (mediaRecorder.current?.state === 'recording') {
      // Recorder is active — let onstop handle share sheet + onBack()
      intentionalStopRef.current = true;
      mediaRecorder.current.stop();
    } else {
      // Recorder already stopped unexpectedly (iOS audio session conflict).
      // onstop won't fire, so navigate back directly without showing the share sheet.
      onBack();
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="h-full w-full bg-black flex flex-col overflow-hidden"
    >
      <video
        ref={videoRef} 
        autoPlay 
        muted 
        playsInline 
        className="absolute inset-0 w-full h-full object-cover"
      />
      
      <div className="absolute inset-x-0 top-0 h-2/3 bg-gradient-to-b from-black/80 via-black/40 to-transparent pointer-events-none z-0" />

      <header className={`relative p-6 flex items-center justify-between z-10 ${isLandscape ? 'py-3' : ''}`}>
        <button onClick={onBack} className="p-2 bg-black/50 rounded-full text-white"><ArrowLeft size={24} /></button>
        <div className="px-3 py-1 bg-red-600 rounded-full text-[10px] font-bold uppercase tracking-widest animate-pulse">
          {isRecording ? 'Recording' : 'Standby'}
        </div>
        <div className="w-10" />
      </header>

      <div className={`flex-1 flex flex-col items-center justify-center relative z-10 px-5 ${isLandscape ? 'py-4 pb-32' : 'py-8 pb-52'}`}>
        {countdown > 0 ? (
          <motion.div 
            initial={{ scale: 2, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            key={countdown}
            className="text-9xl font-bold text-white drop-shadow-2xl"
          >
            {countdown}
          </motion.div>
        ) : (
          <TeleprompterText 
            line={lines[currentIndex]}
            rehearseFontPx={rehearseFontPx}
            isPlaying={isPlaying}
            textScrollRef={textScrollRef}
            scrollSpeed={scrollSpeed}
            isLandscape={isLandscape}
            scrollDelaySec={scrollDelaySec}
          />
        )}
      </div>

      <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-50">
        {!isRecording ? (
          <button
            onClick={startTape}
            className="w-20 h-20 rounded-full bg-red-600 flex items-center justify-center shadow-xl active:scale-95 transition"
          >
            <div className="w-8 h-8 bg-white rounded-full" />
          </button>
        ) : (
          <button
    onClick={stopTape}
    className="w-20 h-20 rounded-full bg-red-700 flex items-center justify-center shadow-xl active:scale-95 transition"
  >
    <div className="w-6 h-6 bg-white" />
  </button>
        )}
      </div>

      <footer className="relative p-12 flex justify-center items-center z-10 hidden">
        <button 
          onClick={isRecording ? stopTape : startTape}
          className={`w-20 h-20 rounded-full border-4 flex items-center justify-center transition-all ${
            isRecording ? 'border-white bg-red-600 scale-90' : 'border-white bg-transparent'
          }`}
        >
          <div className={`rounded-full transition-all ${isRecording ? 'w-8 h-8 bg-white' : 'w-16 h-16 bg-red-600'}`} />
        </button>
      </footer>

      {/iPhone|iPad|iPod/.test(navigator.userAgent) && (
        <div className="absolute bottom-4 left-0 right-0 px-4 z-20 pointer-events-none">
          <div className="bg-amber-500/90 text-black text-[10px] font-bold uppercase tracking-widest py-1 px-3 rounded-full text-center max-w-xs mx-auto">
            Voice cue may be limited while recording on iOS.
          </div>
        </div>
      )}
    </motion.div>
  );
}
