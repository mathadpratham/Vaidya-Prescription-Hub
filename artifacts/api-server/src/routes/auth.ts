import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, doctorsTable } from "@workspace/db";

const router: IRouter = Router();

const registerSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  phone: z
    .string()
    .trim()
    .regex(/^\d{10}$/, "Enter 10-digit mobile number"),
});

const loginSchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(/^\d{10}$/, "Enter 10-digit mobile number"),
});

router.post("/auth/register", async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: parsed.error.issues[0]?.message ?? "Invalid data" });
  }
  try {
    const [existing] = await db
      .select()
      .from(doctorsTable)
      .where(eq(doctorsTable.phone, parsed.data.phone))
      .limit(1);
    if (existing) {
      req.session.doctorId = existing.id;
      req.session.doctorName = existing.name;
      req.session.doctorPhone = existing.phone;
      return res.json({ doctor: existing });
    }
    const [doctor] = await db
      .insert(doctorsTable)
      .values({ name: parsed.data.name, phone: parsed.data.phone })
      .returning();
    req.session.doctorId = doctor.id;
    req.session.doctorName = doctor.name;
    req.session.doctorPhone = doctor.phone;
    return res.status(201).json({ doctor });
  } catch (err) {
    req.log.error({ err }, "auth/register failed");
    return res.status(500).json({ error: "Failed to register" });
  }
});

router.post("/auth/login", async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: parsed.error.issues[0]?.message ?? "Invalid data" });
  }
  try {
    const [doctor] = await db
      .select()
      .from(doctorsTable)
      .where(eq(doctorsTable.phone, parsed.data.phone))
      .limit(1);
    if (!doctor) {
      return res
        .status(404)
        .json({ error: "No account found. Please sign up first." });
    }
    req.session.doctorId = doctor.id;
    req.session.doctorName = doctor.name;
    req.session.doctorPhone = doctor.phone;
    return res.json({ doctor });
  } catch (err) {
    req.log.error({ err }, "auth/login failed");
    return res.status(500).json({ error: "Failed to login" });
  }
});

router.get("/auth/me", (req: Request, res: Response) => {
  if (!req.session.doctorId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  return res.json({
    doctor: {
      id: req.session.doctorId,
      name: req.session.doctorName,
      phone: req.session.doctorPhone,
    },
  });
});

router.post("/auth/logout", (req: Request, res: Response) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

export default router;
