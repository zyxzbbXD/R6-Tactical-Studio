import { useState, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { Bot, FileText, Loader2, AlertCircle, Eye, Pencil } from "lucide-react";
import { useSettingsStore } from "../store/useSettingsStore";
import { useBoardStore } from "../store/useBoardStore";
import { t } from "../locales/i18n";

// ─── System prompt ──────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `\
你是一个专业的《彩虹六号：围攻》电竞教练。
请仔细阅读用户提供的复盘文本或字幕，提取出核心战术安排，按照以下【双区块格式】输出，不要任何多余解释。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【区块一：三阶段执行表格】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
输出一个 Markdown 表格，表头固定为：

| 干员位置 | 开局（~1:45）| 中期（~1:00）| 后期 | 备注 |

- 每行对应一个干员的站位/职责。
- 单元格内用 "- 动作" 格式，每格 1-2 条，保持极简。
- **关键动作**（下包位、切墙、关键道具）必须加粗。
- 动词开头——进攻：车、推、控、切、压、跳、架、拿、下包；防守：防、打野、封、保、听电、Retake、死蹲、架。
- 备注列只写下包精确位或干员替换建议，无内容则留空。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【区块二：战术 Point 总结】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
表格下方另起一节，用三级标题 ### [进攻/防守] Point，以无序列表精炼总结 2-4 条核心控制逻辑。
严禁使用比喻或修辞，只写区域控制关系和执行顺序。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【报点规范】
术语严格使用标准图报点（如：蓝通、IT、hatch、default、摩托、铁箱）。
前期动作若多人相似，合并描述，重点突出中后期差异。`;

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
        ? `\n\n当前画板上的干员：${items.map((i) => i.name).join("、")}`
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
            { role: "system", content: SYSTEM_PROMPT },
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
        throw new Error("API 返回了成功状态，但 choices[0].message.content 为空。请检查 model 名称是否正确。");
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
            placeholder={"粘贴字幕、解说文稿、文字复盘内容…\n\nAI 将自动提取干员分工，生成「开局 / 中期 / 后期」战术表格。"}
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
              >{`### 准备阶段\n- **Ash**: 留车在蓝通，人挂窗。\n- **Thermite**: 准备切外墙…\n\n### 局中执行\n- 配合闪光弹强切 **IT 房**。\n\n点击 Generate 或切到 Edit 手动编写。`}</p>
            </div>
          )}
        </div>
      </div>
    </div>
    </aside>
  );
}
