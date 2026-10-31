import { useEffect, useState } from "react";
import Dashboard from "./Dashboard.jsx";
import Login from "./Login.jsx";

const DASHBOARDS = {
  ADMIN: "/admin/dashboard",
  STAFF: "/staff/dashboard",
  CUSTOMER: "/customer/dashboard",
  WORKER: "/worker/dashboard",
  USER: "/user/dashboard",
};
const DEMO_SESSION_KEY = "brightloop-demo-session";

function getDemoSession() {
  if (!import.meta.env.DEV) return null;
  try {
    const value = localStorage.getItem(DEMO_SESSION_KEY) || sessionStorage.getItem(DEMO_SESSION_KEY);
    const session = value ? JSON.parse(value) : null;
    return session?.isDemo && ["ADMIN", "WORKER", "USER"].includes(session.role) ? session : null;
  } catch {
    return null;
  }
}

function viewFromPath(path) {
  if (path === "/signup") return "signup";
  if (path === "/signup/staff") return "staff-signup";
  if (path === "/forgot-password") return "forgot-password";
  if (path === "/reset-password") return "reset-password";
  return "login";
}

export default function App() {
  const [user, setUser] = useState(getDemoSession);
  const [checkingSession, setCheckingSession] = useState(() => !getDemoSession());
  const [adminData, setAdminData] = useState(null);
  const path = window.location.pathname;
  const isDashboardPath = Object.values(DASHBOARDS).includes(path);

  useEffect(() => {
    let active = true;
    if (user?.isDemo) return () => { active = false; };
    fetch("/api/auth/me", { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()).user;
      })
      .then(async (currentUser) => {
        if (!active) return;
        if (currentUser?.role === "ADMIN") {
          try {
            const response = await fetch("/api/users/staff", { credentials: "include" });
            if (!active) return;
            if (response.ok) setAdminData(await response.json());
            else setAdminData({ error: "Unable to load staff management." });
          } catch {
            if (active) setAdminData({ error: "Unable to load staff management." });
          }
        }
        if (active) setUser(currentUser);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setCheckingSession(false);
      });
    return () => {
      active = false;
    };
  }, [user?.isDemo]);

  useEffect(() => {
    if (checkingSession) return;
    if (user && !isDashboardPath) {
      window.location.replace(DASHBOARDS[user.role] || "/login");
    } else if (isDashboardPath && !user) {
      window.location.replace("/login");
    } else if (isDashboardPath && user && DASHBOARDS[user.role] !== path) {
      window.location.replace(DASHBOARDS[user.role] || "/login");
    }
  }, [checkingSession, isDashboardPath, path, user]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
    try {
      localStorage.removeItem(DEMO_SESSION_KEY);
      sessionStorage.removeItem(DEMO_SESSION_KEY);
    } catch {
      // The in-memory session still ends if storage is unavailable.
    }
    setUser(null);
    window.location.replace("/login");
  }

  if (checkingSession || (isDashboardPath && !user)) {
    return <div className="app-loading" role="status">Loading Brightloop…</div>;
  }

  if (isDashboardPath && user && DASHBOARDS[user.role] === path) {
    return (
      <Dashboard
        user={user}
        initialStaff={adminData?.staff || []}
        initialInvitations={adminData?.invitations || []}
        initialError={adminData?.error || ""}
        onLogout={handleLogout}
      />
    );
  }

  return <Login view={viewFromPath(path)} onAuthenticated={setUser} />;
}
