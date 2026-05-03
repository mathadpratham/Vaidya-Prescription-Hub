import { Router, type IRouter } from "express";
import { z } from "zod";
import { eq, desc, sql } from "drizzle-orm";
import { db, patientsTable, clinicalNotesTable } from "@workspace/db";

const router: IRouter = Router();

const PALETTE = ["#0B9E7A", "#2563EB", "#7C3AED", "#DC2626", "#D97706"];
const BEDS = ["B-3", "B-6", "B-8", "B-9", "B-12", "B-14"];

async function nextPatientId() {
  const rows = await db
    .select({ id: patientsTable.id })
    .from(patientsTable)
    .orderBy(desc(patientsTable.createdAt));
  const seq = rows.length + 1;
  return `PID-${String(100 + seq).padStart(3, "0")}`;
}

async function nextPalette() {
  const rows = await db
    .select({ id: patientsTable.id })
    .from(patientsTable);
  const idx = rows.length;
  return {
    color: PALETTE[idx % PALETTE.length],
    bed: BEDS[idx % BEDS.length],
  };
}

const medicationSchema = z.object({
  name: z.string().trim().min(1),
  dose: z.string().trim().default(""),
  frequency: z.string().trim().default(""),
  duration: z.string().trim().default(""),
});

const newNoteSchema = z.object({
  doctorName: z.string().trim().optional(),
  transcript: z.string().optional(),
  bp: z.string().optional(),
  temp: z.string().optional(),
  spo2: z.string().optional(),
  diagnosis: z.string().optional(),
  diagnoses: z.array(z.string().trim().min(1)).optional(),
  prescription: z.string().optional(),
  medications: z.array(medicationSchema).optional(),
  followup: z.string().optional(),
  admit: z.string().optional(),
  patientName: z.string().trim().optional(),
  patientAge: z.coerce.number().int().min(0).max(150).optional(),
});

const patchPatientSchema = z.object({
  name: z.string().trim().min(1).optional(),
  age: z.coerce.number().int().min(0).max(150).optional(),
  gender: z.enum(["Male", "Female", "Other"]).optional(),
  department: z.string().trim().optional(),
  complaint: z.string().trim().optional(),
  phone: z.string().trim().optional(),
});

// Phone-based lookup — creates patient if not found
router.post("/patients/lookup", async (req, res) => {
  const phone = String(req.body?.phone ?? "").trim().replace(/\D/g, "");
  if (!phone || phone.length < 10) {
    res.status(400).json({ error: "Valid 10-digit phone number required" });
    return;
  }
  try {
    const [existing] = await db
      .select()
      .from(patientsTable)
      .where(eq(patientsTable.phone, phone))
      .limit(1);
    if (existing) {
      res.json({ patient: existing, isNew: false });
      return;
    }
    const id = await nextPatientId();
    const { color, bed } = await nextPalette();
    const [created] = await db
      .insert(patientsTable)
      .values({ id, phone, name: "Patient", tag: "new", bed, color })
      .returning();
    res.status(201).json({ patient: created, isNew: true });
  } catch (err) {
    req.log.error({ err }, "Failed to lookup patient");
    res.status(500).json({ error: "Failed to lookup patient" });
  }
});

router.get("/patients", async (req, res) => {
  try {
    const all = await db
      .select()
      .from(patientsTable)
      .orderBy(desc(patientsTable.createdAt));
    res.json({ patients: all });
  } catch (err) {
    req.log.error({ err }, "Failed to list patients");
    res.status(500).json({ error: "Failed to list patients" });
  }
});

router.get("/patients/:id", async (req, res) => {
  try {
    const [patient] = await db
      .select()
      .from(patientsTable)
      .where(eq(patientsTable.id, req.params.id))
      .limit(1);
    if (!patient) {
      res.status(404).json({ error: "Patient not found" });
      return;
    }
    const notes = await db
      .select()
      .from(clinicalNotesTable)
      .where(eq(clinicalNotesTable.patientId, req.params.id))
      .orderBy(desc(clinicalNotesTable.createdAt));
    res.json({ patient, notes });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch patient");
    res.status(500).json({ error: "Failed to fetch patient" });
  }
});

router.patch("/patients/:id", async (req, res) => {
  const parsed = patchPatientSchema.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: parsed.error.issues[0]?.message ?? "Invalid data" });
    return;
  }
  try {
    const updates: Partial<typeof patientsTable.$inferInsert> = {};
    if (parsed.data.name) updates.name = parsed.data.name;
    if (parsed.data.age !== undefined) updates.age = parsed.data.age;
    if (parsed.data.gender) updates.gender = parsed.data.gender;
    if (parsed.data.department) updates.department = parsed.data.department;
    if (parsed.data.complaint !== undefined)
      updates.complaint = parsed.data.complaint;
    if (parsed.data.phone) updates.phone = parsed.data.phone;

    if (Object.keys(updates).length === 0) {
      const [p] = await db
        .select()
        .from(patientsTable)
        .where(eq(patientsTable.id, req.params.id))
        .limit(1);
      res.json({ patient: p });
      return;
    }

    const [updated] = await db
      .update(patientsTable)
      .set(updates)
      .where(eq(patientsTable.id, req.params.id))
      .returning();
    res.json({ patient: updated });
  } catch (err) {
    req.log.error({ err }, "Failed to update patient");
    res.status(500).json({ error: "Failed to update patient" });
  }
});

router.post("/patients/:id/notes", async (req, res) => {
  const parsed = newNoteSchema.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: parsed.error.issues[0]?.message ?? "Invalid note data" });
    return;
  }
  try {
    const [exists] = await db
      .select()
      .from(patientsTable)
      .where(eq(patientsTable.id, req.params.id))
      .limit(1);
    if (!exists) {
      res.status(404).json({ error: "Patient not found" });
      return;
    }

    // Auto-update patient name/age if extracted from transcript
    const nameUpdate = parsed.data.patientName;
    const ageUpdate = parsed.data.patientAge;
    if (
      (nameUpdate && exists.name === "Patient") ||
      (ageUpdate && !exists.age)
    ) {
      const patch: Partial<typeof patientsTable.$inferInsert> = {};
      if (nameUpdate && exists.name === "Patient") patch.name = nameUpdate;
      if (ageUpdate && !exists.age) patch.age = ageUpdate;
      if (Object.keys(patch).length > 0) {
        await db
          .update(patientsTable)
          .set(patch)
          .where(eq(patientsTable.id, req.params.id));
      }
    }

    const doctorName =
      parsed.data.doctorName ??
      req.session?.doctorName ??
      "Doctor";

    const [created] = await db
      .insert(clinicalNotesTable)
      .values({
        patientId: req.params.id,
        doctorName,
        transcript: parsed.data.transcript,
        bp: parsed.data.bp,
        temp: parsed.data.temp,
        spo2: parsed.data.spo2,
        diagnosis: parsed.data.diagnosis,
        diagnoses: parsed.data.diagnoses ?? [],
        prescription: parsed.data.prescription,
        medications: parsed.data.medications ?? [],
        followup: parsed.data.followup,
        admit: parsed.data.admit,
      })
      .returning();

    res.status(201).json({ note: created });
  } catch (err) {
    req.log.error({ err }, "Failed to save note");
    res.status(500).json({ error: "Failed to save note" });
  }
});

export default router;
