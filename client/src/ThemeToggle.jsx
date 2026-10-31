import Icon from "./Icon.jsx";

export default function ThemeToggle({ theme, onToggle }) {
  const next = theme === "light" ? "dark" : "light";

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={onToggle}
      aria-label={`Switch to ${next} mode`}
    >
      <Icon name={theme === "light" ? "sun" : "moon"} />
      <span>{theme === "light" ? "Light" : "Dark"}</span>
    </button>
  );
}
