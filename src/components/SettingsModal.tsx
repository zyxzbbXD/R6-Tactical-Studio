import { useRef, useEffect, forwardRef } from "react";
import { X, Key, Globe, Cpu, Sun, Moon, Languages, Settings2 } from "lucide-react";
import { useSettingsStore } from "../store/useSettingsStore";
import { t } from "../locales/i18n";
import { cn } from "../utils/cn";

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
    isAdvancedMode, setAdvancedMode,
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
      className="fixed inset-0 flex items-center justify-center backdrop-blur-sm"
      style={{ zIndex: 10000, background: "rgba(0,0,0,0.6)" }}
      onClick={closeSettings}
    >
      {/* Modal panel */}
      <div
        className="flex w-[520px] flex-col rounded-2xl overflow-hidden bg-r6-surface border border-r6-border"
        style={{ boxShadow: "0 32px 80px rgba(0,0,0,0.8)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-r6-border">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-r6-accent-dim border border-r6-accent">
            <Cpu size={18} className="text-r6-accent" />
          </div>
          <div className="flex-1">
            <p className="text-[16px] font-semibold text-r6-text">
              {t("AI Settings", language)}
            </p>
            <p className="text-[13px] text-r6-muted">
              {t("API subtitle", language)}
            </p>
          </div>
          <button
            onClick={closeSettings}
            className="flex h-9 w-9 items-center justify-center rounded-xl transition-colors text-r6-muted hover:bg-r6-surface-3 hover:text-r6-text"
          >
            <X size={17} />
          </button>
        </div>

        {/* Fields */}
        <div className="flex flex-col gap-6 px-6 py-6">
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
          <div className="border-t border-r6-border" />

          {/* Theme selector */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="text-r6-muted"><Sun size={15} /></span>
              <span className="text-[14px] font-medium text-r6-text">
                {t("Theme", language)}
              </span>
            </div>
            <div className="flex rounded-xl overflow-hidden bg-r6-surface-2 border border-r6-border">
              {(["dark", "light"] as const).map((th) => {
                const active = theme === th;
                const Icon = th === "dark" ? Moon : Sun;
                return (
                  <button
                    key={th}
                    onClick={() => setTheme(th)}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-2 py-2 text-[14px] font-medium transition-colors border-b-2",
                      active
                        ? "bg-r6-accent-dim text-r6-accent border-b-r6-accent"
                        : "bg-transparent text-r6-muted border-b-transparent hover:text-r6-text"
                    )}
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
              <span className="text-r6-muted"><Languages size={15} /></span>
              <span className="text-[14px] font-medium text-r6-text">
                {t("Language", language)}
              </span>
            </div>
            <div className="flex rounded-xl overflow-hidden bg-r6-surface-2 border border-r6-border">
              {LANGUAGES.map((lang, i) => {
                const active = language === lang.code;
                return (
                  <button
                    key={lang.code}
                    onClick={() => setLanguage(lang.code)}
                    className={cn(
                      "flex flex-1 items-center justify-center py-2 text-[13px] font-medium transition-colors border-b-2",
                      active
                        ? "bg-r6-accent-dim text-r6-accent border-b-r6-accent"
                        : "bg-transparent text-r6-muted border-b-transparent hover:text-r6-text"
                    )}
                    style={i < LANGUAGES.length - 1 ? { borderRight: "1px solid var(--color-r6-border)" } : undefined}
                  >
                    {lang.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-r6-border" />

          {/* Advanced Edit Mode toggle */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-r6-muted"><Settings2 size={15} /></span>
                <span className="text-[14px] font-medium text-r6-text">
                  {t("advanced_mode", language)}
                </span>
              </div>
              <p className="text-[13px] text-r6-muted-2 leading-snug">
                {t("advanced_mode_hint", language)}
              </p>
            </div>
            {/* Toggle switch */}
            <button
              onClick={() => setAdvancedMode(!isAdvancedMode)}
              className={cn(
                "relative mt-0.5 shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
                isAdvancedMode ? "bg-r6-accent" : "bg-r6-surface-3"
              )}
              role="switch"
              aria-checked={isAdvancedMode}
            >
              <span
                className={cn(
                  "inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                  isAdvancedMode ? "translate-x-6" : "translate-x-1"
                )}
              />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-r6-border bg-r6-surface-2">
          <p className="text-[13px] text-r6-muted-2">
            {t("Changes saved", language)}
          </p>
          <button
            onClick={closeSettings}
            className="rounded-xl px-6 py-2.5 text-[14px] font-medium transition-opacity bg-r6-accent text-white hover:opacity-85"
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
        <span className="text-r6-muted">{icon}</span>
        <label className="text-[14px] font-medium text-r6-text">
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
        className="w-full rounded-xl px-3.5 py-2.5 text-[14px] outline-none transition-colors bg-r6-surface-2 border border-r6-border text-r6-text caret-r6-accent focus:border-r6-accent"
      />
      <p className="text-[13px] text-r6-muted-2">{hint}</p>
    </div>
  )
);
