import { useEffect } from "react";
import "./App.css";
import Sidebar from "./components/Sidebar";
import MainCanvas from "./components/MainCanvas";
import RightSidebar from "./components/RightSidebar";
import SettingsModal from "./components/SettingsModal";
import { useSettingsStore } from "./store/useSettingsStore";

function App() {
  const theme = useSettingsStore((s) => s.theme);

  useEffect(() => {
    if (theme === "light") {
      document.documentElement.setAttribute("data-theme", "light");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }, [theme]);

  return (
    <div className="flex h-full w-full overflow-hidden" style={{ background: "var(--color-r6-bg)" }}>
      <Sidebar />
      <MainCanvas />
      <RightSidebar />
      <SettingsModal />
    </div>
  );
}

export default App;
