# Git Diff 问题调试指南

## 问题描述

1. **问题 1**：修改文件后，重新点击文件查看 diff，内容没有刷新
2. **问题 2**：删除文件时，diff 显示错误（显示为添加而不是删除）

## 调试步骤

### 1. 启动应用

确保应用已经启动并加载了一个 Git 仓库。

### 2. 测试问题 1：修改文件不刷新

**操作步骤**：

1. 在 Git 面板中，点击一个已修改的文件（如 `src/test.txt`）
2. 观察浏览器控制台输出，应该看到：
   ```
   [DEBUG GitPanel] ==================== 点击文件 ====================
   [DEBUG GitPanel] 文件路径: src/test.txt
   [DEBUG GitPanel] 文件状态: modified
   [DEBUG GitPanel] 类型: unstaged
   [DEBUG GitService] 尝试从工作区读取文件: "...\src\test.txt"
   [DEBUG GitService] 文件存在，大小: XXX 字节
   [DEBUG GitService] 成功读取文件，内容长度: XXX 字节
   [DEBUG GitService] 文件内容前100字符: "..."
   [DEBUG GitPanel] API 返回时间: ...
   [DEBUG GitPanel] newContentLength: XXX
   ```

3. 在编辑器中修改 `src/test.txt` 文件（添加或删除一些内容）
4. **重要**：确保文件已保存到磁盘（检查编辑器是否自动保存）
5. 等待 1-2 秒
6. 再次在 Git 面板中点击同一个文件 `src/test.txt`
7. 观察控制台输出，对比两次的 `newContentLength` 和 `newContentPreview`

**预期结果**：
- 第二次的 `newContentLength` 应该与第一次不同
- 第二次的 `newContentPreview` 应该显示修改后的内容

**实际结果**：
- 如果 `newContentLength` 相同 → **文件没有保存到磁盘**（编辑器问题）
- 如果 `newContentLength` 不同但界面没变化 → **React 渲染问题**
- 如果后端日志显示读取的内容相同 → **文件系统缓存问题**

---

### 3. 测试问题 2：删除文件显示错误

**操作步骤**：

1. 创建一个测试文件 `src/delete-test.txt`，写入一些内容：
   ```
   第一行
   第二行
   第三行
   ```

2. 提交到 Git：
   ```bash
   git add src/delete-test.txt
   git commit -m "添加测试文件"
   ```

3. 在 Git 面板中确认文件已提交

4. 删除文件：
   ```bash
   rm src/delete-test.txt
   # 或者在编辑器中删除
   ```

5. 在 Git 面板中点击 `delete-test.txt` 查看diff

6. 观察控制台输出：
   ```
   [DEBUG GitPanel] 文件状态: deleted
   [DEBUG GitService] 尝试从工作区读取文件: "...\src\delete-test.txt"
   [DEBUG GitService] 文件不存在或无法访问元数据
   [DEBUG GitPanel] oldContentLength: XXX (应该有内容)
   [DEBUG GitPanel] newContentLength: 0 (应该是 undefined)
   [DEBUG DiffViewer] oldContentLength: XXX
   [DEBUG DiffViewer] newContentLength: 0 (空字符串！)
   [DEBUG DiffViewer] 计算后的 diff: { addedCount: XXX, removedCount: 0 }
   ```

**预期结果**：
- 应该显示所有行被**删除**（红色背景）
- `removedCount` 应该等于文件行数
- `addedCount` 应该是 0

**实际结果**：
- ❌ 显示所有行被**添加**（绿色背景）
- ❌ `addedCount` 等于文件行数
- ❌ `removedCount` 是 0

---

## 日志分析

### 后端日志（Rust）

```
[DEBUG GitService] 尝试从工作区读取文件: "...\src\test.txt"
[DEBUG GitService] change_type: Modified
[DEBUG GitService] 文件存在，大小: 1234 字节
[DEBUG GitService] 成功读取文件，内容长度: 1234 字节
[DEBUG GitService] 文件内容前100字符: "这是文件的前100个字符..."
[DEBUG GitService] 文本检查通过，返回内容
```

**关键点**：
- 确认 `change_type` 正确（`Modified`、`Added`、`Deleted`）
- 确认文件大小和内容长度
- 确认读取的内容是最新的

### 前端日志（TypeScript）

```
[DEBUG GitPanel] 获取到的 diff 数据: {
  file_path: "src/test.txt",
  change_type: "modified",
  oldContentLength: 1000,
  newContentLength: 1200,  // ← 应该随着文件修改而变化
  old_content: "原来的内容...",
  new_content: "新的内容...",
}

[DEBUG DiffViewer] 渲染，参数: {
  oldContentType: "string",
  oldContentLength: 1000,
  newContentType: "string",
  newContentLength: 1200,
}

[DEBUG DiffViewer] 计算后的 diff: {
  addedCount: 10,
  removedCount: 5,
  linesCount: 1005,
}
```

**关键点**：
- `change_type` 应该与后端一致
- `old_content` 和 `new_content` 应该是字符串（不是 `undefined`）
- 对于删除的文件，`new_content` 应该是 `undefined`（但会被转换成 `""`）

---

## 问题诊断

### 问题 1：修改文件不刷新

**可能原因**：

1. **编辑器没有自动保存**
   - 检查：修改文件后，在终端执行 `cat src/test.txt` 看内容是否变化
   - 解决：关闭编辑器的自动保存，或手动保存后再查看 diff

2. **React 状态没有更新**
   - 检查：控制台是否输出 `selectedDiff 变化`
   - 检查：`内容对比` 显示 `oldSame: false, newSame: false`
   - 解决：可能需要强制刷新或添加 key

3. **内容相同但对象引用不同**
   - 检查：`内容对比` 显示 `oldSame: true, newSame: true` 但长度不同
   - 解决：这是正常的，React 应该会重新渲染

### 问题 2：删除文件显示错误

**根本原因**：

```
后端返回：{ old_content: "内容", new_content: null }
前端接收：{ old_content: "内容", new_content: undefined }
GitPanel:  oldContent={selectedDiff.old_content || ''}  // "内容"
           newContent={selectedDiff.new_content || ''}  // undefined || '' = ''
DiffViewer: computeDiff("内容", "")  // 计算为"添加"
```

**正确的应该是**：

```
删除文件：computeDiff("旧内容", undefined)  // 应该计算为"删除"
添加文件：computeDiff(undefined, "新内容")  // 应该计算为"添加"
修改文件：computeDiff("旧内容", "新内容")   // 正常计算
```

---

## 修复方案

### 方案 1：传递 change_type 给 DiffViewer

修改 `DiffViewer` 接收 `change_type` 参数：

```typescript
interface DiffViewerProps {
  oldContent?: string
  newContent?: string
  changeType?: DiffChangeType
}

export function DiffViewer({ oldContent, newContent, changeType }: DiffViewerProps) {
  // 根据不同的 change_type 处理 undefined
  let effectiveOldContent = oldContent
  let effectiveNewContent = newContent

  if (changeType === 'deleted' && newContent === undefined) {
    effectiveNewContent = ''  // 删除：新内容为空
  }

  if (changeType === 'added' && oldContent === undefined) {
    effectiveOldContent = ''  // 添加：旧内容为空
  }

  const diff = computeDiff(
    effectiveOldContent ?? '',
    effectiveNewContent ?? ''
  )
  // ...
}
```

### 方案 2：使用特殊标记

在 GitPanel 中传递特殊标记：

```typescript
<DiffViewer
  oldContent={selectedDiff.old_content ?? '__FILE_NOT_EXIST__'}
  newContent={selectedDiff.new_content ?? '__FILE_NOT_EXIST__'}
/>
```

然后在 DiffViewer 中处理这个标记。

---

## 验证清单

- [ ] 修改文件后，后端能读取到最新内容
- [ ] 前端能接收到最新的 diff 数据
- [ ] React 状态正确更新
- [ ] DiffViewer 重新渲染
- [ ] 删除文件时，`old_content` 有值，`new_content` 是 `undefined`
- [ ] 添加文件时，`old_content` 是 `undefined`，`new_content` 有值
- [ ] 修改文件时，两个都有值
