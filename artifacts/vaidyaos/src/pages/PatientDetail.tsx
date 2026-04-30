import { useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, AlertCircle, Plus } from "lucide-react";
import { getPatient, type Patient, type ClinicalNote } from "@/lib/api";

function formatTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "short",
    });
  } catch {
    return iso;
  }
}

export default function PatientDetail() {
  const [, params] = useRoute("/patients/:id");
  const [, navigate] = useLocation();
  const id = params?.id ?? "";

  const [patient, setPatient] = useState<Patient | null>(null);
  const [notes, setNotes] = useState<ClinicalNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    getPatient(id)
      .then((data) => {
        if (cancelled) return;
        setPatient(data.patient);
        setNotes(data.notes);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-[100dvh] max-w-md mx-auto bg-[#F7F9F8] flex items-center justify-center text-[#8FA89F]">
        Loading…
      </div>
    );
  }

  if (error || !patient) {
    return (
      <div className="min-h-[100dvh] max-w-md mx-auto bg-[#F7F9F8] flex flex-col">
        <div className="bg-white border-b border-[#E2EAE7] px-5 py-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="w-9 h-9 rounded-full border border-[#E2EAE7] bg-white flex items-center justify-center text-[#4B6358]"
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="font-semibold text-[#0F1C18]">Patient</div>
        </div>
        <div className="p-5">
          <div className="bg-red-50 text-red-600 text-sm p-3 rounded-xl flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>{error || "Patient not found"}</p>
          </div>
        </div>
      </div>
    );
  }

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
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[#0F1C18] truncate" data-testid="text-patient-name">
            {patient.name}
          </div>
          <div className="text-xs text-[#8FA89F]">View history</div>
        </div>
        <span className="bg-teal-50 text-[#0B9E7A] text-[11px] font-semibold px-2.5 py-1 rounded-full font-mono">
          {patient.id}
        </span>
      </div>

      <div className="flex-1 p-4 pb-10 overflow-y-auto">
        <div className="grid grid-cols-2 gap-2.5 mb-4">
          <InfoCard label="Department" value={patient.department ?? "—"} />
          <InfoCard
            label="Age / Gender"
            value={`${patient.age ?? "—"}y, ${patient.gender ?? "—"}`}
          />
          <InfoCard label="Bed" value={patient.bed ?? "—"} />
          <InfoCard
            label="Complaint"
            value={patient.complaint || "—"}
            small
          />
        </div>

        <div className="text-xs font-semibold text-[#8FA89F] tracking-wider uppercase mb-3">
          Clinical Notes
        </div>

        {notes.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-[#8FA89F]">
            <div className="text-4xl">📝</div>
            <div className="text-sm text-center">
              No clinical notes yet.
              <br />
              Press the button below to start voice documentation.
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {notes.map((n) => (
              <div
                key={n.id}
                className="bg-white border border-[#E2EAE7] rounded-2xl p-4"
                data-testid={`note-${n.id}`}
              >
                <div className="flex items-center justify-between mb-2.5">
                  <div className="text-[13px] font-semibold text-[#0B9E7A]">
                    {n.doctorName}
                  </div>
                  <div className="text-xs text-[#8FA89F]">
                    {formatTime(n.createdAt)}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <Vital label="BP" value={n.bp || "—"} />
                  <Vital label="Temp" value={n.temp ? `${n.temp}°` : "—"} />
                  <Vital label="SpO₂" value={n.spo2 ? `${n.spo2}%` : "—"} />
                </div>
                {n.transcript && (
                  <div className="text-[14px] text-[#0F1C18] leading-relaxed whitespace-pre-wrap">
                    {n.transcript}
                  </div>
                )}
                {(n.diagnosis || n.prescription || n.followup) && (
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {n.diagnosis && (
                      <span className="bg-teal-50 text-[#0B9E7A] text-xs font-semibold px-2.5 py-1 rounded-full">
                        Dx: {n.diagnosis}
                      </span>
                    )}
                    {n.prescription && (
                      <span className="bg-blue-50 text-[#2563EB] text-xs font-semibold px-2.5 py-1 rounded-full">
                        Rx: {n.prescription}
                      </span>
                    )}
                    {n.followup && (
                      <span className="bg-amber-50 text-amber-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                        Follow-up: {n.followup}
                      </span>
                    )}
                    {n.admit === "Yes" && (
                      <span className="bg-red-50 text-red-600 text-xs font-semibold px-2.5 py-1 rounded-full">
                        Admit
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => navigate(`/patients/${patient.id}/voice`)}
          className="w-full bg-[#0B9E7A] text-white rounded-2xl py-4 text-base font-semibold active:bg-[#077A5E] transition mt-4 flex items-center justify-center gap-2"
          data-testid="button-add-note"
        >
          <Plus className="w-5 h-5" /> Add New Note
        </button>
      </div>
    </div>
  );
}

function InfoCard({
  label,
  value,
  small,
}: {
  label: string;
  value: string;
  small?: boolean;
}) {
  return (
    <div className="bg-white border border-[#E2EAE7] rounded-xl p-3">
      <div className="text-[11px] text-[#8FA89F] mb-0.5">{label}</div>
      <div
        className={`font-semibold text-[#0F1C18] ${small ? "text-[12px]" : "text-sm"}`}
      >
        {value}
      </div>
    </div>
  );
}

function Vital({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#F7F9F8] rounded-lg p-2.5 text-center">
      <div className="text-base font-semibold text-[#0F1C18]">{value}</div>
      <div className="text-[10px] text-[#8FA89F] mt-0.5">{label}</div>
    </div>
  );
}
