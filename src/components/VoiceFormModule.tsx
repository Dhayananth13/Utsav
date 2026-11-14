import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Send, Search, AlertCircle, CheckCircle2, ExternalLink, Trash2 } from 'lucide-react';
import { api } from '../api';
import type { ModuleRecord, UtsavEvent, VoiceFormPayload } from '../types';

interface VoiceFormModuleProps {
  event: UtsavEvent;
  records: ModuleRecord<VoiceFormPayload>[];
  onRefresh: () => void;
  guestMode?: boolean;
}

const SAMPLE_VOICE_NOTES = [
  {
    label: 'Family RSVP (Ambiguous headcount)',
    text: 'Hi! This is Karthik from Chennai. Me and my parents are coming for Sangeet and Wedding, maybe 4 or 5 of us if my sister catches the morning flight. Two vegetarian meals please.',
  },
  {
    label: 'Confirmed Couple',
    text: 'Hey Kavita, Neha and Siddharth here! Confirming 2 seats for Mehendi, Sangeet, and Reception. Reaching Bengaluru on Nov 25 around 2 PM. No dietary restrictions.',
  },
  {
    label: 'Polite Decline',
    text: 'So sorry! Vikram Desai here, I have a client workshop in Mumbai on the 25th and 26th so I cannot attend in person, sending warm wishes and shagun online.',
  },
];

export function VoiceFormModule({ event, records, onRefresh, guestMode = false }: VoiceFormModuleProps) {
  const [recording, setRecording] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [transcriptInput, setTranscriptInput] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'attending' | 'ambiguous' | 'declined'>('all');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
    };
  }, [audioPreviewUrl]);

  const startRecording = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setRecordedBlob(blob);
        if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
        setAudioPreviewUrl(URL.createObjectURL(blob));
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
      setElapsedSec(0);
      timerRef.current = window.setInterval(() => {
        setElapsedSec((prev) => prev + 1);
      }, 1000);
    } catch {
      setError('Microphone permission unavailable in this browser. Type or load a sample voice note below.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const submitVoiceOrText = async () => {
    setError('');
    if (!recordedBlob && !transcriptInput.trim()) {
      setError('Record a voice note or enter an RSVP message first.');
      return;
    }

    setProcessing(true);
    try {
      if (recordedBlob) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const result = String(reader.result || '');
            resolve(result.split(',')[1] || '');
          };
          reader.onerror = () => reject(new Error('Failed to read audio recording'));
          reader.readAsDataURL(recordedBlob);
        });

        await api.extractVoiceRsvp(event.id, {
          audioBase64: base64,
          mimeType: recordedBlob.type || 'audio/webm',
        });
        setRecordedBlob(null);
        setAudioPreviewUrl(null);
      } else {
        await api.extractVoiceRsvp(event.id, {
          transcriptInput: transcriptInput.trim(),
        });
        setTranscriptInput('');
      }
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to extract RSVP');
    } finally {
      setProcessing(false);
    }
  };

  const resolveAmbiguous = async (record: ModuleRecord<VoiceFormPayload>, exactCount: number) => {
    await api.updateRecord(record.id, {
      headcount: exactCount,
      ambiguousHeadcount: false,
      clarificationQuestion: '',
    });
    onRefresh();
  };

  const handleDelete = async (recordId: string) => {
    await api.deleteRecord(recordId);
    onRefresh();
  };

  const functionsList = event.config.functions?.length ? event.config.functions : ['Main Gathering'];
  const attendingRecords = records.filter((r) => r.payload.attending);
  const confirmedHeadcount = attendingRecords.reduce((s, r) => s + (r.payload.headcount || 0), 0);
  const ambiguousRecords = records.filter((r) => r.payload.ambiguousHeadcount);

  const filteredRecords = records.filter((r) => {
    if (filter === 'attending' && !r.payload.attending) return false;
    if (filter === 'declined' && r.payload.attending) return false;
    if (filter === 'ambiguous' && !r.payload.ambiguousHeadcount) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        r.payload.guestName.toLowerCase().includes(q) ||
        r.payload.transcript.toLowerCase().includes(q) ||
        r.payload.dietaryNotes.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-[#E7E5E0] bg-white p-4">
          <div className="text-xs text-zinc-500">Confirmed Headcount</div>
          <div className="mt-1 text-2xl font-semibold font-mono tabular-nums text-zinc-900">
            {confirmedHeadcount}
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            {attendingRecords.length} attending · {records.length - attendingRecords.length} declined
          </div>
        </div>

        <div className="rounded-xl border border-[#E7E5E0] bg-white p-4">
          <div className="text-xs text-zinc-500">Total Voice & Form RSVPs</div>
          <div className="mt-1 text-2xl font-semibold font-mono tabular-nums text-zinc-900">
            {records.length}
          </div>
          <div className="mt-1 text-xs text-zinc-500">Stored in shared module_records</div>
        </div>

        <div className="rounded-xl border border-[#E7E5E0] bg-white p-4">
          <div className="text-xs text-zinc-500">Needs Follow-up</div>
          <div className="mt-1 text-2xl font-semibold font-mono tabular-nums text-amber-700">
            {ambiguousRecords.length}
          </div>
          <div className="mt-1 text-xs text-zinc-500">Ambiguous guest count flagged</div>
        </div>

        <div className="rounded-xl border border-[#E7E5E0] bg-white p-4">
          <div className="text-xs text-zinc-500">Function Breakdown</div>
          <div className="mt-2 space-y-1">
            {functionsList.slice(0, 3).map((fn) => {
              const count = attendingRecords
                .filter((r) => r.payload.functions?.includes(fn))
                .reduce((s, r) => s + (r.payload.headcount || 0), 0);
              return (
                <div key={fn} className="flex items-center justify-between text-xs">
                  <span className="text-zinc-600 truncate pr-2">{fn}</span>
                  <span className="font-mono tabular-nums font-medium text-zinc-900">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Capture Panel */}
      <div className="rounded-xl border border-[#E7E5E0] bg-white p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#E7E5E0] pb-4">
          <div>
            <h3 className="text-base font-semibold text-zinc-900">
              {guestMode ? 'Leave a Voice RSVP' : 'Capture Voice or Text RSVP'}
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Speak naturally in English or Hinglish. Gemini transcribes audio and extracts headcount, functions, and dietary notes.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!recording ? (
              <button
                type="button"
                onClick={startRecording}
                className="inline-flex items-center gap-2 rounded-lg bg-[#C2410C] px-4 py-2 text-xs font-semibold text-white hover:bg-[#9A3412] whitespace-nowrap shrink-0"
              >
                <Mic className="h-3.5 w-3.5" />
                Record Voice Note
              </button>
            ) : (
              <button
                type="button"
                onClick={stopRecording}
                className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800 whitespace-nowrap shrink-0"
              >
                <Square className="h-3.5 w-3.5" />
                Stop ({Math.floor(elapsedSec / 60)}:{String(elapsedSec % 60).padStart(2, '0')})
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {audioPreviewUrl && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#E7E5E0] bg-[#FAFAF8] p-3">
              <audio controls src={audioPreviewUrl} className="h-8 max-w-full" />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRecordedBlob(null);
                    setAudioPreviewUrl(null);
                  }}
                  className="rounded-lg border border-[#E7E5E0] px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-white"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={submitVoiceOrText}
                  disabled={processing}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#C2410C] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#9A3412] disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  {processing ? 'Transcribing & Extracting...' : 'Transcribe & Save RSVP'}
                </button>
              </div>
            </div>
          )}

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <label className="text-xs font-medium text-zinc-700">
                Or paste a WhatsApp / voice transcript directly
              </label>
              <div className="flex flex-wrap items-center gap-1.5">
                {SAMPLE_VOICE_NOTES.map((sample) => (
                  <button
                    key={sample.label}
                    type="button"
                    onClick={() => setTranscriptInput(sample.text)}
                    className="rounded-md border border-[#E7E5E0] bg-[#FAFAF8] px-2.5 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100 whitespace-nowrap"
                  >
                    Try: {sample.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <textarea
                rows={2}
                value={transcriptInput}
                onChange={(e) => setTranscriptInput(e.target.value)}
                placeholder='e.g. "Hi Kavita, this is Arjun Verma. 3 of us coming for Sangeet and Wedding on Nov 25, 1 Jain meal needed."'
                className="w-full rounded-lg border border-[#E7E5E0] bg-white px-3 py-2 text-sm text-zinc-900 focus:border-[#C2410C] focus:outline-none"
              />
              <button
                type="button"
                onClick={submitVoiceOrText}
                disabled={processing || (!transcriptInput.trim() && !recordedBlob)}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-40 whitespace-nowrap shrink-0"
              >
                <Send className="h-3.5 w-3.5" />
                {processing ? 'Extracting...' : 'Extract RSVP'}
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* RSVP Dashboard Table */}
      {!guestMode && (
        <div className="rounded-xl border border-[#E7E5E0] bg-white">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E7E5E0] p-4">
            <div className="flex items-center gap-1 p-1 bg-[#F4F2ED] rounded-lg w-fit">
              {(['all', 'attending', 'ambiguous', 'declined'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setFilter(tab)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors whitespace-nowrap shrink-0 ${
                    filter === tab
                      ? 'bg-white text-zinc-900 shadow-sm'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  {tab === 'ambiguous' ? `Needs Review (${ambiguousRecords.length})` : tab}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="h-3.5 w-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search guest, meal, transcript..."
                className="w-full rounded-lg border border-[#E7E5E0] bg-white pl-8 pr-3 py-1.5 text-xs text-zinc-900 focus:border-[#C2410C] focus:outline-none"
              />
            </div>
          </div>

          {filteredRecords.length === 0 ? (
            <div className="p-8 text-center text-sm text-zinc-500">
              No RSVP responses match this filter yet. Record a voice note above to add the first response.
            </div>
          ) : (
            <div className="divide-y divide-[#E7E5E0]">
              {filteredRecords.map((rec) => {
                const p = rec.payload;
                const waText = encodeURIComponent(
                  `Hi ${p.guestName}, confirming your RSVP for ${event.name}!`
                );
                const waHref = p.phone
                  ? `https://wa.me/91${p.phone.replace(/\D/g, '').slice(-10)}?text=${waText}`
                  : `https://wa.me/?text=${waText}`;

                return (
                  <div key={rec.id} className="p-4 hover:bg-[#FAFAF8] transition-colors">
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                      <div className="space-y-1.5 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-zinc-900">{p.guestName}</span>
                          <span aria-hidden="true" className="text-zinc-300">·</span>
                          {p.attending ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Attending ({p.headcount} {p.headcount === 1 ? 'seat' : 'seats'})
                            </span>
                          ) : (
                            <span className="text-xs font-medium text-red-700">Declined</span>
                          )}
                          {p.functions && p.functions.length > 0 && (
                            <>
                              <span aria-hidden="true" className="text-zinc-300">·</span>
                              <span className="text-xs text-zinc-600">{p.functions.join(' / ')}</span>
                            </>
                          )}
                        </div>

                        <p className="text-xs text-zinc-600 leading-relaxed">“{p.transcript}”</p>

                        <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
                          {p.dietaryNotes && <span>Dietary: {p.dietaryNotes}</span>}
                          {p.arrivalNote && (
                            <>
                              {p.dietaryNotes && <span aria-hidden="true">·</span>}
                              <span>Logistics: {p.arrivalNote}</span>
                            </>
                          )}
                        </div>

                        {/* Should-have: Ambiguous headcount inline resolution */}
                        {p.ambiguousHeadcount && (
                          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2">
                            <div className="flex items-center gap-2 text-xs text-amber-900">
                              <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-700" />
                              <span>
                                {p.clarificationQuestion ||
                                  'Headcount sounded uncertain — confirm exact seats:'}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              {[1, 2, 3, 4, 5, 6].map((n) => (
                                <button
                                  key={n}
                                  type="button"
                                  onClick={() => resolveAmbiguous(rec, n)}
                                  className={`rounded-md px-2.5 py-1 text-xs font-mono font-medium transition-colors ${
                                    p.headcount === n
                                      ? 'bg-amber-800 text-white'
                                      : 'bg-white border border-amber-300 text-amber-900 hover:bg-amber-100'
                                  }`}
                                >
                                  {n}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <a
                          href={waHref}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg border border-[#E7E5E0] bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 whitespace-nowrap"
                        >
                          WhatsApp
                          <ExternalLink className="h-3 w-3" />
                        </a>
                        <button
                          type="button"
                          onClick={() => handleDelete(rec.id)}
                          aria-label={`Delete RSVP for ${p.guestName}`}
                          className="rounded-lg border border-[#E7E5E0] bg-white p-1.5 text-zinc-500 hover:text-red-700 hover:border-red-200"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
