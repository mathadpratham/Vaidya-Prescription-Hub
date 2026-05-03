import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";

const router: IRouter = Router();

const sendSchema = z.object({
  phone: z.string().min(10),
  message: z.string().min(1),
});

router.post("/whatsapp/send", async (req: Request, res: Response) => {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    res.json({ success: false, noApiKey: true });
    return;
  }

  const parsed = sendSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "phone and message are required" });
    return;
  }

  const digits = parsed.data.phone.replace(/\D/g, "");
  const to = digits.startsWith("91") ? digits : `91${digits}`;

  try {
    const metaRes = await fetch(
      `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { preview_url: false, body: parsed.data.message },
        }),
      },
    );

    const body = (await metaRes.json()) as {
      messages?: { id: string }[];
      error?: { message: string };
    };

    if (!metaRes.ok) {
      req.log.error({ body }, "Meta WhatsApp API error");
      res.status(502).json({
        success: false,
        error: body.error?.message ?? "WhatsApp API error",
      });
      return;
    }

    res.json({ success: true, messageId: body.messages?.[0]?.id });
  } catch (err) {
    req.log.error({ err }, "WhatsApp send failed");
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

export default router;
