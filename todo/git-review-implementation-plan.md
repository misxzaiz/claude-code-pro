# Git 变更准确性与 AI 审阅功能实现规划

> 创建时间：2025-01-26
> 状态：规划中

---

## 一、需求 1：变更差异准确性

### 1.1 核心问题分析

#### 问题 1：AI 工具完成后 Git 状态不刷新

**现状**：
- `eventChatStore.ts` 处理 `tool_call_end` 时，只更新工具状态
- 文件已修改，但 `gitStore.status` 没有更新
- 用户需要手动刷新 GitPanel 才能看到变更

**影响**：
- GitPanel 显示过时的状态
- Diff viewer 可能显示错误的内容
- 用户可能基于错误信息做决策

---

#### 问题 2：Diff viewer 显示与文件状态不匹配

**现状**：
- `GitPanel/index.tsx` 的 `useEffect` 只依赖 `currentWorkspace?.path`
- 当用户暂存文件后，diff viewer 仍显示 worktree diff
- 需要重新点击文件才能看到正确的 diff

**影响**：
- 用户看到的 diff 内容与实际不符
- 暂存/取消暂存后，diff 内容不变

---

#### 问题 3：提交后选中状态未清理

**现状**：
- `gitStore.commitChanges` 成功后，`selectedDiff` 没有清空
- `GitPanel` 的 `selectedDiff` 是本地 state
- 提交后 diff viewer 仍然显示已不存在的变更

**影响**：
- 显示已提交的变更内容
- 用户可能误以为还有未提交的变更

---

### 1.2 实现方案

#### 方案 1.1：AI 工具完成后自动刷新 Git 状态

**修改文件**：`src/stores/eventChatStore.ts`

**核心改动**：
```typescript
// 新增辅助函数：判断工具是否会影响 Git 状态
function isFileModificationTool(toolName: string): boolean {
  const modificationTools = [
    'edit', 'str_replace_editor', 'write', 'write_file',
    'create_file', 'delete_file', 'read', 'read_file'
  ]
  const normalized = toolName.toLowerCase()
  return modificationTools.some(t => normalized.includes(t))
}

// 在 updateToolCallBlock 中添加
updateToolCallBlock: (toolId, status, output, error) => {
  // ... 现有逻辑 ...

  // ✅ 新增：工具完成后，刷新 Git 状态
  if (status === 'completed' || status === 'failed') {
    const block = currentMessage.blocks.find(b =>
      b.type === 'tool_call' && b.id === toolId
    ) as ToolCallBlock

    if (block && isFileModificationTool(block.name)) {
      const workspacePath = useWorkspaceStore.getState().getCurrentWorkspace()?.path
      if (workspacePath) {
        // 异步刷新，不阻塞工具状态更新
        useGitStore.getState().refreshStatus(workspacePath).catch(err => {
          console.warn('[EventChatStore] Git 刷新失败:', err)
        })
      }
    }
  }
}
```

**潜在问题**：
1. **性能问题**：频繁刷新 → 防抖机制（300ms）
2. **竞争条件**：多个工具同时完成 → 刷新锁
3. **误判工具**：read_file 不会修改 → 精确判断工具类型

---

#### 方案 1.2：修复 Diff viewer 状态同步

**修改文件**：`src/components/GitPanel/index.tsx`

**核心改动**：
```typescript
// ✅ 新增：监听 status 变化，自动更新 diff
useEffect(() => {
  if (!selectedDiff || !status) return

  const filePath = selectedDiff.filePath

  // 检查文件状态是否改变
  const isStaged = status.staged.some(f => f.path === filePath)
  const isUnstaged = status.unstaged.some(f => f.path === filePath)
  const isUntracked = status.untracked.includes(filePath)

  // 文件不再存在（已提交），关闭 diff
  if (!isStaged && !isUnstaged && !isUntracked) {
    setSelectedDiff(null)
    return
  }

  // 文件状态改变，重新加载 diff
  const loadDiff = async () => {
    setIsDiffLoading(true)
    try {
      const diff = isStaged
        ? await getIndexFileDiff(currentWorkspace.path, filePath)
        : await getWorktreeFileDiff(currentWorkspace.path, filePath)
      setSelectedDiff(diff)
    } finally {
      setIsDiffLoading(false)
    }
  }

  loadDiff()
}, [status]) // ✅ 依赖 status
```

**潜在问题**：
1. **无限循环** → 检查 diff 内容是否真的改变
2. **性能问题** → 只在文件状态改变时才重新加载
3. **状态不一致** → 显示加载状态

---

#### 方案 1.3：提交后清理选中状态

**修改文件**：`src/stores/gitStore.ts`

**核心改动**：
```typescript
async commitChanges(workspacePath: string, message: string, stageAll = true) {
  set({ isLoading: true, error: null })

  try {
    const commit = await invoke<string>('git_commit_changes', {
      workspacePath,
      message,
      stageAll,
    })

    await get().refreshStatus(workspacePath)

    // ✅ 新增：清空选中的 diff
    set({
      selectedDiff: null,
      selectedFilePath: null,
      isLoading: false
    })

    return commit
  } catch (err) {
    // ...
  }
}
```

**潜在问题**：
1. **用户体验** → 提示"已提交"，提供"重新打开"按钮
2. **状态清理不完整** → 同时清空所有选中状态

---

### 1.3 防抖优化方案

**新增文件**：`src/utils/gitRefreshDebounce.ts`

```typescript
/**
 * Git 刷新防抖工具
 */

let refreshTimer: NodeJS.Timeout | null = null
let isRefreshing = false
let pendingRefresh = false

export function debouncedGitRefresh(
  refreshFn: () => Promise<void>,
  delay = 300
): void {
  if (isRefreshing) {
    pendingRefresh = true
    return
  }

  if (refreshTimer) {
    clearTimeout(refreshTimer)
  }

  refreshTimer = setTimeout(async () => {
    isRefreshing = true

    try {
      await refreshFn()

      if (pendingRefresh) {
        pendingRefresh = false
        await refreshFn()
      }
    } finally {
      isRefreshing = false
      refreshTimer = null
    }
  }, delay)
}
```

**集成到 `eventChatStore.ts`**：
```typescript
import { debouncedGitRefresh } from '@/utils/gitRefreshDebounce'

if (block && isFileModificationTool(block.name)) {
  const workspacePath = useWorkspaceStore.getState().getCurrentWorkspace()?.path
  if (workspacePath) {
    debouncedGitRefresh(() =>
      useGitStore.getState().refreshStatus(workspacePath)
    )
  }
}
```

---

## 二、需求 2：AI 修改内容审阅

### 2.1 核心问题分析

#### 问题 1：Edit 工具变更不可见

**现状**：
- `ToolCallBlockRenderer` 只显示工具摘要
- 用户看不到具体改了什么
- 无法细粒度控制变更

**影响**：
- 用户无法确认 AI 是否正确修改
- 无法接受/拒绝部分变更

---

#### 问题 2：无法回滚 AI 的修改

**现状**：
- Edit 工具直接修改文件
- 没有保存修改前的内容
- 无法撤销修改

**影响**：
- 用户需要手动恢复文件
- 多文件修改时回滚困难

---

#### 问题 3：审阅与 Git 状态脱节

**现状**：
- 审阅界面与 Git 状态没有集成
- 接受/拒绝变更后，Git 状态不更新
- 没有实现"部分暂存"机制

**影响**：
- 审阅后的变更无法正确反映到 Git
- 用户可能重复提交相同的内容

---

### 2.2 实现方案

#### 方案 2.1：扩展 ToolCallBlock 类型

**修改文件**：`src/types/chat.ts`

**核心改动**：
```typescript
/** 工具调用内容块 */
export interface ToolCallBlock {
  type: 'tool_call';
  id: string;
  name: string;
  input: Record<string, unknown>;
  status: ToolStatus;
  output?: string;
  error?: string;
  startedAt: string;
  completedAt?: string;
  duration?: number;

  // ✅ 新增：Edit 工具的 diff 信息
  diff?: {
    /** 修改前的文件内容 */
    oldContent?: string;
    /** 修改后的文件内容 */
    newContent?: string;
    /** 文件路径 */
    filePath?: string;
    /** 变更摘要 */
    summary?: string;
  };
}
```

**潜在问题**：
1. **内存占用** → 限制文件大小（>1MB 不存储）
2. **性能影响** → 异步加载，不阻塞工具执行

---

#### 方案 2.2：在工具开始时保存原始内容

**修改文件**：`src/stores/eventChatStore.ts`

**核心改动**：
```typescript
appendToolCallBlock: async (toolId, toolName, input) => {
  // ... 现有逻辑 ...

  // ✅ 新增：对于 Edit 工具，保存原始内容
  const filePath = extractFilePath(input)
  if (filePath && isEditTool(toolName)) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const oldContent = await invoke<string>('read_file_content', { path: filePath })

      toolBlock.diff = {
        filePath,
        oldContent,
        summary: undefined,
      }
    } catch (err) {
      console.warn('[EventChatStore] 读取原始文件失败:', err)
    }
  }
}

updateToolCallBlock: (toolId, status, output, error) => {
  // ... 现有逻辑 ...

  // ✅ 新增：工具完成后，读取修改后的内容
  if (status === 'completed' && block.diff?.filePath) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const newContent = await invoke<string>('read_file_content', {
        path: block.diff.filePath
      })

      const updatedBlock = {
        ...block,
        diff: {
          ...block.diff,
          newContent,
          summary: computeDiffSummary(block.diff.oldContent, newContent),
        }
      }

      // 更新 blocks
      set((state) => ({
        currentMessage: state.currentMessage
          ? { ...state.currentMessage, blocks: updatedBlocks }
          : null,
      }))
    } catch (err) {
      console.warn('[EventChatStore] 读取修改后文件失败:', err)
    }
  }
}
```

**潜在问题**：
1. **工具类型判断** → 检查工具名称和输入参数
2. **文件不存在** → 区分 edit 和 create_file
3. **性能问题** → 限制文件大小（1MB）

---

#### 方案 2.3：创建 EditDiffViewer 组件

**新增文件**：`src/components/Chat/EditDiffViewer.tsx`

```typescript
/**
 * Edit 工具变更审阅组件
 */

import { useMemo } from 'react'
import { Check, XCircle } from 'lucide-react'
import { computeDiff } from '@/services/diffService'
import { Button } from '@/components/Common/Button'
import { invoke } from '@tauri-apps/api/core'

interface EditDiffViewerProps {
  oldContent: string
  newContent: string
  filePath: string
  onAccept: () => void
  onReject: () => void
}

export function EditDiffViewer({
  oldContent,
  newContent,
  filePath,
  onAccept,
  onReject
}: EditDiffViewerProps) {
  const diff = useMemo(() =>
    computeDiff(oldContent, newContent),
    [oldContent, newContent]
  )

  const handleReject = async () => {
    try {
      await invoke('write_file', {
        path: filePath,
        content: oldContent,
      })
      onReject()
    } catch (err) {
      console.error('[EditDiffViewer] 回滚失败:', err)
    }
  }

  return (
    <div className="edit-diff-viewer rounded-lg border border-border">
      {/* 头部 */}
      <div className="px-4 py-2 bg-background-surface border-b border-border flex justify-between">
        <span className="text-sm font-medium">变更审阅</span>
        <span className="text-xs text-text-tertiary">
          {diff.addedCount} 行添加, {diff.removedCount} 行删除
        </span>
      </div>

      {/* Diff 内容 */}
      <div className="max-h-96 overflow-y-auto">
        {diff.lines.map((line, index) => (
          <div key={index} className="flex text-sm font-mono">
            {/* 行号和内容 */}
          </div>
        ))}
      </div>

      {/* 操作按钮 */}
      <div className="px-4 py-2 bg-background-surface border-t border-border flex justify-end gap-2">
        <Button onClick={handleReject} variant="secondary" size="sm">
          <XCircle className="w-4 h-4" />
          拒绝并回滚
        </Button>
        <Button onClick={onAccept} variant="primary" size="sm">
          <Check className="w-4 h-4" />
          接受变更
        </Button>
      </div>
    </div>
  )
}
```

**集成到 `ToolCallBlockRenderer`**：
```typescript
// 在 src/components/Chat/EnhancedChatMessages.tsx 中

const isEditWithDiff = block.name.toLowerCase().includes('edit') && block.diff

{isExpanded && isEditWithDiff && block.diff && (
  <div className="mt-3">
    <EditDiffViewer
      oldContent={block.diff.oldContent || ''}
      newContent={block.diff.newContent || ''}
      filePath={block.diff.filePath || ''}
      onAccept={() => {
        markAsReviewed(block.id)
        const workspacePath = useWorkspaceStore.getState().getCurrentWorkspace()?.path
        if (workspacePath) {
          useGitStore.getState().refreshStatus(workspacePath)
        }
      }}
      onReject={() => {
        const workspacePath = useWorkspaceStore.getState().getCurrentWorkspace()?.path
        if (workspacePath) {
          useGitStore.getState().refreshStatus(workspacePath)
        }
      }}
    />
  </div>
)}
```

---

#### 方案 2.4：审阅状态管理

**新增文件**：`src/stores/reviewStore.ts`

```typescript
/**
 * 变更审阅状态管理
 */

import { create } from 'zustand'

interface ReviewState {
  reviewedToolIds: Set<string>
  markAsReviewed: (toolId: string) => void
  isReviewed: (toolId: string) => boolean
  clearReviews: () => void
}

export const useReviewStore = create<ReviewState>((set, get) => ({
  reviewedToolIds: new Set(),

  markAsReviewed: (toolId: string) => {
    set((state) => ({
      reviewedToolIds: new Set(state.reviewedToolIds).add(toolId),
    }))
  },

  isReviewed: (toolId: string) => {
    return get().reviewedToolIds.has(toolId)
  },

  clearReviews: () => {
    set({ reviewedToolIds: new Set() })
  },
}))
```

---

## 三、实现优先级和风险评估

### 3.1 优先级排序

| 需求 | 子需求 | 优先级 | 复杂度 | 风险 |
|------|--------|--------|--------|------|
| **需求1** | 防抖的 Git 状态自动刷新 | 🔥 高 | 中 | 低 |
| **需求1** | 提交后清理选中状态 | 🔥 高 | 低 | 低 |
| **需求1** | Diff viewer 状态同步 | 中 | 中 | 中 |
| **需求2** | 扩展 ToolCallBlock 类型 | 中 | 低 | 低 |
| **需求2** | 保存原始文件内容 | 中 | 中 | 中 |
| **需求2** | 创建 EditDiffViewer | 低 | 高 | 高 |
| **需求2** | 审阅状态管理 | 低 | 低 | 低 |

### 3.2 风险分析

#### 风险 1：性能问题
- **描述**：频繁的 Git 刷新和文件读取
- **缓解措施**：防抖机制、文件大小限制、异步操作

#### 风险 2：内存占用
- **描述**：存储完整的文件内容
- **缓解措施**：文件大小限制、及时清理、虚拟滚动

#### 风险 3：数据一致性
- **描述**：Git 状态、diff 内容、实际文件可能不一致
- **缓解措施**：统一刷新时机、加载状态、错误处理

#### 风险 4：用户体验
- **描述**：频繁刷新可能打扰用户
- **缓解措施**：后台刷新、非侵入式提示、可配置开关

---

## 四、测试策略

### 4.1 单元测试
1. 防抖函数测试
2. 工具类型判断测试
3. diff 计算测试

### 4.2 集成测试
1. AI 工具完成后 Git 状态刷新
2. Diff viewer 状态同步
3. 审阅回滚测试

### 4.3 用户验收测试
1. AI 修改文件后，用户在 GitPanel 看到变更
2. 用户暂存文件后，diff viewer 显示正确的 diff
3. 用户查看 AI 的修改，不满意，拒绝并回滚

---

## 五、实施路径

### 第一阶段（核心功能）
- [ ] 实现防抖的 Git 状态自动刷新
- [ ] 提交后清理选中状态
- [ ] 扩展 ToolCallBlock 类型，支持 diff 信息

### 第二阶段（审阅功能）
- [ ] 保存原始文件内容
- [ ] 创建 EditDiffViewer 组件
- [ ] 集成到 ToolCallBlockRenderer

### 第三阶段（优化）
- [ ] Diff viewer 状态同步优化
- [ ] 性能优化（文件大小限制、虚拟滚动）
- [ ] 用户体验优化（加载状态、错误提示）

---

## 六、文件清单

### 需要修改的文件
1. `src/stores/eventChatStore.ts` - AI 工具完成后刷新 Git 状态
2. `src/stores/gitStore.ts` - 提交后清理选中状态
3. `src/components/GitPanel/index.tsx` - Diff viewer 状态同步
4. `src/types/chat.ts` - 扩展 ToolCallBlock 类型
5. `src/components/Chat/EnhancedChatMessages.tsx` - 集成审阅组件

### 需要新增的文件
1. `src/utils/gitRefreshDebounce.ts` - 防抖工具
2. `src/components/Chat/EditDiffViewer.tsx` - 审阅组件
3. `src/stores/reviewStore.ts` - 审阅状态管理

---

## 七、潜在问题和解决方案

| 问题 | 解决方案 |
|------|----------|
| 频繁刷新影响性能 | 防抖机制 + 后台刷新 |
| 大文件占用内存 | 文件大小限制 + 及时清理 |
| Git 状态不一致 | 统一刷新时机 + 加载状态 |
| 用户误操作 | 撤销功能 + 确认对话框 |
