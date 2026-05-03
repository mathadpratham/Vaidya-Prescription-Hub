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

const SYSTEM_INSTRUCTION = `You are a medical scribe assistant for Indian doctors.
You will receive a free-form clinical consultation transcript that may be in Hindi, Kannada, English, or a mix (Hinglish, Devanagari, Roman script).

Extract the following structured fields from the transcript. If a field is not mentioned, return an empty string. Do not invent information.

- bp: blood pressure as "systolic/diastolic" e.g. "120/80". Empty if not mentioned.
- temp: temperature in Fahrenheit as a number string e.g. "102.4". Convert from Celsius if needed (C * 9/5 + 32). Empty if not mentioned.
- spo2: SpO2 percentage as a number string e.g. "98". Empty if not mentioned.
- patientPhone: 10-digit Indian mobile number of the patient as spoken (digits only, no spaces or dashes, e.g. "9876543210"). Empty if not mentioned.
- patientName: full name of the patient as spoken during the consultation (e.g. "Suresh Kumar"). Empty if not mentioned.
- patientAge: age of the patient as a number string (e.g. "45"). Empty if not mentioned.
- diagnosis: short diagnosis or impression, e.g. "Viral fever", "Suspected NSTEMI". Empty if not mentioned.
- diagnoses: array of distinct diagnoses, each a short string. Empty array if none.
- prescription: short summary of medicines prescribed (drug + dose + frequency comma-separated), e.g. "Paracetamol 500mg TDS, Cetirizine 10mg HS". Empty if no medicines. (Kept for backward compatibility — also fill medications below.)
- medications: array of medicines. For each medicine return:
    - name: drug name (e.g. "Paracetamol", "Amoxicillin")
    - dose: strength + unit (e.g. "500mg", "10ml", "5mg/kg")
    - frequency: dosing schedule, expanded plainly (e.g. "1-0-1" for morning-noon-night, "TDS" → "1-1-1", "BD" → "1-0-1", "OD" → "1-0-0", "HS" → "0-0-1", "SOS" → "as needed"). Use "1-0-1" style when possible.
    - duration: how many days/weeks (e.g. "5 days", "2 weeks", "ongoing"). Empty string if not mentioned.
  Empty array if no medicines.
- followup: follow-up duration or instruction, e.g. "3 days", "2 weeks", "as needed". Empty if not mentioned.
- admit: "Yes" if admission is recommended, otherwise "No".

Output ONLY valid JSON matching the provided schema.`;

router.post("/parse-clinical", async (req: Request, res: Response) => {
  const transcript: unknown = req.body?.transcript;
  if (typeof transcript !== "string" || !transcript.trim()) {
    return res.status(400).json({ error: "transcript is required" });
  }

  if (!ai) {
    return res.status(500).json({
      error:
        "Gemini AI is not configured. AI_INTEGRATIONS_GEMINI_BASE_URL or AI_INTEGRATIONS_GEMINI_API_KEY missing.",
    });
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [{ text: `Transcript:\n${transcript}` }],
        },
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
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
