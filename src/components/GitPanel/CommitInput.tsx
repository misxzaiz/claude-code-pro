/**
 * 提交输入组件
 *
 * 输入提交消息，支持 AI 生成
 */

import { useState } from 'react'
import { Sparkles, Send } from 'lucide-react'
import { Button } from '@/components/Common/Button'
import { useGitStore } from '@/stores/gitStore'
import { useWorkspaceStore } from '@/stores'
import { generateCommitMessage } from '@/services/aiCommitService'

interface CommitInputProps {
  hasChanges?: boolean
}

export function CommitInput({ hasChanges: _hasChanges }: CommitInputProps) {
  const [message, setMessage] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const { commitChanges, isLoading } = useGitStore()
  // 直接获取当前工作区，与 GitPanel 等其他组件保持一致
  const currentWorkspace = useWorkspaceStore((s) => s.getCurrentWorkspace())

  const handleGenerate = async () => {
    if (!currentWorkspace) return

    // 验证工作区路径
    if (!currentWorkspace.path || currentWorkspace.path.trim() === '') {
      console.error('[CommitInput] AI 生成: 无效的工作区路径', {
        currentWorkspace: {
          id: currentWorkspace.id,
          name: currentWorkspace.name,
          path: currentWorkspace.path,
        }
      })
      return
    }

    setIsGenerating(true)
    try {
      console.log('[CommitInput] 开始 AI 生成提交消息', {
        workspace: currentWorkspace.name,
        path: currentWorkspace.path,
      })
      const generated = await generateCommitMessage(currentWorkspace.path)
      setMessage(generated)
    } catch (err) {
      console.error('[CommitInput] AI 生成失败:', err)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleCommit = async () => {
    if (!message.trim() || !currentWorkspace) return

    // 验证工作区路径
    if (!currentWorkspace.path || currentWorkspace.path.trim() === '') {
      console.error('[CommitInput] 无效的工作区路径', {
        currentWorkspace: {
          id: currentWorkspace.id,
          name: currentWorkspace.name,
          path: currentWorkspace.path,
        }
      })
      return
    }

    // Windows 保留名称检查
    const reservedNames = ['nul', 'con', 'prn', 'aux', 'com1', 'com2', 'com3', 'com4', 'lpt1', 'lpt2', 'lpt3']
    const pathLower = currentWorkspace.path.toLowerCase()
    if (reservedNames.some(name => pathLower.includes(name))) {
      console.error('[CommitInput] 路径包含 Windows 保留名称', {
        path: currentWorkspace.path,
      })
      return
    }

    try {
      console.log('[CommitInput] 准备提交', {
        workspace: currentWorkspace.name,
        path: currentWorkspace.path,
        message: message.trim(),
      })
      await commitChanges(currentWorkspace.path, message, true)
      setMessage('')
    } catch (err) {
      console.error('[CommitInput] 提交失败:', err)
    }
  }

  return (
    <div className="px-4 py-3 border-t border-border-subtle space-y-2">
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="输入提交消息..."
        className="w-full px-3 py-2 text-sm bg-background-surface border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary resize-none"
        rows={2}
        disabled={isLoading}
      />

      <div className="flex items-center justify-between gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={handleGenerate}
          disabled={isGenerating || isLoading || !currentWorkspace}
        >
          <Sparkles size={14} className={isGenerating ? 'animate-spin' : ''} />
          AI 生成
        </Button>

        <Button
          size="sm"
          variant="primary"
          onClick={handleCommit}
          disabled={!message.trim() || isLoading}
        >
          <Send size={14} />
          提交
        </Button>
      </div>
    </div>
  )
}
