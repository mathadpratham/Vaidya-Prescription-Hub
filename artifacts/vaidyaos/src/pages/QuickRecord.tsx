import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, AlertCircle, Mic, Square, Play,
  Loader2, Plus, Trash2, CheckCircle2, Camera, X,
} from "lucide-react";
import {
  apiBase, lookupPatient, getPatient, saveNote, parseClinical, sendWhatsAppMessage,
  type ClinicalFields, type Medication, type Patient, type ClinicalNote, type ClinicalPhoto,
} from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import { buildReminderText } from "@/lib/whatsapp";

async function compressImage(file: File): Promise<{ data: string; mimeType: string }> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1200;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
      resolve({ data: dataUrl.split(",")[1], mimeType: "image/jpeg" });
    };
    img.src = url;
  });
}

type PatientHistory = {
  patient: Patient;
  isNew: boolean;
  lastNote: ClinicalNote | null;
  totalNotes: number;
};

type LanguageCode = "unknown" | "en-IN" | "hi-IN" | "kn-IN";

const LANGUAGE_OPTIONS: { value: LanguageCode; label: string }[] = [
  { value: "unknown", label: "Auto-detect / स्वचालित" },
  { value: "en-IN",  label: "English (India)" },
  { value: "hi-IN",  label: "Hindi / हिन्दी" },
  { value: "kn-IN",  label: "Kannada / ಕನ್ನಡ" },
];

const EMPTY_FIELDS: ClinicalFields = {
  bp: "", temp: "", spo2: "",
  patientPhone: "", patientName: "", patientAge: "",
  diagnosis: "", diagnoses: [],
  prescription: "", medications: [],
  followup: "", admit: "No",
};

const EMPTY_MED: Medication = { name: "", dose: "", frequency: "", duration: "" };

export default function QuickRecord() {
  const [, navigate] = useLocation();
  const { doctor } = useAuth();

  const [language, setLanguage]       = useState<LanguageCode>("unknown");
  const [transcript, setTranscript]   = useState("");
  const [fields, setFields]           = useState<ClinicalFields>(EMPTY_FIELDS);
  const [extracted, setExtracted]     = useState(false);
  const [errorMsg, setErrorMsg]       = useState("");
  const [detectedLang, setDetectedLang] = useState("");

  const [isRecording, setIsRecording]     = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isParsing, setIsParsing]         = useState(false);
  const [isSaving, setIsSaving]           = useState(false);
  const [savedOk, setSavedOk]             = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [recordedSegments, setRecordedSegments] = useState<{ url: string; mime: string }[]>([]);
  const [isPlayingBack, setIsPlayingBack] = useState(false);

  const [sendReminders, setSendReminders]     = useState(false);
  const [patientHistory, setPatientHistory]   = useState<PatientHistory | null>(null);
  const [lookingUp, setLookingUp]             = useState(false);
  const [photos, setPhotos]                   = useState<ClinicalPhoto[]>([]);
  const [waToast, setWaToast]                 = useState("");

  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef   = useRef<Blob[]>([]);
  const mediaStreamRef   = useRef<MediaStream | null>(null);
  const playbackAudioRef = useRef<HTMLAudioElement | null>(null);
  const playbackIndexRef = useRef(0);
  const rotateTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordTimerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const isStoppingRef    = useRef(false);
  const pendingRef       = useRef(0);

  const SEGMENT_MS = 25_000;

  useEffect(() => () => {
    stopMediaTracks();
    clearRotateTimer();
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    stopPlayback();
    recordedSegments.forEach((s) => URL.revokeObjectURL(s.url));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopMediaTracks = () => { mediaStreamRef.current?.getTracks().forEach((t) => t.stop()); mediaStreamRef.current = null; };
  const clearRotateTimer = () => { if (rotateTimerRef.current) { clearTimeout(rotateTimerRef.current); rotateTimerRef.current = null; } };
  const stopPlayback = () => {
    const a = playbackAudioRef.current;
    if (a) { a.onended = null; a.pause(); a.src = ""; }
    playbackAudioRef.current = null;
    playbackIndexRef.current = 0;
    setIsPlayingBack(false);
  };

  const sendToSarvam = async (blob: Blob, mimeType: string) => {
    pendingRef.current += 1;
    setIsTranscribing(true);
    try {
      const ext = mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : mimeType.includes("wav") ? "wav" : "webm";
      const fd = new FormData();
      fd.append("file", blob, `rec.${ext}`);
      fd.append("language_code", language);
      const res = await fetch(`${apiBase}/sarvam/transcribe`, { method: "POST", body: fd });
      if (!res.ok) throw new Error(`Transcription failed (${res.status})`);
      const data = (await res.json()) as { transcript?: string; language_code?: string };
      if (data.language_code) setDetectedLang(data.language_code);
      const text = (data.transcript ?? "").trim();
      if (text) setTranscript((p) => p ? `${p} ${text}` : text);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Transcription error");
    } finally {
      pendingRef.current = Math.max(0, pendingRef.current - 1);
      if (pendingRef.current === 0) setIsTranscribing(false);
    }
  };

  const pickMimeType = () => {
    const pref = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
    return pref.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) ?? "";
  };

  const buildRecorder = (stream: MediaStream, onSegment: (b: Blob, m: string) => void, onFinal: () => void): MediaRecorder => {
    const mime = pickMimeType();
    const opts: MediaRecorderOptions = { audioBitsPerSecond: 128000 };
    if (mime) opts.mimeType = mime;
    const rec = new MediaRecorder(stream, opts);
    audioChunksRef.current = [];
    rec.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
    rec.onstop = () => {
      const m = rec.mimeType || "audio/webm";
      const blob = new Blob(audioChunksRef.current, { type: m });
      audioChunksRef.current = [];
      if (blob.size > 0) {
        const url = URL.createObjectURL(blob);
        setRecordedSegments((p) => [...p, { url, mime: m }]);
        onSegment(blob, m);
      }
      if (isStoppingRef.current) onFinal();
    };
    rec.onerror = () => { setErrorMsg("Recording error"); isStoppingRef.current = true; clearRotateTimer(); stopMediaTracks(); setIsRecording(false); };
    return rec;
  };

  const scheduleRotation = () => {
    clearRotateTimer();
    rotateTimerRef.current = setTimeout(() => {
      const stream = mediaStreamRef.current;
      const cur = mediaRecorderRef.current;
      if (!stream || !cur || isStoppingRef.current) return;
      cur.stop();
      const next = buildRecorder(stream, (b, m) => void sendToSarvam(b, m), () => { stopMediaTracks(); setIsRecording(false); });
      mediaRecorderRef.current = next;
      next.start();
      scheduleRotation();
    }, SEGMENT_MS);
  };

  const startRecording = async () => {
    setErrorMsg("");
    setSavedOk(false);
    setExtracted(false);
    if (!navigator.mediaDevices?.getUserMedia) { setErrorMsg("Browser does not support microphone"); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1, sampleRate: 16000 } });
      mediaStreamRef.current = stream;
      isStoppingRef.current = false;
      setDetectedLang("");
      stopPlayback();
      setRecordedSegments((p) => { p.forEach((s) => URL.revokeObjectURL(s.url)); return []; });
      setRecordSeconds(0);
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      recordTimerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
      const rec = buildRecorder(stream, (b, m) => void sendToSarvam(b, m), () => { stopMediaTracks(); setIsRecording(false); });
      mediaRecorderRef.current = rec;
      rec.start();
      setIsRecording(true);
      scheduleRotation();
    } catch { setErrorMsg("Microphone access denied"); stopMediaTracks(); }
  };

  const stopRecording = () => {
    isStoppingRef.current = true;
    clearRotateTimer();
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
    else { stopMediaTracks(); setIsRecording(false); }
  };

  const playAudio = () => {
    if (!recordedSegments.length) return;
    if (isPlayingBack) { stopPlayback(); return; }
    const audio = new Audio();
    playbackAudioRef.current = audio;
    playbackIndexRef.current = 0;
    setIsPlayingBack(true);
    const playNext = () => {
      const idx = playbackIndexRef.current;
      if (idx >= recordedSegments.length) { stopPlayback(); return; }
      audio.src = recordedSegments[idx].url;
      playbackIndexRef.current = idx + 1;
      audio.play().catch(() => stopPlayback());
    };
    audio.onended = playNext;
    audio.onerror = () => stopPlayback();
    playNext();
  };

  const handleExtract = async () => {
    const rxPhotos = photos.filter((p) => p.type === "prescription");
    if (!transcript.trim() && rxPhotos.length === 0) {
      setErrorMsg("Record your voice or take a photo of the prescription first");
      return;
    }
    setErrorMsg("");
    setIsParsing(true);
    setPatientHistory(null);
    try {
      const f = await parseClinical(transcript, rxPhotos.length > 0 ? rxPhotos : undefined);
      setFields(f);
      setExtracted(true);
      // Auto-lookup patient history in background as soon as phone extracted
      const digits = f.patientPhone.replace(/\D/g, "");
      if (digits.length === 10) {
        setLookingUp(true);
        lookupPatient(digits)
          .then(async ({ patient, isNew }) => {
            if (isNew) {
              setPatientHistory({ patient, isNew, lastNote: null, totalNotes: 0 });
            } else {
              const data = await getPatient(patient.id);
              setPatientHistory({
                patient,
                isNew: false,
                lastNote: data.notes[0] ?? null,
                totalNotes: data.notes.length,
              });
            }
          })
          .catch(() => {}) // silent — don't block the form
          .finally(() => setLookingUp(false));
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to extract");
    } finally {
      setIsParsing(false);
    }
  };

  const handleSave = async () => {
    const phone = fields.patientPhone.replace(/\D/g, "");
    if (phone.length !== 10) {
      setErrorMsg("Patient phone number not found. Ask the patient and type it above.");
      return;
    }
    setErrorMsg("");
    setIsSaving(true);
    try {
      // Reuse cached patient from auto-lookup to avoid a second round-trip
      const { patient } = patientHistory?.patient
        ? { patient: patientHistory.patient }
        : await lookupPatient(phone);
      const cleanedMeds = fields.medications.filter((m) => m.name.trim());
      const cleanedDx = fields.diagnoses.length > 0
        ? fields.diagnoses
        : fields.diagnosis ? fields.diagnosis.split(",").map((s) => s.trim()).filter(Boolean) : [];
      await saveNote(patient.id, {
        transcript,
        doctorName: doctor?.name ?? "Doctor",
        bp: fields.bp, temp: fields.temp, spo2: fields.spo2,
        diagnosis: fields.diagnosis || cleanedDx.join(", "),
        diagnoses: cleanedDx,
        prescription: fields.prescription || cleanedMeds.map((m) => `${m.name}${m.dose ? ` ${m.dose}` : ""}${m.frequency ? ` ${m.frequency}` : ""}`).join(", "),
        medications: cleanedMeds,
        photos,
        followup: fields.followup,
        admit: fields.admit,
        patientName: fields.patientName || undefined,
        patientAge: fields.patientAge ? Number(fields.patientAge) : undefined,
      } as Parameters<typeof saveNote>[1]);
      setSavedOk(true);
      if (sendReminders && cleanedMeds.length > 0) {
        const reminderText = buildReminderText(fields.patientName, doctor?.name ?? "Doctor", cleanedMeds, fields.followup);
        if (reminderText) {
          void sendWhatsAppMessage(phone, reminderText).then((r) => {
            if (r.noApiKey) setWaToast("WhatsApp API not configured yet — add key in settings");
            else if (r.success) setWaToast("✓ Reminder sent via WhatsApp");
            else setWaToast(`WhatsApp error: ${r.error ?? "unknown"}`);
            setTimeout(() => setWaToast(""), 4000);
          });
        }
      }
      setTimeout(() => navigate(`/patients/${patient.id}`), 900);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  const phoneOk = fields.patientPhone.replace(/\D/g, "").length === 10;
  const hasMeds  = fields.medications.some((m) => m.name.trim());
  const hasRxPhoto = photos.some((p) => p.type === "prescription");
  const showReminderToggle = extracted && phoneOk && hasMeds;
  const canExtract = (transcript.trim().length > 0 || hasRxPhoto) && !isParsing && !isRecording;

  const min = Math.floor(recordSeconds / 60);
  const sec = recordSeconds % 60;

  return (
    <div className="min-h-[100dvh] max-w-md mx-auto bg-[#F7F9F8] flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-[#E2EAE7] px-5 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button type="button" onClick={() => navigate("/")}
          className="w-9 h-9 rounded-full border border-[#E2EAE7] bg-white flex items-center justify-center text-[#4B6358]"
          aria-label="Back">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[#0F1C18]">New Consultation</div>
          <div className="text-xs text-[#8FA89F]">Ask patient: name, phone, complaints</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-6">
        {errorMsg && (
          <div className="mx-4 mt-4 bg-red-50 text-red-600 text-sm p-3 rounded-xl flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>{errorMsg}</p>
          </div>
        )}

        {/* Language picker */}
        <div className="px-4 pt-4">
          <div className="bg-white border border-[#E2EAE7] rounded-2xl p-3.5 mb-3">
            <label className="block text-[11px] font-semibold text-[#8FA89F] tracking-wider uppercase mb-1.5">
              Speech Language
            </label>
            <select value={language} onChange={(e) => setLanguage(e.target.value as LanguageCode)}
              className="w-full border border-[#E2EAE7] rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#0B9E7A]">
              {LANGUAGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* Live transcript */}
          <div className="bg-white border border-[#E2EAE7] rounded-2xl p-4 min-h-[140px] mb-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] font-semibold text-[#8FA89F] tracking-wider uppercase">Live Transcript</div>
              <div className="flex items-center gap-2">
                {detectedLang && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-50 text-[#0B9E7A] font-semibold">
                    {LANGUAGE_OPTIONS.find((o) => o.value === detectedLang)?.label ?? detectedLang}
                  </span>
                )}
                {recordedSegments.length > 0 && (
                  <button type="button" onClick={playAudio} disabled={isRecording}
                    className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-[#F7F9F8] text-[#4B6358] hover:bg-[#E2EAE7] transition disabled:opacity-50">
                    {isPlayingBack ? <><Square className="w-2.5 h-2.5" /> Stop</> : <><Play className="w-2.5 h-2.5" /> Play</>}
                  </button>
                )}
              </div>
            </div>
            <textarea value={transcript} onChange={(e) => { setTranscript(e.target.value); setExtracted(false); }}
              placeholder="Press the mic and speak… doctor asks the patient for their name, phone number, and complaints."
              className="w-full text-[15px] text-[#0F1C18] leading-relaxed min-h-[100px] resize-none focus:outline-none placeholder:text-[#8FA89F]" />
          </div>
        </div>

        {/* Mic + Camera + timer */}
        <div className="flex flex-col items-center gap-2 py-4">
          <div className="font-mono text-2xl text-[#0F1C18] font-medium">
            {min}:{sec.toString().padStart(2, "0")}
          </div>
          <div className="flex items-center gap-5">
            <div className="relative">
              {isRecording && (
                <>
                  <span className="absolute inset-0 -m-1 rounded-full border-2 border-red-500 animate-ping" />
                  <span className="absolute inset-0 -m-1 rounded-full border-2 border-red-500 animate-ping" style={{ animationDelay: "0.5s" }} />
                </>
              )}
              <button type="button"
                onClick={() => { if (isRecording) stopRecording(); else void startRecording(); }}
                className={`relative w-[72px] h-[72px] rounded-full flex items-center justify-center text-white shadow-lg transition active:scale-95 ${isRecording ? "bg-red-500 shadow-red-500/40" : "bg-[#0B9E7A] shadow-teal-500/40"}`}
                aria-label={isRecording ? "Stop" : "Record"}>
                {isRecording ? <Square className="w-7 h-7" fill="currentColor" /> : <Mic className="w-7 h-7" />}
              </button>
            </div>

            {/* Camera button */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                void compressImage(file).then(({ data, mimeType }) => {
                  setPhotos((prev) => [...prev, { data, mimeType, type: "prescription" }]);
                });
                e.target.value = "";
              }}
            />
            <button type="button"
              onClick={() => cameraInputRef.current?.click()}
              disabled={isRecording}
              className="w-[52px] h-[52px] rounded-full border-2 border-[#E2EAE7] bg-white flex flex-col items-center justify-center text-[#4B6358] active:bg-[#E2EAE7] disabled:opacity-40 transition gap-0.5"
              aria-label="Add photo">
              <Camera className="w-5 h-5" />
              {photos.length > 0 && (
                <span className="text-[9px] font-bold text-[#0B9E7A]">{photos.length}</span>
              )}
            </button>
          </div>

          <div className="text-xs text-[#4B6358] font-medium text-center px-8">
            {isTranscribing ? "Transcribing…" : isRecording ? "Recording… ask patient name & phone" : transcript ? "Done. Extract fields below." : "Tap mic to speak or camera to scan Rx"}
          </div>
        </div>

        {/* Photo strip */}
        {photos.length > 0 && (
          <div className="flex gap-2.5 overflow-x-auto pb-1 px-4 mb-1">
            {photos.map((p, i) => (
              <div key={i} className="relative shrink-0">
                <img
                  src={`data:${p.mimeType};base64,${p.data}`}
                  className={`w-[70px] h-[70px] rounded-xl object-cover border-2 ${p.type === "prescription" ? "border-[#0B9E7A]" : "border-purple-400"}`}
                  alt={p.type}
                />
                {/* Delete */}
                <button type="button"
                  onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full text-white flex items-center justify-center shadow">
                  <X className="w-3 h-3" />
                </button>
                {/* Type toggle */}
                <button type="button"
                  onClick={() => setPhotos((prev) => prev.map((ph, idx) =>
                    idx === i ? { ...ph, type: ph.type === "prescription" ? "clinical" : "prescription" } : ph,
                  ))}
                  className={`absolute bottom-0 left-0 right-0 text-[9px] font-bold py-0.5 text-center rounded-b-xl ${p.type === "prescription" ? "bg-[#0B9E7A] text-white" : "bg-purple-500 text-white"}`}>
                  {p.type === "prescription" ? "Rx scan" : "Clinical 📷"}
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="px-4 space-y-3">
          {/* Extract button */}
          <button type="button" onClick={() => void handleExtract()}
            disabled={!canExtract}
            className="w-full bg-white border border-[#0B9E7A] text-[#0B9E7A] rounded-xl py-3 text-sm font-semibold active:bg-teal-50 disabled:border-[#E2EAE7] disabled:text-[#8FA89F] transition flex items-center justify-center gap-2">
            {isParsing
              ? <><Loader2 className="w-4 h-4 animate-spin" /> {hasRxPhoto && transcript.trim() ? "Tallying voice + photo…" : hasRxPhoto ? "Reading prescription…" : "Extracting…"}</>
              : hasRxPhoto && transcript.trim()
                ? "✨ Tally voice + Rx photo"
                : hasRxPhoto
                  ? "✨ Read prescription photo"
                  : "✨ Extract patient info & clinical fields"}
          </button>

          {/* Patient identity */}
          {extracted && (
            <div className={`rounded-2xl border-2 p-4 ${phoneOk ? "bg-teal-50 border-[#0B9E7A]" : "bg-amber-50 border-amber-400"}`}>
              <div className="flex items-center gap-2 mb-3">
                {phoneOk
                  ? <CheckCircle2 className="w-4 h-4 text-[#0B9E7A] shrink-0" />
                  : <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />}
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#4B6358]">Patient Identity</div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <IdentityField label="Phone" value={fields.patientPhone}
                  onChange={(v) => setFields({ ...fields, patientPhone: v.replace(/\D/g, "").slice(0, 10) })}
                  placeholder="10 digits" warn={!phoneOk} inputMode="numeric" />
                <IdentityField label="Name" value={fields.patientName}
                  onChange={(v) => setFields({ ...fields, patientName: v })} placeholder="Patient name" />
                <IdentityField label="Age" value={fields.patientAge}
                  onChange={(v) => setFields({ ...fields, patientAge: v.replace(/\D/g, "") })}
                  placeholder="Years" inputMode="numeric" />
              </div>
              {!phoneOk && (
                <div className="text-[11px] text-amber-700 mt-2 font-medium">
                  Phone not found in transcript. Ask patient and type above.
                </div>
              )}
            </div>
          )}

          {/* Patient history banner */}
          {extracted && phoneOk && (
            lookingUp ? (
              <div className="flex items-center gap-2 text-[12px] text-[#8FA89F] bg-white border border-[#E2EAE7] rounded-xl px-3 py-2.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                Checking patient history…
              </div>
            ) : patientHistory ? (
              patientHistory.isNew ? (
                /* New patient */
                <div className="flex items-center gap-2.5 bg-blue-50 border border-blue-200 rounded-xl px-3.5 py-3">
                  <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                    <span className="text-[15px]">🆕</span>
                  </div>
                  <div>
                    <div className="text-[12px] font-semibold text-blue-700">New Patient</div>
                    <div className="text-[11px] text-blue-500">No previous records — first visit</div>
                  </div>
                </div>
              ) : (
                /* Returning patient */
                <div className="bg-white border-2 border-[#0B9E7A] rounded-2xl overflow-hidden">
                  <div className="flex items-center gap-2.5 bg-teal-50 px-3.5 py-2.5">
                    <div className="w-7 h-7 rounded-full bg-[#0B9E7A]/15 flex items-center justify-center shrink-0 text-base">
                      🔁
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-semibold text-[#0B9E7A]">Returning Patient</div>
                      <div className="text-[11px] text-[#4B6358]">
                        {patientHistory.totalNotes} visit{patientHistory.totalNotes !== 1 ? "s" : ""} on record
                        {patientHistory.patient.age ? ` · ${patientHistory.patient.age}y` : ""}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate(`/patients/${patientHistory.patient.id}`)}
                      className="text-[11px] font-semibold text-[#0B9E7A] bg-white border border-[#0B9E7A]/30 rounded-lg px-2.5 py-1 shrink-0"
                    >
                      Full history →
                    </button>
                  </div>

                  {patientHistory.lastNote && (
                    <div className="px-3.5 py-3 space-y-2">
                      <div className="text-[10px] font-semibold text-[#8FA89F] uppercase tracking-wider">
                        Last visit · {(() => {
                          const diff = Date.now() - new Date(patientHistory.lastNote.createdAt).getTime();
                          const d = Math.floor(diff / 86400000);
                          if (d === 0) return "today";
                          if (d === 1) return "yesterday";
                          return `${d} days ago`;
                        })()}
                      </div>

                      {/* Last diagnosis */}
                      {(() => {
                        const n = patientHistory.lastNote!;
                        const dx = n.diagnoses?.length > 0 ? n.diagnoses : n.diagnosis?.split(",").map(s => s.trim()).filter(Boolean) ?? [];
                        return dx.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {dx.slice(0, 3).map((d, i) => (
                              <span key={i} className="text-[11px] font-semibold bg-teal-50 text-[#0B9E7A] px-2 py-0.5 rounded-full">
                                {d}
                              </span>
                            ))}
                          </div>
                        ) : null;
                      })()}

                      {/* Last medications */}
                      {patientHistory.lastNote.medications?.length > 0 && (
                        <div className="text-[11px] text-[#4B6358] leading-relaxed">
                          <span className="font-semibold text-[#0F1C18]">Rx: </span>
                          {patientHistory.lastNote.medications.slice(0, 4).map((m, i) => (
                            <span key={i}>
                              {i > 0 && <span className="text-[#8FA89F]"> · </span>}
                              {m.name}{m.dose ? ` ${m.dose}` : ""}{m.frequency ? ` (${m.frequency})` : ""}
                            </span>
                          ))}
                          {patientHistory.lastNote.medications.length > 4 && (
                            <span className="text-[#8FA89F]"> +{patientHistory.lastNote.medications.length - 4} more</span>
                          )}
                        </div>
                      )}

                      {/* Last followup */}
                      {patientHistory.lastNote.followup && (
                        <div className="text-[11px] text-amber-700">
                          📅 Advised follow-up: {patientHistory.lastNote.followup}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            ) : null
          )}

          {/* Vitals */}
          {extracted && (
            <div className="grid grid-cols-3 gap-2">
              <VitalBox label="BP" value={fields.bp || "—"} />
              <VitalBox label="Temp °F" value={fields.temp || "—"} />
              <VitalBox label="SpO₂ %" value={fields.spo2 || "—"} />
            </div>
          )}

          {/* Diagnosis */}
          {extracted && (
            <div className="bg-white border border-[#E2EAE7] rounded-xl p-3">
              <div className="text-[11px] text-[#8FA89F] mb-1.5 font-medium">Diagnosis</div>
              <input type="text" value={fields.diagnosis}
                onChange={(e) => setFields({ ...fields, diagnosis: e.target.value })}
                placeholder="e.g. Viral fever, Hypertension"
                className="w-full text-sm font-semibold text-[#0F1C18] focus:outline-none placeholder:text-[#8FA89F]" />
            </div>
          )}

          {/* Medications table */}
          {extracted && (
            <div className="bg-white border border-[#E2EAE7] rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[11px] text-[#8FA89F] font-medium uppercase tracking-wider">Prescription</div>
                <button type="button"
                  onClick={() => setFields({ ...fields, medications: [...fields.medications, { ...EMPTY_MED }] })}
                  className="text-[11px] font-semibold text-[#0B9E7A] flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Add row
                </button>
              </div>
              {fields.medications.length === 0 ? (
                <div className="text-[12px] text-[#8FA89F] py-1">No medicines extracted. Tap Add row.</div>
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
                    <div key={i} className={`grid grid-cols-[1.6fr_1fr_1.1fr_0.9fr_24px] items-center text-[12px] ${i > 0 ? "border-t border-[#E2EAE7]" : ""}`}>
                      <input value={m.name} onChange={(e) => { const n = [...fields.medications]; n[i] = { ...n[i], name: e.target.value }; setFields({ ...fields, medications: n }); }}
                        placeholder="Drug" className="px-2 py-1.5 font-semibold text-[#0F1C18] focus:outline-none placeholder:text-[#8FA89F] min-w-0" />
                      <input value={m.dose} onChange={(e) => { const n = [...fields.medications]; n[i] = { ...n[i], dose: e.target.value }; setFields({ ...fields, medications: n }); }}
                        placeholder="500mg" className="px-1.5 py-1.5 text-[#4B6358] focus:outline-none placeholder:text-[#8FA89F] min-w-0" />
                      <input value={m.frequency} onChange={(e) => { const n = [...fields.medications]; n[i] = { ...n[i], frequency: e.target.value }; setFields({ ...fields, medications: n }); }}
                        placeholder="1-0-1" className="px-1.5 py-1.5 text-[#4B6358] focus:outline-none placeholder:text-[#8FA89F] min-w-0" />
                      <input value={m.duration} onChange={(e) => { const n = [...fields.medications]; n[i] = { ...n[i], duration: e.target.value }; setFields({ ...fields, medications: n }); }}
                        placeholder="5d" className="px-1.5 py-1.5 text-[#4B6358] focus:outline-none placeholder:text-[#8FA89F] min-w-0" />
                      <button type="button" onClick={() => setFields({ ...fields, medications: fields.medications.filter((_, idx) => idx !== i) })}
                        className="text-[#8FA89F] active:text-red-500 p-1">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Follow-up / admit */}
          {extracted && (
            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-white border border-[#E2EAE7] rounded-xl p-3">
                <div className="text-[11px] text-[#8FA89F] mb-1 font-medium">Follow-up</div>
                <input type="text" value={fields.followup} onChange={(e) => setFields({ ...fields, followup: e.target.value })}
                  placeholder="e.g. 3 days" className="w-full text-sm font-semibold text-[#0F1C18] focus:outline-none placeholder:text-[#8FA89F]" />
              </div>
              <div className="bg-white border border-[#E2EAE7] rounded-xl p-3">
                <div className="text-[11px] text-[#8FA89F] mb-1 font-medium">Admit?</div>
                <input type="text" value={fields.admit} onChange={(e) => setFields({ ...fields, admit: e.target.value })}
                  placeholder="No" className="w-full text-sm font-semibold text-[#0F1C18] focus:outline-none placeholder:text-[#8FA89F]" />
              </div>
            </div>
          )}

          {/* WhatsApp reminder toggle */}
          {showReminderToggle && !savedOk && (
            <button type="button"
              onClick={() => setSendReminders((v) => !v)}
              className={`w-full rounded-xl border-2 p-3.5 flex items-center gap-3 transition active:scale-[0.98] ${sendReminders ? "border-[#25D366] bg-[#25D366]/8" : "border-[#E2EAE7] bg-white"}`}>
              <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition ${sendReminders ? "border-[#25D366] bg-[#25D366]" : "border-[#8FA89F]"}`}>
                {sendReminders && <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              </div>
              <div className="flex-1 text-left">
                <div className={`text-sm font-semibold ${sendReminders ? "text-[#1a7a42]" : "text-[#0F1C18]"}`}>
                  Send WhatsApp medicine reminders
                </div>
                <div className="text-[11px] text-[#8FA89F] mt-0.5">
                  Sends silently in background — no WhatsApp window opens
                </div>
              </div>
              <WhatsAppIcon className={`w-5 h-5 shrink-0 ${sendReminders ? "text-[#25D366]" : "text-[#8FA89F]"}`} />
            </button>
          )}

          {/* WhatsApp send toast */}
          {waToast && (
            <div className={`text-[12px] font-semibold px-3 py-2.5 rounded-xl text-center ${waToast.startsWith("✓") ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
              {waToast}
            </div>
          )}

          {/* Save button */}
          {extracted && (
            <button type="button" onClick={() => void handleSave()}
              disabled={isSaving || (!transcript.trim() && !hasRxPhoto)}
              className={`w-full rounded-2xl py-4 text-base font-semibold transition flex items-center justify-center gap-2 ${savedOk ? "bg-emerald-600 text-white" : "bg-[#0B9E7A] text-white active:bg-[#077A5E] disabled:bg-[#E2EAE7] disabled:text-[#8FA89F]"}`}
              data-testid="button-save-emr">
              {savedOk
                ? (sendReminders ? "✓ Saved! Sending via WhatsApp…" : "✓ Saved to EMR!")
                : isSaving ? "Saving…"
                : "Save to EMR"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function VitalBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-[#E2EAE7] rounded-xl p-3 text-center">
      <div className="text-base font-semibold text-[#0F1C18]">{value}</div>
      <div className="text-[10px] text-[#8FA89F] mt-0.5">{label}</div>
    </div>
  );
}

function IdentityField({ label, value, onChange, placeholder, warn, inputMode }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; warn?: boolean; inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <div className={`bg-white rounded-xl border p-2.5 ${warn ? "border-amber-400" : "border-[#E2EAE7]"}`}>
      <div className="text-[10px] text-[#8FA89F] font-semibold mb-1">{label}</div>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} inputMode={inputMode}
        className="w-full text-[13px] font-semibold text-[#0F1C18] focus:outline-none placeholder:text-[#C5D4CF] placeholder:font-normal min-w-0" />
    </div>
  );
}
