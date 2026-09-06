# 内置浏览器下载管理器 — PRD 与实施方案

> 状态：Proposed ｜ 关联分析：内置浏览器导出文件不可见问题
> 前置约束：见 §2「现状与硬约束」，其中 §2.3「不可实现项」为设计边界，不可绕过

---

## 1. 背景与问题

内置浏览器（Tauri v2 `WebviewBuilder` + wry 0.55.1 + WebView2）页面上有「导出 Excel」这类功能时，用户点击后**看不到任何反馈**。

### 1.1 现状：四层缺口

| # | 缺口 | 位置 |
|---|---|---|
| 1 | 原生下载事件从未被订阅 | `src-tauri/src/commands/browser.rs:1521-1582` builder 链无 `.on_download(...)` |
| 2 | 现有检测挂在错误钩子上 | `browser.rs:1529-1551` 跑在 `on_navigation` 内，而页内 `<a download>` 走独立的 `DownloadStarting` 分支 |
| 3 | 判定标准漏 | `browser.rs:1446-1471` 仅按 URL 末段扩展名判断，`/api/export?format=excel` 无扩展名直接返回 `false` |
| 4 | 无承接设施 | 无下载目录配置、无 DataRoot 下载目录、无 UI、唯一 toast 3 秒消失且不带路径 |

### 1.2 用户感知

文件静默落到系统 `Downloads` 目录，应用全程无感知。用户视角：点了导出，什么都没发生。

---

## 2. 现状与硬约束

### 2.1 可用能力（已核实，非推测）

- `tauri 2.11.5` 的 `WebviewBuilder::on_download` 是**稳定 API**（`tauri-2.11.5/src/webview/mod.rs:643`）。接线处 `tauri-runtime-wry-2.11.4/src/lib.rs:5010-5029` **不在 `cfg(unstable)` 门内**（`:5007` 的 `#[cfg(not(feature = "unstable"))] None` 属于上方 bounds 代码块结尾）。**无需新增 `core-webview2` 依赖。**
- 事件模型：

```rust
DownloadEvent::Requested  { url: Url, destination: &mut PathBuf }   // 改写绝对路径；返回 false 取消
DownloadEvent::Finished   { url: Url, path: Option<PathBuf>, success: bool }
```

- `Requested` 的 `destination` 是 `&mut PathBuf`，**允许在开始时改写为任意绝对路径**，wry 内部以 `SetResultFilePath` + `SetHandled(true)` 落地（`wry-0.55.1/src/webview2/mod.rs:791-869`）。
- 完成态由 wry 在 `DownloadStarting` 回调内部注册 `StateChanged` 监听获取（同文件 `:814-846`）。
- `opener:allow-open-path` 已在 `src-tauri/capabilities/default.json`，路径规则 `**` 全放行 →「打开所在目录」无权限改动。
- `DataRoot::ensure()`（`src-tauri/src/services/data_root.rs:168-181`）负责创建标准子目录。

### 2.2 平台约束

macOS（wkwebview 后端）**没有下载 handler 实现**（依赖源码中无匹配项），与 `DownloadEvent::Finished` 文档「macOS 的 path 恒为空」一致。

**结论：下载管理器是 Windows-only 功能。** UI 必须处理「平台不支持」空态，且不可假设全平台可用。

### 2.3 不可实现项（设计边界）

**进度条不可实现。** `DownloadEvent` 只有 `Requested` / `Finished` 两个变体；wry 监听的是 WebView2 `StateChanged`，只上报状态枚举（`IN_PROGRESS / COMPLETED / CANCELED / INTERRUPTED`），**不上报已下载字节数**，tauri 层也未暴露进度回调。

UI 只能做**两段式**：进行中（无百分比）→ 完成 / 失败。不要预留进度条，预留了也无法驱动。

### 2.4 实施顺序不可颠倒

侧板 UI 是纯消费端。跳过数据源直接做 UI，产出的是一个永远是空列表的面板。

---

## 3. 目标与非目标

### 3.1 目标

- G1 文件落地可控：下载进应用可知的目录，而非系统默认 `Downloads`
- G2 即时触达：下载发生的那一刻用户能感知「文件去哪了」
- G3 持久可管理：历史可翻查、可重试、可打开所在目录、可清理
- G4 安全兜底：可执行文件不静默落盘

### 3.2 非目标

- 不做断点续传 / 多线程下载（WebView2 下载委托不支持）
- 不做下载限速、下载队列并发控制
- 不做病毒扫描 / 文件校验
- 不做跨平台下载（macOS 见 §2.2）
- 不做下载速度/进度显示（见 §2.3）
- 不做全局设置页的下载目录配置项 —— v1 固定 `DataRoot/downloads`，见 §6.6 扩展点

---

## 4. 方案概览

### 4.1 核心判断：拆成两层，不要只做侧板 tab

用户点「导出」的瞬间焦点在浏览器标签上，左板大概率关闭或处于其他 tab。下载很快（小文件几百毫秒完成），到用户想起翻侧板，什么都没了。

侧板适合做**持久视图**，不适合做**唯一实时通知承载面**。

| 层 | 位置 | 职责 | 触达性 |
|---|---|---|---|
| **实时通知** | `BottomStatusBar` 指示器 + 完成 toast（带可点击路径） | 即时感知「文件去哪了」 | 高 |
| **持久管理** | 侧板新增 `downloads` tab | 历史、重试、删除、打开目录、清理 | 中 |

只做侧板 tab 会漏掉触达；只做 toast 会丢掉历史。两层都要。

### 4.2 数据流

```
页面点击导出
  └─ WebView2 DownloadStarting
      └─ wry download_started_handler
          └─ tauri on_download closure
              └─ DownloadEvent::Requested { url, destination }
                  ├─ 改写 destination → DataRoot/downloads/<sanitized>
                  └─ emit "browser://download-started" { label, url, destination }
                      └─ 前端下载 store 入队（status: downloading）
                          └─ BottomStatusBar 指示器计数 +1

文件落盘
  └─ wry StateChanged → COMPLETED / CANCELED / INTERRUPTED
      └─ DownloadEvent::Finished { url, path, success }
          └─ emit "browser://download-finished" { label, url, path, success }
              └─ 前端 store 更新（status: completed/failed，补 size + mtime）
                  ├─ completed → toast（可点击打开目录）
                  └─ BottomStatusBar 指示器转稳态
```

---

## 5. 详细设计

### 5.1 后端事件协议

两个事件，payload 定义如下。事件名沿用现有 `browser://` 命名空间（与 `browser://session-updated`、`browser://download-detected` 一致）。

```ts
// 下载开始
interface BrowserDownloadStarted {
  label: string        // webview label，如 "browser-<tabId>"
  url: string          // 源 URL
  destination: string  // 已解析的绝对落盘路径
  tabId: string | null // 关联标签页 id（可能为 null）
}

// 下载结束
interface BrowserDownloadFinished {
  label: string
  url: string
  path: string | null  // success=false 时为 null
  success: boolean
  tabId: string | null
}
```

**废弃 `browser://download-detected`。** 该事件语义混乱（文案「检测到下载内容」实际含义是「已转交系统浏览器」，且不确认是否成功），且只在导航命中时才 emit，覆盖不到 blob 导出。改由 `download-started` / `download-finished` 取代。

### 5.2 Rust 侧实现要点

#### 5.2.1 builder 链加钩子

`browser.rs:1521` 的 builder 链上追加：

```rust
.on_download(|_webview, event| match event {
    DownloadEvent::Requested { url, destination } => {
        let target = resolve_download_destination(&url);
        if let Some(t) = &target {
            *destination = t.clone();
        }
        emit_download_started(&app, label, url, target);
        true // 放行
    }
    DownloadEvent::Finished { url, path, success } => {
        emit_download_finished(&app, label, url, path, success);
        true
    }
    _ => true,
})
```

`on_download` 是 builder 方法，**必须在 `add_child` 之前挂上**，已构建的 `Webview` 实例上没有该方法。

#### 5.2.2 落盘路径解析与清洗

```
resolve_download_destination(url) → Option<PathBuf>
  1. 取 URL 路径末段 + query 中可能的 filename 参数
  2. 解析 Content-Disposition 提示（若可从已有 net hook 拿到）
  3. 清洗：剥离目录分量、拒绝 ".."、拒绝绝对路径、拒绝 NUL、限制长度 255
  4. 空值/全特殊字符 → 生成 "download-<timestamp>.<ext>"
  5. 返回 DataRoot/downloads_dir().join(sanitized)
```

**安全边界**：`destination` 是 `&mut PathBuf`，改路径时必须清洗 URL 文件名，防 `..` 与绝对路径写出下载目录之外。WebView2 会用清洗后的路径落盘。

#### 5.2.3 下载目录

`data_root.rs` 增 `downloads_dir()`（与 `logs_dir()` / `cache_dir()` 同级），`ensure()` 中创建。

不新增全局设置项，v1 固定 `DataRoot/downloads`。见 §6.6 扩展点。

#### 5.2.4 改造既有拦截逻辑

`browser.rs:1446-1551` 的 `is_downloadable_url` + `on_navigation` 转外部浏览器那套需要降级：

| 类型 | 新行为 | 理由 |
|---|---|---|
| `xls` / `xlsx` / `doc` / `docx` / `ppt` / `pptx` / `pdf` / `zip` / `rar` / `7z` | **允许内嵌渲染或正常落盘**，不再转外部浏览器 | 用户明确要导出，拦截是反模式 |
| `exe` / `msi` / `dmg` / `apk` / `ipa` | **保留转外部浏览器兜底**（或落盘 + 危险标记） | 安全考虑 |
| `blob:` | 不再按导航拦截，交由 `on_download` 处理 | `DownloadStarting` 是正确钩子 |

`on_new_window` 目前的 `NewWindowResponse::Deny`（`browser.rs:1570-1581`）保持不变，但需注意 `window.open(blobUrl)` 触发的导出会因此丢失 —— 该项作为已知限制记录，不在 v1 解决。

### 5.3 前端数据模型

新建 `src/stores/browserDownloadStore.ts`，范式参考 `browserSidebarStore` 的 `persist()`（`src/stores/browserSidebarStore.ts:61`）。

```ts
export type DownloadStatus = 'downloading' | 'completed' | 'failed'

export interface BrowserDownloadItem {
  id: string                 // 生成，label+url+timestamp 去重
  label: string
  tabId: string | null
  url: string
  filename: string           // 展示用
  destination: string        // 计划路径（Requested 时已知）
  path: string | null        // 实际路径（Finished 时回填）
  status: DownloadStatus
  size: number | null        // 完成后 stat 得到
  createdAt: number
  finishedAt: number | null
}

interface BrowserDownloadState {
  items: BrowserDownloadItem[]
  activeCount: number        // 派生：status === 'downloading'
  addOrUpdateFromStarted: (p: BrowserDownloadStarted) => void
  addOrUpdateFromFinished: (p: BrowserDownloadFinished) => void
  retry: (id: string) => void
  remove: (id: string) => void
  clearCompleted: () => void
}
```

约束：
- **内存为主，persist 只留最近 100 条**（下载记录不该无限增长）
- `activeCount` 供 `BottomStatusBar` 指示器使用，避免指示器订阅整个 `items`
- 用原始值 selector（参考 `BrowserSidebarPanel.tsx:401` 注释：避免对象引用变化导致 `useSyncExternalStore` 无限循环）

### 5.4 实时通知层（先做）

#### 5.4.1 BottomStatusBar 下载指示器

在 `BrowserSidebarPanel.tsx:218` 的 `BottomStatusBar` 第一行操作区（`:277-313`）插入。已存在、已知「当前标签」、无需新增全局 UI 层，是成本最低的落点。

- `activeCount > 0`：显示 `<Download>` 图标 + 数字 + 轻微脉冲动画
- `activeCount === 0` 且有记录：显示灰色 `<Download>` 图标，带数量 badge
- 点击：切到左板 `downloads` tab

#### 5.4.2 完成 toast

取代 `BrowserPanel.tsx:523-533` 现有的 `browser://download-detected` 监听。

- 标题：「下载完成」，内容：文件名
- **带可点击路径**，点击调 `opener.openPath()` 打开所在目录（权限已就绪）
- `toast.info` 默认 3000ms（`src/stores/toastStore.ts:151`），下载完成建议延长到 6000ms（用户要读路径），用带 `duration` 的重载或新增 `toast.download()`
- 失败态：`toast.error`，文案区分「下载失败」，附「重试」动作
- 补 `browser.downloadStarted` 的 i18n key（当前 `src/locales/` 下 **0 命中**，靠 `defaultValue` 兜底，英文环境显示中文）

### 5.5 持久管理层（后做）

侧板新增 `downloads` tab，三处机械改动：

1. `browserSidebarStore.ts:20` — `SidebarTabName` 加 `'downloads'`
   （注：现有 `'history' | 'aiSource'` 是 `commit 9183027c` 移除书签功能后遗留的**死类型**，建议顺手清掉）
2. `BrowserSidebarPanel.tsx:413` — `tabs` 数组加一项
3. `BrowserSidebarPanel.tsx:481` — 加条件分支渲染新组件

#### 5.5.1 列表项设计

| 区域 | 内容 |
|---|---|
| 左侧图标 | 按扩展名着色：文档蓝、压缩包橙、可执行红、其他灰 |
| 主行 | 文件名（`truncate`） |
| 次行 | 来源 hostname + 状态 + 时间 |
| 状态标记 | 进行中（脉冲圆点，无百分比）/ 完成（绿勾）/ 失败（红叉） |
| hover 操作 | 打开文件 / 打开所在目录 / 复制路径 / 重试（仅失败）/ 删除记录 |

**不要做进度条**（§2.3）。进行中用不定态脉冲圆点表达「在动」。

#### 5.5.2 工具栏

- 「打开下载目录」— 主操作
- 「清空已完成」— 需二次确认
- 状态过滤：全部 / 进行中 / 已完成 / 失败

#### 5.5.3 空态

| 场景 | 展示 |
|---|---|
| 平台不支持（非 Windows） | 明确说明仅 Windows 支持，不显示空列表 |
| 无任何记录 | 「暂无下载记录」+ 引导文案 |
| 过滤后为空 | 「该状态下暂无记录」 |

#### 5.5.4 搜索语义

`:439` 的 `SearchBar` 是全局的，`:403-411` 的 `filteredResults` 只搜 shortcuts，命中后走 `:442` 的独立搜索结果分支（不渲染 tab 栏）。

加了下载 tab 后必须明确：搜索是否覆盖下载历史。建议**覆盖** —— 否则「侧板里有下载列表，但搜索搜不到它」语义不一致。实现上 `filteredResults` 增一个 `downloads` 分片。

### 5.6 重试语义

「重试」= 让来源标签重新导航到原 URL。实现上调用现有 `browser_navigate_with_app`。

限制：只对**可复现的下载**有效。blob: URL 重试无意义（blob 已随页面销毁），对这类只保留「重新访问来源页面」而不是直接重试下载。

---

## 6. 边界情况与已知限制

| # | 场景 | 处理 |
|---|---|---|
| 6.1 | 文件名含 `..` 或绝对路径 | `resolve_download_destination` 清洗，写出下载目录外一律拒绝 |
| 6.2 | 同名文件重复下载 | WebView2 自动改名；`Finished.path` 回填实际路径，以 `Finished` 为准 |
| 6.3 | 用户切 tab / 关标签期间下载 | 下载属于 webview，不属标签生命周期；记录按 label 归档，不受标签关闭影响 |
| 6.4 | `window.open(blobUrl)` 导出 | `on_new_window` Deny → 静默丢失。**已知限制，v1 不解决** |
| 6.5 | 超大文件 | 无进度、无取消 UI；用户只能等 `Finished` |
| 6.6 | 自定义下载目录 | v1 固定 `DataRoot/downloads`。扩展点：新增 config 字段 + 设置 UI + `resolve_download_destination` 读配置 |
| 6.7 | 可执行文件 | 落盘后列表项标危险色，toast 提示；是否额外拦截由 §5.2.4 决定 |
| 6.8 | macOS / Linux | UI 显示平台不支持空态；后端 `on_download` 挂上但事件不会来 |

---

## 7. 实施顺序

**依赖关系严格，不可并行跳步。**

### Phase 1 — 数据源（独立可验证，其他都依赖它）

- [ ] `data_root.rs` 增 `downloads_dir()` + `ensure()` 创建
- [ ] `browser.rs:1521` builder 链加 `.on_download(...)`
- [ ] `resolve_download_destination` + 单元测试（`..`、绝对路径、超长、空文件名）
- [ ] emit `browser://download-started` / `browser://download-finished`
- [ ] **验证点**：真实页面导出 Excel，确认文件落到 `DataRoot/downloads`，两事件到达前端

> 这一步完成后问题就已解决 80%：文件有落点了，前端能收到信号了。

### Phase 2 — 前端承接

- [ ] `browserDownloadStore.ts`（persist，上限 100 条）
- [ ] 替换 `BrowserPanel.tsx:523-533` 的 `download-detected` 监听为两个新事件
- [ ] 完成 toast（带可点击路径、6000ms、失败可重试）
- [ ] 补 `browser.downloadStarted` i18n key（zh-CN + en-US）
- [ ] 顺手修 `BrowserPanel.tsx:520-540` 的事件清理写法（`unlistenOverflowRef.current` 被 IIFE 覆盖，`unlistenOverflow()` 永不被调用；当前功能正确但脆弱，再加第三个 listener 会漏挂）

### Phase 3 — UI 两层

- [ ] `BottomStatusBar` 下载指示器（先做，触达价值最高）
- [ ] 侧板 `downloads` tab（三处改动 + 新组件）
- [ ] 搜索覆盖下载历史
- [ ] 清死类型 `'history' | 'aiSource'`

### Phase 4 — 降级旧逻辑（最后做，避免回滚困难）

- [ ] `is_downloadable_url` 白名单收窄到可执行文件
- [ ] 删除 `browser://download-detected` 事件及其前端消费

---

## 8. 验证清单

- [ ] 页面内 `<a download>` 导出 xlsx → 落盘 `DataRoot/downloads` + toast 出现 + 侧板有记录
- [ ] `/api/export?format=excel`（无扩展名）→ 同上（这是旧逻辑漏掉的核心场景）
- [ ] blob: URL 导出 → 同上
- [ ] PDF / zip 下载 → 不再被转外部浏览器
- [ ] exe 下载 → 走安全兜底
- [ ] 下载失败（断网）→ 失败态 + 可重试
- [ ] 文件名校 `../../evil.exe` → 不出下载目录
- [ ] 同名重复下载 → 两条记录，路径不同
- [ ] 非 Windows 平台 → 平台不支持空态
- [ ] 侧板搜索能搜到下载记录

---

## 9. 风险

| 风险 | 说明 | 应对 |
|---|---|---|
| **钩子边界需实测** | `NavigationStarting` 与 `DownloadStarting` 的边界、未设 `DefaultDownloadDirectory` 时实际落盘目录，两点依赖平台行为，无法从依赖源码确证 | Phase 1 开头先用真实导出页面实测一次再动代码 |
| **wry 注册方式** | `download_completed_handler` 在 `DownloadStarting` 回调**内部**注册 `StateChanged`，对同一 `DownloadOperation` 只注册一次 | 上层不重复调用会重复订阅的接口 |
| **`destination` 安全** | `&mut PathBuf` 可任意写 | 强制清洗，加单测 |
| **macOS 无实现** | wkwebview 后端无下载 handler | UI 做平台不支持空态 |
| **进度条诱惑** | 设计评审容易被要求加进度条 | §2.3 明确为不可实现，不要预留 |
| **先做 UI 返工** | 侧板 UI 依赖数据形状定型 | Phase 顺序不可颠倒 |
