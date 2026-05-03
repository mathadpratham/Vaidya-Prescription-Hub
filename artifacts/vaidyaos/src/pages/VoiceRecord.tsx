import { useEffect, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import {
  ArrowLeft,
  AlertCircle,
  Mic,
  Square,
  Play,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import {
  apiBase,
  getPatient,
  parseClinical,
  saveNote,
  type Patient,
  type ClinicalFields,
  type Medication,
} from "@/lib/api";

type LanguageCode = "unknown" | "en-IN" | "hi-IN" | "kn-IN";

const LANGUAGE_OPTIONS: { value: LanguageCode; label: string }[] = [
  { value: "unknown", label: "Auto-detect / स्वचालित" },
  { value: "en-IN", label: "English (India)" },
  { value: "hi-IN", label: "Hindi / हिन्दी" },
  { value: "kn-IN", label: "Kannada / ಕನ್ನಡ" },
];

const EMPTY_FIELDS: ClinicalFields = {
  bp: "",
  temp: "",
  spo2: "",
  patientPhone: "",
  patientName: "",
  patientAge: "",
  diagnosis: "",
  diagnoses: [],
  prescription: "",
  medications: [],
  followup: "",
  admit: "No",
};

const EMPTY_MED: Medication = {
  name: "",
  dose: "",
  frequency: "",
  duration: "",
};

export default function VoiceRecord() {
  const [, params] = useRoute("/patients/:id/voice");
  const [, navigate] = useLocation();
  const id = params?.id ?? "";

  const [patient, setPatient] = useState<Patient | null>(null);
  const [language, setLanguage] = useState<LanguageCode>("unknown");
  const [transcript, setTranscript] = useState("");
  const [fields, setFields] = useState<ClinicalFields>(EMPTY_FIELDS);
  const [errorMessage, setErrorMessage] = useState("");
  const [detectedLanguage, setDetectedLanguage] = useState<string>("");

  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  const [recordSeconds, setRecordSeconds] = useState(0);
  const [recordedSegments, setRecordedSegments] = useState<
    { url: string; mime: string }[]
  >([]);
  const [isPlayingBack, setIsPlayingBack] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const playbackAudioRef = useRef<HTMLAudioElement | null>(null);
  const playbackIndexRef = useRef(0);
  const rotateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isStoppingRef = useRef(false);
  const pendingTranscriptionsRef = useRef(0);

  const SEGMENT_MS = 25_000;

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getPatient(id)
      .then((data) => {
        if (!cancelled) setPatient(data.patient);
      })
      .catch((err: Error) => {
        if (!cancelled) setErrorMessage(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopMediaTracks();
      clearRotateTimer();
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      stopPlayback();
      recordedSegments.forEach((s) => URL.revokeObjectURL(s.url));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopMediaTracks = () => {
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
  };

  const clearRotateTimer = () => {
    if (rotateTimerRef.current) {
      clearTimeout(rotateTimerRef.current);
      rotateTimerRef.current = null;
    }
  };

  const sendAudioToSarvam = async (audioBlob: Blob, mimeType: string) => {
    pendingTranscriptionsRef.current += 1;
    setIsTranscribing(true);
    try {
      const ext = mimeType.includes("mp4")
        ? "m4a"
        : mimeType.includes("ogg")
          ? "ogg"
          : mimeType.includes("wav")
            ? "wav"
            : "webm";
      const fd = new FormData();
      fd.append("file", audioBlob, `recording.${ext}`);
      fd.append("language_code", language);

      const res = await fetch(`${apiBase}/sarvam/transcribe`, {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        let msg = `Transcription failed (${res.status})`;
        try {
          const j = (await res.json()) as { error?: string };
          if (j?.error) msg = j.error;
        } catch {
          // ignore
        }
        throw new Error(msg);
      }

      const data = (await res.json()) as {
        transcript?: string;
        language_code?: string;
      };
      if (data.language_code) setDetectedLanguage(data.language_code);
      const newText = (data.transcript ?? "").trim();
      if (newText) {
        setTranscript((prev) => (prev ? `${prev} ${newText}` : newText));
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Transcription error",
      );
    } finally {
      pendingTranscriptionsRef.current = Math.max(
        0,
        pendingTranscriptionsRef.current - 1,
      );
      if (pendingTranscriptionsRef.current === 0) setIsTranscribing(false);
    }
  };

  const pickMimeType = (): string => {
    const preferred = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg;codecs=opus",
    ];
    return (
      preferred.find(
        (t) =>
          typeof MediaRecorder !== "undefined" &&
          MediaRecorder.isTypeSupported(t),
      ) ?? ""
    );
  };

  const buildRecorder = (
    stream: MediaStream,
    onSegmentReady: (blob: Blob, mime: string) => void,
    onFinalSegment: () => void,
  ): MediaRecorder => {
    const supportedType = pickMimeType();
    const opts: MediaRecorderOptions = { audioBitsPerSecond: 128000 };
    if (supportedType) opts.mimeType = supportedType;
    const recorder = new MediaRecorder(stream, opts);

    audioChunksRef.current = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) audioChunksRef.current.push(event.data);
    };

    recorder.onstop = () => {
      const mime = recorder.mimeType || "audio/webm";
      const blob = new Blob(audioChunksRef.current, { type: mime });
      audioChunksRef.current = [];
      if (blob.size > 0) {
        const url = URL.createObjectURL(blob);
        setRecordedSegments((prev) => [...prev, { url, mime }]);
        onSegmentReady(blob, mime);
      }
      if (isStoppingRef.current) onFinalSegment();
    };

    recorder.onerror = () => {
      setErrorMessage("Recording error");
      isStoppingRef.current = true;
      clearRotateTimer();
      stopMediaTracks();
      setIsRecording(false);
    };

    return recorder;
  };

  const scheduleRotation = () => {
    clearRotateTimer();
    rotateTimerRef.current = setTimeout(() => {
      const stream = mediaStreamRef.current;
      const current = mediaRecorderRef.current;
      if (!stream || !current || isStoppingRef.current) return;
      current.stop();
      const next = buildRecorder(
        stream,
        (b, m) => void sendAudioToSarvam(b, m),
        () => {
          stopMediaTracks();
          setIsRecording(false);
        },
      );
      mediaRecorderRef.current = next;
      next.start();
      scheduleRotation();
    }, SEGMENT_MS);
  };

  const stopPlayback = () => {
    const audio = playbackAudioRef.current;
    if (audio) {
      audio.onended = null;
      audio.pause();
      audio.src = "";
    }
    playbackAudioRef.current = null;
    playbackIndexRef.current = 0;
    setIsPlayingBack(false);
  };

  const playRecordedAudio = () => {
    if (recordedSegments.length === 0) return;
    if (isPlayingBack) {
      stopPlayback();
      return;
    }
    const audio = new Audio();
    playbackAudioRef.current = audio;
    playbackIndexRef.current = 0;
    setIsPlayingBack(true);
    const playNext = () => {
      const idx = playbackIndexRef.current;
      if (idx >= recordedSegments.length) {
        stopPlayback();
        return;
      }
      audio.src = recordedSegments[idx].url;
      playbackIndexRef.current = idx + 1;
      audio.play().catch(() => stopPlayback());
    };
    audio.onended = playNext;
    audio.onerror = () => stopPlayback();
    playNext();
  };

  const startRecording = async () => {
    setErrorMessage("");
    setSavedOk(false);
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setErrorMessage("Browser does not support microphone");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 16000,
        },
      });
      mediaStreamRef.current = stream;
      isStoppingRef.current = false;
      setDetectedLanguage("");
      stopPlayback();
      setRecordedSegments((prev) => {
        prev.forEach((s) => URL.revokeObjectURL(s.url));
        return [];
      });
      setRecordSeconds(0);
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      recordTimerRef.current = setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);

      const recorder = buildRecorder(
        stream,
        (b, m) => void sendAudioToSarvam(b, m),
        () => {
          stopMediaTracks();
          setIsRecording(false);
        },
      );
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      scheduleRotation();
    } catch {
      setErrorMessage("Microphone access denied");
      stopMediaTracks();
    }
  };

  const stopRecording = () => {
    isStoppingRef.current = true;
    clearRotateTimer();
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    } else {
      stopMediaTracks();
      setIsRecording(false);
    }
  };

  const toggleRecord = () => {
    if (isRecording) stopRecording();
    else void startRecording();
  };

  const handleAutoExtract = async () => {
    if (!transcript.trim()) {
      setErrorMessage("Record or type a transcript first");
      return;
    }
    setErrorMessage("");
    setIsParsing(true);
    try {
      const f = await parseClinical(transcript);
      setFields(f);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to parse transcript",
      );
    } finally {
      setIsParsing(false);
    }
  };

  const handleSave = async () => {
    if (!id) return;
    setErrorMessage("");
    setIsSaving(true);
    try {
      const cleanedMeds = fields.medications.filter((m) => m.name.trim());
      const cleanedDx =
        fields.diagnoses && fields.diagnoses.length > 0
          ? fields.diagnoses.map((d) => d.trim()).filter(Boolean)
          : fields.diagnosis
            ? fields.diagnosis.split(",").map((s) => s.trim()).filter(Boolean)
            : [];
      await saveNote(id, {
        transcript,
        bp: fields.bp,
        temp: fields.temp,
        spo2: fields.spo2,
        diagnosis: fields.diagnosis || cleanedDx.join(", "),
        diagnoses: cleanedDx,
        prescription:
          fields.prescription ||
          cleanedMeds
            .map(
              (m) =>
                `${m.name}${m.dose ? ` ${m.dose}` : ""}${m.frequency ? ` ${m.frequency}` : ""}${m.duration ? ` x ${m.duration}` : ""}`,
            )
            .join(", "),
        medications: cleanedMeds,
        followup: fields.followup,
        admit: fields.admit,
      });
      setSavedOk(true);
      setTimeout(() => navigate(`/patients/${id}`), 700);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  const minutes = Math.floor(recordSeconds / 60);
  const seconds = recordSeconds % 60;

  return (
    <div className="min-h-[100dvh] max-w-md mx-auto bg-[#F7F9F8] flex flex-col">
      <div className="bg-white border-b border-[#E2EAE7] px-5 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button
          type="button"
          onClick={() => navigate(id ? `/patients/${id}` : "/")}
          className="w-9 h-9 rounded-full border border-[#E2EAE7] bg-white flex items-center justify-center text-[#4B6358]"
          aria-label="Back"
          data-testid="button-back"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[#0F1C18] truncate">
            {patient?.name ?? "Patient"}
          </div>
          <div className="text-xs text-[#8FA89F]">
            {patient ? `${patient.age ?? "—"}y • ${patient.department ?? ""}` : "Loading…"}
          </div>
        </div>
        {patient && (
          <span className="bg-teal-50 text-[#0B9E7A] text-[11px] font-semibold px-2.5 py-1 rounded-full font-mono">
            {patient.id}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto pb-6">
        {errorMessage && (
          <div className="mx-4 mt-4 bg-red-50 text-red-600 text-sm p-3 rounded-xl flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>{errorMessage}</p>
          </div>
        )}

        <div className="px-4 pt-4">
          <div className="bg-white border border-[#E2EAE7] rounded-2xl p-3.5 mb-3">
            <label className="block text-[11px] font-semibold text-[#8FA89F] tracking-wider uppercase mb-1.5">
              Speech Language
            </label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as LanguageCode)}
              className="w-full border border-[#E2EAE7] rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#0B9E7A]"
              data-testid="select-language"
            >
              {LANGUAGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-3">
            <VitalBox label="BP (mmHg)" value={fields.bp || "—"} />
            <VitalBox label="Temp (°F)" value={fields.temp || "—"} />
            <VitalBox label="SpO₂ (%)" value={fields.spo2 || "—"} />
          </div>

          <div className="bg-white border border-[#E2EAE7] rounded-2xl p-4 min-h-[140px]">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] font-semibold text-[#8FA89F] tracking-wider uppercase">
                Live Transcription
              </div>
              <div className="flex items-center gap-2">
                {detectedLanguage && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-50 text-[#0B9E7A] font-semibold">
                    {LANGUAGE_OPTIONS.find((o) => o.value === detectedLanguage)
                      ?.label ?? detectedLanguage}
                  </span>
                )}
                {recordedSegments.length > 0 && (
                  <button
                    type="button"
                    onClick={playRecordedAudio}
                    disabled={isRecording}
                    className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-[#F7F9F8] text-[#4B6358] hover:bg-[#E2EAE7] transition disabled:opacity-50"
                    aria-label={isPlayingBack ? "Stop playback" : "Play recording"}
                    data-testid="button-play-audio"
                  >
                    {isPlayingBack ? (
                      <>
                        <Square className="w-2.5 h-2.5" /> Stop
                      </>
                    ) : (
                      <>
                        <Play className="w-2.5 h-2.5" /> Play
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Press the microphone button and speak your clinical notes in Hindi or English..."
              className="w-full text-[15px] text-[#0F1C18] leading-relaxed min-h-[100px] resize-none focus:outline-none placeholder:text-[#8FA89F]"
              data-testid="textarea-transcript"
            />
          </div>
        </div>

        <div className="flex flex-col items-center gap-2 py-6">
          <div className="font-mono text-2xl text-[#0F1C18] font-medium">
            {minutes}:{seconds.toString().padStart(2, "0")}
          </div>
          <div className="relative">
            {isRecording && (
              <>
                <span className="absolute inset-0 -m-1 rounded-full border-2 border-red-500 animate-ping" />
                <span
                  className="absolute inset-0 -m-1 rounded-full border-2 border-red-500 animate-ping"
                  style={{ animationDelay: "0.5s" }}
                />
              </>
            )}
            <button
              type="button"
              onClick={toggleRecord}
              className={`relative w-[72px] h-[72px] rounded-full flex items-center justify-center text-white shadow-lg transition active:scale-95 ${
                isRecording
                  ? "bg-red-500 shadow-red-500/40"
                  : "bg-[#0B9E7A] shadow-teal-500/40"
              }`}
              aria-label={isRecording ? "Stop recording" : "Start recording"}
              data-testid="button-record"
            >
              {isRecording ? (
                <Square className="w-7 h-7" fill="currentColor" />
              ) : (
                <Mic className="w-7 h-7" />
              )}
            </button>
          </div>
          <div className="text-xs text-[#4B6358] font-medium">
            {isTranscribing
              ? "Transcribing…"
              : isRecording
                ? "Recording… speak your clinical notes"
                : transcript
                  ? "Recording stopped. Review and save."
                  : "Tap microphone to start recording"}
          </div>
        </div>

        <div className="px-4 space-y-3">
          <button
            type="button"
            onClick={() => void handleAutoExtract()}
            disabled={!transcript.trim() || isParsing}
            className="w-full bg-white border border-[#0B9E7A] text-[#0B9E7A] rounded-xl py-3 text-sm font-semibold active:bg-teal-50 disabled:border-[#E2EAE7] disabled:text-[#8FA89F] transition flex items-center justify-center gap-2"
            data-testid="button-extract"
          >
            {isParsing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Extracting…
              </>
            ) : (
              "✨ Auto-extract vitals & diagnosis"
            )}
          </button>

          <div className="bg-white border border-[#E2EAE7] rounded-xl p-3">
            <div className="text-[11px] text-[#8FA89F] mb-1.5 font-medium">
              Diagnosis
            </div>
            <input
              type="text"
              value={fields.diagnosis}
              onChange={(e) =>
                setFields({ ...fields, diagnosis: e.target.value })
              }
              placeholder="e.g. Viral fever, Throat infection"
              className="w-full text-sm font-semibold text-[#0F1C18] focus:outline-none placeholder:text-[#8FA89F]"
              data-testid="field-diagnosis"
            />
          </div>

          <div className="bg-white border border-[#E2EAE7] rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] text-[#8FA89F] font-medium uppercase tracking-wider">
                Prescription
              </div>
              <button
                type="button"
                onClick={() =>
                  setFields({
                    ...fields,
                    medications: [...fields.medications, { ...EMPTY_MED }],
                  })
                }
                className="text-[11px] font-semibold text-[#0B9E7A] flex items-center gap-1 active:opacity-70"
                data-testid="button-add-medication"
              >
                <Plus className="w-3 h-3" /> Add row
              </button>
            </div>

            {fields.medications.length === 0 ? (
              <div className="text-[12px] text-[#8FA89F] py-2">
                No medicines extracted. Tap "Add row" or run auto-extract.
              </div>
            ) : (
              <div className="border border-[#E2EAE7] rounded-lg overflow-hidden">
                <div className="grid grid-cols-[1.6fr_1fr_1.1fr_0.9fr_24px] bg-[#F7F9F8] text-[10px] uppercase tracking-wider text-[#8FA89F] font-semibold">
                  <div className="px-2 py-1.5">Drug</div>
                  <div className="px-1.5 py-1.5">Dose</div>
                  <div className="px-1.5 py-1.5">Freq</div>
                  <div className="px-1.5 py-1.5">Days</div>
                  <div />
                </div>
                {fields.medications.map((m, i) => (
                  <div
                    key={i}
                    className={`grid grid-cols-[1.6fr_1fr_1.1fr_0.9fr_24px] items-center text-[12px] ${i > 0 ? "border-t border-[#E2EAE7]" : ""}`}
                  >
                    <input
                      type="text"
                      value={m.name}
                      onChange={(e) => {
                        const next = [...fields.medications];
                        next[i] = { ...next[i], name: e.target.value };
                        setFields({ ...fields, medications: next });
                      }}
                      placeholder="Drug"
                      className="px-2 py-1.5 font-semibold text-[#0F1C18] focus:outline-none placeholder:text-[#8FA89F] min-w-0"
                      data-testid={`med-name-${i}`}
                    />
                    <input
                      type="text"
                      value={m.dose}
                      onChange={(e) => {
                        const next = [...fields.medications];
                        next[i] = { ...next[i], dose: e.target.value };
                        setFields({ ...fields, medications: next });
                      }}
                      placeholder="500mg"
                      className="px-1.5 py-1.5 text-[#4B6358] focus:outline-none placeholder:text-[#8FA89F] min-w-0"
                      data-testid={`med-dose-${i}`}
                    />
                    <input
                      type="text"
                      value={m.frequency}
                      onChange={(e) => {
                        const next = [...fields.medications];
                        next[i] = { ...next[i], frequency: e.target.value };
                        setFields({ ...fields, medications: next });
                      }}
                      placeholder="1-0-1"
                      className="px-1.5 py-1.5 text-[#4B6358] focus:outline-none placeholder:text-[#8FA89F] min-w-0"
                      data-testid={`med-freq-${i}`}
                    />
                    <input
                      type="text"
                      value={m.duration}
                      onChange={(e) => {
                        const next = [...fields.medications];
                        next[i] = { ...next[i], duration: e.target.value };
                        setFields({ ...fields, medications: next });
                      }}
                      placeholder="5d"
                      className="px-1.5 py-1.5 text-[#4B6358] focus:outline-none placeholder:text-[#8FA89F] min-w-0"
                      data-testid={`med-dur-${i}`}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const next = fields.medications.filter(
                          (_, idx) => idx !== i,
                        );
                        setFields({ ...fields, medications: next });
                      }}
                      className="text-[#8FA89F] active:text-red-500 p-1"
                      aria-label="Remove medication"
                      data-testid={`med-remove-${i}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <FieldCard
              label="Follow-up"
              value={fields.followup}
              onChange={(v) => setFields({ ...fields, followup: v })}
            />
            <FieldCard
              label="Admit?"
              value={fields.admit}
              onChange={(v) => setFields({ ...fields, admit: v })}
            />
          </div>

          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving || !transcript.trim()}
            className={`w-full rounded-2xl py-4 text-base font-semibold transition flex items-center justify-center gap-2 ${
              savedOk
                ? "bg-emerald-600 text-white"
                : "bg-[#0B9E7A] text-white active:bg-[#077A5E] disabled:bg-[#E2EAE7] disabled:text-[#8FA89F]"
            }`}
            data-testid="button-save-note"
          >
            {savedOk
              ? "✓ Saved to EMR!"
              : isSaving
                ? "Saving…"
                : "Save to EMR"}
          </button>
        </div>
      </div>
    </div>
  );
}

function VitalBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-[#E2EAE7] rounded-xl p-3 text-center">
      <div className="text-base font-semibold text-[#0F1C18]" data-testid={`vital-${label.split(" ")[0].toLowerCase()}`}>
        {value}
      </div>
      <div className="text-[10px] text-[#8FA89F] mt-0.5">{label}</div>
    </div>
  );
}

function FieldCard({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="bg-white border border-[#E2EAE7] rounded-xl p-3">
      <div className="text-[11px] text-[#8FA89F] mb-1 font-medium">{label}</div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
        className="w-full text-sm font-semibold text-[#0F1C18] focus:outline-none placeholder:text-[#8FA89F]"
        data-testid={`field-${label.toLowerCase().replace(/[^a-z]/g, "")}`}
      />
    </div>
  );
}
