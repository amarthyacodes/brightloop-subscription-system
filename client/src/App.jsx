import { useEffect, useState } from "react";
import Dashboard from "./Dashboard.jsx";
import Login from "./Login.jsx";

const THEME_KEY = "theme";
const SESSION_KEY = "subly-session";
const VALID_ROLES = ["admin", "user", "worker"];

function getInitialTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function getInitialSession() {
  try {
    const raw =
      localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || !VALID_ROLES.includes(parsed.role)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function App() {
  const [theme, setTheme] = useState(getInitialTheme);
  const [session, setSession] = useState(getInitialSession);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((current) => (current === "light" ? "dark" : "light"));
  }

  function handleLogin(nextSession, remember) {
    const store = remember ? localStorage : sessionStorage;
    const other = remember ? sessionStorage : localStorage;

    other.removeItem(SESSION_KEY);
    store.setItem(SESSION_KEY, JSON.stringify(nextSession));
    setSession(nextSession);
  }

  function handleLogout() {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    setSession(null);
  }

  if (!session) {
    return (
      <Login
        theme={theme}
        onToggleTheme={toggleTheme}
        onLogin={handleLogin}
      />
    );
  }

  return (
    <Dashboard
      session={session}
      theme={theme}
      onToggleTheme={toggleTheme}
      onLogout={handleLogout}
    />
  );
}

export default App;
