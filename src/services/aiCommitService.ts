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

  // 检查 Git 状态
  const status = gitStore.status
  if (!status) {
    throw new Error('无法获取 Git 状态，请确保这是 Git 仓库')
  }

  // 合并所有变更（已暂存 + 未暂存 + 未跟踪）
  const allChanges = [
    ...status.staged.map(f => ({ ...f, source: 'staged' })),
    ...status.unstaged.map(f => ({ ...f, source: 'unstaged' })),
    ...status.untracked.map(f => ({ path: f, status: 'untracked', source: 'unstaged' }))
  ]

  if (allChanges.length === 0) {
    throw new Error('没有文件变更')
  }

  console.log('[AI Commit] 检测到变更文件数:', allChanges.length)

  // 生成变更摘要（使用 git status 数据，快速）
  const summary = allChanges
    .slice(0, 10)
    .map((f) => {
      const typeMap: Record<string, string> = {
        added: '新增',
        deleted: '删除',
        modified: '修改',
        renamed: '重命名',
        copied: '复制',
        untracked: '未跟踪',
      }
      const statusText = typeMap[f.status] || '未知'
      return `- ${f.path}: ${statusText}`
    })
    .join('\n')

  // 可选：获取详细的 diff 信息（仅在变更文件少时）
  let fileInfo = ''

  if (allChanges.length <= 5 && gitStore.worktreeDiffs.length === 0) {
    console.log('[AI Commit] 变更文件较少，获取详细 diff 信息')
    try {
      await gitStore.getWorktreeDiff(workspacePath)
    } catch (err) {
      console.warn('[AI Commit] 获取 diff 失败，使用基础信息:', err)
    }

    const diffs = gitStore.worktreeDiffs
    if (diffs.length > 0) {
      fileInfo = '\n\n**详细变更：**\n' + diffs
        .slice(0, 3)
        .map((d) => {
          if (d.oldContent && d.newContent) {
            // 有内容的文件，显示简要信息
            const oldLines = d.oldContent.split('\n').length
            const newLines = d.newContent.split('\n').length
            return `--- ${d.filePath} (${oldLines} → ${newLines} 行)`
          }
          return `- ${d.filePath}: ${d.changeType}`
        })
        .join('\n')
    }
  }

  // 构建提示词
  const prompt = `请为以下 Git 变更生成一个简洁的提交消息。

**文件变更：**
${summary}
${fileInfo}

**要求：**
1. 使用中文
2. 遵循约定式提交格式：type(scope): subject
   - type: feat, fix, docs, style, refactor, test, chore
   - scope: 可选，影响的模块或功能
   - subject: 简短描述（不超过 50 字符）
3. 如果有多个文件，概括主要变更
4. 只返回提交消息，不要其他说明

**只返回提交消息内容，不要其他说明。**`

  console.log('[AI Commit] 准备调用 AI，提示词长度:', prompt.length)

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

  console.log('[AI Commit] AI 返回:', commitMessage)

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
