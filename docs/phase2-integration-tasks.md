# 📋 Phase 2 剩余集成工作详细分析

## 🎯 总览

**已完成**: 核心代码（19 个文件，~2000 行）✅
**剩余工作**: 4 个集成任务（预计 1-2 天）

---

## 📊 任务优先级

| 任务 | 优先级 | 难度 | 预计时间 | 状态 |
|------|--------|------|----------|------|
| 1. 实现 dbMsgToChatMessage | P0 | 中 | 1-2 小时 | 待完成 |
| 2. 集成到 configStore | P0 | 低 | 30 分钟 | 待完成 |
| 3. 集成到 eventChatStore | P0 | 低 | 30 分钟 | 待完成 |
| 4. 实现后端 AI 调用 | P0 | 高 | 2-4 小时 | 待完成 |

---

## 🔧 任务 1: 实现 dbMsgToChatMessage 函数

### 当前状态

**文件**: `src/services/memory/utils/chat-message-adapter.ts`

**当前代码**（占位实现）:
```typescript
export function dbMsgToChatMessage(dbMsg: any): ChatMessage {
  console.warn('[dbMsgToChatMessage] 需要实现数据库消息到 ChatMessage 的转换')
  return {
    id: dbMsg.id,
    type: 'user',
    content: dbMsg.content || '',
    timestamp: dbMsg.timestamp || new Date().toISOString(),
  }
}
```

**问题**:
- ❌ 只返回 `user` 类型
- ❌ 没有处理 `assistant` 的 `blocks`
- ❌ 没有处理 `tool` 和 `tool_group`
- ❌ 没有解析 `toolCalls` JSON 字段

### 数据格式分析

**数据库格式** (`Message` interface):
```typescript
interface Message {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  toolCalls?: string  // JSON 字符串
  timestamp: string
  // ... 其他字段
}
```

**UI 格式** (`ChatMessage` type):
```typescript
type ChatMessage =
  | UserChatMessage       // { type: 'user', content }
  | AssistantChatMessage  // { type: 'assistant', blocks[] }
  | SystemChatMessage     // { type: 'system', content }
  | ToolChatMessage       // { type: 'tool', toolId, toolName, ... }
  | ToolGroupChatMessage  // { type: 'tool_group', toolIds[], ... }
```

### 实施方案

**完整实现代码**:

```typescript
/**
 * 转换数据库消息为 ChatMessage
 * 参考 eventChatStore.restoreFromHistory 中的转换逻辑
 */
export function dbMsgToChatMessage(dbMsg: any): ChatMessage {
  const base = {
    id: dbMsg.id,
    timestamp: dbMsg.timestamp || new Date().toISOString(),
  }

  // 1. 用户消息
  if (dbMsg.role === 'user') {
    return {
      ...base,
      type: 'user',
      content: dbMsg.content || '',
    }
  }

  // 2. 助手消息
  if (dbMsg.role === 'assistant') {
    // 尝试解析 toolCalls
    let blocks: ContentBlock[] = []

    // 如果有 toolCalls，解析为 ToolCallBlock
    if (dbMsg.toolCalls) {
      try {
        const toolCalls = JSON.parse(dbMsg.toolCalls)
        if (Array.isArray(toolCalls)) {
          blocks = toolCalls.map((tc: any) => ({
            type: 'tool_call' as const,
            id: tc.id,
            name: tc.name,
            input: tc.input,
            status: (tc.status || 'completed') as ToolStatus,
            output: tc.output,
            error: tc.error,
            startedAt: tc.startedAt || dbMsg.timestamp,
            completedAt: tc.completedAt,
            duration: tc.duration,
          }))
        }
      } catch (error) {
        console.warn('[dbMsgToChatMessage] 解析 toolCalls 失败:', error)
      }
    }

    // 添加文本内容块
    blocks.push({
      type: 'text',
      content: dbMsg.content || '',
    })

    return {
      ...base,
      type: 'assistant',
      blocks,
    }
  }

  // 3. 系统消息
  if (dbMsg.role === 'system') {
    return {
      ...base,
      type: 'system',
      content: dbMsg.content || '',
    }
  }

  // 4. 工具消息（如果 role 是 'tool'）
  if (dbMsg.role === 'tool') {
    return {
      ...base,
      type: 'tool',
      toolId: dbMsg.id,
      toolName: dbMsg.content?.match(/\[([^\]]+)\]/)?.[1] || 'unknown',
      status: 'completed',
      summary: dbMsg.content || '工具调用',
      startedAt: dbMsg.timestamp,
    }
  }

  // 默认返回用户消息
  console.warn('[dbMsgToChatMessage] 未知消息类型:', dbMsg.role)
  return {
    ...base,
    type: 'user',
    content: dbMsg.content || '',
  }
}
```

### 测试验证

```typescript
// 测试用例
const testDbMsg = {
  id: 'msg-1',
  role: 'assistant',
  content: '这是回复内容',
  toolCalls: JSON.stringify([
    {
      id: 'call-1',
      name: 'read_file',
      input: { path: '/test.txt' },
      status: 'completed',
      output: '文件内容',
    }
  ]),
  timestamp: '2024-01-01T00:00:00.000Z'
}

const chatMsg = dbMsgToChatMessage(testDbMsg)
console.log('转换结果:', chatMsg)
```

---

## 🔧 任务 2: 集成到 configStore

### 目标

在 `configStore` 中添加压缩配置，允许用户自定义压缩行为。

### 当前 configStore 结构

**文件**: `src/stores/configStore.ts`

需要添加的字段：
```typescript
interface ConfigState {
  // ... 现有字段

  // 新增：压缩配置
  compressionConfig: CompressionConfig
  updateCompressionConfig: (config: Partial<CompressionConfig>) => void
}
```

### 实施方案

**步骤 1: 导入类型**
```typescript
import type { CompressionConfig, DEFAULT_COMPRESSION_CONFIG } from '@/services/memory/types'
```

**步骤 2: 扩展接口**
```typescript
export interface ConfigState {
  // ... 现有字段

  // 压缩配置
  compressionConfig: CompressionConfig

  // 更新压缩配置
  updateCompressionConfig: (config: Partial<CompressionConfig>) => void
}
```

**步骤 3: 初始化配置**
```typescript
export const useConfigStore = create<ConfigState>((set, get) => ({
  // ... 现有初始化

  // 新增：压缩配置
  compressionConfig: {
    ...DEFAULT_COMPRESSION_CONFIG,
    // 根据可用引擎选择默认模型
    summaryModel: get().engines.deepseek ? 'deepseek' : 'claude-code',
  },

  // 新增：更新压缩配置
  updateCompressionConfig: (config: Partial<CompressionConfig>) => {
    set(state => ({
      compressionConfig: {
        ...state.compressionConfig,
        ...config,
      },
    }))

    // 可选：持久化到 localStorage
    localStorage.setItem('compressionConfig', JSON.stringify(get().compressionConfig))
  },
}))
```

### UI 集成（可选）

在设置页面添加压缩配置：

```tsx
// src/components/Settings/CompressionSettings.tsx

export const CompressionSettings: React.FC = () => {
  const { compressionConfig, updateCompressionConfig } = useConfigStore()

  return (
    <div>
      <h3>对话压缩设置</h3>

      <label>
        最大 Token 数量:
        <input
          type="number"
          value={compressionConfig.maxTokens}
          onChange={(e) => updateCompressionConfig({ maxTokens: Number(e.target.value) })}
        />
      </label>

      <label>
        摘要模型:
        <select
          value={compressionConfig.summaryModel}
          onChange={(e) => updateCompressionConfig({ summaryModel: e.target.value as any })}
        >
          <option value="deepseek">DeepSeek</option>
          <option value="claude-code">Claude Code</option>
        </select>
      </label>
    </div>
  )
}
```

---

## 🔧 任务 3: 集成到 eventChatStore

### 目标

在 `eventChatStore` 中添加压缩相关的方法和状态。

### 当前 eventChatStore 结构

**文件**: `src/stores/eventChatStore.ts`

需要添加的字段：
```typescript
interface EventChatState {
  // ... 现有字段

  // 压缩相关
  compressionResult: CompressionResult | null
  isCompressing: boolean

  // 压缩方法
  compressConversation: () => Promise<void>
  shouldCompressConversation: () => boolean
}
```

### 实施方案

**步骤 1: 导入类型**
```typescript
import type { CompressionResult } from '@/services/memory/types'
import { getCompressorService } from '@/services/memory'
```

**步骤 2: 扩展状态**
```typescript
export const useEventChatStore = create<EventChatState>((set, get) => ({
  // ... 现有状态

  // 新增：压缩相关
  compressionResult: null,
  isCompressing: false,

  // ... 现有方法
}))
```

**步骤 3: 添加压缩方法**
```typescript
export const useEventChatStore = create<EventChatState>((set, get) => ({
  // ... 现有初始化

  /**
   * 压缩对话
   */
  compressConversation: async () => {
    const state = get()
    const { messages, conversationId } = state

    if (messages.length === 0) {
      console.warn('[EventChatStore] 没有消息需要压缩')
      return
    }

    console.log('[EventChatStore] 开始压缩对话...', {
      conversationId,
      messageCount: messages.length,
    })

    set({ isCompressing: true })

    try {
      const compressor = getCompressorService()
      const { result, compressedMessages } = await compressor.compress(
        conversationId,
        messages
      )

      if (result.success) {
        set({
          messages: compressedMessages,
          compressionResult: result,
          isCompressing: false,
        })

        console.log('[EventChatStore] 压缩完成', {
          beforeCount: messages.length,
          afterCount: compressedMessages.length,
          compressionRatio: `${(result.compressionRatio * 100).toFixed(0)}%`,
        })
      } else {
        set({
          compressionResult: result,
          isCompressing: false,
        })
      }
    } catch (error) {
      console.error('[EventChatStore] 压缩失败:', error)

      set({
        compressionResult: {
          success: false,
          archivedCount: 0,
          archivedTokens: 0,
          beforeTokens: 0,
          afterTokens: 0,
          compressionRatio: 1.0,
          duration: 0,
          costTokens: 0,
          error: error.message,
        },
        isCompressing: false,
      })
    }
  },

  /**
   * 检查是否需要压缩
   */
  shouldCompressConversation: () => {
    const state = get()
    const compressor = getCompressorService()
    return compressor.shouldCompress(state.conversationId || '', state.messages)
  },

  // ... 其他方法
}))
```

### 触发压缩的时机

```typescript
// 1. 在 saveToHistory 中自动触发
saveToHistory: async (title?: string) => {
  // ... 现有保存逻辑

  // 保存后检查是否需要压缩
  const state = get()
  const config = useConfigStore.getState().compressionConfig

  if (config.compressOnSave && state.shouldCompressConversation()) {
    console.log('[EventChatStore] 触发自动压缩')
    await state.compressConversation()
  }
},

// 2. 在消息发送后检查
addMessage: (message) => {
  // ... 现有逻辑

  // 检查是否需要压缩
  const state = get()
  const config = useConfigStore.getState().compressionConfig

  if (config.compressInBackground && state.shouldCompressConversation()) {
    // 延迟压缩，避免阻塞
    setTimeout(() => state.compressConversation(), 1000)
  }
}
```

---

## 🔧 任务 4: 实现后端 AI 调用

### 目标

实现 Tauri 命令，在前端调用后端生成摘要。

### 当前状态

**文件**: `src/services/memory/utils/ai-caller.ts`

**当前代码**（占位实现）:
```typescript
export async function callAI(options: AICallOptions): Promise<string> {
  throw new Error('AI 调用功能需要后端支持，请先实现 Tauri 命令')
}
```

### 方案 A: 使用现有引擎（推荐）

**优点**:
- ✅ 无需额外的后端代码
- ✅ 复用现有的 DeepSeek/Claude 引擎
- ✅ 配置统一管理

**实施步骤**:

**步骤 1: 修改 ai-caller.ts**
```typescript
import { getEngine } from '@/core/engine-bootstrap'
import type { EngineId } from '@/core'

export interface AICallOptions {
  engineId: EngineId
  prompt: string
  temperature?: number
}

export async function callAI(options: AICallOptions): Promise<string> {
  const { engineId, prompt, temperature = 0.3 } = options

  console.log('[AICaller] 开始调用 AI...', {
    engineId,
    promptLength: prompt.length,
    temperature,
  })

  try {
    // 1. 获取引擎
    const engine = getEngine(engineId)

    // 2. 创建会话
    const session = engine.createSession({
      sessionId: crypto.randomUUID(),
      workspacePath: '',
      engineId,
    })

    // 3. 构造任务
    const task = {
      type: 'chat' as const,
      input: {
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      },
    }

    // 4. 执行任务（简化版，只获取最终内容）
    const events = []
    for await (const event of session.run(task)) {
      events.push(event)

      // 当收到 assistant 消息时，提取内容
      if (event.type === 'message' && event.role === 'assistant') {
        const content = extractTextFromContent(event.content)
        if (content) {
          console.log('[AICaller] AI 调用完成', {
            contentLength: content.length,
          })
          return content
        }
      }
    }

    // 如果没有收到消息，尝试从最后一个事件提取
    const lastEvent = events[events.length - 1]
    if (lastEvent && lastEvent.type === 'message' && lastEvent.role === 'assistant') {
      return extractTextFromContent(lastEvent.content)
    }

    throw new Error('无法从 AI 响应中提取内容')
  } catch (error) {
    console.error('[AICaller] AI 调用失败:', error)
    throw error
  }
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content
      .filter(item => item && typeof item === 'object' && 'type' in item)
      .filter(item => item.type === 'text')
      .map(item => (item as any).text)
      .join('\n')
  }

  return String(content || '')
}
```

### 方案 B: 创建 Tauri 命令（备选）

如果需要更灵活的控制，可以创建专用的 Tauri 命令。

**步骤 1: 创建 Rust 命令**

**文件**: `src-tauri/src/commands/summary.rs`

```rust
use tauri::State;
use crate::AppState;
use crate::engines::deepseek::DeepSeekEngine;

#[tauri::command]
pub async fn generate_summary(
    prompt: String,
    engine_id: String,
    temperature: f32,
    state: State<'_, AppState>,
) -> Result<String, String> {
    println!("[Summary] Generating summary with engine: {}", engine_id);

    // 根据引擎 ID 选择引擎
    let response = match engine_id.as_str() {
        "deepseek" => {
            let engine = state.deepseek_engine.lock().unwrap();
            engine.call(&prompt, temperature).await
                .map_err(|e| e.to_string())?
        }
        _ => return Err("Unsupported engine".to_string()),
    };

    Ok(response)
}
```

**步骤 2: 注册命令**

**文件**: `src-tauri/src/commands/mod.rs`

```rust
pub mod summary;

// 在 mod.rs 中导出
pub use summary::generate_summary;
```

**步骤 3: 在 main.rs 中注册**

**文件**: `src-tauri/src/main.rs`

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // ... 其他插件
        .invoke_handler(tauri::generate_handler![
            // ... 其他命令
            generate_summary,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**步骤 4: 前端调用**

```typescript
import { invoke } from '@tauri-apps/api/core'

export async function callAI(options: AICallOptions): Promise<string> {
  const { engineId, prompt, temperature = 0.3 } = options

  try {
    const response = await invoke<string>('generate_summary', {
      prompt,
      engineId,
      temperature,
    })

    return response
  } catch (error) {
    console.error('[AICaller] AI 调用失败:', error)
    throw error
  }
}
```

---

## 📋 实施检查清单

### 任务 1: dbMsgToChatMessage
- [ ] 实现 5 种消息类型的转换
- [ ] 解析 toolCalls JSON 字段
- [ ] 处理错误情况
- [ ] 编写单元测试
- [ ] 测试实际数据库消息

### 任务 2: configStore 集成
- [ ] 添加 compressionConfig 字段
- [ ] 添加 updateCompressionConfig 方法
- [ ] 初始化默认配置
- [ ] （可选）持久化到 localStorage
- [ ] （可选）创建设置 UI

### 任务 3: eventChatStore 集成
- [ ] 添加 compressionResult 状态
- [ ] 添加 isCompressing 状态
- [ ] 实现 compressConversation 方法
- [ ] 实现 shouldCompressConversation 方法
- [ ] 在 saveToHistory 中触发压缩
- [ ] 在 addMessage 中检查压缩

### 任务 4: AI 调用实现
- [ ] 选择方案（推荐方案 A）
- [ ] 实现引擎调用逻辑
- [ ] 处理错误和超时
- [ ] 测试实际 AI 调用
- [ ] 验证摘要质量

---

## 🎯 实施顺序建议

### Day 1 上午（2-3 小时）
1. ✅ 实现 dbMsgToChatMessage（任务 1）
2. ✅ 集成到 configStore（任务 2）
3. ✅ 测试消息加载和恢复

### Day 1 下午（2-3 小时）
4. ✅ 集成到 eventChatStore（任务 3）
5. ✅ 实现方案 A 的 AI 调用（任务 4）
6. ✅ 端到端测试

### Day 2（测试和优化）
7. ✅ 编写单元测试
8. ✅ 性能测试
9. ✅ 用户体验优化
10. ✅ 文档完善

---

## 🧪 测试方案

### 1. 单元测试

```typescript
// dbMsgToChatMessage 测试
describe('dbMsgToChatMessage', () => {
  it('应该转换用户消息', () => {
    const dbMsg = {
      id: '1',
      role: 'user',
      content: '你好',
      timestamp: '2024-01-01T00:00:00.000Z'
    }
    const chatMsg = dbMsgToChatMessage(dbMsg)
    expect(chatMsg.type).toBe('user')
    expect(chatMsg.content).toBe('你好')
  })

  it('应该转换助手消息', () => {
    const dbMsg = {
      id: '2',
      role: 'assistant',
      content: '回复内容',
      toolCalls: JSON.stringify([...]),
      timestamp: '2024-01-01T00:00:00.000Z'
    }
    const chatMsg = dbMsgToChatMessage(dbMsg)
    expect(chatMsg.type).toBe('assistant')
    expect(chatMsg.blocks).toHaveLength(2) // text + tool_call
  })
})
```

### 2. 集成测试

```typescript
describe('压缩功能集成', () => {
  it('应该完整执行压缩流程', async () => {
    // 1. 创建测试会话
    // 2. 发送大量消息（>100）
    // 3. 触发压缩
    // 4. 验证摘要生成
    // 5. 验证消息归档
  })
})
```

### 3. E2E 测试

```typescript
// 手动测试流程
1. 启动应用
2. 发送 100+ 条消息
3. 观察是否提示压缩
4. 点击"立即压缩"
5. 验证消息数量减少
6. 验证摘要正确生成
```

---

## 💡 注意事项

1. **错误处理**: 所有 AI 调用都需要 try-catch
2. **降级策略**: 如果 AI 失败，应该有备用方案
3. **性能**: 压缩不应该阻塞 UI
4. **用户体验**: 显示压缩进度和结果
5. **配置**: 允许用户自定义压缩行为

---

## ✅ 完成标准

- [ ] 所有 4 个任务完成
- [ ] 单元测试通过
- [ ] 集成测试通过
- [ ] E2E 测试通过
- [ ] 性能达标（压缩 < 10s）
- [ ] 文档完整

---

**预计完成时间**: 1-2 天
**文档版本**: v1.0
**更新日期**: 2026-02-02
