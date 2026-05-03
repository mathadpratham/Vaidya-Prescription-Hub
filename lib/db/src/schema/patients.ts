import {
  pgTable,
  text,
  integer,
  serial,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export type Medication = {
  name: string;
  dose: string;
  frequency: string;
  duration: string;
};

export type ClinicalPhoto = {
  data: string;
  mimeType: string;
  type: "prescription" | "clinical";
  caption?: string;
};

export const patientsTable = pgTable("patients", {
  id: text("id").primaryKey(),
  phone: text("phone").unique(),
  name: text("name").notNull().default("Patient"),
  age: integer("age"),
  gender: text("gender"),
  department: text("department"),
  complaint: text("complaint"),
  tag: text("tag").notNull().default("new"),
  bed: text("bed"),
  color: text("color").notNull().default("#0B9E7A"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const clinicalNotesTable = pgTable("clinical_notes", {
  id: serial("id").primaryKey(),
  patientId: text("patient_id")
    .notNull()
    .references(() => patientsTable.id, { onDelete: "cascade" }),
  doctorName: text("doctor_name").notNull().default("Dr. Arun Kumar"),
  transcript: text("transcript"),
  bp: text("bp"),
  temp: text("temp"),
  spo2: text("spo2"),
  diagnosis: text("diagnosis"),
  prescription: text("prescription"),
  diagnoses: jsonb("diagnoses").$type<string[]>().default([]).notNull(),
  medications: jsonb("medications").$type<Medication[]>().default([]).notNull(),
  photos: jsonb("photos").$type<ClinicalPhoto[]>().default([]).notNull(),
  followup: text("followup"),
  admit: text("admit"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertPatientSchema = createInsertSchema(patientsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertPatient = z.infer<typeof insertPatientSchema>;
export type Patient = typeof patientsTable.$inferSelect;

export const insertClinicalNoteSchema = createInsertSchema(
  clinicalNotesTable,
).omit({
  id: true,
  createdAt: true,
  patientId: true,
});
export type InsertClinicalNote = z.infer<typeof insertClinicalNoteSchema>;
export type ClinicalNote = typeof clinicalNotesTable.$inferSelect;
