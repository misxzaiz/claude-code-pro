/**
 * 摘要提示词生成
 * 支持中英文双语
 *
 * @author Polaris Team
 * @since 2026-02-02
 */

import type { ChatMessage } from '@/types'
import type { CompressionConfig } from '../types'
import { formatMessagesForSummary } from '../utils/chat-message-adapter'

/**
 * 生成摘要提示词
 */
export function generateSummaryPrompt(
  messages: ChatMessage[],
  config: CompressionConfig,
  language: 'zh' | 'en'
): string {
  const prompts = {
    zh: {
      system: getSystemPrompt('zh'),
      user: getUserPrompt(messages, config, 'zh'),
    },
    en: {
      system: getSystemPrompt('en'),
      user: getUserPrompt(messages, config, 'en'),
    },
  }

  return `${prompts[language].system}\n\n${prompts[language].user}`
}

/**
 * 获取系统提示词
 */
function getSystemPrompt(language: 'zh' | 'en'): string {
  if (language === 'zh') {
    return `你是一个专业的对话摘要专家。你的任务是将一段长对话压缩为精炼的摘要。

# 要求
1. 准确性：必须保留所有关键信息，不能遗漏重要内容
2. 简洁性：用最少的话表达完整的意思
3. 结构化：使用清晰的层次结构（问题 → 解决方案 → 结果）
4. 可读性：使用自然语言，避免技术术语（除非必要）

# 输出格式
你的输出必须是有效的 JSON 格式：
{
  "summary": "摘要内容（100-300字）",
  "keyPoints": ["关键点1", "关键点2", "关键点3", "关键点4", "关键点5"]
}

# 摘要结构建议
- 开头：一句话总结对话主题
- 中间：按时间顺序描述主要交互
- 结尾：最终结果或待办事项

# 关键点提取建议
- 用户的问题或需求
- 提供的解决方案或建议
- 重要的决策点
- 生成的代码或配置
- 遇到的错误和解决方法
- 待办事项或下一步计划`
  } else {
    return `You are a professional conversation summarizer. Your task is to compress a long conversation into a concise summary.

# Requirements
1. Accuracy: Preserve all key information without omissions
2. Conciseness: Express complete ideas with minimal words
3. Structure: Use clear hierarchy (Problem → Solution → Result)
4. Readability: Use natural language, avoid jargon (unless necessary)

# Output Format
Your output must be valid JSON format:
{
  "summary": "Summary content (50-150 words)",
  "keyPoints": ["Key point 1", "Key point 2", "Key point 3", "Key point 4", "Key point 5"]
}

# Summary Structure
- Opening: One sentence summarizing the conversation topic
- Middle: Describe main interactions in chronological order
- Ending: Final result or next steps

# Key Points Extraction
- User's questions or requirements
- Solutions or suggestions provided
- Important decision points
- Generated code or configuration
- Errors encountered and fixes
- Action items or next steps`
  }
}

/**
 * 获取用户提示词
 */
function getUserPrompt(
  messages: ChatMessage[],
  config: CompressionConfig,
  language: 'zh' | 'en'
): string {
  const formattedMessages = formatMessagesForSummary(messages)

  if (language === 'zh') {
    return `请将以下对话压缩为摘要：

# 对话内容
${formattedMessages}

# 限制条件
- 摘要长度：${config.minSummaryLength}-${config.maxSummaryLength} 字
- 关键点数量：最多 ${config.maxKeyPoints} 个
- ${config.preserveTools ? '保留所有工具调用的关键信息' : '可以省略工具调用细节'}
- ${config.preserveErrors ? '保留所有错误信息和解决方案' : '可以省略错误信息'}

请输出 JSON 格式的摘要。`
  } else {
    return `Please summarize the following conversation:

# Conversation Content
${formattedMessages}

# Constraints
- Summary length: ${Math.floor(config.minSummaryLength / 2)}-${Math.floor(config.maxSummaryLength / 2)} words
- Key points: Maximum ${config.maxKeyPoints} items
- ${config.preserveTools ? 'Preserve key information from all tool calls' : 'Omit tool call details'}
- ${config.preserveErrors ? 'Preserve all error messages and solutions' : 'Omit error messages'}

Please output the summary in JSON format.`
  }
}
