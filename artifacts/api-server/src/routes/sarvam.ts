import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const ALLOWED_LANGUAGES = new Set([
  "unknown",
  "en-IN",
  "hi-IN",
  "kn-IN",
  "ta-IN",
  "te-IN",
  "ml-IN",
  "mr-IN",
  "gu-IN",
  "bn-IN",
  "pa-IN",
  "od-IN",
]);

router.post(
  "/sarvam/transcribe",
  upload.single("file"),
  async (req: Request, res: Response) => {
    const apiKey = process.env["SARVAM_API_KEY"];
    if (!apiKey) {
      req.log.error("SARVAM_API_KEY is not configured");
      return res
        .status(500)
        .json({ error: "Server is missing SARVAM_API_KEY" });
    }

    if (!req.file) {
      return res
        .status(400)
        .json({ error: "Audio file is required (field name: 'file')" });
    }

    const requestedLanguage =
      typeof req.body?.language_code === "string"
        ? req.body.language_code
        : "unknown";
    const language_code = ALLOWED_LANGUAGES.has(requestedLanguage)
      ? requestedLanguage
      : "unknown";

    const model =
      typeof req.body?.model === "string" && req.body.model.length > 0
        ? req.body.model
        : "saarika:v2.5";

    try {
      const filename = req.file.originalname || "recording.webm";
      const mimeType = req.file.mimetype || "audio/webm";
      const audioBlob = new Blob([new Uint8Array(req.file.buffer)], {
        type: mimeType,
      });

      const form = new FormData();
      form.append("file", audioBlob, filename);
      form.append("language_code", language_code);
      form.append("model", model);

      const sarvamResponse = await fetch(
        "https://api.sarvam.ai/speech-to-text",
        {
          method: "POST",
          headers: {
            "api-subscription-key": apiKey,
          },
          body: form,
        },
      );

      const responseText = await sarvamResponse.text();

      if (!sarvamResponse.ok) {
        req.log.error(
          { status: sarvamResponse.status, body: responseText },
          "Sarvam API returned an error",
        );
        let friendly = "Sarvam API request failed";
        try {
          const errJson = JSON.parse(responseText) as {
            error?: { message?: string; code?: string };
          };
          if (errJson?.error?.message) {
            friendly = errJson.error.message;
          }
        } catch {
          // keep default
        }
        return res.status(sarvamResponse.status).json({
          error: friendly,
          status: sarvamResponse.status,
          details: responseText,
        });
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(responseText);
      } catch {
        req.log.error(
          { body: responseText },
          "Sarvam API returned non-JSON response",
        );
        return res
          .status(502)
          .json({ error: "Invalid response from Sarvam API" });
      }

      const data = parsed as {
        transcript?: string;
        language_code?: string;
        request_id?: string;
      };

      return res.json({
        transcript: data.transcript ?? "",
        language_code: data.language_code ?? language_code,
        request_id: data.request_id ?? null,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to call Sarvam API");
      return res
        .status(500)
        .json({ error: "Failed to call Sarvam API" });
    }
  },
);

export default router;
