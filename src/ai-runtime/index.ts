/**
 * AI Runtime - AI 抽象运行时
 *
 * 这是一个通用的 AI Code Runtime 平台的核心抽象层。
 * 提供了统一的接口来集成不同的 AI Engine（Claude Code、OpenAI、本地 LLM 等）。
 *
 * @module ai-runtime
 */

// 导出核心类型和接口
export * from './engine'
export * from './session'
export * from './task'
export * from './event'

// 导出便捷工具函数
export {
  createTask,
  type AITask,
  type AITaskKind,
  type AITaskInput,
  type AITaskStatus,
  type AITaskMetadata,
} from './task'

export {
  createTokenEvent,
  createToolCallStartEvent,
  createToolCallEndEvent,
  createProgressEvent,
  createErrorEvent,
  createSessionStartEvent,
  createSessionEndEvent,
  createUserMessageEvent,
  createAssistantMessageEvent,
  isTokenEvent,
  isToolCallStartEvent,
  isToolCallEndEvent,
  isProgressEvent,
  isErrorEvent,
  isSessionStartEvent,
  isSessionEndEvent,
  isUserMessageEvent,
  isAssistantMessageEvent,
} from './event'

export type {
  AIEvent,
  AIEventListener,
  AIEventFilter,
  TokenEvent,
  ToolCallStartEvent,
  ToolCallEndEvent,
  ProgressEvent,
  ResultEvent,
  ErrorEvent,
  SessionStartEvent,
  SessionEndEvent,
  UserMessageEvent,
  AssistantMessageEvent,
  ToolCallInfo,
} from './event'

export {
  createSessionConfig,
  EventEmitter,
} from './session'

export type {
  AISession,
  AISyncSession,
  AISessionConfig,
  AISessionStatus,
  AISessionFactory,
} from './session'

export {
  EngineRegistry,
  createCapabilities,
} from './engine'

export type {
  AIEngine,
  AIEngineFactory,
  EngineCapabilities,
  EngineDescriptor,
} from './engine'

/**
 * AI Runtime 版本
 */
export const VERSION = '1.0.0'

/**
 * 默认 Engine ID
 */
export const DEFAULT_ENGINE_ID = 'claude-code'
