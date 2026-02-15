/**
 * 快捷操作组件
 *
 * 常用 Git 操作按钮
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, Download, RefreshCw, AlertTriangle, GitBranch, ArrowUp, ArrowDown } from 'lucide-react'
import { Button } from '@/components/Common/Button'
import { useGitStore } from '@/stores/gitStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { invoke } from '@tauri-apps/api/core'

interface QuickActionsProps {
  hasChanges: boolean
}

type PushState = 
  | { type: 'idle' }
  | { type: 'confirming_upstream'; branch: string }
  | { type: 'confirming_force'; branch: string; error: string }
  | { type: 'pushing' }

type PullState = 
  | { type: 'idle' }
  | { type: 'confirming'; message: string }
  | { type: 'pulling' }

export function QuickActions({ hasChanges: _hasChanges }: QuickActionsProps) {
  const { t } = useTranslation('git')
  const { pushBranch, isLoading, refreshStatus, status, remotes, getRemotes } = useGitStore()
  const currentWorkspace = useWorkspaceStore((s) => s.getCurrentWorkspace())

  const [isPushing, setIsPushing] = useState(false)
  const [isPulling, setIsPulling] = useState(false)
  const [pushState, setPushState] = useState<PushState>({ type: 'idle' })
  const [pullState, setPullState] = useState<PullState>({ type: 'idle' })
  const [error, setError] = useState<string | null>(null)


  const handlePush = async () => {
    if (!currentWorkspace || !status?.branch) return

    setError(null)

    try {
      await getRemotes(currentWorkspace.path)
    } catch {
      // ignore
    }

    if (!remotes.some(r => r.name === 'origin')) {
      setError(t('errors.pushFailed') + ': No remote named "origin"')
      return
    }

    await doPush(status.branch, false)
  }

  const doPush = async (branch: string, force: boolean) => {
    if (!currentWorkspace) return

    setIsPushing(true)
    setPushState({ type: 'pushing' })
    setError(null)

    try {
      await pushBranch(currentWorkspace.path, branch, 'origin', force)
      setPushState({ type: 'idle' })
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      
      if (errorMsg.includes('rejected') || errorMsg.includes('non-fast-forward')) {
        setPushState({ type: 'confirming_force', branch, error: errorMsg })
      } else {
        setError(`${t('errors.pushFailed')}: ${errorMsg}`)
        setPushState({ type: 'idle' })
      }
    } finally {
      setIsPushing(false)
    }
  }

  const handleSetUpstreamAndPush = async () => {
    if (pushState.type !== 'confirming_upstream') return
    
    setIsPushing(true)
    try {
      await invoke('git_push_set_upstream', {
        workspacePath: currentWorkspace?.path,
        branchName: pushState.branch,
        remoteName: 'origin',
      })
      await refreshStatus(currentWorkspace?.path || '')
      setPushState({ type: 'idle' })
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      setError(`${t('errors.pushFailed')}: ${errorMsg}`)
    } finally {
      setIsPushing(false)
    }
  }

  const handleForcePush = async () => {
    if (pushState.type !== 'confirming_force') return
    await doPush(pushState.branch, true)
  }

  const handlePull = async () => {
    if (!currentWorkspace) return

    setError(null)
    setIsPulling(true)
    setPullState({ type: 'pulling' })

    try {
      const result = await invoke<{ success: boolean; fastForward: boolean; message?: string }>('git_pull', {
        workspacePath: currentWorkspace.path,
        remoteName: 'origin',
        branchName: status?.branch || null,
      })

      if (!result.success && result.message) {
        if (result.message.includes('conflict')) {
          setPullState({ type: 'confirming', message: result.message })
        } else {
          setError(`${t('errors.pullFailed')}: ${result.message}`)
          setPullState({ type: 'idle' })
        }
      } else {
        await refreshStatus(currentWorkspace.path)
        setPullState({ type: 'idle' })
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      
      if (errorMsg.includes('conflict')) {
        setPullState({ type: 'confirming', message: errorMsg })
      } else {
        setError(`${t('errors.pullFailed')}: ${errorMsg}`)
        setPullState({ type: 'idle' })
      }
    } finally {
      setIsPulling(false)
    }
  }

  const handleRefresh = () => {
    if (currentWorkspace) {
      refreshStatus(currentWorkspace.path)
    }
  }

  const isOperating = isLoading || isPushing || isPulling

  return (
    <>
      <div className="px-4 py-3 border-t border-border-subtle">
        {error && (
          <div className="mb-2 px-3 py-2 text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg">
            {error}
          </div>
        )}

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

        {status?.ahead && status.ahead > 0 && (
          <div className="mt-2 flex items-center gap-1 text-xs text-text-tertiary">
            <ArrowUp size={12} className="text-primary" />
            <span>{t('sync.ahead', { count: status.ahead })}</span>
          </div>
        )}
        {status?.behind && status.behind > 0 && (
          <div className="mt-1 flex items-center gap-1 text-xs text-text-tertiary">
            <ArrowDown size={12} className="text-warning" />
            <span>{t('sync.behind', { count: status.behind })}</span>
          </div>
        )}
      </div>

      {pushState.type === 'confirming_upstream' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background-elevated rounded-xl p-6 w-full max-w-md border border-border shadow-lg">
            <div className="flex items-start gap-3 mb-4">
              <GitBranch size={20} className="text-primary shrink-0 mt-0.5" />
              <div>
                <h2 className="text-lg font-semibold text-text-primary mb-1">
                  {t('push.setUpstream')}
                </h2>
                <p className="text-sm text-text-secondary">
                  {t('push.setUpstreamDesc', { branch: pushState.branch })}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPushState({ type: 'idle' })}
                disabled={isPushing}
                className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-background-hover rounded-lg transition-colors disabled:opacity-50"
              >
                {t('cancel', { ns: 'common' })}
              </button>
              <button
                onClick={handleSetUpstreamAndPush}
                disabled={isPushing}
                className="px-4 py-2 text-sm text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors disabled:opacity-50"
              >
                {isPushing ? <RefreshCw size={14} className="animate-spin" /> : t('push.setUpstreamAndPush')}
              </button>
            </div>
          </div>
        </div>
      )}

      {pushState.type === 'confirming_force' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background-elevated rounded-xl p-6 w-full max-w-md border border-border shadow-lg">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle size={20} className="text-danger shrink-0 mt-0.5" />
              <div>
                <h2 className="text-lg font-semibold text-text-primary mb-1">
                  {t('push.rejected')}
                </h2>
                <p className="text-sm text-text-secondary">
                  {t('push.forceConfirm')}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPushState({ type: 'idle' })}
                disabled={isPushing}
                className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-background-hover rounded-lg transition-colors disabled:opacity-50"
              >
                {t('cancel', { ns: 'common' })}
              </button>
              <button
                onClick={handleForcePush}
                disabled={isPushing}
                className="px-4 py-2 text-sm text-white bg-danger hover:bg-danger/90 rounded-lg transition-colors disabled:opacity-50"
              >
                {isPushing ? <RefreshCw size={14} className="animate-spin" /> : t('push.forcePush')}
              </button>
            </div>
          </div>
        </div>
      )}

      {pullState.type === 'confirming' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background-elevated rounded-xl p-6 w-full max-w-md border border-border shadow-lg">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle size={20} className="text-warning shrink-0 mt-0.5" />
              <div>
                <h2 className="text-lg font-semibold text-text-primary mb-1">
                  {t('pull.conflict')}
                </h2>
                <p className="text-sm text-text-secondary whitespace-pre-wrap">
                  {pullState.message}
                </p>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setPullState({ type: 'idle' })}
                className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-background-hover rounded-lg transition-colors"
              >
                {t('close', { ns: 'common' })}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
