import { useState } from "react";
import { browserLocalPersistence, browserSessionPersistence, confirmPasswordReset, createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, setPersistence, signInWithEmailAndPassword, signOut, updateProfile } from "firebase/auth";
import Icon from "./Icon.jsx";
import { firebaseAuth } from "./firebase.js";
import "./Login.css";

const TITLES = {
  login: ["Welcome back", "Sign in to continue to your workspace."],
  signup: ["Create your account", "Start managing subscriptions with Brightloop."],
  "staff-signup": ["Join your team", "Complete your invited Brightloop account."],
  "forgot-password": ["Reset your password", "We’ll send a secure reset link if your account exists."],
  "reset-password": ["Choose a new password", "Create a strong password for your account."],
};

const ENDPOINTS = {
  "staff-signup": "/api/auth/signup/staff",
};
export default function Login({ view, onAuthenticated, initialError = "" }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState(initialError);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const [title, subtitle] = TITLES[view] || TITLES.login;
  const needsName = view === "signup" || view === "staff-signup";
  const needsConfirm = needsName || view === "reset-password";
  const needsEmail = view !== "reset-password";
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token") || "";
  const firebaseResetCode = params.get("oobCode") || "";

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (needsName && !name.trim()) {
      setError("Enter your full name.");
      return;
    }
    if (needsEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    if (view === "login" && !password) {
      setError("Enter your password.");
      return;
    }
    if (needsConfirm && password.length < 9) {
      setError("Password must be more than 8 characters.");
      return;
    }
    if (needsConfirm && new TextEncoder().encode(password).length > 72) {
      setError("Password must be 72 bytes or fewer.");
      return;
    }
    if (needsConfirm && (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[^A-Za-z0-9]/.test(password))) {
      setError("Use an uppercase letter, a lowercase letter, and a symbol in your password.");
      return;
    }
    if (needsConfirm && password !== confirmPassword) {
      setError("Your passwords do not match.");
      return;
    }
    if (view === "staff-signup" && !token) {
      setError("This invitation link is missing its token. Ask your admin to send a new invitation.");
      return;
    }
    if (view === "reset-password" && !firebaseResetCode) {
      setError("This password reset link is missing its token. Request a new link.");
      return;
    }

    setLoading(true);
    try {
      if (view === "login" || view === "signup" || view === "staff-signup") {
        await setPersistence(firebaseAuth, remember ? browserLocalPersistence : browserSessionPersistence);
        if (view === "login") sessionStorage.setItem("brightloop-remember", remember ? "true" : "false");
        if (view === "signup" || view === "staff-signup") sessionStorage.setItem("brightloop-registration-in-progress", "true");
        let credential;
        if (view === "login") credential = await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
        else {
          try { credential = await createUserWithEmailAndPassword(firebaseAuth, email.trim(), password); }
          catch (createError) {
            if (view !== "staff-signup" || createError.code !== "auth/email-already-in-use") throw createError;
            credential = await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
          }
        }
        if (view === "staff-signup") {
          sessionStorage.setItem("brightloop-registration-in-progress", "true");
          await updateProfile(credential.user, { displayName: name.trim() });
          const response = await fetch(ENDPOINTS[view], {
            method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: name.trim(), email: email.trim(), token, idToken: await credential.user.getIdToken() }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "This invitation could not be accepted.");
          sessionStorage.removeItem("brightloop-registration-in-progress");
          onAuthenticated(result.user);
          window.location.replace("/staff/dashboard");
          return;
        }
        if (view === "signup") {
          sessionStorage.setItem("brightloop-registration-in-progress", "true");
          await updateProfile(credential.user, { displayName: name.trim() });
          await sendEmailVerification(credential.user, { url: `${window.location.origin}/login` });
          await signOut(firebaseAuth);
          sessionStorage.removeItem("brightloop-registration-in-progress");
          setMessage("Check your email and verify your address before signing in.");
          setLoading(false);
          return;
        }
        if (!credential.user.emailVerified) {
          await sendEmailVerification(credential.user, { url: `${window.location.origin}/login` });
          await signOut(firebaseAuth);
          sessionStorage.removeItem("brightloop-registration-in-progress");
          setMessage("Check your email and verify your address before signing in.");
          setLoading(false);
          return;
        }
        if (view === "login") {
          setLoading(false);
          return;
        }
      }
      if (view === "forgot-password") {
        await sendPasswordResetEmail(firebaseAuth, email.trim(), { url: `${window.location.origin}/login`, handleCodeInApp: false });
        setMessage("If an account exists for that email, Firebase will send a password reset link.");
        setLoading(false);
        return;
      }
      if (view === "reset-password" && firebaseResetCode) {
        await confirmPasswordReset(firebaseAuth, firebaseResetCode, password);
        setMessage("Your password has been updated. You can now sign in.");
        setLoading(false);
        window.history.replaceState({}, "", "/login");
        return;
      }
    } catch (firebaseError) {
      if (view === "staff-signup" || view === "signup") {
        sessionStorage.removeItem("brightloop-registration-in-progress");
        await signOut(firebaseAuth).catch(() => {});
      }
      const messages = {
        "auth/invalid-credential": "Email or password is incorrect.",
        "auth/email-already-in-use": "An account with this email already exists.",
        "auth/weak-password": "Choose a stronger password (at least 6 characters).",
        "auth/invalid-email": "Enter a valid email address.",
        "auth/user-not-found": "If an account exists for that email, Firebase will send a password reset link.",
        "auth/expired-action-code": "This password reset link has expired. Request a new one.",
        "auth/invalid-action-code": "This password reset link is invalid or has already been used.",
        "auth/too-many-requests": "Too many attempts. Please wait and try again.",
      };
      setError(messages[firebaseError.code] || firebaseError.message || "Unable to connect to Firebase. Check your Firebase settings and try again.");
      setLoading(false);
      return;
    }

  }

  return (
    <div className="login">
      <aside className="login-aside">
        <a className="login-brand" href="/login">
          <span className="login-brand-mark">B</span>
          <span>Brightloop</span>
        </a>
        <div className="login-pitch">
          <p className="eyebrow">SUBSCRIPTION OPERATIONS</p>
          <h1>Clarity for every recurring commitment.</h1>
          <p>One secure workspace for your plans, teams, renewals, and billing.</p>
          <ul className="login-points">
            <li><span className="point-check"><Icon name="check" /></span>See your subscription portfolio at a glance</li>
            <li><span className="point-check"><Icon name="check" /></span>Give each team member the right access</li>
            <li><span className="point-check"><Icon name="check" /></span>Stay ahead of renewals and billing</li>
          </ul>
        </div>
        <p className="login-foot">Secure subscription management for growing teams.</p>
      </aside>

      <main className="login-main">
        <a className="login-mobile-brand" href="/login">
          <span className="login-brand-mark">B</span><span>Brightloop</span>
        </a>
        <section className="login-card" aria-labelledby="auth-title">
          <div className="login-heading">
            <p className="eyebrow">BRIGHTLOOP ACCOUNT</p>
            <h2 id="auth-title">{title}</h2>
            <p>{subtitle}</p>
          </div>

          <form onSubmit={handleSubmit} noValidate>
            {needsName && (
              <label className="field" htmlFor="auth-name">
                <span>Full name</span>
                <input id="auth-name" type="text" autoComplete="name" maxLength={120} required value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" />
              </label>
            )}

            {needsEmail && (
              <label className="field" htmlFor="auth-email">
                <span>Email address</span>
                <div className="input-wrap">
                  <Icon name="mail" />
                  <input id="auth-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" />
                </div>
              </label>
            )}

            {view !== "forgot-password" && (
              <label className="field" htmlFor="auth-password">
                <span>Password</span>
                <div className="input-wrap has-action">
                  <Icon name="lock" />
                  <input id="auth-password" type={showPassword ? "text" : "password"} autoComplete={view === "login" ? "current-password" : "new-password"} minLength={view === "login" ? undefined : 9} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder={view === "login" ? "Your password" : "More than 8 characters"} />
                  <button type="button" className="reveal" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"}><Icon name={showPassword ? "eyeOff" : "eye"} /></button>
                </div>
              </label>
            )}

            {needsConfirm && (
              <label className="field" htmlFor="auth-confirm-password">
                <span>Confirm password</span>
                <div className="input-wrap has-action">
                  <Icon name="lock" />
                  <input id="auth-confirm-password" type={showConfirmPassword ? "text" : "password"} autoComplete="new-password" minLength={9} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Enter your password again" />
                  <button type="button" className="reveal" onClick={() => setShowConfirmPassword((visible) => !visible)} aria-label={showConfirmPassword ? "Hide password" : "Show password"}><Icon name={showConfirmPassword ? "eyeOff" : "eye"} /></button>
                </div>
              </label>
            )}

            {view === "login" && (
              <div className="login-row">
                <label className="check"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /> Remember me</label>
                <a href="/forgot-password">Forgot password?</a>
              </div>
            )}

            {needsConfirm && <p className="password-hint">Use more than 8 characters with uppercase, lowercase, and a symbol.</p>}
            {error && <p className="login-error" role="alert">{error}</p>}
            {message && <p className="login-success" role="status">{message}</p>}

            <button type="submit" className="login-submit" disabled={loading}>
              {loading ? "Please wait…" : view === "login" ? "Sign in" : view === "signup" ? "Create customer account" : view === "staff-signup" ? "Complete staff signup" : view === "forgot-password" ? "Send reset link" : "Save new password"}
            </button>
          </form>

          <div className="auth-switch">
            {view === "login" && <>New to Brightloop? <a href="/signup">Create a customer account</a></>}
            {view === "signup" && <>Already have an account? <a href="/login">Sign in</a></>}
            {view === "staff-signup" && <>Invited by your admin. <a href="/login">Return to sign in</a></>}
            {view === "forgot-password" && <a href="/login">Return to sign in</a>}
            {view === "reset-password" && <a href="/login">Return to sign in</a>}
          </div>
        </section>
      </main>
    </div>
  );
}
