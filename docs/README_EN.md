# 🛡️ R6 Tactical Studio v0.1.2

🌍 [简体中文](../README.md) | [English](./README_EN.md) | [日本語](./README_JA.md)

> A minimalist, cross-platform tactical board and AI-powered VOD review tool built exclusively for Rainbow Six Siege. Featuring an offline, portable design, pure frontend hardcore video analysis, and multi-phase dynamic tactical planning.

## 🎯 Why Do We Need a New R6 Tactical Tool?

Most VOD review tools on the market are bloated. As a player with nearly 4,000 hours logged in the game, I know exactly what makes a truly useful tactical board: **extreme lightweight, instant accessibility, and intuitive layer interaction.**

After researching existing tools, I found several glaring issues:

* **Limitations of existing tools:** Classic open-source projects like [feml1n/R6TAC_Modify](https://feml1n.github.io/R6TAC_Modify/) are great but rely on outdated tech stacks with clunky modern UI interactions. Platforms like [Gamecoach.gg](https://gamecoach.gg/esports/r6siege/) or [r6strat.com](https://r6strat.com/featured_strategies) hide core features behind paywalls or require a constant internet connection, focusing more on "showcasing" rather than "personal workflow review."
* **Lack of a modern review loop:** Traditional boards only allow static line drawing. They fail to seamlessly integrate "POV VODs," "multi-phase timelines," and "tactical floor plans" onto a single screen.
* **Inefficient information processing:** Translating text-based tactical summaries from community posts into visual setups in your head is time-consuming and exhausting.

**💡 Our Breakthroughs (Core Differentiation):**

1. **Pure Local Hardware-Accelerated Analysis:** An exclusive local VOD OCR analysis with a state-machine debounce algorithm. No FFmpeg installation required. It utilizes browser GPU decoding and Web Workers for ultra-fast frame scanning, automatically adapting to both Broadcast and POV UI layouts to extract match timestamps.
2. **"Zero-Bloat" VOD Clipping:** An industry-first feature that exports native OS-level FFmpeg lossless clipping scripts (`.bat` / `.sh`). It enables millisecond-level slicing of massive VOD files without adding a single kilobyte to the application's size.
3. **Dynamic Tactical Planning:** Say goodbye to rigid, single-frame screenshots. Supports dynamic progression across phases 1-4 (Prep, Early, Mid, Late) with smooth keyboard navigation, plus one-click exporting of animated GIF tactical plans.
4. **Immersive Blueprints & Adaptive Scaling:** Recreates an authentic, hardcore CAD blueprint perspective. It features an original edge-scanning algorithm (Bounding Box) based on pixel Alpha channels to automatically scale and center blueprints of any size.
5. **Extremely Lightweight (Portable):** Built on Rust/Tauri, it runs entirely offline with zero external dependencies. Just copy, paste, and launch instantly.

## ✨ Core Features

* **🗺️ Advanced Map System**
    * **Multi-View Toggle:** Freely switch between official Standard top-down views, Tactical Blueprints, and 3D Isometric views. Includes automatic asset fallback protection to prevent empty screens.
    * **Dynamic Overlays:** Independently toggle transparent layers such as Verticality (destructible floors), Room Names, and Details (Stairs & Props).
    * **Custom Map Import:** Drag and drop local images, assign floors and view types, and instantly adapt new map layouts.
* **🪖 Dynamic Tactical Planning**
    * **Operator & Gadget System:** The sidebar integrates all operators and universal gadgets (drones, C4, barbed wire, etc.) with support for drag-and-drop, scaling, and rotation.
    * **4-Phase Timeline:** Supports tactical planning across 4 phases. Switching to a new phase automatically inherits operator positions from the previous one, requiring only minor tweaks to demonstrate dynamic movements.
    * **Blueprint Aesthetic Overhaul:** The blueprint mode automatically renders a deep blue 6400x3600 CAD background, complete with crisp white borders and a fixed top-left Title Block legend for a professional, geeky aesthetic.
* **🎥 Built-in VOD Analysis**
    * **Lightning-Fast Binary Search Tagging:** Drag and drop local VODs into the floating player. One click triggers a binary search to precisely lock in round start/end times, generating a tri-color tactical timeline (Prep/Action/End).
    * **Immersive Review Experience:** Features double-click fullscreen, resizable floating windows (Standard, 50%, etc.), and long-press keyboard navigation to instantly jump between tactical phases while you draw.
* **🤖 AI Parsing & i18n**
    * **Multi-Language & Native Terminology:** Integrates 6 languages (EN, ZH, JA, KO, FR, PT), perfectly adapting to the regional slang of Siege players (e.g., Hard Breach, Default Plant, etc.).
    * **Multi-Modal Export Loop:** Export current frame HD PNGs, lightning-fast Animated GIFs, and local lossless video clipping scripts.

## 🗺️ Map Asset Progress

Because each layer requires AI super-resolution and manual alpha-channel extraction via Photoshop, map assets are being rolled out progressively. Current availability:

| Map | Default | Isometric | Blueprint | Room Names | Props | Stairs | Verticality |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Bank** | ✅ | ✅ | ✅ | ⬜ | ⬜ | ⬜ | ⬜ |
| **Border** | ✅ | ✅ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| **Nighthaven** | ✅ | ✅ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| **Lair** | ✅ | ✅ | ✅ | ⬜ | ⬜ | ⬜ | ⬜ |
| **Kafe** | ✅ | ✅ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| **Fortress*** | ✅ | ✅ | ❌(WIP) | ⬜ | ⬜ | ⬜ | ⬜ |
| **Consulate** | ✅ | ✅ | ✅ | ⬜ | ⬜ | ⬜ | ⬜ |
| **Clubhouse** | ✅ | ✅ | ✅ | ⬜ | ⬜ | ⬜ | ⬜ |
| **Chalet** | ✅ | ✅ | ✅ | ⬜ | ⬜ | ⬜ | ⬜ |

> *\*Note: The official Standard map for Fortress is an outdated version. A UI warning will trigger automatically when selected. Its Blueprint version is currently being remade.*

## 🛠️ Tech Stack

* **Frontend (UI & Interaction):** React 18 + Vite + TypeScript + Tailwind CSS
* **Desktop Engine:** Tauri (Rust) - Handles ultra-lightweight packaging and OS-level window management.
* **Canvas Rendering & Animation:** React Konva + use-image
* **Video Stream & Algorithms:** `tesseract.js` (Dual-mode OCR & State-machine binary search)
* **GIF Engine:** `gifshot` (Seamless Konva instance capturing)
* **State Management:** Zustand

## 📍 Roadmap

- [x] **Phase 1-3: Infrastructure & Canvas Basics** - Initialize Tauri, build split-pane UI; implement Konva rendering, static map mounting, zoom/pan, and operator drag-and-drop.
- [x] **Phase 4-7: VOD Review & Smart Analysis** - Implement floating video player; build pure-frontend VOD timeline OCR rough tagging.
- [x] **Phase 8-11: Modern UI & Map Engine Upgrade** - Roll out Light/Dark themes and 6-language i18n; refactor map engine for multi-layer overlays.
- [x] **Phase 12-13: Dynamic Planning & Multi-Modal Exports** - Integrate Gadget drag-and-drop; implement 1-4 phase toggling/inheritance; add GIF export and CAD Blueprint overhaul.
- [x] **Phase 14-15: Advanced VOD Parsing & Geek Clipping** - Introduce binary search and Dual-Mode (Broadcast/POV) OCR; implement "Zero-bloat" native FFmpeg clipping scripts; add keyboard navigation.
- [x] **Phase 16-17: Engine Robustness & Adaptive Scaling** - Implement map asset fallback protection; create Bounding Box edge detection via Alpha scanning for perfect blueprint centering.
- [ ] **Phase 18+: Tactical Pen & Core Layers (In Progress)** - Add tactical drawing toolkits like dashed lines and grenade trajectories.
- [ ] **Phase 19: Cloud Sync (Planned)** - Support `.json` tactical save imports/exports and community sharing.

## 🚀 Getting Started

Ensure you have `Node.js` (v18+) and `Rust` installed on your machine.

```bash
# 1. Clone the repository
git clone [https://github.com/zyxzbb/r6-tactical-studio.git](https://github.com/zyxzbb/r6-tactical-studio.git)
cd r6-tactical-studio

# 2. Install frontend dependencies
npm install

# 3. Start the development server (Tauri + Vite)
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