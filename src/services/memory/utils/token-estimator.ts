/**
 * Token 估算器
 * 优化 token 计算，考虑工具调用
 *
 * @author Polaris Team
 * @since 2026-02-02
 */

import type { ChatMessage, AssistantChatMessage, ToolChatMessage, ToolGroupChatMessage } from '@/types'

/**
 * 估算单个消息的 token 数量
 */
export function estimateMessageTokens(msg: ChatMessage): number {
  let contentLength = 0

  switch (msg.type) {
    case 'user':
      contentLength = msg.content.length
      break

    case 'assistant':
      // blocks 内容
      contentLength = (msg as AssistantChatMessage).blocks.reduce((sum, block) => {
        if (block.type === 'text') {
          return sum + (block as any).content.length
        } else if (block.type === 'tool_call') {
          // 工具调用也需要 token
          return sum + 100 // 估算值
        }
        return sum
      }, 0)
      break

    case 'system':
      contentLength = msg.content.length
      break

    case 'tool': {
      const toolMsg = msg as ToolChatMessage
      // input 和 output 可能很大
      const inputLength = toolMsg.input
        ? JSON.stringify(toolMsg.input).length
        : 0
      const outputLength = toolMsg.output?.length || 0
      contentLength = inputLength + outputLength
      break
    }

    case 'tool_group': {
      // 工具组消息的 summary 通常较短
      contentLength = (msg as ToolGroupChatMessage).summary?.length || 100
      break
    }

    default:
      contentLength = 100
  }

  // 估算规则：
  // - 中文：1 字 ≈ 1.5 tokens
  // - 英文：1 词 ≈ 1 token
  // - 代码：1 字符 ≈ 0.3 tokens
  const chineseRatio = 0.5 // 假设 50% 是中文
  return Math.ceil(contentLength * (chineseRatio * 1.5 + (1 - chineseRatio) * 0.5))
}

/**
 * 估算消息列表的总 token 数量
 */
export function estimateTotalTokens(messages: ChatMessage[]): number {
  return messages.reduce((total, msg) => total + estimateMessageTokens(msg), 0)
}

/**
 * 估算文本的 token 数量
 */
export function estimateTextTokens(text: string): number {
  if (!text) return 0

  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length
  const otherChars = text.length - chineseChars

  return Math.ceil(chineseChars * 1.5 + otherChars * 0.5)
}
