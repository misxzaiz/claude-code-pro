import { useTranslation } from 'react-i18next'
import { GitBranch, ArrowUpDown, RefreshCw } from 'lucide-react'
import type { GitRepositoryStatus } from '@/types'

interface GitStatusHeaderProps {
  status: GitRepositoryStatus | null
  isLoading: boolean
  onRefresh: () => void
}

export function GitStatusHeader({ status, isLoading, onRefresh }: GitStatusHeaderProps) {
  const { t } = useTranslation('git')

  if (!status) {
    return (
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
        <span className="text-sm text-text-tertiary">{t('notGitRepo')}</span>
      </div>
    )
  }

  if (status.isEmpty) {
    return (
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
        <span className="text-sm text-text-tertiary">{t('emptyRepo')}</span>
      </div>
    )
  }

  return (
    <div className="px-4 py-3 border-b border-border-subtle space-y-2">
      <div className="flex items-center gap-2 text-sm">
        <GitBranch size={14} className="text-text-tertiary shrink-0" />
        <span className="text-text-primary font-medium">{status.branch || 'HEAD'}</span>
        {status.commit && (
          <span className="text-text-tertiary text-xs font-mono">
            {status.shortCommit}
          </span>
        )}
      </div>

      {(status.ahead > 0 || status.behind > 0) && (
        <div className="flex items-center gap-3 text-xs text-text-secondary">
          {status.ahead > 0 && (
            <span className="flex items-center gap-1" title={t('aheadRemote')}>
              <ArrowUpDown size={12} className="text-success rotate-180" />
              +{status.ahead}
            </span>
          )}
          {status.behind > 0 && (
            <span className="flex items-center gap-1" title={t('behindRemote')}>
              <ArrowUpDown size={12} className="text-warning" />
              -{status.behind}
            </span>
          )}
        </div>
      )}

      <button
        onClick={onRefresh}
        disabled={isLoading}
        className="top-3 right-3 p-1 text-text-tertiary hover:text-text-primary hover:bg-background-hover rounded transition-colors disabled:opacity-50"
        title={t('refreshStatus')}
      >
        <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
      </button>
    </div>
  )
}
