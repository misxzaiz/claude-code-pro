# Git 面板日志测试指南

## 已添加的日志记录

### 1. 前端日志（浏览器控制台）

#### `src/stores/gitStore.ts`
- `[GitStore] refreshStatus 开始` - 记录刷新状态开始
- `[GitStore] 调用 git_get_status` - 记录调用 Tauri 命令
- `[GitStore] git_get_status 成功` - 记录成功获取状态
- `[GitStore] git_get_status 失败` - 记录失败及错误详情

#### `src/components/GitPanel/index.tsx`
- `[GitPanel] useEffect 触发` - 记录组件渲染和依赖变化
- `[GitPanel] 调用 refreshStatus` - 记录调用刷新状态
- `[GitPanel] currentWorkspace 为空` - 记录工作区为空的情况
- `[GitPanel] 渲染"不是 Git 仓库"状态` - 记录显示错误状态

#### `src/App.tsx`
- `[App] 工作区状态更新` - 记录工作区状态变化

### 2. 后端日志（终端/控制台）

#### `src-tauri/src/commands/git.rs`
- `[Tauri Command] git_get_status 被调用` - 记录命令被调用
- `[Tauri Command] git_get_status 成功` - 记录命令执行成功
- `[Tauri Command] git_get_status 失败` - 记录命令执行失败

#### `src-tauri/src/services/git.rs`
- `[GitService] get_status 开始，路径: xxx` - 记录服务调用开始
- `[GitService] 仓库打开成功` - 记录仓库打开成功
- `[GitService] 仓库打开失败` - 记录仓库打开失败
- `[GitService] 仓库是否为空: true/false` - 记录仓库是否为空

## 如何查看日志

### 前端日志（浏览器）
1. 打开浏览器开发者工具（F12）
2. 切换到 Console 标签
3. 刷新页面或切换工作区
4. 查看以 `[GitStore]`、`[GitPanel]`、`[App]` 开头的日志

### 后端日志（终端）
1. 在运行 `npm run tauri dev` 的终端中查看
2. 查找以 `[Tauri Command]`、`[GitService]` 开头的日志

## 预期日志流程

### 正常情况（Git 仓库）

**前端日志：**
```
[App] 工作区状态更新 { workspacesCount: 1, currentWorkspaceId: "xxx", currentWorkspace: {...} }
[GitPanel] useEffect 触发 { currentWorkspace: {...}, status: null, isLoading: false, error: null }
[GitPanel] 调用 refreshStatus { path: "D:\Polaris" }
[GitStore] refreshStatus 开始 { workspacePath: "D:\Polaris" }
[GitStore] 调用 git_get_status { workspacePath: "D:\Polaris" }
[GitStore] git_get_status 成功 { status: {...} }
```

**后端日志：**
```
[Tauri Command] git_get_status 被调用，路径: D:\Polaris
[GitService] get_status 开始，路径: "D:\Polaris"
[GitService] 仓库打开成功
[GitService] 仓库是否为空: false
[Tauri Command] git_get_status 成功
```

### 异常情况（不是 Git 仓库）

**前端日志：**
```
[App] 工作区状态更新 { workspacesCount: 1, currentWorkspaceId: "xxx", currentWorkspace: {...} }
[GitPanel] useEffect 触发 { currentWorkspace: {...}, status: null, isLoading: false, error: null }
[GitPanel] 调用 refreshStatus { path: "D:\NonGitPath" }
[GitStore] refreshStatus 开始 { workspacePath: "D:\NonGitPath" }
[GitStore] 调用 git_get_status { workspacePath: "D:\NonGitPath" }
[GitStore] git_get_status 失败 { workspacePath: "D:\NonGitPath", error: "...", errorType: "..." }
[GitPanel] 渲染"不是 Git 仓库"状态 { currentWorkspace: {...}, isLoading: false, error: "..." }
```

**后端日志：**
```
[Tauri Command] git_get_status 被调用，路径: D:\NonGitPath
[GitService] get_status 开始，路径: "D:\NonGitPath"
[GitService] 仓库打开失败: ...
[Tauri Command] git_get_status 失败: ...
```

## 诊断步骤

1. **启动应用**：运行 `npm run tauri dev`
2. **打开浏览器控制台**：按 F12 打开开发者工具
3. **观察日志**：
   - 检查 `[App] 工作区状态更新` 日志，确认工作区是否正确加载
   - 检查 `[GitPanel] useEffect 触发` 日志，确认组件是否正确渲染
   - 检查 `[GitPanel] 调用 refreshStatus` 日志，确认是否调用了刷新状态
   - 检查 `[GitStore]` 日志，确认 Tauri 命令是否被调用
   - 检查后端终端日志，确认 Rust 服务是否正确执行

4. **根据日志定位问题**：
   - 如果没有 `[GitPanel]` 日志 → 组件未渲染
   - 如果没有 `[GitPanel] 调用 refreshStatus` → useEffect 未触发
   - 如果有 `[GitStore] git_get_status 失败` → Tauri 命令失败
   - 如果后端显示 `[GitService] 仓库打开失败` → 路径不是 Git 仓库