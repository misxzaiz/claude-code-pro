/**
 * 快捷操作组件
 *
 * 常用 Git 操作按钮
 */

import { Upload, GitPullRequest } from 'lucide-react'
import { Button } from '@/components/Common/Button'
import { useGitStore } from '@/stores/gitStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'

interface QuickActionsProps {
  hasChanges: boolean
}

export function QuickActions({ hasChanges: _hasChanges }: QuickActionsProps) {
  const { pushBranch, isLoading } = useGitStore()
  const currentWorkspace = useWorkspaceStore((s) => s.getCurrentWorkspace())
  const { status } = useGitStore()

  const handlePush = async () => {
    if (!currentWorkspace || !status?.branch) return

    try {
      await pushBranch(currentWorkspace.path, status.branch, 'origin', false)
    } catch (err) {
      console.error('推送失败:', err)
    }
  }

  const handleCreatePR = () => {
    // TODO: 打开 PR 创建对话框
    console.log('创建 PR - 功能待实现')
  }

  return (
    <div className="px-4 py-3 border-t border-border-subtle">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={handlePush}
          disabled={isLoading || !currentWorkspace || !status?.branch}
          className="flex-1"
        >
          <Upload size={14} />
          推送
        </Button>

        <Button
          size="sm"
          variant="secondary"
          onClick={handleCreatePR}
          disabled={isLoading || !currentWorkspace}
          className="flex-1"
        >
          <GitPullRequest size={14} />
          创建 PR
        </Button>
      </div>
    </div>
  )
}
