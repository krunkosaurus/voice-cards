import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ProjectProvider } from "./contexts/ProjectContext";
import { SyncProvider } from "./contexts/SyncContext";
import { HistoryProviderWrapper } from "./components/HistoryProviderWrapper";
import { SyncProgress } from "./components/SyncProgress";
import { OverwriteConfirmDialog } from "./components/OverwriteConfirmDialog";
import Home from "./pages/Home";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        switchable
      >
        <ProjectProvider>
          <SyncProvider>
            <HistoryProviderWrapper>
              <TooltipProvider>
                <Toaster />
                <SyncProgress />
                <OverwriteConfirmDialog />
                <Router />
              </TooltipProvider>
            </HistoryProviderWrapper>
          </SyncProvider>
        </ProjectProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
