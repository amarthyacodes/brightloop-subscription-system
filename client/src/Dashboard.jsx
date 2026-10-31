import { useState } from "react";
import Icon from "./Icon.jsx";
import ThemeToggle from "./ThemeToggle.jsx";
import "./App.css";

const SUBSCRIPTIONS = [
  {
    id: 1,
    name: "Netflix",
    plan: "Premium",
    category: "Entertainment",
    price: 17.99,
    cycle: "Monthly",
    next: { month: "Nov", day: 4 },
    status: "Active",
    color: "#e50914",
    initial: "N",
  },
  {
    id: 2,
    name: "Spotify",
    plan: "Duo",
    category: "Music",
    price: 14.99,
    cycle: "Monthly",
    next: { month: "Nov", day: 7 },
    status: "Active",
    color: "#1db954",
    initial: "S",
  },
  {
    id: 3,
    name: "Adobe Creative Cloud",
    plan: "All Apps",
    category: "Software",
    price: 59.99,
    cycle: "Monthly",
    next: { month: "Nov", day: 12 },
    status: "Active",
    color: "#fa0f00",
    initial: "A",
  },
  {
    id: 4,
    name: "Notion",
    plan: "Plus",
    category: "Productivity",
    price: 10.0,
    cycle: "Monthly",
    next: { month: "Nov", day: 15 },
    status: "Trial",
    color: "#6b7280",
    initial: "N",
  },
  {
    id: 5,
    name: "iCloud+",
    plan: "2 TB",
    category: "Cloud storage",
    price: 9.99,
    cycle: "Monthly",
    next: { month: "Nov", day: 21 },
    status: "Active",
    color: "#007aff",
    initial: "i",
  },
  {
    id: 6,
    name: "YouTube Premium",
    plan: "Individual",
    category: "Entertainment",
    price: 13.99,
    cycle: "Monthly",
    next: { month: "Nov", day: 28 },
    status: "Active",
    color: "#ff0000",
    initial: "Y",
  },
  {
    id: 7,
    name: "Figma",
    plan: "Professional",
    category: "Design",
    price: 15.0,
    cycle: "Monthly",
    next: { month: "Nov", day: 2 },
    status: "Paused",
    color: "#a259ff",
    initial: "F",
  },
];

const NAV_BY_ROLE = {
  admin: [
    { id: "dashboard", label: "Dashboard", icon: "grid" },
    { id: "subscriptions", label: "Subscriptions", icon: "card" },
    { id: "users", label: "Users", icon: "users" },
    { id: "settings", label: "Settings", icon: "settings" },
  ],
  user: [
    { id: "dashboard", label: "Dashboard", icon: "grid" },
    { id: "subscriptions", label: "My subscriptions", icon: "card" },
    { id: "billing", label: "Billing", icon: "wallet" },
    { id: "settings", label: "Settings", icon: "settings" },
  ],
  worker: [
    { id: "dashboard", label: "Dashboard", icon: "grid" },
    { id: "tasks", label: "Assigned tasks", icon: "check" },
    { id: "accounts", label: "Accounts", icon: "users" },
    { id: "reports", label: "Reports", icon: "chart" },
  ],
};

const ROLE_LABELS = {
  admin: "Admin",
  user: "User",
  worker: "Worker",
};

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export default function Dashboard({
  session,
  theme,
  onToggleTheme,
  onLogout,
}) {
  const [activeNav, setActiveNav] = useState("dashboard");

  const navItems = NAV_BY_ROLE[session.role] ?? NAV_BY_ROLE.user;
  const roleLabel = ROLE_LABELS[session.role] ?? "User";
  const firstName = session.name.split(" ")[0];
  const initials = session.name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const activeSubscriptions = SUBSCRIPTIONS.filter((s) => s.status === "Active");
  const monthlyTotal = activeSubscriptions.reduce((sum, s) => sum + s.price, 0);
  const annualTotal = monthlyTotal * 12;
  const upcoming = [...SUBSCRIPTIONS]
    .filter((s) => s.status !== "Paused")
    .sort((a, b) => a.next.day - b.next.day)
    .slice(0, 4);
  const nextPayment = upcoming[0];

  const stats = [
    {
      label: "Monthly spend",
      value: currency.format(monthlyTotal),
      sub: "4.2% less than last month",
      subClass: "positive",
      icon: "wallet",
    },
    {
      label: "Active subscriptions",
      value: String(activeSubscriptions.length),
      sub: `of ${SUBSCRIPTIONS.length} tracked plans`,
      icon: "card",
    },
    {
      label: "Next payment",
      value: `${nextPayment.next.month} ${nextPayment.next.day}`,
      sub: `${nextPayment.name} · ${currency.format(nextPayment.price)}`,
      icon: "calendar",
    },
    {
      label: "Annual projection",
      value: currency.format(annualTotal),
      sub: "Based on active plans",
      icon: "trend",
    },
  ];

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">S</span>
          <span>Subly</span>
        </div>

        <nav className="nav" aria-label="Main navigation">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-item${activeNav === item.id ? " active" : ""}`}
              onClick={() => setActiveNav(item.id)}
              aria-current={activeNav === item.id ? "page" : undefined}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user">
            <span className="user-avatar">{initials}</span>
            <div className="user-info">
              <strong>{session.name}</strong>
              <span>{session.email}</span>
            </div>
          </div>
          <button type="button" className="logout-btn" onClick={onLogout}>
            <Icon name="logout" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="page-title">
            <h1>Dashboard</h1>
            <p>Welcome back, {firstName}. Here is your overview.</p>
          </div>
          <div className="topbar-actions">
            <span className={`role-pill ${session.role}`}>{roleLabel}</span>
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            <button type="button" className="btn-primary">
              <Icon name="plus" />
              <span>Add subscription</span>
            </button>
          </div>
        </header>

        <main className="content">
          <section className="stats" aria-label="Key figures">
            {stats.map((stat) => (
              <article className="stat-card" key={stat.label}>
                <div className="stat-label">
                  <span>{stat.label}</span>
                  <span className="stat-icon">
                    <Icon name={stat.icon} />
                  </span>
                </div>
                <div className="stat-value">{stat.value}</div>
                <div className={`stat-sub ${stat.subClass ?? ""}`}>
                  {stat.sub}
                </div>
              </article>
            ))}
          </section>

          <div className="grid-2">
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h2>Your subscriptions</h2>
                  <p>Plans you are currently tracking</p>
                </div>
                <button type="button" className="btn-ghost">
                  View all
                </button>
              </div>

              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Service</th>
                      <th>Price</th>
                      <th>Next billing</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SUBSCRIPTIONS.map((sub) => (
                      <tr key={sub.id}>
                        <td>
                          <div className="sub-name">
                            <span
                              className="sub-logo"
                              style={{ background: sub.color }}
                            >
                              {sub.initial}
                            </span>
                            <div>
                              <strong>{sub.name}</strong>
                              <span>
                                {sub.plan} · {sub.category}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="price">
                          {currency.format(sub.price)}
                          <span className="cycle">/mo</span>
                        </td>
                        <td className="muted-cell">
                          {sub.next.month} {sub.next.day}, 2026
                        </td>
                        <td>
                          <span
                            className={`badge ${sub.status.toLowerCase()}`}
                          >
                            {sub.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel">
              <div className="panel-head">
                <div>
                  <h2>Upcoming payments</h2>
                  <p>Next charges this month</p>
                </div>
              </div>

              <ul className="upcoming">
                {upcoming.map((sub) => (
                  <li className="upcoming-item" key={sub.id}>
                    <span className="upcoming-date">
                      <strong>{sub.next.day}</strong>
                      <span>{sub.next.month}</span>
                    </span>
                    <div className="upcoming-info">
                      <strong>{sub.name}</strong>
                      <span>{sub.plan}</span>
                    </div>
                    <span className="upcoming-price">
                      {currency.format(sub.price)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="panel-foot">
                <span>Total due this month</span>
                <strong>
                  {currency.format(
                    upcoming.reduce((sum, sub) => sum + sub.price, 0)
                  )}
                </strong>
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
