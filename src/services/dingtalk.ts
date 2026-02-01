/**
 * 钉钉服务 API
 * 提供前端与 Tauri 后端通信的接口
 */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

/**
 * 钉钉配置
 */
export interface DingTalkConfig {
  appKey: string;
  appSecret: string;
  enabled: boolean;
}

/**
 * 钉钉消息
 */
export interface DingTalkMessage {
  conversationId: string;
  senderName: string;
  content: string;
}

/**
 * 钉钉服务状态
 */
export interface DingTalkStatus {
  running: boolean;
  error?: string;
}

/**
 * 启动钉钉服务
 */
export async function startDingTalkService(config: DingTalkConfig): Promise<void> {
  return invoke('start_dingtalk_service', { config });
}

/**
 * 停止钉钉服务
 */
export async function stopDingTalkService(): Promise<void> {
  return invoke('stop_dingtalk_service');
}

/**
 * 发送消息到钉钉
 */
export async function sendDingTalkMessage(
  response: string,
  conversationId: string
): Promise<void> {
  return invoke('send_dingtalk_message', {
    response,
    conversationId,
  });
}

/**
 * 检查钉钉服务是否运行
 */
export async function isDingTalkServiceRunning(): Promise<boolean> {
  return invoke('is_dingtalk_service_running');
}

/**
 * 获取钉钉服务配置
 */
export async function getDingTalkConfig(): Promise<DingTalkConfig | null> {
  return invoke('get_dingtalk_config');
}

/**
 * 监听钉钉消息
 * @returns 返回取消监听的函数
 */
export function listenDingTalkMessages(
  callback: (message: DingTalkMessage) => void
): Promise<() => void> {
  return listen<DingTalkMessage>('dingtalk:message', (event) => {
    callback(event.payload);
  }).then(unlisten => () => {
    unlisten();
  });
}

/**
 * 监听钉钉服务状态变化
 * @returns 返回取消监听的函数
 */
export function listenDingTalkStatus(
  callback: (status: DingTalkStatus) => void
): Promise<() => void> {
  return listen<DingTalkStatus>('dingtalk:status', (event) => {
    callback(event.payload);
  }).then(unlisten => () => {
    unlisten();
  });
}
