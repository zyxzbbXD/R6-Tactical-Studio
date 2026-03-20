import { create } from "zustand";
import { persist } from "zustand/middleware";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface SettingsState {
  // API config — persisted to localStorage
  apiKey: string;
  baseUrl: string;
  model: string;

  // Appearance
  theme: "dark" | "light";
  language: string;

  // UI state — persisted so panel stays open across reloads
  isRightSidebarOpen: boolean;
  rightSidebarTab: "timeline" | "ai";
  isSettingsOpen: boolean;
  isImportModalOpen: boolean;

  // Advanced mode — unlocks power-user tools (e.g. custom room labels)
  isAdvancedMode: boolean;

  // AI auxiliary mode — opt-in beta feature
  isAiModeEnabled: boolean;

  // Actions
  setApiKey: (key: string) => void;
  setBaseUrl: (url: string) => void;
  setModel: (model: string) => void;
  setTheme: (theme: "dark" | "light") => void;
  setLanguage: (lang: string) => void;
  toggleRightSidebar: () => void;
  openExportPanel: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  openImportModal: () => void;
  closeImportModal: () => void;
  setAdvancedMode: (v: boolean) => void;
  setAiModeEnabled: (val: boolean) => void;
  setRightSidebarTab: (tab: "timeline" | "ai") => void;
}

// ─── Store ─────────────────────────────────────────────────────────────────────

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      apiKey: "",
      baseUrl: "https://api.openai.com",
      model: "gpt-4o-mini",
      theme: "dark",
      language: "zh",
      isRightSidebarOpen: false,
      rightSidebarTab: "timeline",
      isSettingsOpen: false,
      isImportModalOpen: false,
      isAdvancedMode: false,
      isAiModeEnabled: false,

      setApiKey: (key) => set({ apiKey: key }),
      setBaseUrl: (url) => set({ baseUrl: url }),
      setModel: (model) => set({ model }),
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      toggleRightSidebar: () => set((s) => ({ isRightSidebarOpen: !s.isRightSidebarOpen })),
      openExportPanel: () => set({ isRightSidebarOpen: true }),
      openSettings: () => set({ isSettingsOpen: true }),
      closeSettings: () => set({ isSettingsOpen: false }),
      openImportModal: () => set({ isImportModalOpen: true }),
      closeImportModal: () => set({ isImportModalOpen: false }),
      setAdvancedMode: (v) => set({ isAdvancedMode: v }),
      setAiModeEnabled: (val) => set({ isAiModeEnabled: val }),
      setRightSidebarTab: (tab) => set({ rightSidebarTab: tab }),
    }),
    {
      name: "r6-settings",
      partialize: (s) => ({
        apiKey: s.apiKey,
        baseUrl: s.baseUrl,
        model: s.model,
        theme: s.theme,
        language: s.language,
        isRightSidebarOpen: s.isRightSidebarOpen,
        isAdvancedMode: s.isAdvancedMode,
        isAiModeEnabled: s.isAiModeEnabled,
      }),
    }
  )
);
