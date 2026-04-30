import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { createPatient, type Patient } from "@/lib/api";
import { generatePseudoQrSvg } from "@/lib/qr";

const DEPARTMENTS = [
  "General OPD",
  "Medicine",
  "Surgery",
  "Orthopaedics",
  "Gynaecology",
  "Paediatrics",
  "ICU",
];

export default function AddPatient() {
  const [, navigate] = useLocation();
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("Male");
  const [department, setDepartment] = useState("General OPD");
  const [complaint, setComplaint] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<Patient | null>(null);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("Patient name is required");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const ageNum = age.trim() ? Number(age) : undefined;
      const patient = await createPatient({
        name: name.trim(),
        age: ageNum && !Number.isNaN(ageNum) ? ageNum : undefined,
        gender,
        department,
        complaint: complaint.trim() || undefined,
      });
      setCreated(patient);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to register patient");
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setName("");
    setAge("");
    setComplaint("");
    setCreated(null);
  };

  return (
    <div className="min-h-[100dvh] max-w-md mx-auto bg-[#F7F9F8] flex flex-col">
      <div className="bg-white border-b border-[#E2EAE7] px-5 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="w-9 h-9 rounded-full border border-[#E2EAE7] bg-white flex items-center justify-center text-[#4B6358]"
          aria-label="Back"
          data-testid="button-back"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="font-semibold text-[#0F1C18]">Register Patient</div>
      </div>

      <div className="flex-1 p-5 pb-10 overflow-y-auto">
        {error && (
          <div className="bg-red-50 text-red-600 text-sm p-3 rounded-xl flex items-start gap-2 mb-4">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        )}

        {!created ? (
          <div className="space-y-3.5">
            <Field label="Full Name *">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Patient full name"
                className="form-input"
                data-testid="input-name"
              />
            </Field>
            <Field label="Age">
              <input
                value={age}
                onChange={(e) => setAge(e.target.value)}
                type="number"
                inputMode="numeric"
                placeholder="e.g. 45"
                className="form-input"
                data-testid="input-age"
              />
            </Field>
            <Field label="Gender">
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className="form-input"
                data-testid="select-gender"
              >
                <option>Male</option>
                <option>Female</option>
                <option>Other</option>
              </select>
            </Field>
            <Field label="Department">
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="form-input"
                data-testid="select-department"
              >
                {DEPARTMENTS.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </Field>
            <Field label="Chief Complaint">
              <input
                value={complaint}
                onChange={(e) => setComplaint(e.target.value)}
                placeholder="e.g. Fever for 3 days"
                className="form-input"
                data-testid="input-complaint"
              />
            </Field>

            <button
              type="button"
              disabled={submitting}
              onClick={() => void handleSubmit()}
              className="w-full bg-[#0B9E7A] text-white rounded-2xl py-4 text-base font-semibold active:bg-[#077A5E] disabled:bg-[#E2EAE7] disabled:text-[#8FA89F] transition mt-2"
              data-testid="button-register"
            >
              {submitting ? "Registering…" : "Generate QR & Register →"}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-teal-50 border-2 border-[#0B9E7A] rounded-2xl p-6 flex flex-col items-center gap-3">
              <div className="text-[16px] font-semibold text-[#077A5E]">
                {created.name}
              </div>
              <div
                className="bg-white p-3 rounded-lg"
                dangerouslySetInnerHTML={{
                  __html: generatePseudoQrSvg(
                    `${created.id}|${created.name}|${created.department ?? ""}`,
                  ),
                }}
              />
              <div className="font-mono text-xs text-[#4B6358]">
                {created.id} • {created.department}
              </div>
              <div className="text-xs text-[#077A5E] text-center">
                Patient registered ✓ QR code generated
              </div>
            </div>

            <button
              type="button"
              onClick={() => navigate(`/patients/${created.id}/voice`)}
              className="w-full bg-[#0B9E7A] text-white rounded-2xl py-4 text-base font-semibold active:bg-[#077A5E] transition"
              data-testid="button-start-voice"
            >
              Start Voice Documentation →
            </button>
            <button
              type="button"
              onClick={reset}
              className="w-full bg-[#F7F9F8] text-[#0F1C18] border border-[#E2EAE7] rounded-2xl py-3.5 text-[15px] font-semibold active:bg-[#E2EAE7] transition"
              data-testid="button-register-another"
            >
              Register Another Patient
            </button>
            <button
              type="button"
              onClick={() => navigate("/")}
              className="w-full text-[#4B6358] py-2 text-sm"
              data-testid="button-back-home"
            >
              ← Back to Patients
            </button>
          </div>
        )}
      </div>

      <style>{`
        .form-input {
          width: 100%;
          border: 1.5px solid #E2EAE7;
          border-radius: 10px;
          padding: 12px 14px;
          font-size: 15px;
          background: #FFFFFF;
          color: #0F1C18;
          outline: none;
          transition: border-color 0.15s;
          appearance: auto;
        }
        .form-input:focus { border-color: #0B9E7A; }
      `}</style>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-[#4B6358] mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}
