# 🛡️ R6 Tactical Studio

> 一款专为《彩虹六号：围攻》（Rainbow Six Siege）打造的极简、跨平台战术画板与 AI 视频复盘工具。主打离线便携、秒级启动与 AI 辅助分析。

## 🎯 为什么我们需要一个新的彩六战术工具？

市面上的复盘工具往往过于臃肿。作为在游戏里沉淀了近 4000 小时的硬核玩家，深知一款真正好用的战术板需要什么：**极致轻量、随开随用、直观的图层交互。**

在调研了现有工具后，我们发现了明显的断层：

* **现存工具的局限性：** 像 [feml1n/R6TAC_Modify](https://feml1n.github.io/R6TAC_Modify/) 这种老牌开源项目，虽然经典但技术栈陈旧，UI 交互不够现代；而像 [Gamecoach.gg](https://gamecoach.gg/esports/r6siege/) 或 [r6strat.com](https://r6strat.com/featured_strategies) 这类平台，要么核心功能被藏在付费墙后，要么必须全程联网，且功能侧重于展示而非“个人的工作流复盘”。
* **缺少现代化的复盘闭环：** 传统画板只能画线，无法将“第一视角录像”与“战术平面图”同屏无缝结合。
* **信息处理效率低：** 当我们在社区看到别人的文字版战术总结时，需要靠脑补将其转化为站位图，费时费力。

**💡 我们的破局点（核心差异化）：**

1.  **AI 战术解析：** 独家集成大模型 API。输入别人的战术总结文本，或直接丢入复盘视频的字幕文件（SRT），AI 即可自动提取信息，生成结构化的 Markdown 战术分工表（如：切位/自由位的干员选择、时间轴分配）。
2.  **极致轻量化 (Portable)：** 基于 Rust/Tauri 构建，打包体积仅几十 MB。不依赖任何本地运行环境，随拷随用，启动秒开。

## ✨ 核心特性 (Features)

* **🗺️ 高性能战术画板 (The Board - *已实装*)**
    * 基于 `Konva.js` 渲染，支持无极缩放 (Zoom) 与鼠标中键平移 (Pan)。
    * 内置最新赛季高清平面图（如 Bank），支持 1F/2F/B1 等楼层无缝切换。
* **🪖 丝滑的战术推演交互 (*开发中*)**
    * 支持从侧边栏将干员、道具图标跨域拖拽 (Drag & Drop) 至中央画布。
    * 采用 `Zustand` 进行全局状态管理，精准计算缩放/平移后的相对坐标。
    * 支持点击选中图标，进行二次拖拽、缩放、旋转控制，以及一键 Delete 删除。
    * 提供原生画笔工具 (Pen Tool)，用于绘制进攻轴线或防守站位范围。
* **🎥 悬浮视频复盘 (Floating VOD - *开发中*)**
    * 将本地 `.mp4` 录像拖入软件，自动生成无边框的自由悬浮窗。
    * 边看录像边在底层画板上推演，支持简单的视频打点与切片。
* **🤖 AI 智能解析 (AI Formatting - *开发中*)**
    * 一键将非结构化的文本战术总结转化为清晰的表格，并支持内嵌 Markdown 编辑器进行微调。

## 🛠️ 技术栈 (Tech Stack)

* **前端 (UI & 交互):** React 18 + Vite + TypeScript + Tailwind CSS + shadcn/ui
* **状态管理:** Zustand
* **画布绘图:** React Konva + use-image
* **后端 & 客户端:** Tauri (Rust) - 负责本地文件系统交互与极致轻量打包。
* **视频处理:** 原生 HTML5 `<video>` + `react-draggable`。

## 🗺️ 开发路线图 (Roadmap)

- [x] **Phase 1: 基础架构** - 初始化 Tauri + React 环境，搭建暗黑极简双栏 UI 骨架。
- [x] **Phase 2: 画布基建** - 引入 Konva，实现地图资源的静态挂载与楼层切换，跑通底图的缩放与平移交互。
- [x] **Phase 3: 核心推演交互** - 引入 Zustand 状态管理，实现 HTML 侧边栏到 Canvas 的跨域坐标转换与拖拽；实现元素的选中、形变控制与画笔绘制。
- [ ] **Phase 4: 视频复盘模块** - 实现 `react-draggable` 包装的悬浮视频播放器，加载本地录像。
- [ ] **Phase 5: AI 赋能** - 集成大模型 API 设置面板，开发文本转战术 Markdown 表格的功能。
- [ ] **Phase 6: 导出与工程化** - 实现 JSON 工程保存与读取；整合画布截图与 Markdown 生成 PDF 战术简报。

## 🚀 快速开始 (Getting Started)

确保你的电脑已安装 `Node.js` (v18+) 和 `Rust` 环境。

```bash
# 1. 克隆仓库
git clone [https://github.com/your-username/r6-tactical-studio.git](https://github.com/your-username/r6-tactical-studio.git)
cd r6-tactical-studio

# 2. 安装前端依赖
npm install

# 3. 启动开发服务器 (Tauri + Vite)
npm run tauri dev