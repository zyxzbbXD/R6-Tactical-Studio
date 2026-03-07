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
  isSettingsOpen: boolean;

  // Actions
  setApiKey: (key: string) => void;
  setBaseUrl: (url: string) => void;
  setModel: (model: string) => void;
  setTheme: (theme: "dark" | "light") => void;
  setLanguage: (lang: string) => void;
  toggleRightSidebar: () => void;
  openSettings: () => void;
  closeSettings: () => void;
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
      isSettingsOpen: false,

      setApiKey: (key) => set({ apiKey: key }),
      setBaseUrl: (url) => set({ baseUrl: url }),
      setModel: (model) => set({ model }),
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      toggleRightSidebar: () => set((s) => ({ isRightSidebarOpen: !s.isRightSidebarOpen })),
      openSettings: () => set({ isSettingsOpen: true }),
      closeSettings: () => set({ isSettingsOpen: false }),
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
      }),
    }
  )
);
