/**
 * AI Command Helper
 *
 * 简化的 AI 命令执行接口，用于向后兼容
 */

import { AgentRegistry } from './agents/AgentRunner'
import type { AgentInput } from './agents/AgentRunner'
import type { EngineId } from '@/types/config'
import { useConfigStore } from '@/stores'

/**
 * AI 命令配置
 */
export interface AICommandConfig {
  /** 用户提示词 */
  prompt: string
  /** 工作区路径 */
  workspacePath?: string
  /** 关联文件 */
  files?: string[]
  /** 是否流式输出 */
  stream?: boolean
  /** 自定义选项 */
  options?: Record<string, unknown>
  /** 指定使用的引擎 (默认使用配置的默认引擎) */
  engine?: EngineId
}

/**
 * 执行 AI 命令
 *
 * @param config 命令配置
 * @returns AI 响应内容
 */
export async function executeAICommand(config: AICommandConfig): Promise<string> {
  // 获取引擎 ID：优先使用传入的 engine，否则使用配置的默认引擎，最后使用 'claude-code'
  const configStore = useConfigStore.getState()
  const engineId: EngineId = config.engine || configStore.config?.defaultEngine || 'claude-code'

  const agent = AgentRegistry.get(engineId)

  if (!agent) {
    throw new Error(`${engineId} Agent 未注册`)
  }

  // 检查 Agent 是否可用
  const available = await agent.isAvailable()
  if (!available) {
    throw new Error(`${engineId} Agent 不可用`)
  }

  // 构建输入
  const input: AgentInput = {
    prompt: config.prompt,
    workspacePath: config.workspacePath,
    files: config.files,
    options: config.options,
  }

  // 执行并收集结果
  let fullContent = ''

  for await (const event of agent.run(input)) {
    if (event.type === 'token') {
      fullContent += event.value
    } else if (event.type === 'assistant_message') {
      if (event.content) {
        fullContent = event.content
      }
    } else if (event.type === 'error') {
      throw new Error(event.error)
    }
  }

  return fullContent
}

/**
 * 执行 AI 命令（流式）
 *
 * @param config 命令配置
 * @returns 异步事件流
 */
export async function* executeAICommandStream(config: AICommandConfig) {
  // 获取引擎 ID：优先使用传入的 engine，否则使用配置的默认引擎，最后使用 'claude-code'
  const configStore = useConfigStore.getState()
  const engineId: EngineId = config.engine || configStore.config?.defaultEngine || 'claude-code'

  const agent = AgentRegistry.get(engineId)

  if (!agent) {
    throw new Error(`${engineId} Agent 未注册`)
  }

  const available = await agent.isAvailable()
  if (!available) {
    throw new Error(`${engineId} Agent 不可用`)
  }

  const input: AgentInput = {
    prompt: config.prompt,
    workspacePath: config.workspacePath,
    files: config.files,
    options: config.options,
  }

  yield* agent.run(input)
}