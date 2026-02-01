# DeepSeek Native Engine - 使用指南

## 快速开始

### 1. 配置 DeepSeek API Key

首先需要在 [DeepSeek 开放平台](https://platform.deepseek.com) 获取 API Key。

### 2. 初始化引擎

```typescript
import { DeepSeekEngine } from '@/engines/deepseek'

const engine = new DeepSeekEngine({
  apiKey: 'your-deepseek-api-key',
  model: 'deepseek-coder',
  temperature: 0.7,
  maxTokens: 8192,
  workspaceDir: '/path/to/workspace'
})

// 检查可用性
const available = await engine.isAvailable()
if (!available) {
  console.error('DeepSeek API 不可用')
  return
}

// 初始化
await engine.initialize()
```

### 3. 创建会话并执行任务

```typescript
const session = engine.createSession()

// 监听事件
session.onEvent((event) => {
  switch (event.type) {
    case 'user_message':
      console.log('用户:', event.content)
      break
    case 'assistant_message':
      console.log('助手:', event.content)
      break
    case 'tool_call_start':
      console.log('工具调用:', event.toolName, event.toolInput)
      break
    case 'tool_call_end':
      console.log('工具完成:', event.toolName)
      break
    case 'error':
      console.error('错误:', event.error)
      break
  }
})

// 执行任务
const task = {
  id: 'task-1',
  input: {
    prompt: '帮我创建一个 React 计数器组件'
  }
}

const eventIterable = await session.run(task)

// 处理事件流
for await (const event of eventIterable) {
  // 事件已通过 onEvent 处理
}
```

### 4. 多轮对话

```typescript
// 继续会话
await session.continue('添加一个重置按钮')
```

## 支持的工具

| 工具名称 | 功能描述 |
|---------|---------|
| `bash` | 执行 shell 命令 |
| `read_file` | 读取文件内容 |
| `write_file` | 创建或覆盖文件 |
| `edit_file` | 精确编辑文件（字符串替换） |
| `list_files` | 列出目录内容 |
| `git_status` | 获取 Git 状态 |
| `git_diff` | 查看 Git diff |
| `git_log` | 查看提交历史 |
| `todo_add` | 添加待办事项 |
| `todo_list` | 列出待办事项 |
| `todo_complete` | 完成待办事项 |
| `todo_delete` | 删除待办事项 |
| `search_files` | 按文件名搜索 |
| `search_code` | 搜索代码内容 |

## 模型选择

DeepSeek 提供以下模型：

| 模型 | 用途 | 推荐场景 |
|------|------|---------|
| `deepseek-chat` | 通用对话 | 日常对话、问答 |
| `deepseek-coder` | 代码生成 | **编程任务（推荐）** |
| `deepseek-reasoner` | 复杂推理 | 需要深度思考的任务 |

## 成本对比

| 模型 | 输入价格 | 输出价格 | 相对成本 |
|------|---------|---------|---------|
| Claude Sonnet | $3/1M tokens | $15/1M tokens | 100% |
| DeepSeek Coder | ¥0.14/1M tokens | ¥0.28/1M tokens | ~1% |

**DeepSeek 成本仅为 Claude 的 1-2%！**

## 完整示例

```typescript
import { bootstrapEngines } from '@/core/engine-bootstrap'

// 启动应用时初始化引擎
await bootstrapEngines('deepseek', {
  apiKey: 'your-api-key',
  model: 'deepseek-coder'
})

// 使用引擎
const session = getDefaultEngine()?.createSession()

await session?.run({
  id: 'task-1',
  input: {
    prompt: '分析当前项目结构并给出改进建议'
  }
})
```

## 故障排除

### API 调用失败

1. 检查 API Key 是否正确
2. 检查网络连接
3. 确认 API 额度是否充足

### 工具调用失败

1. 确认 Tauri 后端命令已正确注册
2. 检查文件路径是否正确
3. 查看控制台错误日志

### 上下文丢失

DeepSeek 会自动管理对话历史，无需手动处理。

## 技术细节

- **协议**: OpenAI 兼容的 HTTP API
- **流式响应**: 模拟流式输出（逐字符发送事件）
- **工具调用**: 完整支持 Function Calling
- **上下文管理**: 自动维护对话历史
- **故障转移**: 可通过 ModelManager 实现多模型切换

## 更多资源

- [DeepSeek API 文档](https://api-docs.deepseek.com)
- [DeepSeek 开放平台](https://platform.deepseek.com)
- [Function Calling 指南](https://api-docs.deepseek.com/zh-cn/guides/tool_calls)
