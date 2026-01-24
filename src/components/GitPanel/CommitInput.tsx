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
  hasChanges: boolean
}

export function CommitInput({ hasChanges }: CommitInputProps) {
  const [message, setMessage] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const { commitChanges, isLoading } = useGitStore()
  const getCurrentWorkspace = useWorkspaceStore((s) => s.getCurrentWorkspace)

  const handleGenerate = async () => {
    const currentWorkspace = getCurrentWorkspace()
    if (!currentWorkspace) return

    setIsGenerating(true)
    try {
      const generated = await generateCommitMessage(currentWorkspace.path)
      setMessage(generated)
    } catch (err) {
      console.error('AI 生成失败:', err)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleCommit = async () => {
    const currentWorkspace = getCurrentWorkspace()
    if (!message.trim() || !currentWorkspace) return

    try {
      await commitChanges(currentWorkspace.path, message, true)
      setMessage('')
    } catch (err) {
      console.error('提交失败:', err)
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
