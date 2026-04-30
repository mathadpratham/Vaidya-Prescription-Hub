export const apiBase = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

export type Patient = {
  id: string;
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
  followup: string | null;
  admit: string | null;
  createdAt: string;
};

export type ClinicalFields = {
  bp: string;
  temp: string;
  spo2: string;
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

export async function parseClinical(transcript: string): Promise<ClinicalFields> {
  const res = await fetch(`${apiBase}/parse-clinical`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript }),
  });
  const data = await handle<{ fields: ClinicalFields }>(res);
  return data.fields;
}
