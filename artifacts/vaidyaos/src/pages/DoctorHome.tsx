import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Plus, AlertCircle, Stethoscope } from "lucide-react";
import { listPatients, type Patient } from "@/lib/api";
import { patientInitials } from "@/lib/qr";

function tagStyle(tag: string) {
  if (tag === "critical")
    return { bg: "bg-red-50", text: "text-red-600", label: "🔴 Critical" };
  if (tag === "follow")
    return { bg: "bg-blue-50", text: "text-blue-600", label: "Follow-up" };
  return { bg: "bg-teal-50", text: "text-teal-600", label: "New" };
}

export default function DoctorHome() {
  const [, navigate] = useLocation();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listPatients()
      .then((p) => {
        if (!cancelled) setPatients(p);
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
  }, []);

  return (
    <div className="min-h-[100dvh] max-w-md mx-auto bg-[#F7F9F8] flex flex-col">
      <div className="bg-gradient-to-br from-[#0B9E7A] to-[#077A5E] text-white px-5 py-6">
        <div className="flex items-center gap-2 text-white/80 text-xs mb-1">
          <Stethoscope className="w-4 h-4" />
          <span>VaidyaOS</span>
        </div>
        <div className="text-sm opacity-80">Good morning 👋</div>
        <div className="text-2xl font-semibold">Dr. Arun Kumar</div>
        <div className="grid grid-cols-3 gap-3 mt-4">
          <div className="bg-white/15 rounded-xl px-3 py-2.5">
            <div className="text-xl font-semibold">{patients.length}</div>
            <div className="text-[11px] opacity-80">Patients today</div>
          </div>
          <div className="bg-white/15 rounded-xl px-3 py-2.5">
            <div className="text-xl font-semibold">2.1h</div>
            <div className="text-[11px] opacity-80">Time saved</div>
          </div>
          <div className="bg-white/15 rounded-xl px-3 py-2.5">
            <div className="text-xl font-semibold">100%</div>
            <div className="text-[11px] opacity-80">Notes digitized</div>
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 pt-4 pb-24 overflow-y-auto">
        <div className="text-xs font-semibold text-[#8FA89F] tracking-wider uppercase mb-3">
          Today's Patients
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 text-sm p-3 rounded-xl flex items-start gap-2 mb-3">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        )}

        {loading ? (
          <div className="text-center text-[#8FA89F] py-10 text-sm">
            Loading patients…
          </div>
        ) : patients.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-[#8FA89F]">
            <div className="text-4xl">📝</div>
            <div className="text-sm text-center">
              No patients yet.
              <br />
              Tap the + button to register one.
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {patients.map((p) => {
              const tag = tagStyle(p.tag);
              return (
                <Link
                  key={p.id}
                  href={`/patients/${p.id}`}
                  className="block bg-white border border-[#E2EAE7] rounded-2xl p-4 active:bg-teal-50 active:border-teal-300 transition"
                  data-testid={`link-patient-${p.id}`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                      style={{
                        background: `${p.color}22`,
                        color: p.color,
                      }}
                    >
                      {patientInitials(p.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[15px] font-semibold text-[#0F1C18] truncate">
                        {p.name}
                      </div>
                      <div className="text-xs text-[#4B6358] mt-0.5">
                        {p.age ?? "—"}y • {p.gender ?? "—"} •{" "}
                        {p.department ?? "General OPD"}
                      </div>
                      {p.complaint && (
                        <div className="text-xs text-[#4B6358] mt-0.5 truncate">
                          {p.complaint}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${tag.bg} ${tag.text}`}
                      >
                        {tag.label}
                      </span>
                      <span className="text-[10px] text-[#8FA89F] font-mono">
                        {p.id}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => navigate("/patients/new")}
        className="fixed bottom-6 right-[max(1.25rem,calc(50vw-13rem))] w-14 h-14 bg-[#0B9E7A] rounded-2xl flex items-center justify-center text-white shadow-lg shadow-teal-500/40 active:scale-95 transition z-20"
        aria-label="Add patient"
        data-testid="button-add-patient"
      >
        <Plus className="w-7 h-7" strokeWidth={2.5} />
      </button>
    </div>
  );
}
