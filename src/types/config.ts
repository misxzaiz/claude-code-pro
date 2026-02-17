/**
 * 配置相关类型定义
 */

/**  引擎 ID */
export type EngineId = 'claude-code' | 'iflow' | 'deepseek' | 'deepseek'

/** 支持的语言 */
export type Language = 'zh-CN' | 'en-US'

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
  /** API Key (用于 DeepSeek) */
  apiKey?: string;
  /** API Base URL (用于 DeepSeek) */
  apiBase?: string;
  /** 模型名称 (用于 DeepSeek) */
  model?: 'deepseek-chat' | 'deepseek-coder' | 'deepseek-reasoner';
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

/** 百度翻译配置 */
export interface BaiduTranslateConfig {
  /** 百度翻译 App ID */
  appId: string;
  /** 百度翻译密钥 */
  secretKey: string;
}

/** 钉钉集成配置 */
export interface DingTalkConfig {
  /** 是否启用钉钉集成 */
  enabled: boolean;
  /** 钉钉应用的 AppKey */
  appKey: string;
  /** 钉钉应用的 AppSecret */
  appSecret: string;
  /** 测试群会话 ID (用于测试连接) */
  testConversationId: string;
  /** Webhook 服务器端口 (用于接收钉钉消息) */
  webhookPort: number;
}

/** 应用配置 */
export interface Config {
  /** 当前选择的引擎 */
  defaultEngine: EngineId;
  /** 界面语言 */
  language?: Language;
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
  /** DeepSeek 引擎配置 */
  deepseek: {
    /** API Key */
    apiKey: string;
    /** API Base URL (可选) */
    apiBase?: string;
    /** 模型选择 */
    model?: 'deepseek-chat' | 'deepseek-coder' | 'deepseek-reasoner';
    /** 温度参数 (可选) */
    temperature?: number;
    /** 最大 Token 数 (可选) */
    maxTokens?: number;
  };
  /** 工作目录 */
  workDir?: string;
  /** 会话保存路径 */
  sessionDir?: string;
  /** Git 二进制路径 (Windows) */
  gitBinPath?: string;
  /** 悬浮窗配置 */
  floatingWindow: FloatingWindowConfig;
  /** 百度翻译配置 */
  baiduTranslate?: BaiduTranslateConfig;
  /** 钉钉集成配置 */
  dingtalk: DingTalkConfig;
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
  /** DeepSeek API 是否可用 */
  deepseekAvailable?: boolean;
  /** DeepSeek API Key 是否配置 */
  deepseekConfigured?: boolean;
  /** 工作目录 */
  workDir?: string;
  /** 配置是否有效 */
  configValid: boolean;
}
