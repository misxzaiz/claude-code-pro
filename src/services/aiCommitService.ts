/**
 * AI 辅助生成提交消息服务
 */

import { useGitStore } from '@/stores/gitStore'
import { executeAICommand } from '@/core/ai-command'

/**
 * 生成 Git 提交消息
 *
 * @param workspacePath 工作区路径
 * @returns 生成的提交消息
 */
export async function generateCommitMessage(workspacePath: string): Promise<string> {
  const gitStore = useGitStore.getState()
  const changedFiles = gitStore.getChangedFiles()

  if (changedFiles.length === 0) {
    throw new Error('没有文件变更')
  }

  // 获取变更摘要
  const diffs = gitStore.diffs.slice(0, 10) // 最多取前 10 个文件
  const summary = diffs
    .map((d) => {
      const typeMap = {
        added: '新增',
        deleted: '删除',
        modified: '修改',
        renamed: '重命名',
        copied: '复制',
      }
      return `- ${d.filePath}: ${typeMap[d.changeType]}`
    })
    .join('\n')

  // 使用 AI 执行
  const response = await executeAICommand({
    prompt,
    workspacePath,
    stream: false,
  })

  // 解析响应
  const content = typeof response === 'string' ? response : String(response)

  // 提取提交消息（移除可能的 markdown 代码块标记）
  let commitMessage = content
    .replace(/```[\s\S]*?```/g, '')
    .replace(/["'`]/g, '')
    .trim()

  // 移除可能的前缀说明文字
  commitMessage = commitMessage
    .replace(/^(这是|以下是|提交消息[:：])?\s*/i, '')
    .trim()

  if (!commitMessage) {
    throw new Error('AI 未能生成有效的提交消息')
  }

  return commitMessage
}

/**
 * 使用 AI 生成 PR 描述
 *
 * @param workspacePath 工作区路径
 * @param prTitle PR 标题
 * @returns 生成的 PR 描述
 */
export async function generatePRDescription(
  workspacePath: string,
  prTitle: string
): Promise<string> {
  const gitStore = useGitStore.getState()
  const diffs = gitStore.diffs

  if (diffs.length === 0) {
    throw new Error('没有文件变更')
  }

  // 构建变更摘要
  const changesSummary = diffs
    .slice(0, 20)
    .map((d) => {
      const stats = d.additions || d.deletions ? ` (+${d.additions || 0}, -${d.deletions || 0})` : ''
      return `- **${d.filePath}**: ${d.changeType}${stats}`
    })
    .join('\n')

  const prompt = `请为以下 Pull Request 生成描述。

**PR 标题：**
${prTitle}

**代码变更：**
${changesSummary}

**要求：**
1. 使用中文
2. 描述这次 PR 的主要变更内容
3. 如果有多个文件，按功能分组描述
4. 如果有关联的 issue，可以提及
5. 简洁清晰，便于 reviewer 理解

**只返回 PR 描述内容，不要其他说明。**`

  const response = await executeAICommand({
    prompt,
    workspacePath,
    stream: false,
  })

  const content = typeof response === 'string' ? response : String(response)

  // 清理响应
  let description = content
    .replace(/```[\s\S]*?```/g, '')
    .replace(/["'`]/g, '')
    .trim()

  description = description
    .replace(/^(这是|以下是|PR 描述[:：])?\s*/i, '')
    .trim()

  if (!description) {
    throw new Error('AI 未能生成有效的 PR 描述')
  }

  return description
}
