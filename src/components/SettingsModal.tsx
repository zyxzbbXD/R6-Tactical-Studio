import { useRef, useEffect, forwardRef } from "react";
import { X, Key, Globe, Cpu, Sun, Moon, Languages } from "lucide-react";
import { useSettingsStore } from "../store/useSettingsStore";
import { t } from "../locales/i18n";

// ─── Language options ──────────────────────────────────────────────────────────

const LANGUAGES = [
  { code: "en",  label: "EN" },
  { code: "zh",  label: "中文" },
  { code: "ja",  label: "日本語" },
  { code: "ko",  label: "한국어" },
  { code: "fr",  label: "FR" },
  { code: "pt",  label: "PT" },
];

// ─── SettingsModal ─────────────────────────────────────────────────────────────

export default function SettingsModal() {
  const {
    isSettingsOpen, closeSettings,
    apiKey, baseUrl, model, setApiKey, setBaseUrl, setModel,
    theme, setTheme,
    language, setLanguage,
  } = useSettingsStore();

  // Close on Escape key
  useEffect(() => {
    if (!isSettingsOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") closeSettings(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isSettingsOpen, closeSettings]);

  const firstInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (isSettingsOpen) firstInputRef.current?.focus();
  }, [isSettingsOpen]);

  if (!isSettingsOpen) return null;

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 10000, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={closeSettings}
    >
      {/* Modal panel */}
      <div
        className="flex w-[480px] flex-col rounded-2xl overflow-hidden"
        style={{
          background: "var(--color-r6-surface)",
          border: "1px solid var(--color-r6-border)",
          boxShadow: "0 32px 80px rgba(0,0,0,0.8)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-5 py-4"
          style={{ borderBottom: "1px solid var(--color-r6-border)" }}
        >
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ background: "var(--color-r6-accent-dim)", border: "1px solid var(--color-r6-accent)" }}
          >
            <Cpu size={18} style={{ color: "var(--color-r6-accent)" }} />
          </div>
          <div className="flex-1">
            <p className="text-[16px] font-semibold" style={{ color: "var(--color-r6-text)" }}>
              {t("AI Settings", language)}
            </p>
            <p className="text-[13px]" style={{ color: "var(--color-r6-muted)" }}>
              {t("API subtitle", language)}
            </p>
          </div>
          <button
            onClick={closeSettings}
            className="flex h-9 w-9 items-center justify-center rounded-xl transition-colors"
            style={{ color: "var(--color-r6-muted)" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-r6-surface-3)"; e.currentTarget.style.color = "var(--color-r6-text)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--color-r6-muted)"; }}
          >
            <X size={17} />
          </button>
        </div>

        {/* Fields */}
        <div className="flex flex-col gap-5 px-5 py-5">
          <Field
            ref={firstInputRef}
            icon={<Globe size={15} />}
            label={t("Base URL", language)}
            hint={t("Base URL hint", language)}
            value={baseUrl}
            onChange={setBaseUrl}
            placeholder="https://api.openai.com"
          />
          <Field
            icon={<Key size={15} />}
            label={t("API Key", language)}
            hint={t("API Key hint", language)}
            value={apiKey}
            onChange={setApiKey}
            placeholder="sk-..."
            type="password"
          />
          <Field
            icon={<Cpu size={15} />}
            label={t("Model", language)}
            hint={t("Model hint", language)}
            value={model}
            onChange={setModel}
            placeholder="gpt-4o-mini"
          />

          {/* Divider */}
          <div style={{ borderTop: "1px solid var(--color-r6-border)" }} />

          {/* Theme selector */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span style={{ color: "var(--color-r6-muted)" }}><Sun size={15} /></span>
              <span className="text-[14px] font-medium" style={{ color: "var(--color-r6-text)" }}>
                {t("Theme", language)}
              </span>
            </div>
            <div
              className="flex rounded-xl overflow-hidden"
              style={{ background: "var(--color-r6-surface-2)", border: "1px solid var(--color-r6-border)" }}
            >
              {(["dark", "light"] as const).map((th) => {
                const active = theme === th;
                const Icon = th === "dark" ? Moon : Sun;
                return (
                  <button
                    key={th}
                    onClick={() => setTheme(th)}
                    className="flex flex-1 items-center justify-center gap-2 py-2 text-[14px] font-medium transition-colors"
                    style={{
                      background: active ? "var(--color-r6-accent-dim)" : "transparent",
                      color: active ? "var(--color-r6-accent)" : "var(--color-r6-muted)",
                      borderBottom: active ? "2px solid var(--color-r6-accent)" : "2px solid transparent",
                    }}
                    onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = "var(--color-r6-text)"; }}
                    onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = "var(--color-r6-muted)"; }}
                  >
                    <Icon size={14} />
                    {t(th === "dark" ? "Dark" : "Light", language)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Language selector */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span style={{ color: "var(--color-r6-muted)" }}><Languages size={15} /></span>
              <span className="text-[14px] font-medium" style={{ color: "var(--color-r6-text)" }}>
                {t("Language", language)}
              </span>
            </div>
            <div
              className="flex rounded-xl overflow-hidden"
              style={{ background: "var(--color-r6-surface-2)", border: "1px solid var(--color-r6-border)" }}
            >
              {LANGUAGES.map((lang, i) => {
                const active = language === lang.code;
                return (
                  <button
                    key={lang.code}
                    onClick={() => setLanguage(lang.code)}
                    className="flex flex-1 items-center justify-center py-2 text-[13px] font-medium transition-colors"
                    style={{
                      background: active ? "var(--color-r6-accent-dim)" : "transparent",
                      color: active ? "var(--color-r6-accent)" : "var(--color-r6-muted)",
                      borderBottom: active ? "2px solid var(--color-r6-accent)" : "2px solid transparent",
                      borderRight: i < LANGUAGES.length - 1 ? "1px solid var(--color-r6-border)" : undefined,
                    }}
                    onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = "var(--color-r6-text)"; }}
                    onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = "var(--color-r6-muted)"; }}
                  >
                    {lang.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderTop: "1px solid var(--color-r6-border)", background: "var(--color-r6-surface-2)" }}
        >
          <p className="text-[13px]" style={{ color: "var(--color-r6-muted-2)" }}>
            {t("Changes saved", language)}
          </p>
          <button
            onClick={closeSettings}
            className="rounded-xl px-5 py-2 text-[14px] font-medium transition-opacity"
            style={{ background: "var(--color-r6-accent)", color: "#fff" }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            {t("Done", language)}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Field sub-component ───────────────────────────────────────────────────────

interface FieldProps {
  icon: React.ReactNode;
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}

const Field = forwardRef<HTMLInputElement, FieldProps>(
  ({ icon, label, hint, value, onChange, placeholder, type = "text" }, ref) => (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span style={{ color: "var(--color-r6-muted)" }}>{icon}</span>
        <label className="text-[14px] font-medium" style={{ color: "var(--color-r6-text)" }}>
          {label}
        </label>
      </div>
      <input
        ref={ref}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        className="w-full rounded-xl px-3 py-2.5 text-[14px] outline-none transition-colors"
        style={{
          background: "var(--color-r6-surface-2)",
          border: "1px solid var(--color-r6-border)",
          color: "var(--color-r6-text)",
          caretColor: "var(--color-r6-accent)",
        }}
        onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-r6-accent)")}
        onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-r6-border)")}
      />
      <p className="text-[13px]" style={{ color: "var(--color-r6-muted-2)" }}>{hint}</p>
    </div>
  )
);
