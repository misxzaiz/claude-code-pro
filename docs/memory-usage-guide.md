# 记忆系统使用指南

## 📚 目录

1. [记忆系统是什么？](#记忆系统是什么)
2. [记忆系统如何工作](#记忆系统如何工作)
3. [实际使用示例](#实际使用示例)
4. [AI 引擎集成状态](#ai-引擎集成状态)
5. [如何验证记忆系统](#如何验证记忆系统)

---

## 记忆系统是什么？

记忆系统是 Polaris 项目的 **Phase 3 核心功能**，它让 AI 能够"记住"你在不同对话中提到的重要信息，包括：

- **项目知识**：文件路径、项目结构、代码规范
- **关键决策**：技术选型、架构决策、重要约定
- **用户偏好**：你喜欢的 AI 引擎、工作时间、常用工作区
- **FAQ**：你问过的问题和得到的答案
- **代码模式**：你的编码习惯、常用代码片段

**简单来说**：你告诉过 AI 一次，它就会记住，下次对话时自动应用这些知识！

---

## 记忆系统如何工作

### 自动化流程

```
┌─────────────────────────────────────────────────────────────┐
│  1. 你和 AI 对话                                             │
└────────────────┬────────────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────────────────────────┐
│  2. 会话结束（AI 回复完成）                                   │
│     eventChatStore 检测到 'done' 事件                         │
└────────────────┬────────────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────────────────────────┐
│  3. 自动触发记忆提取                                          │
│     extractAndSaveLongTermMemory() 被调用                    │
└────────────────┬────────────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────────────────────────┐
│  4. KnowledgeExtractor 分析对话内容                           │
│     - 提取项目知识（文件路径、决策）                           │
│     - 提取用户偏好（引擎、时间、工作区）                       │
│     - 提取 FAQ（问答对）                                      │
└────────────────┬────────────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────────────────────────┐
│  5. 保存到 SQLite 数据库                                     │
│     - long_term_memories 表                                  │
│     - 自动去重（基于 key 字段）                               │
│     - 记录命中次数（hit_count）                               │
└────────────────┬────────────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────────────────────────┐
│  6. 下次对话时自动加载                                        │
│     PromptBuilder 从数据库读取高频记忆                         │
│     注入到系统提示词中                                        │
└─────────────────────────────────────────────────────────────┘
```

### 数据库结构

```sql
CREATE TABLE long_term_memories (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,           -- 知识类型
  key TEXT NOT NULL,             -- 唯一标识（用于去重）
  value TEXT,                    -- 知识内容（JSON）
  session_id TEXT,               -- 关联会话（全局知识为 NULL）
  workspace_path TEXT,           -- 工作区路径
  confidence REAL,               -- 置信度（0-1）
  created_at TEXT,               -- 创建时间
  updated_at TEXT,               -- 更新时间
  hit_count INTEGER,             -- 命中次数
  last_hit_at TEXT,              -- 最后命中时间
  is_deleted INTEGER,            -- 是否删除
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
);
```

---

## 实际使用示例

### 示例 1: "设置角色"场景

你问: **"帮我设置一个角色扮演的场景"**

AI 回复: （生成了角色扮演相关的代码）

**✨ 记忆系统后台做了什么？**

1. **会话结束后**，自动分析对话内容
2. **提取知识**:
   ```json
   {
     "type": "key_decision",
     "key": "role_play_scenario",
     "value": {
       "decision": "角色扮演场景",
       "reason": "用户需要角色扮演功能",
       "context": "..."
     }
   }
   ```
3. **保存到数据库**（如果之前没有）
4. **下次对话时**，当你再次提到"角色"或"场景"时，AI 会自动加载这条记忆

### 示例 2: 项目文件路径记忆

你: **"帮我修改 src/components/Button.tsx"**

AI: （修改了文件）

**✨ 记忆系统提取了什么？**

```json
{
  "type": "project_context",
  "key": "file:src/components/Button.tsx",
  "value": {
    "path": "src/components/Button.tsx",
    "description": "按钮组件",
    "last_modified": "2026-02-03"
  }
}
```

**下次你直接说**：**"修改 Button 组件的样式"**

AI 会从记忆中知道：Button = `src/components/Button.tsx`

### 示例 3: 用户偏好记忆

你使用 **DeepSeek** 引擎进行了多次对话

**✨ 记忆系统自动记住**：

```json
{
  "type": "user_preference",
  "key": "preferred_engine",
  "value": "deepseek"
}
```

下次创建新会话时，AI 会自动推荐 DeepSeek 引擎！

### 示例 4: 技术决策记忆

你: **"我们使用 Tailwind CSS 还是 styled-components？"**

AI: **"建议使用 Tailwind CSS，因为..."**

你: **"好的，就用 Tailwind"**

**✨ 记忆系统提取**：

```json
{
  "type": "key_decision",
  "key": "css_framework_choice",
  "value": {
    "decision": "使用 Tailwind CSS",
    "reason": "项目约定",
    "alternatives": ["styled-components"]
  }
}
```

**未来对话中**，当你提到"样式"、"CSS"、"组件库"时，AI 会自动提醒你选择了 Tailwind CSS！

---

## AI 引擎集成状态

### ✅ DeepSeek 引擎（已完全集成）

**集成位置**: `src/engines/deepseek/core/prompt-builder.ts`

**工作原理**:

```typescript
// 在构建系统提示词时，自动加载高频记忆
async build(intent: Intent, userMessage: string): Promise<string> {
  const parts: string[] = []

  // Layer 1: 核心提示词
  parts.push(this.buildCore())

  // Layer 2: 项目规则
  parts.push(await this.buildRules())

  // ✅ Layer 3: 项目记忆（自动注入）
  const memories = await this.loadHighFrequencyMemories()
  if (memories.length > 0) {
    const memoryText = this.formatMemories(memories)
    parts.push('\n\n## 项目记忆\n\n', memoryText)
  }

  // Layer 4: 技能提示词
  parts.push(await this.buildSkills(intent, userMessage))

  return parts.join('')
}
```

**实际效果**:

当你向 DeepSeek 提问时，系统提示词会自动包含：

```
你是 Polaris 编程助手。

核心原则：
1. 简单问题直接回答，不要过度分析
2. 只在必要时使用工具
3. 保持简洁明了

## 项目规则

## 项目记忆

### 项目结构
- src/components/Button.tsx: 按钮组件
- src/hooks/useTheme.ts: 主题切换 Hook

### 关键决策
- CSS框架选择: 使用 Tailwind CSS
- 状态管理: 使用 Zustand

## 特定指导
（根据意图加载相关技能）
```

### ❌ Claude Code 引擎（未集成）

**原因**: Claude Code 通过 Tauri 后端调用，目前只支持工作区上下文

**需要的改进**:

```typescript
// src/engines/claude-code/session.ts
private async buildPrompt(task: AITask): Promise<string> {
  let prompt = task.input.prompt

  // TODO: 添加记忆集成
  const memoryService = getLongTermMemoryService()
  const { memories } = await getMemoryRetrieval().semanticSearch(
    prompt,
    this.config.workspaceDir,
    5
  )

  if (memories.length > 0) {
    const memoryText = this.formatMemories(memories)
    prompt = `## 相关记忆\n\n${memoryText}\n\n${prompt}`
  }

  return prompt
}
```

### ❌ IFlow 引擎（未集成）

需要类似的集成代码。

---

## 如何验证记忆系统

### 1️⃣ 查看控制台日志

发送一条消息后，查看浏览器控制台（F12）：

**预期日志**：
```
✅ [LongTermMemoryService] 开始提取长期记忆...
✅ [KnowledgeExtractor] 提取用户偏好完成 {engineCount: 1, timeCount: 2, workspaceCount: 1}
✅ [LongTermMemoryService] 提取完成 {total: 4}
✅ [LongTermMemoryService] 批量保存知识...
✅ [LongTermMemoryService] 保存知识完成: {created: 4, updated: 0, failed: 0}
✅ [EventChatStore] 知识保存完成
```

**成功标志**: `failed: 0`

### 2️⃣ 查看记忆面板

1. 点击左侧 ActivityBar 的 **大脑图标** 🧠
2. 切换到 **"统计"** 标签
3. 应该看到统计信息：
   ```
   总计: 4 条记忆
   📁 项目: 0
   💭 决策: 0
   ⚙️ 偏好: 3
   ❓ FAQ: 0
   💻 代码: 0
   ```

### 3️⃣ 浏览记忆

1. 在记忆面板中，切换到 **"浏览"** 标签
2. 可以看到所有保存的记忆
3. 支持按类型过滤、排序、删除

### 4️⃣ 搜索记忆

1. 切换到 **"搜索"** 标签
2. 输入关键词（如"引擎"、"Tailwind"）
3. 实时搜索，关键词高亮显示

### 5️⃣ 查看数据库

使用 SQLite 客户端查看数据库：

```bash
sqlite3 polaris_memory.db "SELECT type, key, value FROM long_term_memories;"
```

**预期结果**：
```
user_preference|preferred_engine|"deepseek"
user_preference|peak_usage_hour|"14"
user_preference|workspace_usage:D:\Polaris|{"count":10}
```

---

## 记忆系统的实际应用场景

### 场景 1: 跨会话记忆

**第 1 天对话**:
- 你: "这个项目的端口是 3000"
- AI: "好的，记住了"
- **记忆系统保存**: `{key: "api_port", value: "3000"}`

**第 5 天对话**:
- 你: "启动服务器"
- AI: "正在启动服务器，端口 3000..."
- **记忆系统自动加载**: 端口 3000 的记忆

### 场景 2: 项目协作

**开发者 A**:
- "我们使用 MongoDB 作为数据库"
- **记忆保存**: `{decision: "MongoDB", reason: "项目约定"}`

**开发者 B**（使用同一工作区）:
- "数据怎么存储？"
- AI: "根据项目记忆，你们使用 MongoDB..."
- **记忆自动共享**：因为存储在数据库，团队成员共享记忆

### 场景 3: 代码规范

**你的对话**:
- "函数命名使用驼峰命名法"
- "文件名使用短横线命名"

**记忆系统记住**:
```json
{
  "naming_convention": {
    "function": "camelCase",
    "file": "kebab-case"
  }
}
```

**未来代码生成时**，AI 会自动应用这些规范！

---

## 记忆系统的优势

### ✅ 自动化
- 无需手动记录
- 对话结束后自动提取
- 对话时自动加载

### ✅ 智能化
- 自动去重（不会重复保存相同知识）
- 命中计数（常用知识优先加载）
- 语义搜索（根据关键词检索相关记忆）

### ✅ 持久化
- 保存到 SQLite 数据库
- 跨会话持久化
- 跨工作区隔离（不同工作区的记忆分开）

### ✅ 可视化
- 记忆面板（统计、浏览、搜索）
- 实时搜索
- 一键导出

---

## 常见问题

### Q: 记忆会占用很多 token 吗？

**A**: 不会。记忆系统有智能限制：
- 项目上下文：最多 5 条
- 关键决策：最多 3 条
- 总计：最多 8 条高频记忆
- 预估：< 500 tokens

### Q: 记忆可以被编辑吗？

**A**:
- 当前版本：只能查看和删除
- 未来版本：将支持编辑和合并

### Q: 记忆会过期吗？

**A**:
- 不会自动删除
- 但 hit_count 低的记忆会被排序到后面
- 你可以手动删除过时的记忆

### Q: 隐私安全吗？

**A**:
- 记忆存储在本地 SQLite 数据库
- 不会上传到云端
- 不同工作区的记忆完全隔离

### Q: 如何清空所有记忆？

**A**:
```bash
# 删除数据库文件
rm polaris_memory.db

# 或在记忆面板中逐个删除
```

---

## 总结

**记忆系统是一个"第二大脑"**，它：

1. **自动学习**：从对话中提取重要信息
2. **持久保存**：存储在本地数据库
3. **智能应用**：下次对话时自动加载
4. **可视管理**：通过记忆面板查看和管理

**目前的集成状态**：
- ✅ DeepSeek 引擎：**已完全集成**
- ❌ Claude Code 引擎：未集成
- ❌ IFlow 引擎：未集成

**如果你使用 DeepSeek 引擎，记忆系统已经在工作了！**

**验证方法**：
1. 发送几条消息
2. 查看控制台日志
3. 点击左侧大脑图标查看记忆面板

---

**有任何问题，随时问我哦~** 🎉
