import { useState, useRef } from "react";
import { Logo } from "@/components/Logo";
import { MicButton } from "@/components/MicButton";
import { parsePrescription, Medicine } from "@/lib/prescriptionParser";
import { generatePrescriptionPDF } from "@/lib/pdfGenerator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Download, Stethoscope, AlertCircle } from "lucide-react";

type LanguageCode = "unknown" | "en-IN" | "hi-IN" | "kn-IN";

const LANGUAGE_OPTIONS: { value: LanguageCode; label: string }[] = [
  { value: "unknown", label: "Auto-detect / स्वचालित" },
  { value: "en-IN", label: "English (India)" },
  { value: "hi-IN", label: "Hindi / हिन्दी" },
  { value: "kn-IN", label: "Kannada / ಕನ್ನಡ" },
];

export default function Home() {
  const [patientName, setPatientName] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [patientGender, setPatientGender] = useState("");

  const [language, setLanguage] = useState<LanguageCode>("unknown");
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [detectedLanguage, setDetectedLanguage] = useState<string>("");

  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [showPrescription, setShowPrescription] = useState(false);
  const [isParsing, setIsParsing] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const rotateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isStoppingRef = useRef(false);
  const pendingTranscriptionsRef = useRef(0);

  const SEGMENT_MS = 25_000;
  const apiBase = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

  const stopMediaTracks = () => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
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
      const extension = mimeType.includes("mp4")
        ? "m4a"
        : mimeType.includes("ogg")
          ? "ogg"
          : mimeType.includes("wav")
            ? "wav"
            : "webm";

      const formData = new FormData();
      formData.append("file", audioBlob, `recording.${extension}`);
      formData.append("language_code", language);

      const response = await fetch(`${apiBase}/sarvam/transcribe`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        let friendly = `Sarvam transcription failed (${response.status})`;
        try {
          const errJson = (await response.json()) as { error?: string };
          if (errJson?.error) friendly = errJson.error;
        } catch {
          // ignore
        }
        throw new Error(friendly);
      }

      const data: { transcript?: string; language_code?: string } =
        await response.json();
      const newText = (data.transcript ?? "").trim();
      if (data.language_code) {
        setDetectedLanguage(data.language_code);
      }
      if (newText) {
        setTranscript((prev) => (prev ? `${prev} ${newText}` : newText));
      }
    } catch (err) {
      console.error(err);
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Transcription mein error aaya / त्रुटि",
      );
    } finally {
      pendingTranscriptionsRef.current = Math.max(
        0,
        pendingTranscriptionsRef.current - 1,
      );
      if (pendingTranscriptionsRef.current === 0) {
        setIsTranscribing(false);
      }
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
    const recorder = supportedType
      ? new MediaRecorder(stream, { mimeType: supportedType })
      : new MediaRecorder(stream);

    audioChunksRef.current = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunksRef.current.push(event.data);
      }
    };

    recorder.onstop = () => {
      const mimeType = recorder.mimeType || "audio/webm";
      const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
      audioChunksRef.current = [];

      if (audioBlob.size > 0) {
        onSegmentReady(audioBlob, mimeType);
      }

      if (isStoppingRef.current) {
        onFinalSegment();
      }
    };

    recorder.onerror = (event) => {
      console.error("MediaRecorder error", event);
      setErrorMessage("Recording mein error aaya / रिकॉर्डिंग में त्रुटि");
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

      // Stop current recorder; its onstop will dispatch the segment
      // Then immediately start a fresh recorder on the same stream.
      current.stop();

      const next = buildRecorder(
        stream,
        (blob, mime) => {
          void sendAudioToSarvam(blob, mime);
        },
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

  const startRecording = async () => {
    setErrorMessage("");

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setErrorMessage(
        "Aapka browser microphone support nahi karta. / माइक्रोफ़ोन सपोर्ट नहीं है",
      );
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

      const recorder = buildRecorder(
        stream,
        (blob, mime) => {
          void sendAudioToSarvam(blob, mime);
        },
        () => {
          stopMediaTracks();
          setIsRecording(false);
        },
      );
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setShowPrescription(false);
      scheduleRotation();
    } catch (err) {
      console.error(err);
      setErrorMessage(
        "Microphone access denied. Please allow mic permission. / माइक की अनुमति दें",
      );
      stopMediaTracks();
    }
  };

  const stopRecording = () => {
    isStoppingRef.current = true;
    clearRotateTimer();
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    } else {
      stopMediaTracks();
      setIsRecording(false);
    }
  };

  const toggleRecording = () => {
    if (isTranscribing) return;
    if (isRecording) {
      stopRecording();
    } else {
      void startRecording();
    }
  };

  const handleGenerate = async () => {
    if (!transcript) return;
    setErrorMessage("");
    setIsParsing(true);
    try {
      const response = await fetch(`${apiBase}/parse-prescription`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });

      if (!response.ok) {
        let friendly = `Prescription parsing failed (${response.status})`;
        try {
          const errJson = (await response.json()) as { error?: string };
          if (errJson?.error) friendly = errJson.error;
        } catch {
          // ignore
        }
        throw new Error(friendly);
      }

      const data = (await response.json()) as { medicines?: Medicine[] };
      const aiMedicines = Array.isArray(data.medicines) ? data.medicines : [];

      if (aiMedicines.length === 0) {
        // Fall back to regex parser if AI found nothing
        const fallback = parsePrescription(transcript);
        setMedicines(fallback);
        if (fallback.length === 0) {
          setErrorMessage(
            "Koi dawai nahi mili transcript mein / कोई दवाई नहीं मिली",
          );
        }
      } else {
        setMedicines(aiMedicines);
      }
      setShowPrescription(true);
    } catch (err) {
      console.error(err);
      // Fall back to regex parser on error so user is not blocked
      const fallback = parsePrescription(transcript);
      setMedicines(fallback);
      setShowPrescription(true);
      setErrorMessage(
        err instanceof Error
          ? `${err.message} — using basic parser fallback`
          : "Prescription parse mein error / त्रुटि",
      );
    } finally {
      setIsParsing(false);
    }
  };

  const handleDownload = () => {
    generatePrescriptionPDF(
      {
        name: patientName,
        age: patientAge,
        gender: patientGender,
      },
      medicines,
    );
  };

  return (
    <div className="min-h-[100dvh] bg-background text-foreground pb-20">
      <div className="max-w-md mx-auto px-4 py-8 space-y-8">
        <header className="pt-4">
          <Logo />
        </header>

        {errorMessage && (
          <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg flex items-start space-x-2">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p>{errorMessage}</p>
          </div>
        )}

        <div className="space-y-4 bg-card p-4 rounded-2xl border shadow-sm">
          <div>
            <Label htmlFor="name" className="text-muted-foreground mb-1 block">
              Patient Name
            </Label>
            <Input
              id="name"
              placeholder="Patient ka naam likhein / मरीज़ का नाम"
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              className="text-lg py-6"
            />
          </div>
          <div className="flex space-x-3">
            <div className="flex-1">
              <Input
                placeholder="Age (Varsh)"
                value={patientAge}
                onChange={(e) => setPatientAge(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <Input
                placeholder="Gender"
                value={patientGender}
                onChange={(e) => setPatientGender(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label
              htmlFor="language"
              className="text-muted-foreground mb-1 block"
            >
              Speech language / भाषा
            </Label>
            <select
              id="language"
              value={language}
              onChange={(e) => setLanguage(e.target.value as LanguageCode)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <MicButton
          isRecording={isRecording}
          isTranscribing={isTranscribing}
          onClick={toggleRecording}
        />

        <div className="space-y-2 relative">
          <div className="flex items-center justify-between">
            <Label className="text-muted-foreground font-medium">
              Consultation Transcript
            </Label>
            {detectedLanguage && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                Heard:{" "}
                {LANGUAGE_OPTIONS.find((o) => o.value === detectedLanguage)
                  ?.label ?? detectedLanguage}
              </span>
            )}
          </div>
          <Textarea
            className="min-h-[140px] text-base resize-none p-4 rounded-xl shadow-sm border-muted focus-visible:ring-primary/20"
            placeholder="Aapki awaaz yahan dikhegi… 'Rohit ko Paracetamol 500mg do baar khaane ke baad dena hai' / यहाँ बोला हुआ टेक्स्ट आएगा"
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
          />
        </div>

        <Button
          className="w-full py-6 text-lg rounded-xl shadow-md font-medium"
          onClick={() => void handleGenerate()}
          disabled={!transcript || isParsing}
        >
          {isParsing
            ? "Soch raha hoon... / सोच रहा हूँ..."
            : "Prescription banayein / प्रिस्क्रिप्शन बनाएं"}
        </Button>

        {showPrescription && (
          <Card className="mt-8 border-primary/20 shadow-lg overflow-hidden animate-in slide-in-from-bottom-4">
            <div className="bg-primary p-4 text-primary-foreground flex justify-between items-center">
              <div className="font-serif font-bold text-xl flex items-center gap-2">
                <Stethoscope className="w-5 h-5" />
                VaidyaOS
              </div>
              <div className="text-sm font-medium opacity-90">Digital Rx</div>
            </div>
            <CardHeader className="bg-muted/30 pb-4">
              <CardTitle className="text-lg flex justify-between">
                <span>{patientName || "Patient Name"}</span>
                <span className="text-sm font-normal text-muted-foreground">
                  {new Date().toLocaleDateString("en-IN")}
                </span>
              </CardTitle>
              {(patientAge || patientGender) && (
                <div className="text-sm text-muted-foreground">
                  {patientAge && `Age: ${patientAge} `}
                  {patientGender && `| ${patientGender}`}
                </div>
              )}
            </CardHeader>
            <CardContent className="pt-6">
              <div className="text-3xl font-serif text-primary italic mb-6">
                Rx
              </div>

              {medicines.length > 0 ? (
                <div className="space-y-6">
                  {medicines.map((med, idx) => (
                    <div
                      key={idx}
                      className="flex gap-4 border-b border-border/50 pb-4 last:border-0"
                    >
                      <div className="font-bold text-muted-foreground">
                        {idx + 1}.
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="font-bold text-lg">
                          {med.name || "Unknown Medicine"}{" "}
                          {med.dosage && (
                            <span className="text-sm font-medium text-muted-foreground ml-2">
                              {med.dosage}
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                          {med.frequency && (
                            <span>
                              <span className="font-medium text-foreground">
                                Freq:
                              </span>{" "}
                              {med.frequency}
                            </span>
                          )}
                          {med.timing && (
                            <span>
                              <span className="font-medium text-foreground">
                                When:
                              </span>{" "}
                              {med.timing}
                            </span>
                          )}
                          {med.duration && (
                            <span>
                              <span className="font-medium text-foreground">
                                For:
                              </span>{" "}
                              {med.duration}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground">
                  Kuch saaf samajh nahi aaya — transcription edit karke dobara
                  try karein / कुछ साफ़ नहीं समझा
                </div>
              )}
            </CardContent>
            <CardFooter className="bg-muted/10 pt-4 flex justify-between items-end border-t">
              <div className="w-32 border-b border-black/20 pb-1 text-center text-sm text-muted-foreground">
                Doctor's Signature
              </div>
              <Button onClick={handleDownload} className="gap-2">
                <Download className="w-4 h-4" />
                PDF download karein
              </Button>
            </CardFooter>
          </Card>
        )}
      </div>
    </div>
  );
}
