/**
 * 配置相关类型定义
 */

/**  引擎 ID */
export type EngineId = 'claude-code' | 'iflow' | 'openai-compat'

/** AI 引擎配置 */
export interface EngineConfig {
  /** 引擎 ID */
  id: EngineId;
  /** 引擎名称 */
  name: string;
  /** CLI 命令路径 */
  cliPath?: string;
  /** 是否可用 */
  available?: boolean;
}

/** 悬浮窗模式 */
export type FloatingWindowMode = 'auto' | 'manual'

/** 悬浮窗配置 */
export interface FloatingWindowConfig {
  /** 是否启用悬浮窗 */
  enabled: boolean;
  /** 悬浮窗模式：auto（鼠标移出自动切换） 或 manual（手动） */
  mode: FloatingWindowMode;
  /** 鼠标移到悬浮窗时是否自动展开主窗口 */
  expandOnHover: boolean;
  /** 鼠标移出主窗口后切换到悬浮窗的延迟时长（毫秒），默认 500 */
  collapseDelay: number;
}

/** 应用配置 */
export interface Config {
  /** 当前选择的引擎 */
  defaultEngine: EngineId;
  /** Claude Code 引擎配置 */
  claudeCode: {
    /** Claude CLI 命令路径 */
    cliPath: string;
  };
  /** IFlow 引擎配置 */
  iflow: {
    /** IFlow CLI 命令路径 */
    cliPath?: string;
  };
  /** OpenAI 兼容引擎配置 */
  openaiCompat?: OpenAICompatEngineConfig;
  /** 工作目录 */
  workDir?: string;
  /** 会话保存路径 */
  sessionDir?: string;
  /** Git 二进制路径 (Windows) */
  gitBinPath?: string;
  /** 悬浮窗配置 */
  floatingWindow: FloatingWindowConfig;
}

/** 健康状态 */
export interface HealthStatus {
  /** Claude CLI 是否可用 */
  claudeAvailable: boolean;
  /** Claude 版本 */
  claudeVersion?: string;
  /** IFlow CLI 是否可用 */
  iflowAvailable?: boolean;
  /** IFlow 版本 */
  iflowVersion?: string;
  /** 工作目录 */
  workDir?: string;
  /** 配置是否有效 */
  configValid: boolean;
  /** OpenAI API 是否可用 */
  openaiAvailable?: boolean;
  /** OpenAI 模型名称 */
  openaiModel?: string;
}

/**
 * OpenAI 兼容引擎预设
 */
export type OpenAIPreset =
  | 'openai-gpt4o'
  | 'deepseek-coder'
  | 'deepseek-chat'
  | 'openrouter'
  | 'custom'

/**
 * OpenAI 兼容引擎配置
 */
export interface OpenAICompatEngineConfig {
  /** 当前选择的预设 */
  preset: OpenAIPreset
  /** API 密钥 */
  apiKey: string
  /** 自定义配置（当 preset 为 'custom' 时使用） */
  customConfig?: {
    /** API 基础 URL */
    baseURL?: string
    /** 模型名称 */
    model?: string
    /** 生成温度 */
    temperature?: number
    /** 最大 Tokens */
    maxTokens?: number
  }
}
