# 🎯 R6 Tactical Studio (v0.2.2)

🌍 [简体中文](./README.md) | [English](./docs/README_EN.md) | [日本語](./docs/README_JA.md)

A free, easy-to-use, and lightweight localized tactical review and editing workstation for *Rainbow Six Siege*.

## 1. Why do we need a new R6 tactical tool?

To put it bluntly: **Free tools lack features, and fully-featured tools cost money.**

Classic open-source projects like [feml1n/R6TAC_Modify](https://feml1n.github.io/R6TAC_Modify/) are great, but their tech stack is outdated and the UI interaction isn't modern enough. On the other hand, platforms like [Gamecoach.gg](https://gamecoach.gg/esports/r6siege/) or [r6strat.com](https://r6strat.com/featured_strategies) either hide core features behind a paywall or require a constant internet connection, and they focus more on presentation rather than "personal workflow review."

When I first thought about starting this project, I realized the biggest issue with existing tools is the **need for a constant internet connection**. The login process is just incredibly tedious. So, I figured it's better to build a localized App directly. In the future, I can build a lightweight Web version for simple online editing, while keeping the heavy lifting (video analysis, multi-layer rendering) on the desktop client.

I want to create a real tool that is: **free, user-friendly, and lightweight**.

## 2. Core Design Philosophy & All-in-One Workflow

Current web platforms have their limits, and I really don't want to switch back and forth between a pro VOD player and a web tactical board while reviewing a match. I wanted to integrate the entire workflow into one single software, so all you need to do is:

👉 **Download VOD ➔ Load ➔ Auto-analyze video ➔ Edit tactical board ➔ Export & Share**

Besides the workflow integration, this project includes a few of my own clever little ideas:
* **Using "Animation Layout" thinking for deductions**: I believe a dynamic process is the best way to showcase tactics. Static images are too rigid, so I introduced a Timeline system. You can input operators' paths and gadget timings step-by-step and play it back dynamically.
* **Localized callouts that fit player habits**: The official room names aren't granular enough and often don't match how players actually call them out. So, I manually wrote the room names and added support for custom tags to perfectly match how your own squad actually communicates.

---

## 3. v0.2.1 Core Features at a Glance

### 🗺️ Multi-View & Multi-Layer Canvas
* **Panoramic Views**: Supports Standard, Blueprint, and 3D Isometric viewing angles.
* **Detailed Layers**: Vertical defense (C4/wallbang spots), stairs, and map props are all on independent layers. Combined with brushes, route arrows, and parabola tools, drawing complex tactics is a breeze.

### ⏱️ Original Dynamic Timeline
* Inspired by animation design concepts, rounds are broken down into Prep, Early, Mid, and Execution phases.
* Assign up to 5 steps of cross-floor routing per operator. Supports one-click animation playback for an intuitive visualization of the tactical flow.

### 📼 Video Sync & Machine Vision (OCR) Analysis
* **Built-in Player**: Drag and drop match VODs directly into the software for floating playback.
* **AI Visual Slicing**: Integrates machine vision (OCR) technology to automatically read round timers and defuser plant status, accurately marking key round nodes. It can even generate an FFmpeg script to help you slice round videos with one click (requires FFmpeg installed on your PC).

### 🤖 AI Tactical Assistant (Beta)
* Powered by a Large Language Model. Just input your review thoughts or commentary subtitles, and the AI will automatically extract the information to generate a structured tactical execution table (JSON) and a Markdown tactical brief.

### 📂 Pure Local Asset Library & All-Format Export
* **Drag-and-Drop Deployment**: The sidebar features a complete library of attackers, defenders, and gadgets—just drag to deploy. Project files (`.mty`) are saved purely locally.
* **All-Scenario Export**: Export your canvas with one click to high-res images, multi-stage tactical GIFs, PDF briefs, and Markdown notes.

---

## 4. The Grand Vision (Future Roadmap)

My grand vision for the future involves creating a **"mapping" between text-based tactics and this tactical board**. 
Imagine this: you tweak the description in your tactical doc, and the operator's route on the canvas updates automatically. Drag an operator around, and your text review updates too. Of course, this is a massive undertaking, but I'll get to it when I have the time!

---

## 5. Tech Stack

This project is built on a modern frontend tech stack:
* **Core Framework**: React 18 + TypeScript
* **State Management**: Zustand (with persist and undo/redo middleware)
* **Canvas Rendering**: Konva.js / `react-konva`
* **Styles & UI**: Tailwind CSS + Lucide React icons
* **Machine Vision**: Tesseract.js (for video timestamp OCR analysis)
* **Interaction Extensions**: `react-draggable` (floating window UI), `react-markdown` (AI brief rendering)

---

## 6. Quick Start

### Requirements
* Node.js 18+
* pnpm 8+ or npm/yarn

### Run Locally
```bash
# 1. Clone the repo
git clone [https://github.com/yourusername/R6-Tactical-Studio.git](https://github.com/yourusername/R6-Tactical-Studio.git)
cd R6-Tactical-Studio

# 2. Install dependencies
npm install

# 3. Start dev server
npm run dev
```

## 7. Map Asset Progress

Since each layer requires AI upscaling and manual tweaking of the alpha channel, some map assets are still being implemented. Current availability is as follows:

| Map | Default | Isometric | Blueprint | Room Names | Props | Stairs | Verticality |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Bank** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⬜ |
| **Border** | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | ⬜ |
| **Nighthaven** | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | ⬜ |
| **Lair** | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | ⬜ |
| **Kafe** | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | ⬜ |
| **Fortress*** | ✅ | ✅ | ❌(Remaking) | ✅ | ⬜ | ⬜ | ⬜ |
| **Consulate** | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | ⬜ |
| **Clubhouse** | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ | ⬜ |
| **Chalet** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⬜ |

> *\*Note: The official standard basemap for Fortress is an older version; the UI will trigger an automatic warning when switching to it. Its Blueprint version is currently being remade.*

## 8. Acknowledgments & Dev Notes

As a tool focused on high-definition tactical sharing, the quality of the base maps determines the experience. I have to vent a bit: **the map assets provided on the official Ubisoft website are shockingly blurry (Ubisoft, please fix!)**. To get clean blueprints, I had to run every official map through an AI upscaler for reconstruction, then manually mask them in Photoshop to fix transparency channels—it was quite the ordeal.

Additionally, the inspiration and some references for the **3D Isometric View** come from the open-source project [nanoKdR6/R6TAC](https://github.com/nanoKdR6/R6TAC). Huge respect to the original author!

### ⚖️ Asset Acknowledgments
This project uses various intellectual property related to *Rainbow Six Siege*. Special thanks to:
* **Operator Icons:** Sourced from [r6operators.marcopixel.eu](https://r6operators.marcopixel.eu/).
* **Gadget Icons:** Partially sourced from [Strife Tactics](https://strife.gg/), with others from the [Official Ubisoft R6 Website](https://www.ubisoft.com/en-us/game/rainbow-six/siege).
* *Rainbow Six Siege and all related assets are trademarks of Ubisoft Entertainment in the U.S. and/or other countries.*