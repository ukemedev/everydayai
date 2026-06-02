import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import Dashboard from "@/pages/Dashboard";
import Studio from "@/pages/Studio";
import Settings from "@/pages/Settings";
import Chat from "@/pages/Chat";
import ProtectedRoute from "@/components/ProtectedRoute";
import AdminRoute from "@/components/AdminRoute";
import Admin from "@/pages/Admin";
import AdminUsers from "@/pages/AdminUsers";
import AdminAgents from "@/pages/AdminAgents";
import AdminRevenue from "@/pages/AdminRevenue";
import AdminTemplates from "@/pages/AdminTemplates";
import AdminAuditLog from "@/pages/AdminAuditLog";
import Pricing from "@/pages/Pricing";
import Billing from "@/pages/Billing";
import Templates from "@/pages/Templates";
import Inbox from "@/pages/Inbox";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/pricing" component={Pricing} />
      <Route path="/login" component={Login} />
      <Route path="/signup" component={Signup} />
      <Route path="/dashboard">
        {() => <ProtectedRoute component={Dashboard} />}
      </Route>
      <Route path="/studio">
        {() => <ProtectedRoute component={Studio} />}
      </Route>
      <Route path="/studio/:agentId">
        {() => <ProtectedRoute component={Studio} />}
      </Route>
      <Route path="/settings">
        {() => <ProtectedRoute component={Settings} />}
      </Route>
      <Route path="/billing">
        {() => <ProtectedRoute component={Billing} />}
      </Route>
      <Route path="/templates">
        {() => <ProtectedRoute component={Templates} />}
      </Route>
      <Route path="/inbox">
        {() => <ProtectedRoute component={Inbox} />}
      </Route>
      <Route path="/chat/:agentId" component={Chat} />
      <Route path="/admin">
        {() => <AdminRoute component={Admin} />}
      </Route>
      <Route path="/admin/users">
        {() => <AdminRoute component={AdminUsers} />}
      </Route>
      <Route path="/admin/agents">
        {() => <AdminRoute component={AdminAgents} />}
      </Route>
      <Route path="/admin/templates">
        {() => <AdminRoute component={AdminTemplates} />}
      </Route>
      <Route path="/admin/revenue">
        {() => <AdminRoute component={AdminRevenue} />}
      </Route>
      <Route path="/admin/audit">
        {() => <AdminRoute component={AdminAuditLog} />}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
