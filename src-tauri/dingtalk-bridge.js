#!/usr/bin/env node
/**
 * 钉钉桥接服务 - 连接 Polaris (Tauri) 和 message-middleware
 *
 * 功能：
 * - 作为 Polaris Subscriber 集成到 message-middleware
 * - 接收钉钉消息 → 通过 stdout 转发给 Rust 后端
 * - 接收 Rust 指令（通过 stdin）→ 发送到钉钉
 */

const { MessageMiddleware, DingTalkAdapter } = require('@your-org/message-middleware');

// 从命令行参数读取配置
const args = process.argv.slice(2);

const getAppKey = () => {
  const idx = args.indexOf('--app-key');
  return idx >= 0 ? args[idx + 1] : process.env.DINGTALK_APP_KEY;
};

const getAppSecret = () => {
  const idx = args.indexOf('--app-secret');
  return idx >= 0 ? args[idx + 1] : process.env.DINGTALK_APP_SECRET;
};

/**
 * Polaris 订阅者 - 接收钉钉消息并转发给 Polaris
 */
class PolarisSubscriber {
  constructor(sendToPolaris) {
    this.id = 'polaris-subscriber';
    this.name = 'Polaris Subscriber';
    this.sendToPolaris = sendToPolaris;
    // 消息去重缓存
    this.processedMessages = new Set();
    // 最大缓存数量
    this.maxCacheSize = 1000;
  }

  /**
   * 判断是否应该处理此消息
   */
  async canHandle(message) {
    // 只处理 @机器人的消息，或者没有明确提及的消息
    return message.metadata?.isMentioned !== false;
  }

  /**
   * 处理接收到的消息
   */
  async onMessage(message) {
    // 消息去重
    if (this.processedMessages.has(message.id)) {
      console.error(`[PolarisSubscriber] 跳过重复消息: ${message.id}`);
      return null;
    }

    this.processedMessages.add(message.id);

    // 清理旧缓存（保留最近的 maxCacheSize 条）
    if (this.processedMessages.size > this.maxCacheSize) {
      const first = this.processedMessages.values().next().value;
      this.processedMessages.delete(first);
    }

    // 将钉钉消息转发给 Polaris (通过 stdout)
    this.sendToPolaris({
      conversationId: message.source.conversationId,
      senderName: message.source.senderName,
      content: message.content.text || '',
    });

    // 返回 null 表示我们不直接回复，而是等待 Polaris 的 AI 处理
    return null;
  }
}

/**
 * 主函数
 */
async function main() {
  const appKey = getAppKey();
  const appSecret = getAppSecret();

  if (!appKey || !appSecret) {
    console.error('错误: 缺少钉钉凭证');
    console.error('请通过命令行参数 --app-key 和 --app-secret 提供，或设置环境变量 DINGTALK_APP_KEY 和 DINGTALK_APP_SECRET');
    process.exit(1);
  }

  console.error(`[钉钉桥接服务] AppKey: ${appKey.substring(0, 8)}...`);

  // 创建中间件
  const middleware = new MessageMiddleware({
    queue: {
      maxSize: 1000,
      retryTimes: 3,
    },
  });

  // 创建钉钉适配器
  const dingtalkAdapter = new DingTalkAdapter({
    clientId: appKey,
    clientSecret: appSecret,
  });

  // 创建 Polaris 订阅者
  const polarisSubscriber = new PolarisSubscriber((message) => {
    // 通过 stdout 发送给 Rust 后端
    process.stdout.write(JSON.stringify({
      type: 'message',
      data: message,
    }) + '\n');
  });

  // 添加订阅者
  middleware.addSubscriber(polarisSubscriber);

  // 注册适配器
  middleware.registerAdapter(dingtalkAdapter);

  // 监听来自 Polaris 的指令 (通过 stdin)
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (data) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      if (line.trim()) {
        try {
          const command = JSON.parse(line);

          if (command.type === 'send') {
            // 将 AI 回复发送到钉钉
            dingtalkAdapter.send({
              id: Date.now().toString(),
              timestamp: Date.now(),
              platform: 'dingtalk',
              source: {
                conversationId: command.conversationId,
                conversationType: 'group',
                senderId: 'polaris',
                senderName: 'Polaris AI',
              },
              content: {
                type: 'text',
                text: command.response,
              },
            }).catch(err => {
              console.error(`[钉钉桥接服务] 发送消息失败:`, err.message);
            });
          } else if (command.type === 'READY') {
            // 忽略 READY 信号
          } else {
            console.error(`[钉钉桥接服务] 未知命令类型: ${command.type}`);
          }
        } catch (e) {
          console.error(`[钉钉桥接服务] 解析指令失败:`, e.message);
        }
      }
    }
  });

  // 启动中间件
  try {
    await middleware.start();
    console.error('[钉钉桥接服务] 已启动，等待消息...');

    // 发送就绪状态
    process.stdout.write(JSON.stringify({
      type: 'status',
      data: {
        running: true,
        error: null,
      },
    }) + '\n');
  } catch (err) {
    console.error('[钉钉桥接服务] 启动失败:', err);

    // 发送错误状态
    process.stdout.write(JSON.stringify({
      type: 'status',
      data: {
        running: false,
        error: err.message,
      },
    }) + '\n');

    process.exit(1);
  }

  // 优雅退出
  process.on('SIGINT', async () => {
    console.error('[钉钉桥接服务] 收到 SIGINT，正在退出...');
    try {
      await middleware.stop();
    } catch (err) {
      console.error('[钉钉桥接服务] 停止失败:', err);
    }
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.error('[钉钉桥接服务] 收到 SIGTERM，正在退出...');
    try {
      await middleware.stop();
    } catch (err) {
      console.error('[钉钉桥接服务] 停止失败:', err);
    }
    process.exit(0);
  });
}

// 运行主函数
main().catch(err => {
  console.error('[钉钉桥接服务] 致命错误:', err);
  process.exit(1);
});
