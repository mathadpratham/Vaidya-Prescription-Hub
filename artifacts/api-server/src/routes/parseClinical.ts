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
- diagnosis: short diagnosis or impression, e.g. "Viral fever", "Suspected NSTEMI". Empty if not mentioned.
- prescription: short summary of medicines prescribed (drug + dose + frequency comma-separated), e.g. "Paracetamol 500mg TDS, Cetirizine 10mg HS". Empty if no medicines.
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
            diagnosis: { type: Type.STRING },
            prescription: { type: Type.STRING },
            followup: { type: Type.STRING },
            admit: { type: Type.STRING },
          },
          required: [
            "bp",
            "temp",
            "spo2",
            "diagnosis",
            "prescription",
            "followup",
            "admit",
          ],
          propertyOrdering: [
            "bp",
            "temp",
            "spo2",
            "diagnosis",
            "prescription",
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

    return res.json({
      fields: {
        bp: safe("bp"),
        temp: safe("temp"),
        spo2: safe("spo2"),
        diagnosis: safe("diagnosis"),
        prescription: safe("prescription"),
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
