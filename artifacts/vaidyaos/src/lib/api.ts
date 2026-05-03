export const apiBase = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

export type Patient = {
  id: string;
  phone: string | null;
  name: string;
  age: number | null;
  gender: string | null;
  department: string | null;
  complaint: string | null;
  tag: string;
  bed: string | null;
  color: string;
  createdAt: string;
};

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

export type ClinicalNote = {
  id: number;
  patientId: string;
  doctorName: string;
  transcript: string | null;
  bp: string | null;
  temp: string | null;
  spo2: string | null;
  diagnosis: string | null;
  diagnoses: string[];
  prescription: string | null;
  medications: Medication[];
  photos: ClinicalPhoto[];
  followup: string | null;
  admit: string | null;
  createdAt: string;
};

export type ClinicalFields = {
  bp: string;
  temp: string;
  spo2: string;
  patientPhone: string;
  patientName: string;
  patientAge: string;
  diagnosis: string;
  diagnoses: string[];
  prescription: string;
  medications: Medication[];
  followup: string;
  admit: string;
};

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j?.error) msg = j.error;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export type RecentNote = {
  id: number;
  patientId: string;
  patientName: string | null;
  patientColor: string | null;
  patientPhone: string | null;
  doctorName: string;
  diagnosis: string | null;
  diagnoses: string[];
  medications: Medication[];
  followup: string | null;
  createdAt: string;
};

export async function listRecentNotes(limit = 5): Promise<RecentNote[]> {
  const res = await fetch(`${apiBase}/recent-notes?limit=${limit}`, {
    credentials: "include",
  });
  const data = await handle<{ notes: RecentNote[] }>(res);
  return data.notes;
}

export async function listPatients(): Promise<Patient[]> {
  const res = await fetch(`${apiBase}/patients`);
  const data = await handle<{ patients: Patient[] }>(res);
  return data.patients;
}

export async function createPatient(input: {
  name: string;
  age?: number;
  gender?: string;
  department?: string;
  complaint?: string;
}): Promise<Patient> {
  const res = await fetch(`${apiBase}/patients`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await handle<{ patient: Patient }>(res);
  return data.patient;
}

export async function getPatient(id: string): Promise<{
  patient: Patient;
  notes: ClinicalNote[];
}> {
  const res = await fetch(`${apiBase}/patients/${encodeURIComponent(id)}`);
  return handle<{ patient: Patient; notes: ClinicalNote[] }>(res);
}

export async function saveNote(
  patientId: string,
  note: Partial<ClinicalFields> & { transcript?: string; doctorName?: string },
): Promise<ClinicalNote> {
  const res = await fetch(
    `${apiBase}/patients/${encodeURIComponent(patientId)}/notes`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(note),
    },
  );
  const data = await handle<{ note: ClinicalNote }>(res);
  return data.note;
}

export async function lookupPatient(
  phone: string,
): Promise<{ patient: Patient; isNew: boolean }> {
  const res = await fetch(`${apiBase}/patients/lookup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ phone }),
  });
  return handle<{ patient: Patient; isNew: boolean }>(res);
}

export async function patchPatient(
  id: string,
  data: { name?: string; age?: number; phone?: string; gender?: string; department?: string },
): Promise<Patient> {
  const res = await fetch(`${apiBase}/patients/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  const body = await handle<{ patient: Patient }>(res);
  return body.patient;
}

export async function parseClinical(
  transcript: string,
  photos?: ClinicalPhoto[],
): Promise<ClinicalFields> {
  const res = await fetch(`${apiBase}/parse-clinical`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ transcript, photos }),
  });
  const data = await handle<{ fields: ClinicalFields }>(res);
  return data.fields;
}

export async function sendWhatsAppMessage(
  phone: string,
  message: string,
): Promise<{ success: boolean; noApiKey?: boolean; error?: string }> {
  try {
    const res = await fetch(`${apiBase}/whatsapp/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ phone, message }),
    });
    return (await res.json()) as { success: boolean; noApiKey?: boolean; error?: string };
  } catch {
    return { success: false, error: "Network error" };
  }
}
