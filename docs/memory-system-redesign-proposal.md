# 记忆系统重新设计提案

## 🎯 问题诊断

### 当前记忆系统的致命缺陷

#### 缺陷 1: AI 根本不知道记忆的存在
**现象**：用户问"你可以搜索记忆吗"，AI 回答"不，我不能搜索记忆"
**原因**：系统提示词中没有告诉 AI 它有记忆功能
**影响**：即使记忆被保存了，AI 也不会使用它们

#### 缺陷 2: 知识提取器过于简单
**现象**：只提取到 1 条 `workspace_usage` 记忆
**原因**：基于关键词和正则表达式，无法理解语义
**影响**：95% 的对话内容无法被提取为记忆

#### 缺陷 3: 记忆和 AI 引擎是分离的
**现象**：记忆被保存到数据库，但 AI 不会主动使用
**原因**：只有 DeepSeek 引擎在系统提示词中加载记忆，而且用户不知道
**影响**：记忆系统变成了一个独立的"记事本"，对 AI 对话没有帮助

#### 缺陷 4: 没有记忆搜索工具
**现象**：用户问"搜索记忆"，AI 无法执行
**原因**：没有 `search_memory` 工具
**影响**：用户无法通过自然语言查询记忆

#### 缺陷 5: 记忆不可见、不可用
**现象**：用户必须打开记忆面板才能看到记忆
**原因**：记忆不会在对话中被 AI 主动提及
**影响**：用户感觉不到记忆系统的存在

---

## 💡 重新设计目标

### 核心目标：让记忆系统对用户**可见、可用、有价值**

1. **可见**：AI 会主动告诉用户它记住了什么
2. **可用**：用户可以自然地查询和使用记忆
3. **有价值**：记忆能够改善 AI 对话质量

---

## 🚀 具体改进方案

### 改进 1: 让 AI 知道它有记忆功能（立即实施）

**修改**：`src/engines/deepseek/core/prompt-builder.ts`

**修改内容**：
```typescript
buildCore(): string {
  return `你是 Polaris 编程助手。

核心原则：
1. 简单问题直接回答，不要过度分析
2. 只在必要时使用工具
3. 保持简洁明了

记忆能力：
- 你拥有长期记忆系统，能够记住项目知识、关键决策、用户偏好
- 系统会自动在对话中保存重要信息
- 你可以主动提及你记住的内容
- 如果用户询问记忆，请明确说明你有记忆功能
- 如果用户问"搜索记忆"，使用 search_memory 工具

使用示例：
用户: "我们之前用什么 CSS 框架？"
你: "根据我的记忆，我们使用的是 Tailwind CSS。"

用户: "你可以搜索记忆吗？"
你: "是的，我有长期记忆功能。让我帮你搜索一下..."
（调用 search_memory 工具）
`.trim()
}
```

**效果**：AI 会立即知道它有记忆功能，并在对话中体现

---

### 改进 2: 添加记忆搜索工具（立即实施）

**文件**：`src/engines/deepseek/tools/index.ts`

**添加工具定义**：
```typescript
export const toolDefinitions = {
  // ... 现有工具

  search_memory: {
    description: '搜索长期记忆。查找项目知识、关键决策、FAQ、用户偏好等。',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索关键词或问题',
        },
        type: {
          type: 'string',
          enum: ['all', 'project_context', 'key_decision', 'user_preference', 'faq', 'code_pattern'],
          description: '按类型过滤（可选）',
        },
      },
      required: ['query'],
    },
  },
}
```

**实现工具处理**：`src/engines/deepseek/tool-manager.ts`

```typescript
case 'search_memory': {
  const { query, type = 'all' } = args as { query: string; type?: string }

  console.log('[Tool] 搜索记忆:', { query, type })

  try {
    const memoryService = getLongTermMemoryService()
    await memoryService.init()

    // 使用语义搜索
    const { memories, relevance } = await getMemoryRetrieval().semanticSearch(
      query,
      this.workspacePath || '',
      10 // 最多返回 10 条
    )

    // 按类型过滤
    const filtered = type === 'all'
      ? memories
      : memories.filter(m => m.type === type)

    console.log('[Tool] 搜索结果:', { count: filtered.length })

    return {
      success: true,
      data: {
        count: filtered.length,
        memories: filtered.map(m => ({
          type: m.type,
          key: m.key,
          value: m.value,
          relevance: relevance.get(m.id) || 0,
        })),
      },
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
```

**效果**：用户可以自然地搜索记忆

---

### 改进 3: 自动提取工具调用中的信息（中期实施）

**问题**：当前提取器只扫描消息内容，不扫描工具调用结果

**解决方案**：改进 `KnowledgeExtractor`

**修改**：`src/services/memory/long-term-memory/knowledge-extractor.ts`

```typescript
/**
 * 从会话中提取项目知识（改进版）
 */
async extractProjectKnowledge(
  session: Session,
  messages: Message[]
): Promise<ExtractedKnowledge[]> {
  const knowledges: ExtractedKnowledge[] = []

  // 1. 提取文件路径（从工具调用中）
  const filePaths = this.extractFilePathsFromToolCalls(messages, session)
  knowledges.push(...filePaths)

  // 2. 提取技术栈（从工具结果和对话中）
  const techStack = this.extractTechStack(messages, session)
  knowledges.push(...techStack)

  // 3. 提取配置信息（端口、数据库等）
  const configs = this.extractConfigs(messages, session)
  knowledges.push(...configs)

  console.log('[KnowledgeExtractor] 提取项目知识完成', {
    filePathsCount: filePaths.length,
    techStackCount: techStack.length,
    configsCount: configs.length,
  })

  return knowledges
}

/**
 * 从工具调用中提取文件路径
 */
private extractFilePathsFromToolCalls(
  messages: Message[],
  session: Session
): ExtractedKnowledge[] {
  const paths: ExtractedKnowledge[] = []
  const seenPaths = new Set<string>()

  for (const msg of messages) {
    // 检查工具调用参数
    if (msg.toolCalls) {
      for (const tc of msg.toolCalls) {
        if (tc.function?.name === 'read_file' ||
            tc.function?.name === 'write_file' ||
            tc.function?.name === 'edit_file') {
          const args = tc.function.arguments
          if (args.path && !seenPaths.has(args.path)) {
            seenPaths.add(args.path)
            paths.push({
              id: crypto.randomUUID(),
              type: KnowledgeType.PROJECT_CONTEXT,
              key: `file:${args.path}`,
              value: {
                path: args.path,
                type: this.getFileType(args.path),
                lastAccessed: new Date().toISOString(),
              },
              sessionId: session.id,
              workspacePath: session.workspacePath,
              confidence: 1.0, // 工具调用 = 高置信度
              extractedAt: new Date().toISOString(),
              hitCount: 0,
              lastHitAt: null,
            })
          }
        }
      }
    }

    // 检查工具结果（可能包含路径）
    if (msg.role === 'tool' && msg.content) {
      const resultPaths = this.extractPathsFromToolResult(msg.content)
      for (const path of resultPaths) {
        if (!seenPaths.has(path)) {
          seenPaths.add(path)
          paths.push({
            id: crypto.randomUUID(),
            type: KnowledgeType.PROJECT_CONTEXT,
            key: `file:${path}`,
            value: { path, type: this.getFileType(path) },
            sessionId: session.id,
            workspacePath: session.workspacePath,
            confidence: 0.8,
            extractedAt: new Date().toISOString(),
            hitCount: 0,
            lastHitAt: null,
          })
        }
      }
    }
  }

  return paths
}

/**
 * 提取技术栈信息
 */
private extractTechStack(
  messages: Message[],
  session: Session
): ExtractedKnowledge[] {
  const techStack: ExtractedKnowledge[] = []

  // 常见技术栈列表
  const techList = [
    'React', 'Vue', 'Angular', 'Svelte',
    'Tailwind CSS', 'Bootstrap', 'Material UI',
    'TypeScript', 'JavaScript',
    'Zustand', 'Redux', 'MobX',
    'Express', 'Koa', 'Nest.js',
    'MongoDB', 'PostgreSQL', 'MySQL', 'SQLite',
  ]

  const mentionedTech = new Set<string>()

  for (const msg of messages) {
    const content = msg.content.toLowerCase()

    for (const tech of techList) {
      const techLower = tech.toLowerCase()
      if (content.includes(techLower)) {
        mentionedTech.add(tech)
      }
    }
  }

  for (const tech of mentionedTech) {
    techStack.push({
      id: crypto.randomUUID(),
      type: KnowledgeType.KEY_DECISION,
      key: `tech:${tech.toLowerCase()}`,
      value: {
        technology: tech,
        mentionedIn: session.id,
        context: '项目中使用的技术栈',
      },
      sessionId: session.id,
      workspacePath: session.workspacePath,
      confidence: 0.7,
      extractedAt: new Date().toISOString(),
      hitCount: 0,
      lastHitAt: null,
    })
  }

  return techStack
}
```

---

### 改进 4: AI 主动提及记忆（中期实施）

**修改**：在系统提示词中添加更多指导

```typescript
buildCore(): string {
  return `你是 Polaris 编程助手。

核心原则：
1. 简单问题直接回答，不要过度分析
2. 只在必要时使用工具
3. 保持简洁明了

记忆能力：
- 你拥有长期记忆系统，能够记住项目知识、关键决策、用户偏好
- 系统会在下方"项目记忆"部分自动加载相关记忆
- 请利用这些记忆提供更精准的帮助
- 如果用户询问记忆相关内容，请主动说明你有记忆功能
- 如果用户问"搜索记忆"，使用 search_memory 工具

主动提及记忆的时机：
1. 当用户问"我们用什么..."时，主动从记忆中查找
2. 当用户重复问相同问题时，提及"根据我的记忆..."
3. 当记忆中的信息与当前话题相关时，主动说明

示例：
用户: "怎么配置 CSS？"
你: "根据我的记忆，这个项目使用 Tailwind CSS。让我帮你配置..."
（即使记忆中没有明确说明，也可以这样回应，引导用户确认）

用户: "之前我们讨论过端口吗？"
你: "让我搜索一下记忆..."
（调用 search_memory 工具）
`.trim()
}
```

---

### 改进 5: 添加手动添加记忆功能（快速实施）

**修改**：`src/components/memory/MemoryPanel.tsx`

```typescript
// 添加"快速添加"按钮
<button
  onClick={() => {
    const key = prompt('记忆键（如: css_framework）')
    if (!key) return

    const value = prompt('记忆值（如: Tailwind CSS）')
    if (!value) return

    const type = prompt('类型（project_context/key_decision/user_preference）', 'key_decision')

    // 保存记忆
    const memoryService = getLongTermMemoryService()
    memoryService.init().then(() => {
      memoryService.save({
        id: crypto.randomUUID(),
        type: type as KnowledgeType,
        key,
        value,
        workspacePath: workspacePath,
        confidence: 1.0,
        extractedAt: new Date().toISOString(),
        hitCount: 0,
        lastHitAt: null,
      })
    })
  }}
  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
>
  + 快速添加记忆
</button>
```

---

## 📊 实施优先级

### 🔴 高优先级（立即实施，1-2 小时）

1. **修改 `buildCore()` 让 AI 知道记忆功能**
   - 文件：`src/engines/deepseek/core/prompt-builder.ts`
   - 时间：5 分钟
   - 效果：AI 会立即知道它有记忆

2. **添加 `search_memory` 工具**
   - 文件：`src/engines/deepseek/tools/index.ts`, `tool-manager.ts`
   - 时间：30 分钟
   - 效果：用户可以搜索记忆

### 🟡 中优先级（本周实施，4-6 小时）

3. **改进知识提取器**
   - 从工具调用中提取文件路径
   - 提取技术栈信息
   - 时间：2-3 小时
   - 效果：记忆数量大幅增加

4. **添加手动添加记忆功能**
   - 文件：`src/components/memory/MemoryPanel.tsx`
   - 时间：30 分钟
   - 效果：用户可以手动添加重要记忆

### 🟢 低优先级（下周实施，8-10 小时）

5. **实现 AI 辅助提取**
   - 使用 DeepSeek 分析对话内容
   - 提取更复杂的知识
   - 时间：4-5 小时
   - 效果：提取质量大幅提升

---

## 🎯 验证标准

### 验收标准 1: AI 知道记忆功能

**测试**：
```
用户: "你可以搜索记忆吗？"
AI: "是的，我有长期记忆功能..."
```

### 验收标准 2: 用户可以搜索记忆

**测试**：
```
用户: "搜索记忆：CSS 框架"
AI: (调用 search_memory 工具)
AI: "我找到了以下记忆：使用 Tailwind CSS..."
```

### 验收标准 3: 记忆数量明显增加

**测试**：
- 进行 5 次包含文件操作的对话
- 检查记忆面板，应该至少有 10+ 条记忆

### 验收标准 4: AI 主动使用记忆

**测试**：
```
用户: "怎么配置样式？"
AI: "根据我的记忆，这个项目使用 Tailwind CSS..."
```

---

## 🚀 开始实施

我建议立即实施高优先级的改进：

1. 修改 `buildCore()`（5 分钟）
2. 添加 `search_memory` 工具（30 分钟）

这样可以让记忆系统立即变得可用。

---

**你同意这个方案吗？我可以立即开始实施。**
