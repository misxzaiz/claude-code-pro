# AI 工具系统使用指南

> **更新时间**: 2026-01-27
> **版本**: 1.0.0
> **状态**: ✅ 已集成到应用

---

## 📖 概述

Polaris 现在拥有完整的 AI 工具系统，AI 可以调用预定义的工具来执行操作，如创建、更新、查询待办事项。

---

## 🚀 快速开始

### 1. 工具已自动注册

应用启动时会自动注册所有 Todo 工具，你可以在浏览器控制台看到：

```
[TodoTools] Registering Todo tools to global registry...
[ToolRegistry] Registered tool: TodoCreate
[ToolRegistry] Registered tool: TodoBatchCreate
[ToolRegistry] Registered tool: TodoUpdate
[ToolRegistry] Registered tool: TodoQuery
[TodoTools] Successfully registered 4 Todo tools:
  - TodoCreate: 创建单个待办
  - TodoBatchCreate: 批量创建待办
  - TodoUpdate: 更新待办
  - TodoQuery: 查询待办
[App] AI Tools registered successfully
```

### 2. 验证工具注册

打开浏览器控制台，执行以下代码验证：

```javascript
// 查看所有已注册的工具
import { globalToolRegistry } from '@/ai-runtime'
console.log(globalToolRegistry.listNames())
// 输出: ['TodoCreate', 'TodoBatchCreate', 'TodoUpdate', 'TodoQuery']

// 生成 AI 系统提示词
console.log(globalToolRegistry.generateSystemPrompt())
```

---

## 🛠️ 可用工具

### TodoCreate - 创建单个待办

**描述**: 创建一个新的待办事项。当用户提到需要完成的任务、bug 或功能时使用。

**参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `content` | `string` | ✅ | 待办事项的详细描述 |
| `priority` | `string` | ❌ | 优先级 (low/normal/high/urgent)，默认 normal |
| `tags` | `string[]` | ❌ | 标签（如 frontend, bug, feature, backend） |
| `relatedFiles` | `string[]` | ❌ | 相关的文件路径 |

**示例**:
```javascript
const result = await globalToolRegistry.execute('TodoCreate', {
  content: '实现用户登录功能',
  priority: 'high',
  tags: ['feature', 'auth'],
  relatedFiles: ['src/api/auth.ts', 'src/pages/login.tsx']
})

console.log(result)
// {
//   success: true,
//   data: { id: 'xxx', content: '实现用户登录功能', ... }
// }
```

---

### TodoBatchCreate - 批量创建待办

**描述**: 批量创建多个相关待办事项。当用户提到需要完成多个相关任务时使用。

**参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `todos` | `array` | ✅ | 待办事项列表，每个包含 content, priority, tags |
| `requireConfirmation` | `boolean` | ❌ | 是否需要用户确认（默认 true） |

**示例**:
```javascript
const result = await globalToolRegistry.execute('TodoBatchCreate', {
  todos: [
    { content: '设计数据库表结构', priority: 'high' },
    { content: '实现 API 接口', priority: 'normal' },
    { content: '前端登录表单', priority: 'normal' }
  ],
  requireConfirmation: true
})
```

---

### TodoUpdate - 更新待办

**描述**: 更新现有待办的状态、优先级或其他属性。

**参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `todoId` | `string` | ✅ | 待办事项的 ID |
| `status` | `string` | ❌ | 新状态 (pending/in_progress/completed/cancelled) |
| `priority` | `string` | ❌ | 新优先级 |
| `content` | `string` | ❌ | 新内容描述 |

**示例**:
```javascript
const result = await globalToolRegistry.execute('TodoUpdate', {
  todoId: '123e4567-e89b-12d3-a456-426614174000',
  status: 'in_progress',
  priority: 'high'
})
```

---

### TodoQuery - 查询待办

**描述**: 查询和筛选待办事项列表。

**参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `status` | `string` | ❌ | 按状态筛选 |
| `priority` | `string` | ❌ | 按优先级筛选 |
| `tags` | `string[]` | ❌ | 按标签筛选 |
| `limit` | `number` | ❌ | 返回数量限制 |

**示例**:
```javascript
// 查询所有待处理的高优先级待办
const result = await globalToolRegistry.execute('TodoQuery', {
  status: 'pending',
  priority: 'high',
  limit: 10
})

console.log(result)
// {
//   success: true,
//   data: [
//     { id: 'xxx', content: '修复登录 bug', priority: 'high', status: 'pending' },
//     ...
//   ]
// }
```

---

## 💡 使用场景

### 场景 1: 用户手动创建待办

用户在聊天框输入：
```
@todo[high, frontend] 实现用户登录功能
```

系统会：
1. 解析 `@todo` 命令
2. 调用 `TodoCreate` 工具
3. 创建待办并显示在 TodoPanel

### 场景 2: AI 主动创建待办（未来功能）

用户说：
```
帮我实现用户登录功能
```

AI 理解后可以：
1. 调用 `TodoBatchCreate` 创建子任务
2. 询问用户是否确认
3. 创建待办后开始执行

### 场景 3: 查看待办列表

用户说：
```
显示所有待办
```

AI 调用：
```javascript
await globalToolRegistry.execute('TodoQuery', {})
```

然后格式化返回结果展示给用户。

---

## 🔧 高级用法

### 1. 自定义工具注册

你可以创建自己的工具并注册：

```typescript
import { globalToolRegistry } from '@/ai-runtime'
import type { AITool } from '@/ai-runtime/tools/todoTools'

const MyCustomTool: AITool = {
  name: 'MyCustomTool',
  description: '我的自定义工具',
  inputSchema: {
    type: 'object',
    properties: {
      message: { type: 'string', description: '消息内容' }
    },
    required: ['message']
  },
  execute: async (input) => {
    console.log('收到消息:', input.message)
    return { success: true, data: { result: 'OK' } }
  }
}

globalToolRegistry.register(MyCustomTool)
```

### 2. 监听工具执行

```typescript
// 工具执行前拦截
const originalExecute = globalToolRegistry.execute.bind(globalToolRegistry)
globalToolRegistry.execute = async (name, input) => {
  console.log(`[ToolInterceptor] 即将执行工具: ${name}`, input)
  const result = await originalExecute(name, input)
  console.log(`[ToolInterceptor] 工具执行结果:`, result)
  return result
}
```

### 3. 生成 AI 提示词

```typescript
import { generateEnhancedSystemPrompt } from '@/services/aiPromptEnhancer'

// 为 AI 对话生成增强的系统提示词
const enhancedPrompt = generateEnhancedSystemPrompt(
  "帮我创建一个实现登录功能的待办",
  "session-123"
)

console.log(enhancedPrompt)
// 输出包含工具说明和待办上下文的完整提示词
```

---

## 📊 性能考虑

- 工具执行是**异步**的，不会阻塞 UI
- 工具注册使用 **Map** 数据结构，查询复杂度 O(1)
- 系统提示词生成是**按需**的，只在需要时生成

---

## 🐛 故障排查

### 问题: 工具没有注册成功

**检查步骤**:
1. 打开浏览器控制台
2. 查找 `[App] AI Tools registered successfully` 日志
3. 如果没有，检查 `App.tsx` 中的 `registerTodoTools()` 调用

### 问题: 工具执行失败

**检查步骤**:
1. 确认工具名称拼写正确（区分大小写）
2. 检查参数是否符合工具的 inputSchema
3. 查看控制台错误日志

---

## 🔗 相关文件

| 文件 | 说明 |
|------|------|
| `src/ai-runtime/tool-registry.ts` | 工具注册表核心 |
| `src/ai-runtime/tools/register-todo-tools.ts` | Todo 工具注册 |
| `src/ai-runtime/tools/todoTools.ts` | Todo 工具定义 |
| `src/services/aiPromptEnhancer.ts` | AI 提示词增强 |
| `src/App.tsx` | 应用初始化（工具注册在此） |

---

## 📝 未来计划

- [ ] 阶段 3: 事件系统同步（Todo 操作触发 AI 事件）
- [ ] 阶段 4: Engine 集成（AI 主动调用工具）
- [ ] 工具执行历史记录
- [ ] 工具执行结果可视化
- [ ] 更多内置工具（Git、文件操作等）

---

> **下一步**: 可以开始实现阶段 3（事件系统同步）或阶段 4（Engine 集成）
