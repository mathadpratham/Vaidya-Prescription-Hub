import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Plus, AlertCircle, Stethoscope, LogOut, Search, Phone, X, Clock } from "lucide-react";
import { listPatients, listRecentNotes, lookupPatient, type Patient, type RecentNote } from "@/lib/api";
import { patientInitials } from "@/lib/qr";
import { useAuth } from "@/lib/AuthContext";
import { apiBase } from "@/lib/api";

function tagStyle(tag: string) {
  if (tag === "critical") return { bg: "bg-red-50", text: "text-red-600", label: "🔴 Critical" };
  if (tag === "follow")   return { bg: "bg-blue-50", text: "text-blue-600", label: "Follow-up" };
  return { bg: "bg-teal-50", text: "text-teal-600", label: "New" };
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning 👋";
  if (h < 17) return "Good afternoon 👋";
  return "Good evening 👋";
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function DoctorHome() {
  const [, navigate] = useLocation();
  const { doctor, setDoctor } = useAuth();

  const [patients, setPatients]         = useState<Patient[]>([]);
  const [recentNotes, setRecentNotes]   = useState<RecentNote[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState("");

  const [searchPhone, setSearchPhone]   = useState("");
  const [searchOpen, setSearchOpen]     = useState(false);
  const [searching, setSearching]       = useState(false);
  const [searchError, setSearchError]   = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([listPatients(), listRecentNotes(5)])
      .then(([pts, notes]) => {
        if (cancelled) return;
        setPatients(pts);
        setRecentNotes(notes);
      })
      .catch((err: Error) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleLogout = async () => {
    await fetch(`${apiBase}/auth/logout`, { method: "POST", credentials: "include" });
    setDoctor(null);
  };

  const handlePhoneSearch = async () => {
    const digits = searchPhone.replace(/\D/g, "");
    if (digits.length !== 10) { setSearchError("Enter a valid 10-digit phone number"); return; }
    setSearchError("");
    setSearching(true);
    try {
      const { patient, isNew } = await lookupPatient(digits);
      if (isNew) {
        setSearchError("No patient found with this number.");
        return;
      }
      navigate(`/patients/${patient.id}`);
    } catch {
      setSearchError("Search failed. Try again.");
    } finally {
      setSearching(false);
    }
  };

  const displayName = doctor?.name ?? "Doctor";

  // Client-side filter for the patients list while search bar is open
  const filteredPatients = searchPhone.trim()
    ? patients.filter((p) => {
        const digits = searchPhone.replace(/\D/g, "");
        const nameMatch = p.name.toLowerCase().includes(searchPhone.toLowerCase());
        const phoneMatch = digits.length >= 3 && (p.phone ?? "").includes(digits);
        return nameMatch || phoneMatch;
      })
    : patients;

  return (
    <div className="min-h-[100dvh] max-w-md mx-auto bg-[#F7F9F8] flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-br from-[#0B9E7A] to-[#077A5E] text-white px-5 py-6">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2 text-white/80 text-xs">
            <Stethoscope className="w-4 h-4" />
            <span>VaidyaOS</span>
          </div>
          <div className="flex items-center gap-3">
            <button type="button"
              onClick={() => { setSearchOpen((v) => !v); setSearchPhone(""); setSearchError(""); }}
              className="flex items-center gap-1.5 text-white/80 text-xs hover:text-white transition"
              aria-label="Search patient">
              <Phone className="w-3.5 h-3.5" />
              Search
            </button>
            <button type="button" onClick={() => void handleLogout()}
              className="flex items-center gap-1.5 text-white/70 text-xs hover:text-white transition"
              aria-label="Logout">
              <LogOut className="w-3.5 h-3.5" />
              Logout
            </button>
          </div>
        </div>
        <div className="text-sm opacity-80">{greeting()}</div>
        <div className="text-2xl font-semibold">{displayName}</div>
        <div className="grid grid-cols-3 gap-3 mt-4">
          <div className="bg-white/15 rounded-xl px-3 py-2.5">
            <div className="text-xl font-semibold">{patients.length}</div>
            <div className="text-[11px] opacity-80">Patients today</div>
          </div>
          <div className="bg-white/15 rounded-xl px-3 py-2.5">
            <div className="text-xl font-semibold">{(patients.length * 0.1).toFixed(1)}h</div>
            <div className="text-[11px] opacity-80">Time saved</div>
          </div>
          <div className="bg-white/15 rounded-xl px-3 py-2.5">
            <div className="text-xl font-semibold">100%</div>
            <div className="text-[11px] opacity-80">Notes digitized</div>
          </div>
        </div>
      </div>

      {/* Phone search panel */}
      {searchOpen && (
        <div className="bg-white border-b border-[#E2EAE7] px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 bg-[#F7F9F8] border border-[#E2EAE7] rounded-xl px-3 py-2.5">
              <Search className="w-4 h-4 text-[#8FA89F] shrink-0" />
              <input
                type="tel"
                inputMode="numeric"
                autoFocus
                value={searchPhone}
                onChange={(e) => { setSearchPhone(e.target.value.replace(/\D/g, "").slice(0, 10)); setSearchError(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") void handlePhoneSearch(); }}
                placeholder="Enter 10-digit phone number"
                className="flex-1 text-sm text-[#0F1C18] bg-transparent focus:outline-none placeholder:text-[#8FA89F]"
              />
              {searchPhone && (
                <button type="button" onClick={() => { setSearchPhone(""); setSearchError(""); }}
                  className="text-[#8FA89F]">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button type="button"
              onClick={() => void handlePhoneSearch()}
              disabled={searching || searchPhone.replace(/\D/g, "").length !== 10}
              className="bg-[#0B9E7A] text-white rounded-xl px-4 py-2.5 text-sm font-semibold disabled:bg-[#E2EAE7] disabled:text-[#8FA89F] transition">
              {searching ? "…" : "Go"}
            </button>
          </div>
          {searchError && (
            <div className="mt-2 text-xs text-red-600 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {searchError}
            </div>
          )}
          {!searchError && searchPhone.length > 0 && searchPhone.replace(/\D/g, "").length !== 10 && (
            <div className="mt-2 text-xs text-[#8FA89F]">
              {10 - searchPhone.replace(/\D/g, "").length} more digit{10 - searchPhone.replace(/\D/g, "").length !== 1 ? "s" : ""}
            </div>
          )}
        </div>
      )}

      <div className="flex-1 px-4 pt-4 pb-24 overflow-y-auto">
        {error && (
          <div className="bg-red-50 text-red-600 text-sm p-3 rounded-xl flex items-start gap-2 mb-3">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        )}

        {/* Recent consultations */}
        {recentNotes.length > 0 && !searchOpen && (
          <div className="mb-5">
            <div className="flex items-center gap-1.5 mb-3">
              <Clock className="w-3.5 h-3.5 text-[#8FA89F]" />
              <div className="text-xs font-semibold text-[#8FA89F] tracking-wider uppercase">
                Recent Consultations
              </div>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
              {recentNotes.map((n) => {
                const diagList = n.diagnoses?.length > 0
                  ? n.diagnoses
                  : n.diagnosis ? n.diagnosis.split(",").map((s) => s.trim()).filter(Boolean) : [];
                const topDx = diagList[0] ?? null;
                const initials = patientInitials(n.patientName ?? "P");
                return (
                  <Link key={n.id} href={`/patients/${n.patientId}`}
                    className="shrink-0 w-44 bg-white border border-[#E2EAE7] rounded-2xl p-3.5 active:bg-teal-50 active:border-teal-200 transition block">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                        style={{ background: `${n.patientColor ?? "#0B9E7A"}22`, color: n.patientColor ?? "#0B9E7A" }}>
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold text-[#0F1C18] truncate">
                          {n.patientName === "Patient" && n.patientPhone
                            ? `+91 ${n.patientPhone}`
                            : (n.patientName ?? "Patient")}
                        </div>
                        <div className="text-[10px] text-[#8FA89F]">{timeAgo(n.createdAt)}</div>
                      </div>
                    </div>
                    {topDx ? (
                      <div className="text-[11px] text-[#0B9E7A] font-semibold bg-teal-50 rounded-lg px-2 py-1 truncate">
                        {topDx}
                      </div>
                    ) : n.medications?.length > 0 ? (
                      <div className="text-[11px] text-[#4B6358] truncate">
                        {n.medications[0].name}
                        {n.medications.length > 1 ? ` +${n.medications.length - 1}` : ""}
                      </div>
                    ) : (
                      <div className="text-[11px] text-[#8FA89F]">No diagnosis</div>
                    )}
                    {n.followup && (
                      <div className="text-[10px] text-amber-600 mt-1">📅 {n.followup}</div>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Patients list */}
        <div className="text-xs font-semibold text-[#8FA89F] tracking-wider uppercase mb-3">
          {searchOpen && searchPhone ? `Results for "${searchPhone}"` : "Today's Patients"}
        </div>

        {loading ? (
          <div className="text-center text-[#8FA89F] py-10 text-sm">Loading patients…</div>
        ) : filteredPatients.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-[#8FA89F]">
            <div className="text-4xl">{searchPhone ? "🔍" : "📝"}</div>
            <div className="text-sm text-center">
              {searchPhone
                ? "No patients match this number.\nTap Go to search by exact phone."
                : "No patients yet.\nTap the + button to start a consultation."}
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredPatients.map((p) => {
              const tag = tagStyle(p.tag);
              const displayPt = p.name === "Patient" && p.phone ? `+91 ${p.phone}` : p.name;
              return (
                <Link key={p.id} href={`/patients/${p.id}`}
                  className="block bg-white border border-[#E2EAE7] rounded-2xl p-4 active:bg-teal-50 active:border-teal-300 transition"
                  data-testid={`link-patient-${p.id}`}>
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                      style={{ background: `${p.color}22`, color: p.color }}>
                      {patientInitials(displayPt)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[15px] font-semibold text-[#0F1C18] truncate">{displayPt}</div>
                      <div className="text-xs text-[#4B6358] mt-0.5">
                        {p.age ? `${p.age}y • ` : ""}
                        {p.gender ? `${p.gender} • ` : ""}
                        {p.department ?? "General OPD"}
                      </div>
                      {p.phone && p.name !== "Patient" && (
                        <div className="text-xs text-[#8FA89F] mt-0.5 font-mono">+91 {p.phone}</div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${tag.bg} ${tag.text}`}>
                        {tag.label}
                      </span>
                      <span className="text-[10px] text-[#8FA89F] font-mono">{p.id}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* FAB */}
      <button type="button" onClick={() => navigate("/record")}
        className="fixed bottom-6 right-[max(1.25rem,calc(50vw-13rem))] w-14 h-14 bg-[#0B9E7A] rounded-2xl flex items-center justify-center text-white shadow-lg shadow-teal-500/40 active:scale-95 transition z-20"
        aria-label="Add patient" data-testid="button-add-patient">
        <Plus className="w-7 h-7" strokeWidth={2.5} />
      </button>
    </div>
  );
}
