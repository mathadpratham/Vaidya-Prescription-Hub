import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import DoctorHome from "@/pages/DoctorHome";
import QuickRecord from "@/pages/QuickRecord";
import PatientDetail from "@/pages/PatientDetail";
import VoiceRecord from "@/pages/VoiceRecord";
import AuthPage from "@/pages/AuthPage";
import { AuthProvider, useAuth } from "@/lib/AuthContext";

const queryClient = new QueryClient();

function Router() {
  const { doctor, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-[100dvh] max-w-md mx-auto bg-[#F7F9F8] flex items-center justify-center text-[#8FA89F] text-sm">
        Loading…
      </div>
    );
  }

  if (!doctor) {
    return <AuthPage />;
  }

  return (
    <Switch>
      <Route path="/" component={DoctorHome} />
      <Route path="/record" component={QuickRecord} />
      <Route path="/patients/:id/voice" component={VoiceRecord} />
      <Route path="/patients/:id" component={PatientDetail} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <Router />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
