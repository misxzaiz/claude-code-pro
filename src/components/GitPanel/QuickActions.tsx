/**
 * 快捷操作组件
 *
 * 常用 Git 操作按钮
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, Download, RefreshCw, GitPullRequest } from 'lucide-react'
import { Button } from '@/components/Common/Button'
import { useGitStore } from '@/stores/gitStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { invoke } from '@tauri-apps/api/core'

interface QuickActionsProps {
  hasChanges: boolean
}

export function QuickActions({ hasChanges: _hasChanges }: QuickActionsProps) {
  const { t } = useTranslation('git')
  const { pushBranch, isLoading, refreshStatus } = useGitStore()
  const currentWorkspace = useWorkspaceStore((s) => s.getCurrentWorkspace())
  const { status } = useGitStore()

  const [isPushing, setIsPushing] = useState(false)
  const [isPulling, setIsPulling] = useState(false)

  const handlePush = async () => {
    if (!currentWorkspace || !status?.branch) return

    setIsPushing(true)
    try {
      await pushBranch(currentWorkspace.path, status.branch, 'origin', false)
    } catch (err) {
      console.error('Push failed:', err)
    } finally {
      setIsPushing(false)
    }
  }

  const handlePull = async () => {
    if (!currentWorkspace) return

    setIsPulling(true)
    try {
      await invoke('git_pull', {
        workspacePath: currentWorkspace.path,
        remoteName: 'origin',
        branchName: status?.branch || null,
      })
      await refreshStatus(currentWorkspace.path)
    } catch (err) {
      console.error('Pull failed:', err)
    } finally {
      setIsPulling(false)
    }
  }

  const handleRefresh = () => {
    if (currentWorkspace) {
      refreshStatus(currentWorkspace.path)
    }
  }

  const handleCreatePR = () => {
    console.log('Create PR - TODO')
  }

  const isOperating = isLoading || isPushing || isPulling

  return (
    <div className="px-4 py-3 border-t border-border-subtle">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={handleRefresh}
          disabled={isOperating}
          className="px-2"
          title={t('refreshStatus')}
        >
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
        </Button>

        <Button
          size="sm"
          variant="secondary"
          onClick={handlePull}
          disabled={isOperating || !currentWorkspace}
          className="flex-1"
        >
          <Download size={14} />
          {t('actions.pull')}
        </Button>

        <Button
          size="sm"
          variant="secondary"
          onClick={handlePush}
          disabled={isOperating || !currentWorkspace || !status?.branch}
          className="flex-1"
        >
          <Upload size={14} />
          {t('actions.push')}
        </Button>
      </div>
    </div>
  )
}
