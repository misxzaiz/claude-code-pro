/**
 * 钉钉服务 API
 */

import * as tauri from './tauri';

/**
 * 启动钉钉服务
 */
export async function startDingTalkService(): Promise<void> {
  return tauri.invoke('start_dingtalk_service');
}

/**
 * 停止钉钉服务
 */
export async function stopDingTalkService(): Promise<void> {
  return tauri.invoke('stop_dingtalk_service');
}

/**
 * 发送钉钉消息
 */
export async function sendDingTalkMessage(
  content: string,
  conversationId: string
): Promise<void> {
  return tauri.invoke('send_dingtalk_message', {
    content,
    conversationId,
  });
}

/**
 * 检查钉钉服务是否运行
 */
export async function isDingTalkServiceRunning(): Promise<boolean> {
  return tauri.invoke('is_dingtalk_service_running');
}

/**
 * 获取钉钉服务状态
 */
export async function getDingTalkServiceStatus(): Promise<{
  isRunning: boolean;
  pid?: number;
  port?: number;
  error?: string;
}> {
  return tauri.invoke('get_dingtalk_service_status');
}

/**
 * 测试钉钉连接
 */
export async function testDingTalkConnection(
  testMessage: string,
  conversationId: string
): Promise<string> {
  return tauri.invoke('test_dingtalk_connection', {
    testMessage,
    conversationId,
  });
}

/**
 * 监听钉钉消息
 */
export async function listenDingTalkMessages(
  callback: (message: {
    conversationId: string;
    senderName: string;
    content: string;
    msgType: string;
  }) => void
): Promise<() => void> {
  const unlisten = await tauri.listen('dingtalk:message', (event: any) => {
    callback(event.payload);
  });

  return unlisten;
}

/**
 * 监听钉钉服务状态变化
 */
export async function listenDingTalkStatus(
  callback: (status: {
    isRunning: boolean;
    pid?: number;
    port?: number;
    error?: string;
  }) => void
): Promise<() => void> {
  const unlisten = await tauri.listen('dingtalk:status', (event: any) => {
    callback(event.payload);
  });

  return unlisten;
}

/**
 * 监听钉钉错误
 */
export async function listenDingTalkErrors(
  callback: (error: string) => void
): Promise<() => void> {
  const unlisten = await tauri.listen('dingtalk:error', (event: any) => {
    callback(event.payload);
  });

  return unlisten;
}
