import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, AlertCircle, Loader2, Phone } from "lucide-react";
import { lookupPatient } from "@/lib/api";

export default function AddPatient() {
  const [, navigate] = useLocation();
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const digits = phone.replace(/\D/g, "");
    if (digits.length !== 10) {
      setError("Enter a valid 10-digit mobile number");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const { patient } = await lookupPatient(digits);
      navigate(`/patients/${patient.id}/voice`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
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
        <div className="font-semibold text-[#0F1C18]">New Patient</div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-12">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-teal-50 flex items-center justify-center mb-4">
              <Phone className="w-8 h-8 text-[#0B9E7A]" />
            </div>
            <h2 className="text-xl font-bold text-[#0F1C18]">
              Patient's phone number
            </h2>
            <p className="text-sm text-[#8FA89F] text-center mt-1">
              Existing patient? Opens their record.
              <br />
              New? Creates a profile instantly.
            </p>
          </div>

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
            <div className="bg-white border border-[#E2EAE7] rounded-2xl px-5 py-4 flex items-center gap-3">
              <span className="text-base font-semibold text-[#4B6358] shrink-0">
                +91
              </span>
              <input
                type="tel"
                value={phone}
                onChange={(e) =>
                  setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
                }
                placeholder="98XXXXXXXX"
                inputMode="numeric"
                maxLength={10}
                autoFocus
                className="flex-1 text-xl font-semibold text-[#0F1C18] tracking-widest focus:outline-none placeholder:text-[#C5D4CF] placeholder:font-normal placeholder:text-base placeholder:tracking-normal"
                data-testid="input-phone"
              />
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 text-sm p-3 rounded-xl flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || phone.replace(/\D/g, "").length !== 10}
              className="w-full bg-[#0B9E7A] text-white rounded-2xl py-4 text-base font-semibold active:bg-[#077A5E] disabled:bg-[#E2EAE7] disabled:text-[#8FA89F] transition flex items-center justify-center gap-2"
              data-testid="button-proceed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Looking up…
                </>
              ) : (
                "Start Consultation →"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
