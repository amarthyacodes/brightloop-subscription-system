import { useState } from "react";
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "firebase/auth";
import { firebaseAuth } from "./firebase.js";
import Icon from "./Icon.jsx";
import "./Login.css";

export default function ChangePassword({ user, onComplete }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function finishPasswordChange() {
    const currentUser = firebaseAuth.currentUser;
    if (!currentUser) throw new Error("Your Firebase session has expired. Sign in again.");
    const idToken = await currentUser.getIdToken(true);
    const response = await fetch("/api/auth/complete-password-change", {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not finish updating your account.");
    await currentUser.getIdToken(true);
    onComplete();
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (password.length < 9 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      setError("Use more than 8 characters with uppercase, lowercase, and a symbol.");
      return;
    }
    if (password !== confirmation) {
      setError("Your new passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      const currentUser = firebaseAuth.currentUser;
      if (!currentUser || !currentUser.email) throw new Error("Your Firebase session has expired. Sign in again.");
      await reauthenticateWithCredential(currentUser, EmailAuthProvider.credential(currentUser.email, currentPassword));
      await updatePassword(currentUser, password);
      await finishPasswordChange();
    } catch (requestError) {
      const messages = {
        "auth/invalid-credential": "Your current password is incorrect.",
        "auth/weak-password": "Choose a stronger password.",
        "auth/requires-recent-login": "Sign in again, then change your password.",
        "auth/too-many-requests": "Too many attempts. Wait a moment and try again.",
      };
      setError(messages[requestError.code] || requestError.message || "Unable to change your password.");
    } finally {
      setSaving(false);
    }
  }

  async function finishAlreadyChangedPassword() {
    setError("");
    setSaving(true);
    try { await finishPasswordChange(); }
    catch (requestError) { setError(requestError.message || "Unable to finish updating your account."); }
    finally { setSaving(false); }
  }

  return <div className="login"><aside className="login-aside"><a className="login-brand" href="/login"><span className="login-brand-mark">B</span><span>Brightloop</span></a><div className="login-pitch"><p className="eyebrow">ACCOUNT SECURITY</p><h1>Set a new password.</h1><p>Your account is ready. Choose a private password to continue to your workspace.</p></div><p className="login-foot">Signed in as {user.email}</p></aside><main className="login-main"><section className="login-card" aria-labelledby="change-password-title"><div className="login-heading"><p className="eyebrow">BRIGHTLOOP ACCOUNT</p><h2 id="change-password-title">Change your password</h2><p>{user.mustChangePassword ? "Set a personal password before continuing." : "Update the password for your account."}</p></div><form onSubmit={submit}><label className="field" htmlFor="current-password"><span>Current password</span><div className="input-wrap"><Icon name="lock" /><input id="current-password" type="password" autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></div></label><label className="field" htmlFor="new-password"><span>New password</span><div className="input-wrap"><Icon name="lock" /><input id="new-password" type="password" autoComplete="new-password" minLength={9} required value={password} onChange={(event) => setPassword(event.target.value)} /></div></label><label className="field" htmlFor="confirm-new-password"><span>Confirm new password</span><div className="input-wrap"><Icon name="lock" /><input id="confirm-new-password" type="password" autoComplete="new-password" minLength={9} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></div></label><p className="password-hint">Use more than 8 characters with uppercase, lowercase, and a symbol.</p>{error && <p className="login-error" role="alert">{error}</p>}<button type="submit" className="login-submit" disabled={saving}>{saving ? "Updating…" : "Update password"}</button></form>{user.mustChangePassword && <button type="button" className="secondary-button" onClick={finishAlreadyChangedPassword} disabled={saving}>I already changed my password — finish setup</button>}</section></main></div>;
}
