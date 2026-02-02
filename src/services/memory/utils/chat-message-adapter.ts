/**
 * ChatMessage 适配器
 * 处理 5 种消息类型的内容提取和转换
 *
 * @author Polaris Team
 * @since 2026-02-02
 */

import type { ChatMessage, ToolChatMessage, ToolGroupChatMessage, AssistantChatMessage } from '@/types'

/**
 * 从消息中提取纯文本内容
 */
export function extractContentFromMessage(msg: ChatMessage): string {
  switch (msg.type) {
    case 'user':
      return msg.content

    case 'assistant':
      // blocks 是必填字段
      return (msg as AssistantChatMessage).blocks
        .filter(block => block.type === 'text')
        .map(block => (block as any).content)
        .join('\n')

    case 'system':
      return msg.content

    case 'tool': {
      const toolMsg = msg as ToolChatMessage
      const parts: string[] = []

      // 工具名称和状态
      parts.push(`[工具: ${toolMsg.toolName}]`)
      parts.push(`状态: ${toolMsg.status}`)

      // 输入参数
      if (toolMsg.input) {
        parts.push('输入:')
        parts.push(JSON.stringify(toolMsg.input, null, 2))
      }

      // 输出结果
      if (toolMsg.output) {
        // 截断过长的输出
        const output = toolMsg.output.length > 500
          ? toolMsg.output.substring(0, 500) + '\n...(内容过长，已截断)'
          : toolMsg.output
        parts.push('输出:')
        parts.push(output)
      }

      // 错误信息
      if (toolMsg.error) {
        parts.push('错误:')
        parts.push(toolMsg.error)
      }

      return parts.join('\n')
    }

    case 'tool_group': {
      const groupMsg = msg as ToolGroupChatMessage
      const parts: string[] = []

      parts.push(`[工具组: ${groupMsg.toolNames.join(', ')}]`)
      parts.push(`状态: ${groupMsg.status}`)
      parts.push(`摘要: ${groupMsg.summary}`)

      if (groupMsg.duration) {
        parts.push(`耗时: ${groupMsg.duration}ms`)
      }

      return parts.join('\n')
    }

    default:
      return ''
  }
}

/**
 * 格式化消息为可读文本（用于摘要提示词）
 */
export function formatMessagesForSummary(messages: ChatMessage[]): string {
  return messages
    .map((msg, index) => {
      const timestamp = new Date(msg.timestamp).toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
      })

      const role = getRoleLabel(msg.type)
      const content = extractContentFromMessage(msg)

      // 限制单条消息长度
      const maxLength = 1000
      const truncatedContent = content.length > maxLength
        ? content.substring(0, maxLength) + '\n...(内容过长，已截断)'
        : content

      return `[${index + 1}] ${timestamp} ${role}:\n${truncatedContent}`
    })
    .join('\n\n---\n\n')
}

/**
 * 获取角色标签
 */
function getRoleLabel(type: ChatMessage['type']): string {
  switch (type) {
    case 'user': return '用户'
    case 'assistant': return '助手'
    case 'system': return '系统'
    case 'tool': return '工具'
    case 'tool_group': return '工具组'
    default: return '未知'
  }
}

/**
 * 检测消息列表的主要语言
 */
export function detectLanguage(messages: ChatMessage[]): 'zh' | 'en' {
  const allText = messages.map(m => extractContentFromMessage(m)).join(' ')
  const chineseChars = (allText.match(/[\u4e00-\u9fa5]/g) || []).length
  const ratio = allText.length > 0 ? chineseChars / allText.length : 0

  // 中文字符占比超过 30% 则认为是中文
  return ratio > 0.3 ? 'zh' : 'en'
}

/**
 * 转换数据库消息为 ChatMessage
 * TODO: 需要根据实际的数据库消息格式实现
 */
export function dbMsgToChatMessage(dbMsg: any): ChatMessage {
  // 这个函数需要根据实际的数据库消息格式实现
  // 参考 eventChatStore 中的转换逻辑
  console.warn('[dbMsgToChatMessage] 需要实现数据库消息到 ChatMessage 的转换')

  // 临时实现：返回一个基本的用户消息
  return {
    id: dbMsg.id,
    type: 'user',
    content: dbMsg.content || '',
    timestamp: dbMsg.timestamp || new Date().toISOString(),
  }
}
