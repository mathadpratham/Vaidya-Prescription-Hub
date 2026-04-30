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
You will receive a free-form consultation transcript that may be in Hindi, Kannada, English, or a mix (Hinglish, Devanagari, Roman script). The doctor is dictating a prescription.

Your job: extract a structured list of medicines. For each medicine return:
- name (string, English brand or generic name; transliterate from Devanagari/Kannada to English)
- dosage (e.g. "500 mg", "10 ml", "1 tab")
- frequency (e.g. "BD", "TDS", "1-0-1", "twice a day")
- timing (e.g. "after food", "before food", "at bedtime")
- duration (e.g. "5 days", "1 week")
- notes (anything extra, like "if fever persists", "SOS")

If a field is not mentioned, leave it as an empty string. Do not invent medicines.
If no medicines are mentioned, return an empty array.
Output ONLY valid JSON matching the provided schema.`;

router.post("/parse-prescription", async (req: Request, res: Response) => {
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
        maxOutputTokens: 8192,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            medicines: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  dosage: { type: Type.STRING },
                  frequency: { type: Type.STRING },
                  timing: { type: Type.STRING },
                  duration: { type: Type.STRING },
                  notes: { type: Type.STRING },
                },
                required: [
                  "name",
                  "dosage",
                  "frequency",
                  "timing",
                  "duration",
                  "notes",
                ],
                propertyOrdering: [
                  "name",
                  "dosage",
                  "frequency",
                  "timing",
                  "duration",
                  "notes",
                ],
              },
            },
          },
          required: ["medicines"],
        },
      },
    });

    const text = response.text ?? "";
    let parsed: { medicines?: unknown } = {};
    try {
      parsed = JSON.parse(text) as { medicines?: unknown };
    } catch (parseErr) {
      req.log.error(
        { text, err: parseErr },
        "Gemini returned non-JSON response",
      );
      return res
        .status(502)
        .json({ error: "AI returned an invalid response", raw: text });
    }

    const medicines = Array.isArray(parsed.medicines) ? parsed.medicines : [];
    return res.json({ medicines });
  } catch (err) {
    req.log.error({ err }, "Gemini parse-prescription failed");
    const message =
      err instanceof Error ? err.message : "Unknown AI error";
    return res.status(500).json({ error: message });
  }
});

export default router;
