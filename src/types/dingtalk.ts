/**
 * 钉钉相关类型定义
 */

/**
 * 钉钉配置
 */
export interface DingTalkConfig {
  /** 是否启用钉钉集成 */
  enabled: boolean;
  /** 钉钉应用的 AppKey */
  appKey: string;
  /** 钉钉应用的 AppSecret */
  appSecret: string;
  /** 测试群会话 ID */
  testConversationId: string;
  /** Webhook 服务器端口 (用于接收钉钉消息) */
  webhookPort: number;
}

/**
 * 钉钉消息方向
 */
export type MessageDirection = 'inbound' | 'outbound';

/**
 * 钉钉消息状态
 */
export type MessageStatus = 'pending' | 'sent' | 'failed';

/**
 * 钉钉消息
 */
export interface DingTalkMessage {
  /** 消息唯一 ID */
  id: string;
  /** 会话 ID (群聊或单聊) */
  conversationId: string;
  /** 发送者名称 */
  senderName: string;
  /** 消息内容 */
  content: string;
  /** 时间戳 */
  timestamp: number;
  /** 消息方向 */
  direction: MessageDirection;
  /** 消息状态 (仅对发送消息有效) */
  status?: MessageStatus;
  /** 错误信息 (如果发送失败) */
  error?: string;
}

/**
 * 钉钉服务状态
 */
export interface DingTalkServiceStatus {
  /** 服务是否运行中 */
  isRunning: boolean;
  /** 进程 ID */
  pid?: number;
  /** 端口号 */
  port?: number;
  /** 错误信息 */
  error?: string;
}

/**
 * 钉钉事件负载 (从 Rust 发送到前端)
 */
export interface DingTalkEventPayload {
  type: 'message' | 'error' | 'status';
  data: DingTalkMessage | string | DingTalkServiceStatus;
}
