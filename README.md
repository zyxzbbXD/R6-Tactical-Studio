# 🛡️ R6 Tactical Studio v0.1.1

🌍 [简体中文](./README.md) | [English](./docs/README_EN.md) | [日本語](./docs/README_JA.md)

> 一款专为《彩虹六号：围攻》（Rainbow Six Siege）打造的极简、跨平台战术画板与 AI 视频复盘工具。主打离线便携、纯前端硬核视频解析与多阶段动态推演。

## 🎯 为什么我们需要一个新的彩六战术工具？

市面上的复盘工具往往过于臃肿。作为一个在游戏里沉淀了近 4000 小时的玩家，深知一款真正好用的战术板需要什么：**极致轻量、随开随用、直观的图层交互。**

在调研了现有工具后，我发现了明显的问题：

* **现存工具的局限性：** 像 [feml1n/R6TAC_Modify](https://feml1n.github.io/R6TAC_Modify/) 这种老牌开源项目，虽然经典但技术栈陈旧，UI 交互不够现代；而像 [Gamecoach.gg](https://gamecoach.gg/esports/r6siege/) 或 [r6strat.com](https://r6strat.com/featured_strategies) 这类平台，要么核心功能被藏在付费墙后，要么必须全程联网，且功能侧重于展示而非“个人的工作流复盘”。
* **缺少现代化的复盘闭环：** 传统画板只能静态画线，无法将“第一视角录像”、“多阶段时间轴”与“战术平面图”同屏无缝结合。
* **信息处理效率低：** 当我们在社区看到别人的文字版战术总结时，需要靠脑补将其转化为站位图，费时费力。

**💡 我们的破局点（核心差异化）：**

1.  **纯本地化硬件加速解析：** 独创的本地视频 OCR 分析。无需安装 FFmpeg，利用浏览器 GPU 解码与 Web Worker 轻量级识别，自动提取比赛录像中的时间节点（如：行动阶段开始），并生成交互式时间轴。
2.  **动态兵棋推演：** 告别单张死板的截图。支持 1-4 阶段（准备、开局、中期、后期）的动态演进，并可一键导出 GIF 战术动图。
3.  **沉浸式战术图纸：** 还原真实的硬核战术规划视角，采用高对比度蓝图底板与固定的地图信息栏，让你的战术分享更加直观、专业。
4.  **极致轻量化 (Portable)：** 基于 Rust/Tauri 构建，纯离线运行，无任何外部环境依赖，随拷随用，启动秒开。

## ✨ 核心特性 (Features)

* **🗺️ 高维战术地图系统 (Advanced Map System)**
    * **多视图切换**：支持官方默认俯视图 (Standard)、战术蓝图 (Blueprint) 以及 3D 倾斜透视图 (Isometric) 自由切换。
    * **动态遮罩图层 (Overlays)**：可独立叠加垂直可破坏防守 (Verticality)、房间名称、楼梯与道具 (Details) 等透明图层。
    * **自定义地图导入**：支持一键拖拽上传本地图片，自定义分配楼层与视图类型，新图秒级适配。
* **🪖 动态战术推演交互 (Dynamic Tactical Planning)**
    * **干员与道具系统**：侧边栏整合全干员及通用道具 (Gadgets，如无人机、C4、铁丝网等)，支持跨域拖拽 (Drag & Drop)、缩放与旋转。
    * **四阶段时间轴 (Phases)**：支持 1-4 阶段战术推演。切换新阶段时自动继承上一阶段干员位置，只需微调即可演示动态走位。
    * **蓝图模式视效优化**：在蓝图模式下自动渲染 6400x3600 超高分辨率图纸基底，附带专属白色线框与左上角固定信息铭牌。
* **🎥 内置视频时间轴分析 (Built-in VOD Analysis)**
    * **自动打点标记**：将本地 `.mp4` 录像拖入悬浮窗，一键扫描倒计时 UI。通过 10 秒稀疏采样与数学逆推，自动在进度条生成“行动阶段”节点。
    * **沉浸式复盘**：支持全局暂停，支持标准、50%、全屏多尺寸悬浮窗，边看边画。
* **🤖 AI 智能解析与多语言 (AI & i18n)**
    * **多语言与原生术语适配**：集成 6 国语言（中、英、日、韩、法、葡），右侧 AI 提示词与界面 UI 完美适配各语言区彩六玩家的习惯用语（如：切墙、默认下包、Hard Breach 等）。
    * **一键全模态导出**：支持导出当前帧高清 PNG、战术笔记 Markdown、包含所有阶段的 ZIP 图集，以及极速生成的 **Animated GIF 战术动图**。
    * **现代自适应 UI**：支持 Light/Dark 丝滑主题切换，圆润字体与自适应缩放设计。

## 🛠️ 技术栈 (Tech Stack)

* **前端 (UI & 交互):** React 18 + Vite + TypeScript + Tailwind CSS
* **桌面端引擎:** Tauri (Rust) - 负责极致轻量打包与系统级窗口管理。
* **画布渲染与动画:** React Konva + use-image
* **轻量级本地 OCR:** `tesseract.js` (配置 Web Worker 与白名单模式进行极速数字截帧)
* **动图生成引擎:** `gifshot` (无缝抓取 Konva 实例生成 GIF)
* **状态管理:** Zustand

## 🗺️ 开发路线图 (Roadmap)

- [x] **Phase 1-3: 基础架构与画布基建** - 初始化 Tauri 环境，搭建双栏 UI；实现 Konva 渲染、地图静态挂载、缩放平移及干员拖拽交互。
- [x] **Phase 4-7: 视频复盘与智能分析** - 实现 `react-draggable` 悬浮视频播放器；基于 Canvas 与 Tesseract.js 实现纯前端、0 依赖的录像时间轴自动 OCR 标记。
- [x] **Phase 8-11: 现代化 UI 与地图引擎升级** - 落地 Light/Dark 丝滑主题与 6 国语言本地化；重构底图引擎，支持蓝图、3D透视及自定义地图一键导入；引入蓝图模式及左上角图例功能。
- [x] **Phase 12-13: 动态兵棋与多模态导出** - 接入 Gadgets (道具) 拖拽系统；实装 1-4 战术阶段切换与继承机制；实装基于 `gifshot` 的 GIF 动图与 Markdown/PNG 导出闭环。
- [ ] **Phase 14: 战术工程云同步 (规划中)** - 支持战术 `.json` 存档的导入/导出，并探索社区战术板分享中心。

## 🚀 快速开始 (Getting Started)

确保你的电脑已安装 `Node.js` (v18+) 和 `Rust` 环境。

```bash
# 1. 克隆仓库
git clone [https://github.com/zyxzbb/r6-tactical-studio.git](https://github.com/zyxzbb/r6-tactical-studio.git)
cd r6-tactical-studio

# 2. 安装前端依赖
npm install

# 3. 启动开发服务器 (Tauri + Vite)
npm run tauri dev
```

## 🤝 鸣谢与开发碎碎念 (Acknowledgments & Dev Notes)

作为一个主打高清晰度战术分享的工具，底图的质量直接决定了体验的上限。但在这里不得不吐槽一句：**育碧官网提供的地图素材实在是糊得令人发指（Ubisoft, please fix!）**。为了得到纯净蓝图，项目中所有的官方底图我都得先丢进 AI 跑一遍超分辨率重构，再进 PS 手动抠图、拉透明通道，纯纯的无语。

另外，项目中 **3D 倾斜透视图（Isometric View）** 的灵图片与部分参考来自开源项目 [nanoKdR6/R6TAC](https://github.com/nanoKdR6/R6TAC)，在此向原作者致以崇高的敬意！

### ⚖️ 资源致谢 (Asset Acknowledgments)
本项目使用了与《彩虹六号：围攻》（*Rainbow Six Siege*）相关的各类知识产权。在此特别感谢并致谢：
* **干员图标：** 图标素材来源于 [r6operators.marcopixel.eu](https://r6operators.marcopixel.eu/)。
* **道具图标：** 部分道具图标来源于 [Strife Tactics](https://strife.gg/)，其余来源于 [育碧《彩虹六号：围攻》官方网站](https://www.ubisoft.com/en-us/game/rainbow-six/siege)。
* *《彩虹六号：围攻》及所有相关素材均为育碧娱乐（Ubisoft Entertainment）在美国及/或其他国家的商标。*