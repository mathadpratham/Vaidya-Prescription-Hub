import type { Patient, ClinicalNote, Medication } from "./api";

function waUrl(phone: string, text: string): string {
  const digits = phone.replace(/\D/g, "");
  const e164 = digits.startsWith("91") ? digits : `91${digits}`;
  return `https://wa.me/${e164}?text=${encodeURIComponent(text)}`;
}

export function prescriptionShareUrl(
  patient: Patient,
  note: ClinicalNote,
  doctorName: string,
): string | null {
  const phone = patient.phone;
  if (!phone || phone.replace(/\D/g, "").length < 10) return null;

  const date = new Date(note.createdAt).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });

  const meds: Medication[] =
    note.medications?.length > 0
      ? note.medications
      : note.prescription
          ?.split(",")
          .map((p) => ({ name: p.trim(), dose: "", frequency: "", duration: "" }))
          .filter((m) => m.name) ?? [];

  const diagList =
    note.diagnoses?.length > 0
      ? note.diagnoses
      : note.diagnosis
          ?.split(",")
          .map((s) => s.trim())
          .filter(Boolean) ?? [];

  let text = `📋 *Prescription from ${doctorName}*\n`;
  text += `_${date}_\n\n`;
  text += `*Patient:* ${patient.name}`;
  if (patient.age) text += `, ${patient.age}y`;
  text += "\n";

  if (diagList.length > 0) {
    text += `\n*Diagnosis:* ${diagList.join(", ")}\n`;
  }

  if (note.bp || note.temp || note.spo2) {
    text += "\n*Vitals:*";
    if (note.bp) text += ` BP ${note.bp}`;
    if (note.temp) text += ` | Temp ${note.temp}°F`;
    if (note.spo2) text += ` | SpO₂ ${note.spo2}%`;
    text += "\n";
  }

  if (meds.length > 0) {
    text += "\n*Medicines:*\n";
    for (const m of meds) {
      const parts = [m.name];
      if (m.dose) parts.push(m.dose);
      if (m.frequency) parts.push(m.frequency);
      if (m.duration) parts.push(`for ${m.duration}`);
      text += `• ${parts.join(" – ")}\n`;
    }
  }

  if (note.followup) text += `\n*Follow-up:* ${note.followup}\n`;
  if (note.admit === "Yes") text += `\n⚠️ *Admission advised*\n`;

  text += `\n_Sent via VaidyaOS_`;
  return waUrl(phone, text);
}

export type ReminderSlot = {
  label: string;
  emoji: string;
  url: string;
};

function parseTimings(freq: string): ("morning" | "afternoon" | "night")[] {
  const f = freq.trim().toLowerCase();
  if (!f || f === "sos" || f === "as needed" || f === "prn") return [];

  const dashMatch = f.match(/^(\d)-(\d)-(\d)$/);
  if (dashMatch) {
    const slots: ("morning" | "afternoon" | "night")[] = [];
    if (dashMatch[1] !== "0") slots.push("morning");
    if (dashMatch[2] !== "0") slots.push("afternoon");
    if (dashMatch[3] !== "0") slots.push("night");
    return slots;
  }

  if (f === "od" || f === "once daily" || f === "od morning" || f === "qd") return ["morning"];
  if (f === "od night" || f === "hs" || f === "bedtime") return ["night"];
  if (f === "bd" || f === "bid" || f === "twice daily" || f === "twice a day") return ["morning", "night"];
  if (f === "tds" || f === "tid" || f === "thrice daily" || f === "three times") return ["morning", "afternoon", "night"];
  if (f === "qid" || f === "four times") return ["morning", "afternoon", "night"];

  if (f.includes("morning") && f.includes("night")) return ["morning", "night"];
  if (f.includes("morning")) return ["morning"];
  if (f.includes("night") || f.includes("bedtime")) return ["night"];
  if (f.includes("afternoon")) return ["morning", "afternoon", "night"];

  return ["morning", "night"];
}

const SLOT_META: Record<"morning" | "afternoon" | "night", { label: string; emoji: string; greeting: string }> = {
  morning:   { label: "Morning",   emoji: "🌅", greeting: "Good morning" },
  afternoon: { label: "Afternoon", emoji: "☀️",  greeting: "Good afternoon" },
  night:     { label: "Night",     emoji: "🌙", greeting: "Good night" },
};

export function buildReminderUrls(
  phone: string,
  patientName: string,
  doctorName: string,
  medications: Medication[],
  followup: string,
): ReminderSlot[] {
  const digits = phone.replace(/\D/g, "");
  if (digits.length !== 10) return [];

  const bySlot: Record<"morning" | "afternoon" | "night", Medication[]> = {
    morning: [], afternoon: [], night: [],
  };

  for (const med of medications) {
    if (!med.name.trim()) continue;
    const timings = parseTimings(med.frequency);
    for (const t of timings) bySlot[t].push(med);
  }

  const slots = (["morning", "afternoon", "night"] as const).filter((s) => bySlot[s].length > 0);
  if (slots.length === 0) return [];

  return slots.map((slot) => {
    const meta = SLOT_META[slot];
    const meds = bySlot[slot];
    let text = `💊 *Medicine Reminder* from *Dr. ${doctorName}*\n\n`;
    text += `${meta.greeting}, *${patientName || "Patient"}*!\n\n`;
    text += `Please take your medicines now (${meta.label.toLowerCase()}):\n`;
    for (const m of meds) {
      const parts = [m.name];
      if (m.dose) parts.push(m.dose);
      text += `• ${parts.join(" ")}\n`;
    }
    if (followup) text += `\n📅 *Follow-up:* ${followup}`;
    text += `\n\n_Sent via VaidyaOS_`;
    return {
      label: `${meta.emoji} ${meta.label}`,
      emoji: meta.emoji,
      url: waUrl(digits, text),
    };
  });
}
