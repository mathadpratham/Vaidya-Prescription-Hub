import { useState } from "react";
import { Stethoscope, Loader2 } from "lucide-react";
import { apiBase } from "@/lib/api";
import { useAuth, type Doctor } from "@/lib/AuthContext";

type Tab = "login" | "register";

export default function AuthPage() {
  const { setDoctor } = useAuth();
  const [tab, setTab] = useState<Tab>("login");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const digits = phone.replace(/\D/g, "");
    if (digits.length !== 10) {
      setError("Enter a valid 10-digit mobile number");
      return;
    }
    if (tab === "register" && !name.trim()) {
      setError("Name is required");
      return;
    }
    setLoading(true);
    try {
      const endpoint = tab === "register" ? "/auth/register" : "/auth/login";
      const body =
        tab === "register"
          ? { name: name.trim(), phone: digits }
          : { phone: digits };
      const res = await fetch(`${apiBase}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { doctor?: Doctor; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      if (data.doctor) setDoctor(data.doctor);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] max-w-md mx-auto bg-[#F7F9F8] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-[#0B9E7A] flex items-center justify-center mb-4 shadow-lg shadow-teal-500/20">
            <Stethoscope className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-[#0F1C18]">VaidyaOS</h1>
          <p className="text-sm text-[#8FA89F] mt-1">Doctor's clinical assistant</p>
        </div>

        <div className="bg-white rounded-2xl border border-[#E2EAE7] p-1 flex mb-6">
          {(["login", "register"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => { setTab(t); setError(""); }}
              className={`flex-1 py-2.5 text-sm font-semibold rounded-xl transition ${
                tab === t
                  ? "bg-[#0B9E7A] text-white shadow"
                  : "text-[#8FA89F]"
              }`}
            >
              {t === "login" ? "Login" : "Sign Up"}
            </button>
          ))}
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
          {tab === "register" && (
            <div className="bg-white border border-[#E2EAE7] rounded-xl px-4 py-3">
              <div className="text-[10px] uppercase tracking-wider text-[#8FA89F] font-semibold mb-1">
                Your Name
              </div>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Dr. Arun Kumar"
                autoComplete="name"
                className="w-full text-sm font-semibold text-[#0F1C18] focus:outline-none placeholder:text-[#C5D4CF]"
              />
            </div>
          )}

          <div className="bg-white border border-[#E2EAE7] rounded-xl px-4 py-3">
            <div className="text-[10px] uppercase tracking-wider text-[#8FA89F] font-semibold mb-1">
              Mobile Number
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-[#4B6358] font-semibold shrink-0">+91</span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="98XXXXXXXX"
                inputMode="numeric"
                maxLength={10}
                autoComplete="tel"
                className="w-full text-sm font-semibold text-[#0F1C18] focus:outline-none placeholder:text-[#C5D4CF]"
              />
            </div>
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#0B9E7A] text-white rounded-2xl py-4 text-base font-semibold active:bg-[#077A5E] disabled:opacity-60 transition flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {tab === "login" ? "Logging in…" : "Creating account…"}
              </>
            ) : tab === "login" ? (
              "Login"
            ) : (
              "Create Account"
            )}
          </button>

          <p className="text-center text-xs text-[#8FA89F]">
            {tab === "login" ? (
              <>
                New doctor?{" "}
                <button
                  type="button"
                  onClick={() => { setTab("register"); setError(""); }}
                  className="text-[#0B9E7A] font-semibold"
                >
                  Sign up instantly
                </button>
              </>
            ) : (
              <>
                Already registered?{" "}
                <button
                  type="button"
                  onClick={() => { setTab("login"); setError(""); }}
                  className="text-[#0B9E7A] font-semibold"
                >
                  Login
                </button>
              </>
            )}
          </p>
        </form>
      </div>
    </div>
  );
}
