import { useState, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { Bot, FileText, Loader2, AlertCircle, Eye, Pencil } from "lucide-react";
import { useSettingsStore } from "../store/useSettingsStore";
import { useBoardStore } from "../store/useBoardStore";
import { t } from "../locales/i18n";


// ─── RightSidebar ───────────────────────────────────────────────────────────────

export default function RightSidebar() {
  const { apiKey, baseUrl, model, isRightSidebarOpen } = useSettingsStore();
  const language = useSettingsStore((s) => s.language);
  const items    = useBoardStore((s) => s.items);
  const notes    = useBoardStore((s) => s.notes);
  const setNotes = useBoardStore((s) => s.setNotes);

  const [inputText, setInputText]   = useState("");
  const [isLoading, setIsLoading]   = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [notesTab, setNotesTab]     = useState<"edit" | "preview">("preview");

  const abortRef = useRef<AbortController | null>(null);

  // ── AI call ─────────────────────────────────────────────────────────────────

  const handleGenerate = async () => {
    if (!apiKey.trim()) {
      setError("API Key not set. Open Settings (gear icon) to configure.");
      return;
    }
    if (!inputText.trim()) {
      setError("Please paste some match commentary or VOD subtitles first.");
      return;
    }

    setError(null);
    setIsLoading(true);
    abortRef.current = new AbortController();

    const boardContext =
      items.length > 0
        ? `${t("ai_board_context", language)}${items.map((i) => i.name).join(", ")}`
        : "";

    try {
      const endpoint = `${baseUrl.replace(/\/$/, "")}/v1/chat/completions`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: t("ai_system_prompt", language) },
            { role: "user", content: inputText + boardContext },
          ],
          temperature: 0.3,
          max_tokens: 1024,
          stream: false,
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`${res.status} ${res.statusText}: ${body}`);
      }

      const data = await res.json();
      const content: string | undefined = data?.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error(t("api_empty_response", language));
      }

      setNotes(content);
      setNotesTab("preview");
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    setIsLoading(false);
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <aside
      className={`flex h-full shrink-0 flex-col transition-all duration-300 ease-in-out ${
        isRightSidebarOpen ? "w-[320px] opacity-100" : "w-0 opacity-0 overflow-hidden"
      }`}
      style={{
        background: "var(--color-r6-surface)",
        borderLeft: isRightSidebarOpen ? "1px solid var(--color-r6-border)" : "none",
      }}
    >
    <div className="flex h-full w-[320px] flex-col">
      {/* ── AI Agent section ─────────────────────────────────────────────────── */}
      <div
        className="flex shrink-0 flex-col"
        style={{ borderBottom: "1px solid var(--color-r6-border)" }}
      >
        {/* Section header */}
        <div
          className="flex items-center gap-2 px-4 py-3"
          style={{ borderBottom: "1px solid var(--color-r6-border)" }}
        >
          <Bot size={17} style={{ color: "var(--color-r6-accent)" }} />
          <span className="text-[14px] font-semibold tracking-wide uppercase" style={{ color: "var(--color-r6-muted)" }}>
            {t("AI Tactic Agent", language)}
          </span>
        </div>

        {/* Input textarea */}
        <div className="flex flex-col gap-2 p-3">
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={t("ai_input_placeholder", language)}
            rows={6}
            className="w-full resize-none rounded-xl px-3 py-2 text-[13px] leading-relaxed outline-none transition-colors"
            style={{
              background: "var(--color-r6-surface-2)",
              border: "1px solid var(--color-r6-border)",
              color: "var(--color-r6-text)",
              caretColor: "var(--color-r6-accent)",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-r6-accent)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-r6-border)")}
          />

          {/* Error */}
          {error && (
            <div
              className="flex items-start gap-2 rounded-xl px-3 py-2 text-[13px] leading-snug"
              style={{ background: "rgba(232,93,42,0.1)", border: "1px solid rgba(232,93,42,0.3)", color: "#f97316" }}
            >
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          {/* Generate / Cancel button */}
          {isLoading ? (
            <button
              onClick={handleCancel}
              className="flex items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-medium transition-opacity"
              style={{ background: "var(--color-r6-surface-3)", color: "var(--color-r6-muted)", border: "1px solid var(--color-r6-border)" }}
            >
              <Loader2 size={15} className="animate-spin" />
              {t("Generating", language)}
            </button>
          ) : (
            <button
              onClick={handleGenerate}
              className="flex items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-medium transition-opacity"
              style={{ background: "var(--color-r6-accent)", color: "#fff" }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
            >
              <Bot size={15} />
              {t("Generate Tactic Table", language)}
            </button>
          )}
        </div>
      </div>

      {/* ── Notes / Markdown section ─────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Section header + tabs */}
        <div
          className="flex shrink-0 items-center gap-1 px-3 py-2"
          style={{ borderBottom: "1px solid var(--color-r6-border)" }}
        >
          <FileText size={15} style={{ color: "var(--color-r6-muted)" }} />
          <span className="flex-1 text-[14px] font-semibold tracking-wide uppercase" style={{ color: "var(--color-r6-muted)" }}>
            {t("Notes", language)}
          </span>
          {/* Tab toggle */}
          <div
            className="flex rounded-lg overflow-hidden"
            style={{ border: "1px solid var(--color-r6-border)" }}
          >
            {(["preview", "edit"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setNotesTab(tab)}
                className="flex items-center gap-1 px-2.5 py-1 text-[13px] transition-colors"
                style={{
                  background: notesTab === tab ? "var(--color-r6-accent-dim)" : "transparent",
                  color: notesTab === tab ? "var(--color-r6-accent)" : "var(--color-r6-muted)",
                }}
              >
                {tab === "preview" ? <Eye size={13} /> : <Pencil size={13} />}
                {tab === "preview" ? t("Preview", language) : t("Edit", language)}
              </button>
            ))}
          </div>
        </div>

        {/* Notes content */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {notesTab === "edit" ? (
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={"AI output appears here.\nYou can also type notes manually."}
              className="h-full w-full resize-none px-4 py-3 text-[13px] leading-relaxed outline-none"
              style={{
                background: "transparent",
                color: "var(--color-r6-text)",
                caretColor: "var(--color-r6-accent)",
                fontFamily: "ui-monospace, monospace",
              }}
            />
          ) : notes ? (
            <div
              className="prose-r6 px-4 py-3 text-[13px] leading-relaxed"
              style={{ color: "var(--color-r6-text)" }}
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{notes}</ReactMarkdown>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              <p
                className="text-[13px] leading-relaxed"
                style={{ color: "var(--color-r6-muted-2)", fontFamily: "ui-monospace, monospace", whiteSpace: "pre-line" }}
              >{t("ai_placeholder_text", language)}</p>
            </div>
          )}
        </div>
      </div>
    </div>
    </aside>
  );
}
