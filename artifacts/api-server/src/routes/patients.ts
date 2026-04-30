import { Router, type IRouter } from "express";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { db, patientsTable, clinicalNotesTable } from "@workspace/db";

const router: IRouter = Router();

const PALETTE = ["#0B9E7A", "#2563EB", "#7C3AED", "#DC2626", "#D97706"];
const BEDS = ["B-3", "B-6", "B-8", "B-9", "B-12", "B-14"];

const newPatientSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  age: z.coerce.number().int().min(0).max(150).optional(),
  gender: z.enum(["Male", "Female", "Other"]).optional(),
  department: z.string().trim().min(1).optional(),
  complaint: z.string().trim().optional(),
  tag: z.enum(["new", "follow", "critical"]).optional(),
});

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

router.post("/patients", async (req, res) => {
  const parsed = newPatientSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid patient data" });
    return;
  }

  try {
    const countRows = await db.select().from(patientsTable);
    const seq = countRows.length + 1;
    const id = `PID-${String(100 + seq).padStart(3, "0")}`;
    const color = PALETTE[countRows.length % PALETTE.length];
    const bed = BEDS[countRows.length % BEDS.length];

    const [created] = await db
      .insert(patientsTable)
      .values({
        id,
        name: parsed.data.name,
        age: parsed.data.age,
        gender: parsed.data.gender,
        department: parsed.data.department ?? "General OPD",
        complaint: parsed.data.complaint ?? "",
        tag: parsed.data.tag ?? "new",
        bed,
        color,
      })
      .returning();

    res.status(201).json({ patient: created });
  } catch (err) {
    req.log.error({ err }, "Failed to create patient");
    res.status(500).json({ error: "Failed to register patient" });
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

router.post("/patients/:id/notes", async (req, res) => {
  const parsed = newNoteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid note data" });
    return;
  }
  try {
    const [exists] = await db
      .select({ id: patientsTable.id })
      .from(patientsTable)
      .where(eq(patientsTable.id, req.params.id))
      .limit(1);
    if (!exists) {
      res.status(404).json({ error: "Patient not found" });
      return;
    }

    const [created] = await db
      .insert(clinicalNotesTable)
      .values({
        patientId: req.params.id,
        doctorName: parsed.data.doctorName ?? "Dr. Arun Kumar",
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
