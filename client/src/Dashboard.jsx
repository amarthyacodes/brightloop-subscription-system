import { useCallback, useState } from "react";
import Icon from "./Icon.jsx";
import "./App.css";

const ROLE_CONTENT = {
  ADMIN: { label: "Administrator", title: "Admin dashboard", intro: "Manage your Brightloop workspace and team access." },
  STAFF: { label: "Staff", title: "Staff dashboard", intro: "Your team workspace is ready." },
  CUSTOMER: { label: "Customer", title: "Your dashboard", intro: "Welcome to your Brightloop subscription workspace." },
  WORKER: { label: "Worker", title: "Worker dashboard", intro: "Your team workspace is ready." },
  USER: { label: "User", title: "User dashboard", intro: "Welcome to your Brightloop workspace." },
};

export default function Dashboard({ user, initialStaff, initialInvitations, initialError, onLogout }) {
  const [staff, setStaff] = useState(initialStaff);
  const [invitations, setInvitations] = useState(initialInvitations);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState("");
  const [invitationLink, setInvitationLink] = useState("");
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);
  const content = ROLE_CONTENT[user.role] || ROLE_CONTENT.CUSTOMER;

  const loadStaff = useCallback(async () => {
    const response = await fetch("/api/users/staff", { credentials: "include" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Unable to load staff management.");
    setStaff(result.staff);
    setInvitations(result.invitations);
  }, []);

  async function invite(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/users/staff/invitations", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to create invitation.");
      setName("");
      setEmail("");
      setInvitationLink(result.invitation.link);
      setNotice(result.message);
      await loadStaff();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(member) {
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/users/staff/${member.id}/status`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !member.isActive }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to update staff account.");
      setStaff((current) => current.map((item) => item.id === member.id ? result.user : item));
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href={window.location.pathname}>
          <span className="brand-mark">B</span><span>Brightloop</span>
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <div className="nav-item active"><Icon name="grid" /><span>{content.title}</span></div>
        {user.role === "ADMIN" && <div className="nav-item"><Icon name="users" /><span>Staff management</span></div>}
        <div className="sidebar-footer">
          <div className="user-avatar">{user.name.slice(0, 1).toUpperCase()}</div>
          <div className="user-info"><strong>{user.name}</strong><span>{content.label}</span></div>
          <button type="button" className="logout-btn" onClick={onLogout} aria-label="Sign out"><Icon name="logout" /></button>
        </div>
      </aside>

      <main className="dashboard-main">
        <header className="dashboard-topbar">
          <div><p className="eyebrow">{content.label.toUpperCase()} WORKSPACE</p><h1>{content.title}</h1></div>
          <div className="topbar-meta">{user.isDemo && <span className="demo-badge">DEMO</span>}<div className="account-chip"><span className="account-dot" />{user.email}</div></div>
        </header>

        <div className="dashboard-content">
          <section className="welcome-card">
            <div className="welcome-icon"><Icon name="check" /></div>
            <div><p className="eyebrow">YOU’RE SIGNED IN</p><h2>Welcome, {user.name.split(" ")[0]}.</h2><p>{content.intro}</p></div>
          </section>

          {user.role === "ADMIN" && !user.isDemo && (
            <section className="management-grid" aria-label="Staff management">
              <article className="panel invite-panel">
                <div className="panel-heading"><div><p className="eyebrow">TEAM ACCESS</p><h2>Invite a staff member</h2></div><span className="panel-icon"><Icon name="plus" /></span></div>
                <p className="panel-description">Invitations are tied to the invited email and expire after seven days.</p>
                <form className="invite-form" onSubmit={invite}>
                  <label className="field" htmlFor="staff-name"><span>Full name</span><input id="staff-name" required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="Staff member name" /></label>
                  <label className="field" htmlFor="staff-email"><span>Email address</span><input id="staff-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" /></label>
                  {error && <p className="login-error" role="alert">{error}</p>}
                  {notice && <p className="login-success" role="status">{notice}</p>}
                  {invitationLink && <p className="invite-link"><span>Share this invite:</span><a href={invitationLink}>{invitationLink}</a></p>}
                  <button className="login-submit" type="submit" disabled={busy}>{busy ? "Creating invite…" : "Create staff invitation"}</button>
                </form>
              </article>

              <article className="panel team-panel">
                <div className="panel-heading"><div><p className="eyebrow">PEOPLE</p><h2>Staff management</h2></div><span className="count-pill">{staff.length} staff</span></div>
                {error && !notice && <p className="login-error" role="alert">{error}</p>}
                {staff.length === 0 ? <p className="empty-state">No staff accounts yet. Create an invitation to get started.</p> : (
                  <ul className="people-list">{staff.map((member) => (
                    <li key={member.id} className="person-row">
                      <span className="person-avatar">{member.name.slice(0, 1).toUpperCase()}</span>
                      <span className="person-details"><strong>{member.name}</strong><span>{member.email}</span></span>
                      <span className={`status-pill${member.isActive ? " is-active" : " is-inactive"}`}>{member.isActive ? "Active" : "Inactive"}</span>
                      <button type="button" className="text-button" onClick={() => changeStatus(member)}>{member.isActive ? "Deactivate" : "Activate"}</button>
                    </li>
                  ))}</ul>
                )}
                <div className="invitation-list"><h3>Pending invitations <span>{invitations.length}</span></h3>
                  {invitations.length === 0 ? <p className="empty-state compact">No pending invitations.</p> : invitations.map((invitation) => (
                    <div className="invitation-row" key={invitation.id}><span><strong>{invitation.name}</strong><small>{invitation.email}</small></span><span className="status-pill">Invited</span></div>
                  ))}
                </div>
              </article>
            </section>
          )}

          {(user.role !== "ADMIN" || user.isDemo) && <section className="panel role-panel"><div className="panel-heading"><div><p className="eyebrow">ACCOUNT</p><h2>{user.isDemo && user.role === "ADMIN" ? "Demo admin access" : "Your access"}</h2></div><span className="status-pill is-active">{content.label}</span></div><p className="panel-description">{user.isDemo ? "This local demo session is stored in your browser and is not connected to the database." : "Your account is active. Your role is managed by Brightloop and cannot be changed from this page."}</p></section>}
        </div>
      </main>
    </div>
  );
}
