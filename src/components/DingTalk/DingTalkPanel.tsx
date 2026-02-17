/**
 * 钉钉消息面板主组件
 */

import { useEffect, useState } from 'react';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { useDingTalkStore } from '../../stores/dingtalkStore';
import { useConfigStore } from '../../stores/configStore';
import { Button } from '../Common';

export function DingTalkPanel() {
  const {
    messages,
    isServiceRunning,
    serviceStatus,
    loading,
    error,
    initialize,
    startService,
    stopService,
    sendMessage,
    clearMessages,
  } = useDingTalkStore();

  const { config } = useConfigStore();
  const [initialized, setInitialized] = useState(false);

  // 初始化事件监听
  useEffect(() => {
    if (!initialized && config?.dingtalk?.enabled) {
      initialize();
      setInitialized(true);
    }
  }, [initialized, config?.dingtalk?.enabled, initialize]);

  const handleStartService = async () => {
    await startService();
  };

  const handleStopService = async () => {
    await stopService();
  };

  const handleSendMessage = async (content: string, conversationId: string) => {
    await sendMessage(content, conversationId);
  };

  const handleClearMessages = () => {
    if (confirm('确定要清空所有消息吗?')) {
      clearMessages();
    }
  };

  // 配置未完成
  if (
    !config?.dingtalk?.enabled ||
    !config.dingtalk.appKey ||
    !config.dingtalk.appSecret
  ) {
    return (
      <div className="flex flex-col h-full">
        {/* 顶部工具栏 */}
        <div className="flex items-center justify-between px-4 py-3 bg-background-elevated border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <svg
              className="w-5 h-5 text-primary"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
            </svg>
            <h2 className="font-semibold text-text-primary">钉钉消息</h2>
          </div>
        </div>

        {/* 配置提示 */}
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <svg
              className="mx-auto h-16 w-16 mb-4 text-text-tertiary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>

            <h3 className="text-lg font-semibold text-text-primary mb-2">
              钉钉集成未配置
            </h3>
            <p className="text-sm text-text-secondary mb-6">
              请在设置中配置钉钉应用的 AppKey 和 AppSecret
            </p>

            <Button
              onClick={() => {
                // 打开设置页面的逻辑
                window.dispatchEvent(new CustomEvent('open-settings'));
              }}
              variant="primary"
            >
              前往设置
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between px-4 py-3 bg-background-elevated border-b border-border-subtle">
        <div className="flex items-center gap-3">
          <svg
            className="w-5 h-5 text-primary"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
          </svg>

          <h2 className="font-semibold text-text-primary">钉钉消息</h2>

          {/* 服务状态指示器 */}
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                isServiceRunning ? 'bg-success' : 'bg-warning'
              }`}
            />
            <span className="text-xs text-text-secondary">
              {isServiceRunning ? '已连接' : '未连接'}
            </span>
            {serviceStatus?.port && (
              <span className="text-xs text-text-tertiary">
                :{serviceStatus.port}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* 服务控制按钮 */}
          {isServiceRunning ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={handleStopService}
              disabled={loading}
            >
              停止服务
            </Button>
          ) : (
            <Button
              size="sm"
              variant="primary"
              onClick={handleStartService}
              disabled={loading}
            >
              启动服务
            </Button>
          )}

          {/* 清空消息按钮 */}
          <Button
            size="sm"
            variant="ghost"
            onClick={handleClearMessages}
            disabled={messages.length === 0}
            title="清空消息"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </Button>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mx-4 mt-4 p-3 bg-danger-faint border border-danger/30 rounded-xl text-danger text-sm">
          {error}
        </div>
      )}

      {/* 消息列表 */}
      <MessageList messages={messages} />

      {/* 消息输入框 */}
      <MessageInput
        onSend={handleSendMessage}
        disabled={!isServiceRunning}
        defaultConversationId={config?.dingtalk?.testConversationId}
        loading={loading}
      />
    </div>
  );
}
