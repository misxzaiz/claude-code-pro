/**
 * 聊天相关类型定义
 */

/** 消息角色 */
export type MessageRole = 'user' | 'assistant' | 'system';

/** 工具调用状态 */
export type ToolStatus = 'pending' | 'running' | 'completed' | 'failed' | 'partial';

/** 工具调用信息 */
export interface ToolCall {
  id: string;
  name: string;
  status: ToolStatus;
  input?: Record<string, unknown>;
  output?: string;
  startedAt: string;
  completedAt?: string;
  /** Diff 相关数据 (用于 Edit 工具) */
  diff?: {
    /** 修改前的文件内容 */
    oldContent?: string;
    /** 修改后的文件内容 */
    newContent?: string;
    /** 文件路径 */
    filePath?: string;
  };
}

/** 聊天消息 */
export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: string;
  /** 工具调用摘要（替代完整的 toolCalls） */
  toolSummary?: {
    count: number;
    names: string[];
  };
}

/** 权限拒绝详情 */
export interface PermissionDenial {
  toolName: string;
  reason: string;
  details: Record<string, unknown>;
}

/** 权限请求 */
export interface PermissionRequest {
  id: string;
  sessionId: string;
  denials: PermissionDenial[];
  createdAt: string;
}

/** 内容块类型 */
interface ContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  is_error?: boolean;
  content?: string;
}

/** 助手消息结构 */
interface AssistantMessage {
  id: string;
  type: string;
  role: string;
  model: string;
  content: ContentBlock[];
  stop_reason?: string;
  usage?: unknown;
  [key: string]: unknown;
}

/** 用户消息结构（包含工具结果） */
interface UserMessage {
  role: string;
  content: ContentBlock[];
  [key: string]: unknown;
}

/** 流事件类型 */
export type StreamEvent =
  | { type: 'system'; subtype?: string; session_id?: string; [key: string]: unknown }
  | { type: 'assistant'; message: AssistantMessage }
  | { type: 'user'; message: UserMessage }
  | { type: 'session_start'; sessionId: string }
  | { type: 'text_delta'; text: string }
  | { type: 'tool_start'; toolUseId: string; toolName: string; input: Record<string, unknown> }
  | { type: 'tool_end'; toolUseId: string; toolName?: string; output?: string }
  | { type: 'permission_request'; sessionId: string; denials: PermissionDenial[] }
  | { type: 'result'; subtype: string; [key: string]: unknown }
  | { type: 'error'; error: string }
  | { type: 'session_end' };

/**
 * ========================================
 * 新型消息类型定义 - 分层对话流
 * ========================================
 */

/** 聊天消息类型标识符 */
export type ChatMessageType = 'user' | 'assistant' | 'system' | 'tool' | 'tool_group';

/** 基础消息字段 */
interface BaseChatMessage {
  id: string;
  timestamp: string;
}

/** 用户消息 */
export interface UserChatMessage extends BaseChatMessage {
  type: 'user';
  content: string;
}

/** 助手消息 */
export interface AssistantChatMessage extends BaseChatMessage {
  type: 'assistant';
  content: string;
  isStreaming?: boolean;
}

/** 系统消息 */
export interface SystemChatMessage extends BaseChatMessage {
  type: 'system';
  content: string;
}

/** 工具消息 - 单个工具调用的独立消息 */
export interface ToolChatMessage {
  id: string;
  type: 'tool';
  timestamp: string;
  /** 工具唯一标识 */
  toolId: string;
  /** 工具名称 */
  toolName: string;
  /** 工具状态 */
  status: ToolStatus;
  /** 智能摘要（单行描述） */
  summary: string;
  /** 工具输入参数 */
  input?: Record<string, unknown>;
  /** 工具输出结果 */
  output?: string;
  /** 关联的助手消息 ID */
  relatedMessageId?: string;
  /** 开始时间 */
  startedAt: string;
  /** 完成时间 */
  completedAt?: string;
  /** 执行时长（毫秒） */
  duration?: number;
  /** 错误信息 */
  error?: string;
}

/** 工具组消息 - 多个工具调用的聚合展示 */
export interface ToolGroupChatMessage {
  id: string;
  type: 'tool_group';
  timestamp: string;
  /** 包含的工具 ID 列表 */
  toolIds: string[];
  /** 包含的工具名称列表 */
  toolNames: string[];
  /** 工具组状态 */
  status: ToolStatus;
  /** 智能摘要 */
  summary: string;
  /** 开始时间 */
  startedAt: string;
  /** 完成时间 */
  completedAt?: string;
  /** 执行时长（毫秒） */
  duration?: number;
}

/** 联合聊天消息类型 */
export type ChatMessage =
  | UserChatMessage
  | AssistantChatMessage
  | SystemChatMessage
  | ToolChatMessage
  | ToolGroupChatMessage;

/** 类型守卫：判断是否为工具消息 */
export function isToolMessage(message: ChatMessage): message is ToolChatMessage {
  return message.type === 'tool';
}

/** 类型守卫：判断是否为工具组消息 */
export function isToolGroupMessage(message: ChatMessage): message is ToolGroupChatMessage {
  return message.type === 'tool_group';
}

/** 类型守卫：判断是否为助手消息 */
export function isAssistantMessage(message: ChatMessage): message is AssistantChatMessage {
  return message.type === 'assistant';
}

/** 类型守卫：判断是否为用户消息 */
export function isUserMessage(message: ChatMessage): message is UserChatMessage {
  return message.type === 'user';
}
