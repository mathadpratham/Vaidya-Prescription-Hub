import { useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, AlertCircle, Plus } from "lucide-react";
import { getPatient, sendWhatsAppMessage, type Patient, type ClinicalNote, type Medication, type ClinicalPhoto } from "@/lib/api";
import { buildPrescriptionText } from "@/lib/whatsapp";
import { useAuth } from "@/lib/AuthContext";

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
  const { doctor } = useAuth();
  const id = params?.id ?? "";

  const [patient, setPatient] = useState<Patient | null>(null);
  const [notes, setNotes] = useState<ClinicalNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [waStatus, setWaStatus] = useState<Record<number, "sending" | "sent" | "error" | "nokey">>({});
  const [expandedPhoto, setExpandedPhoto] = useState<string | null>(null);

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
    return () => { cancelled = true; };
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
          <button type="button" onClick={() => navigate("/")}
            className="w-9 h-9 rounded-full border border-[#E2EAE7] bg-white flex items-center justify-center text-[#4B6358]"
            data-testid="button-back">
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
        <button type="button" onClick={() => navigate("/")}
          className="w-9 h-9 rounded-full border border-[#E2EAE7] bg-white flex items-center justify-center text-[#4B6358]"
          aria-label="Back" data-testid="button-back">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[#0F1C18] truncate" data-testid="text-patient-name">
            {patient.name}
          </div>
          <div className="text-xs text-[#8FA89F]">
            {patient.phone ? `+91 ${patient.phone}` : "View history"}
          </div>
        </div>
        <span className="bg-teal-50 text-[#0B9E7A] text-[11px] font-semibold px-2.5 py-1 rounded-full font-mono">
          {patient.id}
        </span>
      </div>

      <div className="flex-1 p-4 pb-10 overflow-y-auto">
        <div className="grid grid-cols-2 gap-2.5 mb-4">
          <InfoCard label="Department" value={patient.department ?? "—"} />
          <InfoCard label="Age / Gender" value={`${patient.age ?? "—"}y, ${patient.gender ?? "—"}`} />
          <InfoCard label="Bed" value={patient.bed ?? "—"} />
          <InfoCard label="Complaint" value={patient.complaint || "—"} small />
        </div>

        <div className="text-xs font-semibold text-[#8FA89F] tracking-wider uppercase mb-3">
          Clinical Notes
        </div>

        {notes.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-[#8FA89F]">
            <div className="text-4xl">📝</div>
            <div className="text-sm text-center">
              No clinical notes yet.<br />Press the button below to start voice documentation.
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {notes.map((n) => {
              const hasPhone = !!(patient.phone && patient.phone.replace(/\D/g, "").length >= 10);
              const rxText = hasPhone ? buildPrescriptionText(patient, n, doctor?.name ?? n.doctorName) : null;
              const noteWaStatus = waStatus[n.id];
              const clinicalPhotos = (n.photos ?? []).filter((p: ClinicalPhoto) => p.type === "clinical");
              const rxPhotos = (n.photos ?? []).filter((p: ClinicalPhoto) => p.type === "prescription");
              return (
                <div key={n.id} className="bg-white border border-[#E2EAE7] rounded-2xl p-4"
                  data-testid={`note-${n.id}`}>
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="text-[13px] font-semibold text-[#0B9E7A]">{n.doctorName}</div>
                    <div className="flex items-center gap-2">
                      {rxText && (
                        <button type="button"
                          onClick={() => {
                            if (noteWaStatus === "sending") return;
                            setWaStatus((s) => ({ ...s, [n.id]: "sending" }));
                            void sendWhatsAppMessage(patient.phone!, rxText).then((r) => {
                              setWaStatus((s) => ({
                                ...s,
                                [n.id]: r.noApiKey ? "nokey" : r.success ? "sent" : "error",
                              }));
                              setTimeout(() => setWaStatus((s) => { const c = { ...s }; delete c[n.id]; return c; }), 4000);
                            });
                          }}
                          className={`flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full transition ${
                            noteWaStatus === "sent" ? "bg-green-50 text-green-700" :
                            noteWaStatus === "nokey" ? "bg-amber-50 text-amber-700" :
                            noteWaStatus === "error" ? "bg-red-50 text-red-600" :
                            "bg-[#25D366]/10 text-[#25D366] active:bg-[#25D366]/20"
                          }`}>
                          <WhatsAppIcon className="w-3.5 h-3.5" />
                          {noteWaStatus === "sending" ? "Sending…" :
                           noteWaStatus === "sent" ? "Sent ✓" :
                           noteWaStatus === "nokey" ? "No API key" :
                           noteWaStatus === "error" ? "Failed" : "Share Rx"}
                        </button>
                      )}
                      <div className="text-xs text-[#8FA89F]">{formatTime(n.createdAt)}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <Vital label="BP" value={n.bp || "—"} />
                    <Vital label="Temp" value={n.temp ? `${n.temp}°` : "—"} />
                    <Vital label="SpO₂" value={n.spo2 ? `${n.spo2}%` : "—"} />
                  </div>

                  <DiagnosisBlock diagnoses={n.diagnoses} fallback={n.diagnosis} />
                  <MedicationTable medications={n.medications} fallback={n.prescription} />

                  {/* Rx scan photos */}
                  {rxPhotos.length > 0 && (
                    <div className="mt-3">
                      <div className="text-[10px] font-semibold text-[#8FA89F] uppercase tracking-wider mb-1.5">Prescription scans</div>
                      <div className="flex gap-2 overflow-x-auto">
                        {rxPhotos.map((p: ClinicalPhoto, i: number) => (
                          <button key={i} type="button" onClick={() => setExpandedPhoto(`data:${p.mimeType};base64,${p.data}`)}>
                            <img src={`data:${p.mimeType};base64,${p.data}`}
                              className="w-16 h-16 rounded-lg object-cover border-2 border-[#0B9E7A]/30 shrink-0" alt="Rx scan" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Clinical photos */}
                  {clinicalPhotos.length > 0 && (
                    <div className="mt-3">
                      <div className="text-[10px] font-semibold text-[#8FA89F] uppercase tracking-wider mb-1.5">Clinical photos</div>
                      <div className="flex gap-2 overflow-x-auto">
                        {clinicalPhotos.map((p: ClinicalPhoto, i: number) => (
                          <button key={i} type="button" onClick={() => setExpandedPhoto(`data:${p.mimeType};base64,${p.data}`)}>
                            <img src={`data:${p.mimeType};base64,${p.data}`}
                              className="w-16 h-16 rounded-lg object-cover border-2 border-purple-200 shrink-0" alt="Clinical photo" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {(n.followup || n.admit === "Yes") && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
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

                  {n.transcript && (
                    <details className="mt-3 text-[13px] text-[#4B6358]">
                      <summary className="cursor-pointer text-[11px] uppercase tracking-wider text-[#8FA89F] font-semibold">
                        Original transcript
                      </summary>
                      <div className="mt-2 leading-relaxed whitespace-pre-wrap text-[#0F1C18]">
                        {n.transcript}
                      </div>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <button type="button" onClick={() => navigate(`/patients/${patient.id}/voice`)}
          className="w-full bg-[#0B9E7A] text-white rounded-2xl py-4 text-base font-semibold active:bg-[#077A5E] transition mt-4 flex items-center justify-center gap-2"
          data-testid="button-add-note">
          <Plus className="w-5 h-5" /> Add New Note
        </button>
      </div>

      {/* Photo lightbox */}
      {expandedPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setExpandedPhoto(null)}>
          <img src={expandedPhoto} className="max-w-full max-h-full rounded-xl object-contain" alt="Full photo" />
          <button type="button"
            onClick={() => setExpandedPhoto(null)}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/20 text-white flex items-center justify-center text-lg font-bold">
            ×
          </button>
        </div>
      )}
    </div>
  );
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function InfoCard({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="bg-white border border-[#E2EAE7] rounded-xl p-3">
      <div className="text-[11px] text-[#8FA89F] mb-0.5">{label}</div>
      <div className={`font-semibold text-[#0F1C18] ${small ? "text-[12px]" : "text-sm"}`}>{value}</div>
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

function DiagnosisBlock({ diagnoses, fallback }: { diagnoses: string[]; fallback: string | null }) {
  const list = diagnoses?.length > 0
    ? diagnoses
    : fallback ? fallback.split(",").map((s) => s.trim()).filter(Boolean) : [];
  if (list.length === 0) return null;
  return (
    <div className="mb-3">
      <div className="text-[11px] uppercase tracking-wider text-[#8FA89F] font-semibold mb-1.5">Diagnosis</div>
      <div className="flex flex-wrap gap-1.5">
        {list.map((d, i) => (
          <span key={`${d}-${i}`} className="bg-teal-50 text-[#0B9E7A] text-xs font-semibold px-2.5 py-1 rounded-full">
            {d}
          </span>
        ))}
      </div>
    </div>
  );
}

function MedicationTable({ medications, fallback }: { medications: Medication[]; fallback: string | null }) {
  let rows: Medication[] = medications?.length > 0 ? medications : [];
  if (rows.length === 0 && fallback?.trim()) {
    rows = fallback.split(",").map((piece) => {
      const text = piece.trim();
      const match = text.match(/^(.*?)\s+(\d+\s*\S*)\s*(.*)$/);
      if (match) return { name: match[1].trim(), dose: match[2].trim(), frequency: match[3].trim(), duration: "" };
      return { name: text, dose: "", frequency: "", duration: "" };
    }).filter((m) => m.name);
  }
  if (rows.length === 0) return null;
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-[#8FA89F] font-semibold mb-1.5">Prescription</div>
      <div className="border border-[#E2EAE7] rounded-xl overflow-hidden">
        <table className="w-full text-[12px] table-fixed">
          <thead>
            <tr className="bg-[#F7F9F8] text-[10px] uppercase tracking-wider text-[#8FA89F]">
              <th className="text-left px-2.5 py-1.5 font-semibold w-[36%]">Drug</th>
              <th className="text-left px-2 py-1.5 font-semibold w-[20%]">Dose</th>
              <th className="text-left px-2 py-1.5 font-semibold w-[24%]">Freq</th>
              <th className="text-left px-2 py-1.5 font-semibold w-[20%]">Days</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m, i) => (
              <tr key={`${m.name}-${i}`} className={i > 0 ? "border-t border-[#E2EAE7]" : ""}>
                <td className="px-2.5 py-1.5 font-semibold text-[#0F1C18] truncate">{m.name || "—"}</td>
                <td className="px-2 py-1.5 text-[#4B6358] truncate">{m.dose || "—"}</td>
                <td className="px-2 py-1.5 text-[#4B6358] truncate">{m.frequency || "—"}</td>
                <td className="px-2 py-1.5 text-[#4B6358] truncate">{m.duration || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
