import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { apiBase } from "@/lib/api";

export type Doctor = {
  id: number;
  name: string;
  phone: string;
};

type AuthCtx = {
  doctor: Doctor | null;
  loading: boolean;
  setDoctor: (d: Doctor | null) => void;
};

const AuthContext = createContext<AuthCtx>({
  doctor: null,
  loading: true,
  setDoctor: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${apiBase}/auth/me`, { credentials: "include" })
      .then((r) => (r.ok ? (r.json() as Promise<{ doctor: Doctor }>) : null))
      .then((data) => {
        if (data?.doctor) setDoctor(data.doctor);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <AuthContext.Provider value={{ doctor, loading, setDoctor }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
