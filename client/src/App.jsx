import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import Dashboard from "./Dashboard.jsx";
import Login from "./Login.jsx";
import { firebaseAuth, firestore } from "./firebase.js";

const DASHBOARDS = { ADMIN: "/admin/dashboard", STAFF: "/staff/dashboard", CUSTOMER: "/customer/dashboard" };
async function readApiResponse(response) {
  const body = await response.text();
  if (!body.trim()) {
    if (!response.ok) throw new Error(`Brightloop server returned an empty response (${response.status}). Make sure the API server is running and try again.`);
    throw new Error("Brightloop server returned an empty sign-in response. Check the API server logs.");
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new Error("Brightloop server returned an unreadable response. Check the API server logs and try again.");
  }
}

function viewFromPath(path) {
  if (path === "/signup") return "signup";
  if (path === "/signup/staff") return "staff-signup";
  if (path === "/forgot-password") return "forgot-password";
  if (path === "/reset-password" || new URLSearchParams(window.location.search).get("mode") === "resetPassword") return "reset-password";
  return "login";
}

export default function App() {
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [authError, setAuthError] = useState("");
  const path = window.location.pathname;
  const isDashboardPath = Object.values(DASHBOARDS).includes(path);

  useEffect(() => onAuthStateChanged(firebaseAuth, async (firebaseUser) => {
    setCheckingSession(true);
    if (sessionStorage.getItem("brightloop-registration-in-progress")) { setCheckingSession(false); return; }
    if (!firebaseUser) {
      setUser(null);
      setCheckingSession(false);
      return;
    }
    try {
      const idToken = await firebaseUser.getIdToken(true);
      const response = await fetch("/api/auth/firebase-session", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, remember: sessionStorage.getItem('brightloop-remember') !== 'false' }),
      });
      const result = await readApiResponse(response);
      if (!response.ok) throw new Error(result.error || "Could not load your Brightloop profile.");
      await firebaseUser.getIdToken(true);
      const profileSnapshot = await getDoc(doc(firestore, "users", firebaseUser.uid));
      if (!profileSnapshot.exists()) throw new Error("Your profile is missing. Ask an administrator to restore your account access.");
      const profile = profileSnapshot.data();
      const role = String(profile.role || "").toUpperCase();
      if (profile.uid !== firebaseUser.uid || profile.email?.toLowerCase() !== firebaseUser.email?.toLowerCase() || role !== result.user.role || !DASHBOARDS[role]) {
        throw new Error("Your account profile is invalid or inconsistent. Ask an administrator to review it.");
      }
      setUser({ ...result.user, uid: firebaseUser.uid, name: profile.name, email: profile.email, role });
      setAuthError("");
    } catch (error) {
      setUser(null);
      setAuthError(error.message || "Unable to load your account. Check your connection and try again.");
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
      await signOut(firebaseAuth).catch(() => {});
    } finally {
      setCheckingSession(false);
    }
  }), []);

  useEffect(() => {
    if (checkingSession) return;
    if (user && !isDashboardPath) window.location.replace(DASHBOARDS[user.role] || "/login");
    else if (isDashboardPath && !user) window.location.replace(authError ? `/login?auth_error=${encodeURIComponent(authError)}` : "/login");
    else if (isDashboardPath && user && DASHBOARDS[user.role] !== path) window.location.replace(DASHBOARDS[user.role] || "/login");
  }, [authError, checkingSession, isDashboardPath, path, user]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
    await signOut(firebaseAuth).catch(() => {});
    setUser(null);
    window.location.replace("/login");
  }

  if (checkingSession || (isDashboardPath && !user)) return <div className="app-loading" role="status">Loading Brightloop…</div>;
  if (authError && !user && !isDashboardPath) return <Login view={viewFromPath(path)} onAuthenticated={setUser} initialError={authError} />;
  if (isDashboardPath && user && DASHBOARDS[user.role] === path) return <Dashboard user={user} onLogout={handleLogout} />;
  return <Login view={viewFromPath(path)} onAuthenticated={setUser} initialError={authError || new URLSearchParams(window.location.search).get('auth_error') || ''} />;
}
