import { Router, type IRouter, type Request, type Response } from "express";
import { GoogleGenAI, Type } from "@google/genai";

const router: IRouter = Router();

const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;

const ai =
  baseUrl && apiKey
    ? new GoogleGenAI({
        apiKey,
        httpOptions: { apiVersion: "", baseUrl },
      })
    : null;


type IncomingPhoto = {
  data: string;
  mimeType: string;
  type: "prescription" | "clinical";
};

function buildSystemInstruction(hasTranscript: boolean, hasPrescriptionPhoto: boolean): string {
  const base = `You are a medical scribe assistant for Indian doctors.
Extract the following structured fields. If a field is not mentioned, return an empty string. Do not invent information.

- bp: blood pressure as "systolic/diastolic" e.g. "120/80". Empty if not mentioned.
- temp: temperature in Fahrenheit as a number string e.g. "102.4". Convert from Celsius if needed. Empty if not mentioned.
- spo2: SpO2 percentage as a number string e.g. "98". Empty if not mentioned.
- patientPhone: 10-digit Indian mobile number (digits only). Empty if not mentioned.
- patientName: full name of the patient. Empty if not mentioned.
- patientAge: age as a number string e.g. "45". Empty if not mentioned.
- diagnosis: short diagnosis e.g. "Viral fever". Empty if not mentioned.
- diagnoses: array of distinct diagnoses. Empty array if none.
- prescription: short summary of medicines (drug + dose + frequency comma-separated). Empty if none.
- medications: array of medicines with name, dose, frequency (use "1-0-1" style), duration. Empty array if none.
- followup: follow-up duration e.g. "3 days". Empty if not mentioned.
- admit: "Yes" if admission recommended, otherwise "No".

Output ONLY valid JSON matching the provided schema.`;

  if (hasTranscript && hasPrescriptionPhoto) {
    return `${base}

TASK: Produce one final, complete digital prescription by tallying ALL information from BOTH the voice transcript AND the handwritten prescription image. Follow these rules strictly:

PATIENT DETAILS (name, phone, age):
- Phone number: take from the voice transcript (patients usually tell it verbally).
- Patient name: the doctor may NOT say the name aloud but may write it on the prescription — check BOTH sources and use whichever has it. If both have a name, prefer the written one (more precise spelling).
- Age: same — check both and use the clearest value.

VITALS (BP, Temp, SpO2): primarily from the voice transcript.

DIAGNOSES:
- Combine diagnoses from BOTH sources. Include any diagnosis written on the prescription even if not spoken.

MEDICATIONS — this is the most critical part:
- Do a FULL UNION of all drugs from BOTH sources. Never drop a medicine.
- If a drug appears ONLY in the prescription image: include it with the dose/frequency from the image.
- If a drug appears ONLY in the transcript: include it with the dose/frequency from the transcript.
- If a drug appears in BOTH: merge into one entry — use the written prescription for the exact drug name spelling, dose, and frequency (written is more precise); use the transcript for any extra context (like duration if not written).
- Watch for the same drug written differently (e.g. "Paracetamol" vs "PCM" vs "Crocin") — deduplicate intelligently.

FOLLOW-UP: take from either source; prefer the more specific instruction.

Output one final, unified, complete digital prescription JSON.`;
  }
  if (!hasTranscript && hasPrescriptionPhoto) {
    return `${base}

You are reading a HANDWRITTEN PRESCRIPTION IMAGE (no voice transcript available).
Extract ALL fields visible in the prescription — patient name, age, phone if written, diagnoses, every medicine with its dose and frequency, and follow-up instructions.
Indian handwritten prescriptions often use abbreviations: BD=twice daily (1-0-1), TDS=thrice (1-1-1), OD=once daily (1-0-0), HS=night only (0-0-1), SOS=as needed.
Transcribe drug names exactly as written. If a field is not visible, leave it empty.`;
  }
  return `${base}

You will receive a free-form clinical consultation transcript that may be in Hindi, Kannada, English, or a mix (Hinglish, Devanagari, Roman script).
Extract all fields. The doctor speaks to the patient and may mention name, phone, age, complaints, diagnosis, and medicines during the consultation.`;
}

router.post("/parse-clinical", async (req: Request, res: Response) => {
  const transcript: unknown = req.body?.transcript;
  const photosRaw: unknown = req.body?.photos;

  const transcriptText = typeof transcript === "string" ? transcript.trim() : "";
  const photos: IncomingPhoto[] = Array.isArray(photosRaw)
    ? (photosRaw as IncomingPhoto[]).filter(
        (p) => p && typeof p.data === "string" && typeof p.mimeType === "string",
      )
    : [];

  const prescriptionPhotos = photos.filter((p) => p.type === "prescription");
  const hasTranscript = transcriptText.length > 0;
  const hasPrescriptionPhoto = prescriptionPhotos.length > 0;

  if (!hasTranscript && !hasPrescriptionPhoto) {
    return res.status(400).json({ error: "transcript or prescription photo is required" });
  }

  if (!ai) {
    return res.status(500).json({
      error:
        "Gemini AI is not configured. AI_INTEGRATIONS_GEMINI_BASE_URL or AI_INTEGRATIONS_GEMINI_API_KEY missing.",
    });
  }

  try {
    const userParts: { text?: string; inlineData?: { mimeType: string; data: string } }[] = [];

    if (hasTranscript) {
      userParts.push({ text: `Voice Transcript:\n${transcriptText}` });
    }
    for (const photo of prescriptionPhotos) {
      userParts.push({
        inlineData: { mimeType: photo.mimeType, data: photo.data },
      });
    }
    if (!hasTranscript && hasPrescriptionPhoto) {
      userParts.push({ text: "Extract all prescription fields from the image above." });
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: userParts,
        },
      ],
      config: {
        systemInstruction: buildSystemInstruction(hasTranscript, hasPrescriptionPhoto),
        responseMimeType: "application/json",
        maxOutputTokens: 2048,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            bp: { type: Type.STRING },
            temp: { type: Type.STRING },
            spo2: { type: Type.STRING },
            patientPhone: { type: Type.STRING },
            patientName: { type: Type.STRING },
            patientAge: { type: Type.STRING },
            diagnosis: { type: Type.STRING },
            diagnoses: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            prescription: { type: Type.STRING },
            medications: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  dose: { type: Type.STRING },
                  frequency: { type: Type.STRING },
                  duration: { type: Type.STRING },
                },
                required: ["name", "dose", "frequency", "duration"],
                propertyOrdering: ["name", "dose", "frequency", "duration"],
              },
            },
            followup: { type: Type.STRING },
            admit: { type: Type.STRING },
          },
          required: [
            "bp",
            "temp",
            "spo2",
            "patientPhone",
            "patientName",
            "patientAge",
            "diagnosis",
            "diagnoses",
            "prescription",
            "medications",
            "followup",
            "admit",
          ],
          propertyOrdering: [
            "bp",
            "temp",
            "spo2",
            "patientPhone",
            "patientName",
            "patientAge",
            "diagnosis",
            "diagnoses",
            "prescription",
            "medications",
            "followup",
            "admit",
          ],
        },
      },
    });

    const text = response.text ?? "";
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch (parseErr) {
      req.log.error(
        { text, err: parseErr },
        "Gemini returned non-JSON response",
      );
      return res
        .status(502)
        .json({ error: "AI returned an invalid response", raw: text });
    }

    const safe = (k: string) =>
      typeof parsed[k] === "string" ? (parsed[k] as string) : "";

    const diagnosesRaw = parsed.diagnoses;
    const diagnoses: string[] = Array.isArray(diagnosesRaw)
      ? diagnosesRaw
          .filter((v): v is string => typeof v === "string")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    const medicationsRaw = parsed.medications;
    const medications = Array.isArray(medicationsRaw)
      ? medicationsRaw
          .map((m) => {
            const obj = (m ?? {}) as Record<string, unknown>;
            const str = (k: string) =>
              typeof obj[k] === "string" ? (obj[k] as string) : "";
            return {
              name: str("name").trim(),
              dose: str("dose").trim(),
              frequency: str("frequency").trim(),
              duration: str("duration").trim(),
            };
          })
          .filter((m) => m.name)
      : [];

    return res.json({
      fields: {
        bp: safe("bp"),
        temp: safe("temp"),
        spo2: safe("spo2"),
        patientPhone: safe("patientPhone").replace(/\D/g, "").slice(-10),
        patientName: safe("patientName"),
        patientAge: safe("patientAge"),
        diagnosis: safe("diagnosis"),
        diagnoses,
        prescription: safe("prescription"),
        medications,
        followup: safe("followup"),
        admit: safe("admit") || "No",
      },
    });
  } catch (err) {
    req.log.error({ err }, "Gemini parse-clinical failed");
    const message = err instanceof Error ? err.message : "Unknown AI error";
    return res.status(500).json({ error: message });
  }
});

export default router;
