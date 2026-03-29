# TournamentDrawSystem 项目文档

## 1. 项目概述

**项目名称**: 大赛抽签系统 (Tournament Draw System)

**核心功能**: 这是一个基于 Electron 桌面应用程序，用于大赛队伍分组抽签。系统可以导入 Excel 队伍数据（支持多 Sheet 多项目），支持种子队设置，带有抽签顺序动画（闪烁→选中→滑入表格）和分组抽签飞行动画（闪烁→选中→飞向分组卡片），支持暂停/恢复，逐个分配到分组，并导出结果。

**技术栈**:
- **框架**: Electron v37.3.1 - 跨平台桌面应用框架
- **前端**: HTML5 + CSS3 + ES Modules (原生 JavaScript)
- **数据处理**: XLSX (SheetJS) v0.18.5 - Excel 文件读写
- **构建工具**: electron-builder v24.9.1 - 打包构建

---

## 2. 项目结构

```
TournamentDrawSystem/
├── main.js                 # Electron 主进程入口
├── preload.js              # 预加载脚本（IPC 桥接）
├── preload-autofill.js     # 禁用 Autofill 脚本
├── index.html              # 应用界面结构
├── draw-algorithm.js       # 抽签算法核心（ES Module 导出）
├── styles.css              # 样式表
├── package.json            # 项目配置
├── background.jpg          # 默认背景图
├── PROJECT_DOCUMENTATION.md # 项目文档
├── src/                    # 渲染进程模块化代码
│   ├── app.js              # 应用入口（跨页面协调、事件委托、初始化）
│   ├── store.js            # 集中式状态对象（所有页面共享）
│   ├── utils.js            # 纯工具函数（shuffleArray、escapeHtml）
│   ├── dialog.js           # 统一弹窗系统（确认弹窗、提示弹窗）
│   ├── navigation.js       # 页面导航（路由切换、导航状态、页面标题）
│   ├── welcome.js          # 启动页面逻辑
│   ├── settings-page.js    # 抽签设置页面逻辑
│   ├── order-page.js       # 抽签顺序页面逻辑（含动画状态机）
│   ├── file-ops.js         # 文件操作（Excel 导入导出、解析）
│   └── draw-page.js        # 分组抽签页面逻辑
└── node_modules/           # 依赖包目录
```

### 文件说明

| 文件 | 作用 |
|------|------|
| `main.js` | Electron 主进程，创建应用窗口，处理意图式 IPC（import-excel/export-excel），安全防护 |
| `preload.js` | 安全的 IPC 桥接层，使用 contextBridge 暴露意图式 API（不暴露文件路径） |
| `index.html` 应用 UI 结构，包含启动页和三步抽签流程页面，使用 data-action 事件委托 |
| `draw-algorithm.js` | 抽签算法核心类，处理分组逻辑和同校回避（ES Module 导出） |
| `styles.css` | 完整的 UI 样式系统，包含 CSP 安全策略、响应式布局、动画 |
| `src/app.js` | 渲染进程入口，事件委托系统，协调跨页面逻辑（updateUIForProject、clearData） |
| `src/store.js` | 集中式状态对象，所有页面模块通过 ES Modules import 共享状态 |
| `src/dialog.js` | 统一弹窗系统：showConfirmDialog（确认+取消）、showAlertDialog（仅确定） |
| `src/navigation.js` | 页面导航：switchPage、goToNext/Prev、updateNavigationState、updatePageHeaders |
| `src/welcome.js` | 启动页：开始抽签、设置背景、加载自定义背景 |
| `src/settings-page.js` | 设置页：队伍表格渲染、分组数量设置、项目列表渲染、项目切换 |
| `src/order-page.js` | 抽签顺序页：动画状态机（idle→flashing→selected）、暂停/恢复 |
| `src/file-ops.js` | 文件操作：Excel 导入导出、解析多 Sheet 数据 |
| `src/draw-page.js` | 分组抽签页：左右分栏布局、分组卡片、逐个飞行动画抽签、结果表格 |
| `src/utils.js` | 工具函数：shuffleArray（Fisher-Yates 洗牌）、escapeHtml（XSS 防护） |

---

## 3. 架构设计

### 3.1 主进程 (`main.js`)

主进程职责:

1. **窗口管理**: 创建 BrowserWindow，配置尺寸 1400x900，启动时自动最大化
2. **安全配置**:
   - `nodeIntegration: false` — 禁止渲染进程直接访问 Node.js
   - `contextIsolation: true` — 隔离渲染进程上下文
   - `sandbox: true` — 启用渲染进程沙箱
   - `setWindowOpenHandler` — 阻止新窗口创建
   - `will-navigate` — 阻止外部导航
3. **意图式 IPC 处理**:
   - `import-excel`: 主进程内部完成文件对话框 + Excel 读取，不向渲染进程暴露文件路径
   - `export-excel`: 主进程内部完成保存对话框 + Excel 写入，渲染进程仅发送数据
   - `open-image-dialog`: 图片选择对话框（仅对话框结果，无文件内容）

安全配置:
```javascript
webPreferences: {
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true,
  preload: path.join(__dirname, 'preload.js')
}
```

IPC 发送方校验: 所有 IPC handler 验证 `event.senderFrame === mainWindow.webContents.mainFrame`

### 3.2 预加载脚本 (`preload.js`)

通过 `contextBridge` 安全地暴露意图式 IPC API（不暴露文件路径）:

```javascript
contextBridge.exposeInMainWorld('electronAPI', {
  importExcel: () => ipcRenderer.invoke('import-excel'),      // 对话框+读取
  exportExcel: (data) => ipcRenderer.invoke('export-excel', data), // 对话框+写入
  openImageDialog: () => ipcRenderer.invoke('open-image-dialog') // 仅对话框
});
```

### 3.3 内容安全策略 (CSP)

在 `index.html` 中通过 meta 标签设置:
```html
<meta http-equiv="Content-Security-Policy"
  content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' file: data:;">
```

- `script-src 'self'` — 阻止内联脚本和内联事件处理器（关键 XSS 防线）
- `style-src 'unsafe-inline'` — 允许 JS 动态设置 element.style
- `img-src file:` — 允许加载本地文件背景图片

### 3.4 渲染进程模块化架构

采用 **ES Modules + 集中式状态** 模式组织代码。所有页面模块共享 `src/store.js` 中的状态对象，通过标准 JavaScript import/export 通信（单窗口 Electron 应用的推荐方式）。

**模块依赖关系**（无循环引用）:
```
store.js          ← 无依赖
utils.js          ← 无依赖
dialog.js         ← 无依赖
navigation.js     ← store
welcome.js        ← dialog
settings-page.js  ← store, dialog, navigation, order-page, utils, draw-algorithm
order-page.js     ← store, dialog, navigation, utils
draw-page.js      ← store, dialog, utils, draw-algorithm
file-ops.js       ← store, dialog, settings-page, navigation
app.js            ← 所有模块（入口，负责跨页面协调）
```

**跨页面协调**:
- `app.js` 中的 `updateUIForProject()` 协调 settings/order/draw 三个页面的 UI 更新
- `app.js` 中的 `clearData()` 重置所有页面状态（含停止动画定时器）
- `navigation.js` 的 `registerPageInit(pageId, callback)` 机制处理页面切换时的初始化
- 各页面模块通过 `window._xxx` 回调在运行时调用 `app.js` 中的协调函数，避免循环 import

**事件委托系统**:
- 所有按钮使用 `data-action` 属性（如 `data-action="select-file"`），不使用内联 `onclick`
- `app.js` 在 document 上注册单个 click 事件监听器，通过 `event.target.closest('[data-action]')` 匹配

### 3.5 集中式状态 (`src/store.js`)

```javascript
export const store = {
  teamsData: [],          // 当前项目的队伍数据
  drawAlgorithm: null,    // DrawAlgorithm 实例
  currentFilePath: null,
  drawCompleted: false,
  projectsData: {},       // 多项目数据 { sheetName: { teams, groupCount, drawOrderGenerated, drawCompleted } }
  currentProject: null,
  sheetNames: [],
  isGeneratingOrder: false,
  drawOrderState: null,   // 抽签顺序动画状态（支持暂停/恢复）
  drawCount: 0,          // 已抽签次数
};
```

### 3.6 IPC 通信流程

```
渲染进程 (ES Modules)          预加载脚本                    主进程
    │                            │                            │
    │  window.electronAPI        │                            │
    │  .importExcel() ──────────>│                            │
    │                            │ ipcRenderer.invoke        │
    │                            │ ('import-excel') ────────>│ dialog.showOpenDialog()
    │                            │                            │ XLSX.readFile()
    │                            │                            │
    │<───────────────────────────│<───────────────────────────│ {success, data}
```

---

## 4. 功能模块分析

### 4.1 启动页面功能

| 功能 | 实现模块 | 说明 |
|------|----------|------|
| 开始抽签 | `src/welcome.js` → `startDrawSystem()` | 淡出欢迎页，显示主界面 |
| 设置背景 | `src/welcome.js` → `changeBackground()` | 选择图片并保存到 localStorage |
| 加载背景 | `src/welcome.js` → `loadCustomBackground()` | 启动时恢复用户自定义背景 |

### 4.2 多项目数据管理

**数据结构**（存储在 `store.projectsData`）:
```javascript
projectsData = {
  "五子棋": {
    teams: [...],              // 队伍数组
    groupCount: 9,             // 分组数量
    drawOrderGenerated: false, // 是否已生成抽签顺序
    drawCompleted: false       // 是否已完成抽签
  }
}
```

**实现位置**:
- 项目解析: `src/file-ops.js` → `parseSheetData()`
- 项目选择: `src/settings-page.js` → `selectProject()`
- 项目列表渲染: `src/settings-page.js` → `renderProjectList()`
- 跨页面 UI 同步: `src/app.js` → `updateUIForProject()`

**项目切换恢复**:
- `selectProject()` 切换时，若项目已完成抽签则重建 `DrawAlgorithm` 实例
- `updateUIForProject()` 恢复分组显示、结果表格、按钮状态

### 4.3 动态页面标题

所有页面 header 格式: `2025大学生计算机大赛项目分组(${项目名})-页面名`

**实现**: `src/navigation.js` → `updatePageHeaders()`

### 4.4 抽签顺序动画系统

**三阶段状态机**（`src/order-page.js` → `drawOrderState.phase`）:

```
idle ──→ flashing ──→ selected ──→ idle（下一个队伍）
         ↕ 暂停      ↕ 延迟暂停
        idle         等当前队伍完成后暂停
```

| 阶段 | 行为 | 持续时间 |
|------|------|----------|
| `flashing` | 状态框中 60ms 间隔随机闪烁队伍名称（`flash-rolling` CSS 动画） | 800ms |
| `selected` | 停在实际抽中队伍上，高亮显示（`flash-selected`：1.8rem + 发光效果） | 飞行动画期间 |
| `idle` | 队伍名称胶囊飞向表格（ease-out 曲线，距离越近越慢），滑入表格 | 300ms 后进入下一轮 |

**飞行动画优化**:
- 使用 `cubic-bezier(0.0, 0.0, 0.2, 1)` ease-out 曲线
- 飞行时间根据距离动态计算：`duration = clamp(distance * 0.8, 300ms, 800ms)`
- 白色胶囊尺寸比默认大 20%（padding: 10px 24px, font-size: 1.2rem）

**表格列**: 抽签顺序 | 参赛队伍 | 学校 | 种子队（已移除"序号"列）

**暂停/恢复机制**:
- `flashing` 阶段暂停：立即停止闪烁，状态框显示"等待开始抽签"，当前队伍不选中
- `selected` 阶段暂停：设置 `pendingPause = true`，等当前队伍飞到表格后再暂停
- 恢复时从 `currentIndex` 继续

**按钮状态循环**: 启动抽签 → 暂停抽签 → 继续抽签 → 抽签完成

**定时器安全**:
- `stopOrderAnimation()` 清除 `flashInterval`，标记 `isPaused=true` 和 `isComplete=true`
- `clearData()` 和 `selectProject()` 切换前调用 `stopOrderAnimation()` 防止旧闭包污染 UI

### 4.5 分组抽签页面布局

**左右分栏布局**（`draw-layout`）:
```
.draw-layout (grid: 1.5fr 1fr)
├── .draw-left (分组卡片网格)
│   └── .groups-grid → .group-card (A/B/C/D... + 队伍数)
│       ├── .group-header (字母标签 + 队伍数)
│       └── .group-body (队伍列表)
└── .draw-right
    ├── .draw-right-top (已抽签队伍表格)
    │   └── table#draw-result-table (抽签顺序 | 参赛队伍 | 种子队 | 分组)
    ├── .draw-right-bottom (状态面板，浅蓝紫渐变背景)
    │   ├── .order-status-label (当前序号/总数)
    │   ├── .order-status-box (浅蓝紫渐变背景)
    │   │   ├── .draw-slot (抽签动画区域)
    │   │   └── .order-status-count (剩余数，深灰色文字)
    │   └── .draw-actions (开始抽签 + 重新抽签)
    └── .draw-page-footer (上一步 + 导出结果)
```

**分组卡片**:
- 头部使用大写字母标记（A、B、C、D...）而非数字
- 头部右侧显示当前组队伍数（如 "3 支队伍"）
- 每次抽签后自动更新队伍数显示

### 4.6 分组数量控制

**逻辑规则**:
- 未上传数据时：输入框禁用，显示为 0，设置按钮禁用
- 上传数据后：输入框启用，默认分组数为 9
- 实时监听 `input` 事件自动更新分组数量
- **分组数变更使已有抽签结果失效**: 修改分组数时自动重置 `drawCompleted` 和 `drawAlgorithm`

### 4.7 统一弹窗系统

**模块**: `src/dialog.js`

| 弹窗类型 | 函数 | 用途 |
|----------|------|------|
| 确认弹窗 | `showConfirmDialog(message, onConfirm)` | 退出确认、清除数据、重新抽签 |
| 提示弹窗 | `showAlertDialog(message)` | 错误提示、成功提示、操作提示 |

### 4.8 抽签算法模块

**模块**: `draw-algorithm.js`（`DrawAlgorithm` 类）

**核心规则**:
1. 种子队优先分配到各组
2. 同一学校的队伍不能放在同一组（除非学校队伍数量 ≥ 分组数量）
3. 分组内队伍数量平均分配
4. 所有组的人数差距不超过1

**关键方法**:
| 方法 | 功能 |
|------|------|
| `getTeamCountPerGroup()` | 计算每组目标队伍数 |
| `getAvailableGroups()` | 获取可分配的组（排除同校） |
| `allocateSeededTeams()` | 分配种子队到不同组 |
| `drawOne()` | 执行单次抽签 |
| `validate()` | 验证分组结果 |

### 4.9 XSS 防护

**工具函数**: `src/utils.js` → `escapeHtml(str)`

使用 DOM `createTextNode` 方式转义 `<`, `>`, `&`, `"`, `'`。

**应用位置**（渲染时转义，不修改原始数据）:
- `src/settings-page.js`: `renderTeamTable()`, `renderProjectList()`
- `src/order-page.js`: `flyToOrderTable()`, `renderOrderTable()`
- `src/draw-page.js`: `createTeamItem()`, `drawNextTeam()`, `addDrawResultRow()`, `renderDrawResultTable()`

### 4.10 结果导出模块

**模块**: `src/file-ops.js` → `exportResult()`

**导出格式**: `[['分组号', '队伍代号', '参赛队伍', '学校', '种子队']]`

### 4.11 分组抽签动画系统

**动画流程**（`src/draw-page.js` → `drawNextTeam()`）:

点击"开始抽签"后，系统自动执行逐个队伍的动画抽签流程：

| 阶段 | 行为 | 持续时间 |
|------|------|----------|
| 闪烁 | draw-slot 中 60ms 间隔随机闪烁队伍名称 | 600ms |
| 选中 | 停在抽中队伍上，高亮显示（`slot-team-highlight`）+ 目标组标签 | 即时 |
| 飞行 | 白色胶囊从 draw-slot 飞向目标分组卡片（ease-out 曲线） | 600ms |
| 出现 | 队伍条目以缩放动画（`teamAppear`）出现在分组列表中 | 350ms |
| 间隔 | 等待后进入下一支队伍 | 200ms |

**安全守卫**: 每个 setTimeout 回调检查 `store.drawAlgorithm` 是否存在，防止重置/切换项目时旧定时器操作无效 DOM。

**空闲状态**: 未开始抽签或重置后，draw-slot 统一显示 "抽签队伍" + "**等待抽签**"（`IDLE_SLOT_HTML` 常量），确保各处（初始 HTML、重置、项目切换、清除数据）内容一致。

**状态面板样式**: draw-right-bottom 内的 `.order-status-box` 使用浅蓝紫渐变背景（`linear-gradient(135deg, #c2d1e8, #d1c4e9)`），状态计数文字使用深灰色（`var(--gray-600)`），与抽签顺序页面的深色背景区分。

---

## 5. UI 布局系统

### 5.1 页面布局结构

```
.page (flex column, height: 100%)
├── .page-header (固定高度 70px, 动态标题)
└── .page-body (flex: 1, overflow-y: auto, min-height: 0)
    ├── .settings-content (设置页, flex: 0 1 auto, overflow: hidden)
    │   ├── .module (队伍数量模块)
    │   └── .settings-layout (grid: 3fr 7fr, max-height: 700px)
    │       ├── .settings-left (.project-module)
    │       └── .settings-right (.team-info-module, max-height: 500px)
    ├── .order-layout (抽签顺序页, grid: 2.15fr 0.85fr)
    │   ├── .order-left (表格, max-height: 700px, overflow-y: auto)
    │   └── .order-right (状态控制面板, 居中对齐)
    │       ├── .order-status-label (当前抽签序号/总数)
    │       ├── .order-status-box (队伍名称闪烁/选中区域)
    │       └── .order-actions (按钮组)
    ├── .draw-layout (分组抽签页, grid: 1.5fr 1fr)
    │   ├── .draw-left (分组卡片网格, max-height: 700px, overflow-y: auto)
    │   └── .draw-right (右侧面板)
    │       ├── .draw-right-top (已抽签队伍表格, max-height: 400px)
    │       ├── .draw-right-bottom (状态面板, 浅蓝紫渐变背景)
    │       │   ├── .order-status-label
    │       │   ├── .order-status-box > .draw-slot
    │       │   ├── .order-status-count
    │       │   └── .draw-actions (开始抽签 + 重新抽签)
    │       └── .draw-page-footer (上一步 + 导出结果)
```

### 5.2 关键 CSS 动画

| 动画名 | 用途 | 参数 |
|--------|------|------|
| `nameFlash` | 抽签顺序闪烁 | 0.08s steps(1) infinite |
| `flash-selected` | 选中高亮 | 1.8rem, scale(1.15), 双重 text-shadow |
| `orderRowSlideIn` | 表格行滑入 | 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94) |
| `fadeIn` | 分组队伍淡入 | 0.3s ease |
| `teamAppear` | 分组队伍出现 | 0.35s ease, scale(0.8)→scale(1) |
| `float` | 欢迎页 logo 浮动 | 3s ease-in-out infinite |
| `highlightPulse` | 抽签槽位高亮 | 0.4s ease, scale(0.95)→scale(1.08) |

### 5.3 导航状态控制

- **抽签顺序导航**: 有数据时可点击，否则 disabled
- **分组抽签导航**: 生成抽签顺序后可点击，否则 disabled
- **抽签完成前**: "下一步"按钮始终禁用

---

## 6. 数据流分析

### 6.1 完整数据流

```
Excel 文件 (多 Sheet)
    │
    ▼
┌─────────────────────────────────────────┐
│  主进程: import-excel()                 │
│  - 显示文件对话框                        │
│  - XLSX.readFile() 读取所有 Sheet          │
│  - 返回 { success, filePath, data }      │
└─────────────────────────────────────────┘
    │
    │ IPC: {success: true, filePath, data: {sheetNames, sheets}}
    ▼
┌─────────────────────────────────────────┐
│  file-ops.js: processImportedData()     │
│  - 遍历每个 Sheet 调用 parseSheetData()  │
│  - 构建 store.projectsData 对象          │
│  - 提取项目名称和分组数量                 │
└─────────────────────────────────────────┘
    │
    ▼ store.projectsData: { "项目名": {...} }
┌─────────────────────────────────────────┐
│  settings-page.js: selectProject()     │
│  - 停止进行中的动画（stopOrderAnimation）│
│  - 更新 store.currentProject            │
│  - 切换 store.teamsData 指向            │
│  - 若项目已完成则重建 DrawAlgorithm     │
│  - 调用 window._updateUIForProject()    │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  order-page.js: generateOrder()        │
│  - 分离种子队/非种子队                   │
│  - 随机打乱并分配 drawOrder              │
│  - 三阶段动画逐个展示                    │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  draw-page.js: startDrawAnimation()    │
│  - 构造 DrawAlgorithm                   │
│  - allocateSeededTeams() 分配种子队      │
│  - drawNextTeam() 逐个动画抽签           │
│    (闪烁→选中→飞行动画→分配到组)       │
│  - 每次分配更新组队伍数显示             │
└─────────────────────────────────────────┘
    │
    ▼ groups: [{index: 1, teams: [...]}]
┌─────────────────────────────────────────┐
│  file-ops.js: exportResult()           │
│  - 格式化数据为二维数组                   │
│  - 主进程 export-excel() 对话框+写入    │
└─────────────────────────────────────────┘
```

### 6.2 种子队特殊处理

1. **按学校分组**: 同校种子队需要分配到不同组
2. **按种子数量排序**: 种子队多的学校优先分配
3. **轮询分配**: 使用取模运算确保分散到不同组
4. **兜底机制**: 若所有组都有同校队伍，分配到人数最少的组

---

## 7. 安全架构

### 7.1 Electron 安全检查清单

| 防线 | 状态 | 实现位置 |
|------|------|----------|
| `nodeIntegration: false` | ✅ | `main.js:15` |
| `contextIsolation: true` | ✅ | `main.js:16` |
| `sandbox: true` | ✅ | `main.js:17` |
| `contextBridge` API | ✅ | `preload.js` |
| 意图式 IPC（无路径暴露） | ✅ | `preload.js`, `main.js` |
| CSP（script-src 'self'） | ✅ | `index.html` |
| 无内联 onclick（data-action） | ✅ | `index.html`, `app.js` |
| 新窗口拦截 (`setWindowOpenHandler`) | ✅ | `main.js:28` |
| 外部导航拦截 (`will-navigate`) | ✅ | `main.js:33` |
| IPC 发送方校验 | ✅ | `main.js:69,99,123` |
| XSS 转义（escapeHtml） | ✅ | `src/utils.js`, 各页面模块 |

### 7.2 XSS 防护

所有 Excel 数据在渲染时通过 `escapeHtml()` 转义，使用 DOM `createTextNode` 方式，在数据源（`file-ops.js`）保持原始数据不变。

### 7.3 定时器安全

- `stopOrderAnimation()` 清除所有抽签顺序动画定时器
- `clearData()` 和 `selectProject()` 在切换上下文前调用停止函数
- 防止旧闭包在数据清空后继续操作 DOM

---

## 8. 配置与依赖

### 8.1 package.json 依赖说明

| 包名 | 版本 | 用途 |
|------|------|------|
| `electron` | ^37.3.1 | 桌面应用框架 |
| `electron-builder` | ^24.9.1 | 应用打包工具 |
| `xlsx` | ^0.18.5 | Excel 文件读写 |

### 8.2 electron-builder 构建配置

```javascript
"build": {
  "appId": "com.tournament.draw",
  "productName": "大赛抽签系统",
  "directories": {
    "output": "dist"
  },
  "files": [
    "**/*",
    "!**/*.Zone.Identifier"
  ],
  "win": { "target": "nsis" },
  "mac": { "target": "dmg" },
  "linux": { "target": "AppImage" }
}
```

### 8.3 启动脚本

```bash
npm start     # 启动开发模式
npm run build # 构建发布包
```

---

## 9. 用户操作流程

```
┌─────────────────────────────────────────────────────────────┐
│                        启动页面                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                   │
│  │开始抽签  │  │设置背景  │  │退出系统  │                   │
│  └────┬─────┘  └──────────┘  └──────────┘                   │
└───────┼──────────────────────────────────────────────────────┘
        │
        ▼ 点击"开始抽签"
┌─────────────────────────────────────────────────────────────┐
│  步骤1: 抽签设置                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 1. 点击"上传队伍数据"选择 Excel 文件                  │    │
│  │ 2. 左侧显示比赛项目列表（支持多项目切换）              │    │
│  │ 3. 右侧显示当前项目的队伍表格（max-height: 500px）    │    │
│  │ 4. 设置分组数量（无数据时输入框禁用）                  │    │
│  │ 5. 点击"下一步"（无数据时按钮禁用）                   │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
        │
        ▼ 点击"下一步"
┌─────────────────────────────────────────────────────────────┐
│  步骤2: 抽签顺序                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 1. 点击"启动抽签"开始抽签动画                         │    │
│  │    - 状态框闪烁随机队伍名称（60ms）                    │    │
│  │    - 选中队伍高亮显示后胶囊飞向表格（减速动画）      │    │
│  │    - 种子队自动排在前面                                │    │
│  │ 2. 可随时点击"暂停抽签"暂停，再点击"继续抽签"恢复      │    │
│  │ 3. 抽签完成后点击"下一步"                             │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
        │
        ▼ 点击"下一步"
┌─────────────────────────────────────────────────────────────┐
│  步骤3: 分组抽签                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  ┌──────────────┐  ┌──────────────────────────┐      │    │
│  │  │  左侧        │  │  右上: 已抽签表格     │      │    │
│  │  │  A/B/C/D...   │  │  右下: 状态面板(浅蓝紫) │      │    │
│  │  │  分组卡片    │  │    + 开始/重新抽签   │      │    │
│  │  │  + 队伍数    │  │  底部: 上一步+导出  │      │    │
│  │  └──────────────┘  └──────────────────────────┘      │    │
│  │ 1. 点击"开始抽签"启动动画抽签（种子队已预分配）        │    │
│  │    - 状态框闪烁随机队伍名称                           │    │
│  │    - 选中队伍后胶囊飞向目标分组卡片                   │    │
│  │    - 逐个队伍依次抽签直到完成                       │    │
│  │ 2. 点击"重新抽签"重置分组结果                       │    │
│  │ 3. 查看分组结果（每组卡片展示队伍列表）                │    │
│  │ 4. 右上表格实时显示已分配队伍                       │    │
│  │ 5. 点击"导出结果"保存 Excel 文件                       │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 快捷操作流程

- **暂停/恢复抽签**: 在抽签顺序页面点击暂停按钮，闪烁立即停止
- **重新抽签**: 点击"重新抽签"按钮可重置分组结果
- **清除数据**: 返回设置页点击"清除数据"重新开始
- **项目切换**: 在左侧项目列表点击切换不同比赛项目

### Excel 格式要求

- **第一列**: 序号（数字）
- **第二列**: 学校
- **第三列**: 参赛队伍
- **第四列**: 种子队（"是" 或留空）
- **E1 单元格**: 可选，分组数量（默认 9）
- **表头行**: 必须包含"序号"字段
- **支持多 Sheet**: 每个 Sheet 作为一个独立比赛项目

---

## 10. 技术亮点

1. **模块化架构**: ES Modules 拆分为 10 个独立模块，无循环依赖，集中式状态管理
2. **深度安全架构**: 沙箱 + CSP + 意图式 IPC + XSS 转义 + 新窗口拦截 + 导航拦截 + IPC 发送方校验
3. **多项目支持**: 单个 Excel 文件可包含多个比赛项目，独立管理抽签状态
4. **动画状态机**: 三阶段抽签顺序动画（idle→flashing→selected），支持暂停/恢复
5. **同校回避算法**: 智能处理同一学校多支队伍的分组，确保公平性
6. **种子队机制**: 种子队优先分散分配，增强竞技平衡性
7. **响应式设计**: CSS 支持多种屏幕尺寸，使用 CSS Grid 和 Flexbox
8. **统一弹窗系统**: 所有提示使用统一风格的自定义弹窗，非原生 alert
9. **事件委托**: data-action 属性 + 单个 document 监听器，无内联 onclick
10. **分组页面左右分栏**: 左侧分组卡片（ABCD 字母+队伍数）+ 右侧表格/状态面板
11. **项目切换恢复**: 切换已完成项目时自动重建算法实例并恢复 UI 状态
12. **定时器安全**: 切换上下文前正确停止所有动画定时器

---

## 11. 更新日志

### v3.1.0 (2026-03-29)

**分组抽签动画**:
- 新增逐个队伍飞行动画抽签流程（`drawNextTeam()`）：闪烁随机名称(600ms) → 选中高亮 → 飞向分组卡片(600ms) → 队伍出现动画(350ms)
- 替换原有的即时批量抽签（while 循环）为链式动画调用
- 每个动画阶段均包含 `store.drawAlgorithm` 空值守卫，防止重置时旧定时器异常

**Bug 修复**:
- 修复 draw-slot 在空闲状态显示内容不统一的问题（统一使用 `IDLE_SLOT_HTML` 常量）
- 修复抽签完成后"重新抽签"按钮仍为禁用状态的问题

**UI 优化**:
- draw-status-box 背景改为浅蓝紫渐变（`#c2d1e8 → #d1c4e9`），状态计数文字颜色调整为深灰
- "上一步"和"导出结果"按钮从 page-footer 移入 draw-right 列底部（`draw-page-footer`），始终显示在状态面板下方

### v3.0.0 (2026-03-27)

**安全加固**:
- 新增 CSP 内容安全策略（`script-src 'self'` 阻止内联脚本）
- 将所有 19 个内联 `onclick` 属性替换为 `data-action` 事件委托
- IPC 重构为意图式 API：`importExcel`/`exportExcel`（主进程内部处理文件对话框，不暴露路径）
- 移除 `readExcel`/`readExcelSheets`/`saveExcel`/`openFileDialog`/`saveFileDialog` 等原始路径 API
- 新增 `sandbox: true` 启用渲染进程沙箱
- 新增 `setWindowOpenHandler` 阻止新窗口创建
- 新增 `will-navigate` 拦截外部导航
- 所有 IPC handler 新增 `event.senderFrame` 发送方校验
- 新增 `escapeHtml()` 工具函数，所有 Excel 数据渲染时转义 HTML 特殊字符

**Bug 修复**:
- 修复 `selectProject()` 切换到已完成项目时分组结果丢失的问题（自动重建 DrawAlgorithm）
- 修复 `updateGroupCount()` 修改分组数后 drawCompleted 状态不一致的问题（变更时重置完成状态）
- 修复 `clearData()` 未清除抽签顺序动画定时器导致旧闭包污染 UI 的问题
- 修复 `selectProject()` 切换项目时旧动画定时器继续运行的问题
- 移除 store 中已废弃的 `autoDrawInterval`/`isAutoDrawing`/`isAutoDrawingNow` 状态

**UI 重构 — 分组抽签页面**:
- 页面从垂直堆叠布局重构为左右分栏（`draw-layout: grid 1.5fr 1fr`）
- 左侧：分组卡片网格（支持滚动）
- 右上：已抽签队伍结果表格（抽签顺序 | 参赛队伍 | 学校 | 种子队）
- 右下：状态面板（复用 order-right 样式）+ 开始抽签/重新抽签按钮
- 移除一键抽签功能
- draw-slot 动画区域移入状态面板内部
- 新增 `renderDrawResultTable()` 渲染完整结果表格
- 新增 `updateDrawStatus()` 更新状态面板显示
- 新增 `addDrawResultRow()` 每次抽签后追加表格行

**UI 优化 — 抽签顺序页面**:
- 去掉"序号"列，表格简化为：抽签顺序 | 参赛队伍 | 学校 | 种子队
- 飞行动画优化：使用 ease-out 曲线，距离越接近表格速度越慢
- 飞行胶囊尺寸增大约 20%（padding、font-size、border-radius）
- 飞行时间根据距离动态计算（300ms~800ms）

**UI 优化 — 分组卡片**:
- 分组头部从数字标记（"第 1 组"）改为大写字母（"A"）+ 队伍数显示（"3 支队伍"）
- 每次抽签后自动更新分组队伍数

### v2.0.0 (2026-03-27)

**架构重构**:
- 将 `renderer.js`（1075 行）拆分为 10 个独立 ES Module 文件
- 新增 `src/store.js` 集中式状态管理，所有页面共享状态
- 采用 `registerPageInit` 回调机制处理页面切换初始化，避免循环依赖
- `app.js` 作为入口负责跨页面协调（updateUIForProject、clearData）
- HTML 改用 `<script type="module">` 加载，`draw-algorithm.js` 新增 ES Module 导出
- 所有 onclick 函数通过 `window` 注册，保持 HTML 不做大幅改动

**不变**: 所有业务逻辑、UI 行为、动画效果完全保持原有实现

### v1.1.0 (2026-03-27)

**新增功能**:
- 抽签顺序页面重构：左右分栏布局（表格 + 状态控制面板），grid 比例 `2.15fr 0.85fr`
- 动态页面标题：所有页面 header 格式为 `2025大学生计算机大赛项目分组(${项目名})-页面名`
- 抽签顺序动画：三阶段状态机（idle → flashing → selected）
  - 闪烁阶段：60ms 间隔随机显示队伍名称
  - 选中阶段：高亮显示选中队伍（1.8rem + 发光效果）
  - 滑入阶段：队伍信息滑入表格（cubic-bezier 动画）
- 暂停/恢复机制：
  - phase 状态追踪（idle/flashing/selected）
  - pendingPause 延迟暂停（选中阶段点击暂停时，等当前队伍完成后暂停）
  - 按钮状态循环：启动抽签 → 暂停抽签 → 继续抽签 → 抽签完成
- 抽签完成前"下一步"按钮始终禁用

### v1.0.0 (2026-03-26)

**新增功能**:
- 多项目支持：支持从 Excel 多个 Sheet 读取不同比赛项目
- 统一弹窗系统：新增 `showAlertDialog()` 函数，替换所有原生 `alert()`
- 窗口最大化：应用启动时自动最大化

**UI 优化**:
- 表格区域高度限制为 500px
- 下一步按钮固定在页面底部
- 项目卡片布局优化：名称和统计数据在同一行
- 分组数量输入框：无数据时禁用并显示 0

**Bug 修复**:
- 修复清除数据后分组数量输入框仍可编辑的问题
- 修复表格内容撑开容器的问题
- 移除已弃用的 `setPreloads` API 调用

---

## 12. 参考文件索引

| 文件 | 路径 | 关键内容 |
|------|------|----------|
| 主进程 | `main.js` | Electron 窗口创建、意图式 IPC、安全策略 |
| 预加载 | `preload.js` | contextBridge 意图式 API |
| 界面结构 | `index.html` | 启动页 + 三步流程 UI、data-action 事件委托 |
| 应用入口 | `src/app.js` | 事件委托、跨页面协调、初始化 |
| 状态管理 | `src/store.js` | 集中式状态对象 |
| 弹窗系统 | `src/dialog.js` | 确认弹窗、提示弹窗 |
| 页面导航 | `src/navigation.js` | 路由切换、导航状态、标题更新 |
| 启动页面 | `src/welcome.js` | 开始抽签、设置背景 |
| 设置页面 | `src/settings-page.js` | 队伍表格、项目列表、项目切换 |
| 抽签顺序 | `src/order-page.js` | 动画状态机、暂停/恢复、飞行动画 |
| 文件操作 | `src/file-ops.js` | Excel 导入导出、解析 |
| 分组抽签 | `src/draw-page.js` | 左右分栏、分组卡片、飞行动画抽签、结果表格 |
| 抽签算法 | `draw-algorithm.js` | 分组逻辑、同校回避 |
| 样式表 | `styles.css` | UI 样式、动画、布局、CSP |
| 工具函数 | `src/utils.js` | shuffleArray、escapeHtml |
| 项目配置 | `package.json` | 依赖、构建配置 |

---

*文档更新日期: 2026-03-29*
