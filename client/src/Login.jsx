import { useState } from "react";
import Icon from "./Icon.jsx";
import ThemeToggle from "./ThemeToggle.jsx";
import "./Login.css";

const ROLES = [
  {
    id: "admin",
    label: "Admin",
    icon: "shield",
    hint: "Full access to subscriptions, users, and billing.",
  },
  {
    id: "user",
    label: "User",
    icon: "user",
    hint: "Manage your own plans and payment methods.",
  },
  {
    id: "worker",
    label: "Worker",
    icon: "briefcase",
    hint: "Handle assigned accounts and renewal tasks.",
  },
];

const DEMO_NAMES = {
  admin: "Alex Morgan",
  user: "Jordan Davis",
  worker: "Sam Rivera",
};

export default function Login({ theme, onToggleTheme, onLogin }) {
  const [role, setRole] = useState("admin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const selectedRole = ROLES.find((item) => item.id === role);

  function selectRole(nextRole) {
    setRole(nextRole);
    setError("");
  }

  function handleSubmit(event) {
    event.preventDefault();

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError("Enter your email and password to continue.");
      return;
    }

    setError("");
    setLoading(true);

    window.setTimeout(() => {
      onLogin(
        {
          role,
          email: trimmedEmail,
          name: DEMO_NAMES[role],
        },
        remember
      );
    }, 450);
  }

  return (
    <div className="login">
      <aside className="login-aside">
        <div className="login-brand">
          <span className="login-brand-mark">S</span>
          <span>Subly</span>
        </div>

        <div className="login-pitch">
          <h1>
            Every subscription.
            <br />
            One calm dashboard.
          </h1>
          <p>
            Track plans, spot renewals, and keep spending under control — for
            your whole team.
          </p>
          <ul className="login-points">
            <li>
              <span className="point-check">
                <Icon name="check" />
              </span>
              See every renewal in one place
            </li>
            <li>
              <span className="point-check">
                <Icon name="check" />
              </span>
              Admin, user, and worker views
            </li>
            <li>
              <span className="point-check">
                <Icon name="check" />
              </span>
              Light and dark themes built in
            </li>
          </ul>
        </div>

        <p className="login-foot">© 2026 Subly. All rights reserved.</p>
      </aside>

      <main className="login-main">
        <div className="login-mobile-brand">
          <span className="login-brand-mark">S</span>
          <span>Subly</span>
        </div>

        <div className="login-theme">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>

        <form className="login-card" onSubmit={handleSubmit} noValidate>
          <div className="login-heading">
            <h2>Welcome back</h2>
            <p>Sign in to continue to your dashboard.</p>
          </div>

          <div className="role-switch" role="group" aria-label="Account type">
            {ROLES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`role-btn${role === item.id ? " active" : ""}`}
                onClick={() => selectRole(item.id)}
                aria-pressed={role === item.id}
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
          <p className="role-hint">{selectedRole.hint}</p>

          <label className="field" htmlFor="login-email">
            <span>Email or username</span>
            <div className="input-wrap">
              <Icon name="mail" />
              <input
                id="login-email"
                type="text"
                autoComplete="username"
                placeholder={`${role}@subly.app`}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
          </label>

          <label className="field" htmlFor="login-password">
            <span>Password</span>
            <div className="input-wrap has-action">
              <Icon name="lock" />
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                className="reveal"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                <Icon name={showPassword ? "eyeOff" : "eye"} />
              </button>
            </div>
          </label>

          <div className="login-row">
            <label className="check">
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
              />
              Remember me
            </label>
            <a href="#" onClick={(event) => event.preventDefault()}>
              Forgot password?
            </a>
          </div>

          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="login-submit" disabled={loading}>
            {loading ? "Signing in…" : `Sign in as ${selectedRole.label}`}
          </button>

          <p className="login-demo">
            Demo mode — any email and password will work.
          </p>
        </form>
      </main>
    </div>
  );
}
