import { Switch, Route, Router as WouterRouter } from "wouter";
import { TooltipProvider } from "~/components/ui/tooltip";
import { ThemeProvider } from "~/components/core/theme-provider";
import { Toaster } from "~/components/ui/sonner";
import { TRPCReactProvider } from "~/clients/trpc/react";
import { DashboardNavbar } from "~/app/(authenticated)/dashboard/_components/dashboard-navbar";

import LandingPageComponent from "~/app/page";
import LoginPageComponent from "~/app/login/page";
import AuthenticatedLayout from "~/app/(authenticated)/layout";
import DashboardPageComponent from "~/app/(authenticated)/dashboard/page";
import SettingsPageComponent from "~/app/(authenticated)/dashboard/settings/page";
import ToolkitsPageComponent from "~/app/(authenticated)/dashboard/toolkits/page";

function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col">
      <DashboardNavbar />
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}

function AuthDashboard({ children }: { children: React.ReactNode }) {
  return (
    <AuthenticatedLayout>
      <DashboardShell>{children}</DashboardShell>
    </AuthenticatedLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPageComponent} />
      <Route path="/login" component={LoginPageComponent} />
      <Route path="/dashboard">
        {() => (
          <AuthDashboard>
            <DashboardPageComponent />
          </AuthDashboard>
        )}
      </Route>
      <Route path="/dashboard/settings">
        {() => (
          <AuthDashboard>
            <SettingsPageComponent />
          </AuthDashboard>
        )}
      </Route>
      <Route path="/dashboard/toolkits">
        {() => (
          <AuthDashboard>
            <ToolkitsPageComponent />
          </AuthDashboard>
        )}
      </Route>
      <Route>
        <div className="flex h-screen items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold">404 — Page Not Found</h1>
          </div>
        </div>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <TRPCReactProvider>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL?.replace(/\/$/, "") ?? ""}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </TRPCReactProvider>
  );
}

export default App;
