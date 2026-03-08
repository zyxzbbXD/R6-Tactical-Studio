# 🛡️ R6 Tactical Studio v0.1.1

🌍 [简体中文](./README.md) | [English](./docs/README_EN.md) | [日本語](./docs/README_JA.md)

> A minimalist, cross-platform tactical whiteboard and AI video review tool built specifically for *Rainbow Six Siege*. Focused on offline portability, pure front-end hardcore video parsing, and multi-phase dynamic tactical deduction.

---

## 🎯 Why do we need a new R6 tactical tool?

Most review tools on the market are bloated. As a hardcore player with nearly 4,000 hours in-game, I know exactly what a truly useful tactical board needs: **extreme lightness, instant access, and intuitive layer interaction.**

After researching existing tools, I identified several pain points:

* **Limitations of existing tools:** Legacy open-source projects like [feml1n/R6TAC_Modify](https://feml1n.github.io/R6TAC_Modify/) are classics but use outdated tech stacks with non-modern UI. Platforms like [Gamecoach.gg](https://gamecoach.gg/esports/r6siege/) or [r6strat.com](https://r6strat.com/featured_strategies) often hide core features behind paywalls or require constant internet connectivity, focusing more on "presentation" than a "personal workflow review."
* **Lack of a modern review loop:** Traditional whiteboards only offer static drawing. They fail to seamlessly integrate "First-Person VODs," "Multi-phase Timelines," and "Tactical Floor Plans" on a single screen.
* **Low information processing efficiency:** When we see text-based tactical summaries in the community, converting them into positioning maps requires mental gymnastics, which is time-consuming and exhausting.

**💡 Our Solution (Core Differentiation):**

1.  **Pure Local Hardware-Accelerated Parsing:** Unique local video OCR analysis. No FFmpeg installation required—utilizing browser GPU decoding and Web Worker lightweight recognition to automatically extract timestamps (e.g., Action Phase start) from match recordings and generate interactive timelines.
2.  **Dynamic Wargaming Deduction:** Say goodbye to rigid static screenshots. Supports dynamic evolution through 4 phases (Prep, Early, Mid, Late) and allows one-click export of tactical GIFs.
3.  **Immersive Tactical Blueprints:** Restores a professional tactical planning perspective using high-contrast blueprint backgrounds and fixed map info panels to make your strat-sharing more intuitive and professional.
4.  **Extreme Portability:** Built on **Rust/Tauri**, it runs entirely offline with zero external environment dependencies. Just copy and run with near-instant startup.

---

## ✨ Core Features

* **🗺️ Advanced Map System**
    * **Multi-View Toggle**: Supports standard overhead (Standard), Tactical Blueprint (Blueprint), and 3D Isometric views.
    * **Dynamic Overlays**: Independently toggle layers for Verticality (destructibility), Room Names, Stairs, and Details (Props).
    * **Custom Map Import**: Drag-and-drop local images to define floors and view types, adapting to new maps in seconds.
* **🪖 Dynamic Tactical Planning**
    * **Operator & Gadget System**: Sidebar integrated with all operators and generic gadgets (Drones, C4, Barbed Wire, etc.), supporting cross-domain Drag & Drop, scaling, and rotation.
    * **Four-Phase Timeline**: Supports tactical deduction across 4 phases. Switching to a new phase automatically inherits operator positions from the previous one, requiring only minor adjustments for movement.
    * **Blueprint Visual Optimization**: Automatically renders 6,400 x 3,600 ultra-high-resolution blueprint bases in Blueprint Mode, complete with exclusive white wireframes and a fixed info plate.
* **🎥 Built-in VOD Analysis**
    * **Auto-Timestamping**: Drag local `.mp4` recordings into the floating window to scan the countdown UI. Using 10s sparse sampling and mathematical back-inference, it automatically generates "Action Phase" nodes on the progress bar.
    * **Immersive Review**: Supports global pause and various floating window sizes (Standard, 50%, Fullscreen) so you can draw while you watch.
* **🤖 AI Intelligent Parsing & i18n**
    * **Multilingual Support**: Supports 6 languages (ZH, EN, JA, KO, FR, PT). AI prompts and UI terminology are perfectly adapted to regional player slang (e.g., Hard Breach, Default Plant, etc.).
    * **Multi-Modal Export**: Export high-res PNGs, Markdown tactical notes, ZIP collections of all phases, or ultra-fast **Animated GIFs**.
    * **Modern Adaptive UI**: Smooth Light/Dark theme switching with rounded typography and responsive scaling.

---

## 🛠️ Tech Stack

* **Frontend (UI & Interaction):** React 18 + Vite + TypeScript + Tailwind CSS
* **Desktop Engine:** Tauri (Rust) - For lightweight packaging and system-level window management.
* **Canvas Rendering:** React Konva + use-image
* **Lightweight Local OCR:** `tesseract.js` (Configured with Web Workers and whitelist mode for high-speed digit capture).
* **GIF Engine:** `gifshot` (Seamlessly captures Konva instances).
* **State Management:** Zustand

---

## 🗺️ Roadmap

- [x] **Phase 1-3: Architecture & Canvas Foundation** - Initialize Tauri, build dual-pane UI, implement Konva rendering, map mounting, zoom/pan, and operator drag interaction.
- [x] **Phase 4-7: Video Review & Smart Analysis** - Implement `react-draggable` floating player; build pure frontend, zero-dependency OCR timeline markers via Canvas and Tesseract.js.
- [x] **Phase 8-11: Modern UI & Map Engine Upgrade** - Deploy Light/Dark themes and 6-language localization; refactor map engine to support Blueprint/3D views and custom imports; add info legends.
- [x] **Phase 12-13: Dynamic Wargaming & Multi-modal Export** - Integrate Gadget system; implement phase inheritance (1-4); finalize GIF/Markdown/PNG export loop.
- [ ] **Phase 14: Tactical Cloud Sync (Planned)** - Support `.json` tactical saves and explore a community strategy sharing hub.

---

## 🚀 Getting Started

Ensure you have `Node.js` (v18+) and the `Rust` environment installed.

```bash
# 1. Clone the repository
git clone [https://github.com/zyxzbb/r6-tactical-studio.git](https://github.com/zyxzbb/r6-tactical-studio.git)
cd r6-tactical-studio

# 2. Install dependencies
npm install

# 3. Launch dev server (Tauri + Vite)
npm run tauri dev
```

## 🤝 Acknowledgments & Dev Notes

As a tool focused on high-definition tactical sharing, the quality of the base maps determines the experience. I have to vent a bit: **the map assets provided on the official Ubisoft website are shockingly blurry (Ubisoft, please fix!)**. To get clean blueprints, I had to run every official map through an AI upscaler for reconstruction, then manually mask them in Photoshop to fix transparency channels—it was quite the ordeal.

Additionally, the inspiration and some references for the **3D Isometric View** come from the open-source project [nanoKdR6/R6TAC](https://github.com/nanoKdR6/R6TAC). Huge respect to the original author!

### ⚖️ Asset Acknowledgments
This project uses various intellectual property related to *Rainbow Six Siege*. Special thanks to:
* **Operator Icons:** Sourced from [r6operators.marcopixel.eu](https://r6operators.marcopixel.eu/).
* **Gadget Icons:** Partially sourced from [Strife Tactics](https://strife.gg/), with others from the [Official Ubisoft R6 Website](https://www.ubisoft.com/en-us/game/rainbow-six/siege).
* *Rainbow Six Siege and all related assets are trademarks of Ubisoft Entertainment in the U.S. and/or other countries.*