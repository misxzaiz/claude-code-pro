import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { GitBranch as GitBranchIcon, Check, ChevronDown, Plus, Loader2 } from 'lucide-react'
import { useGitStore } from '@/stores/gitStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { GitBranch } from '@/types/git'

export function BranchSelector() {
  const { t } = useTranslation('git')
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isSwitching, setIsSwitching] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')
  const [showNewBranch, setShowNewBranch] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const status = useGitStore((s) => s.status)
  const branches = useGitStore((s) => s.branches)
  const getBranches = useGitStore((s) => s.getBranches)
  const checkoutBranch = useGitStore((s) => s.checkoutBranch)
  const createBranch = useGitStore((s) => s.createBranch)
  const refreshStatus = useGitStore((s) => s.refreshStatus)
  const currentWorkspace = useWorkspaceStore((s) => s.getCurrentWorkspace())

  useEffect(() => {
    if (isOpen && currentWorkspace) {
      loadBranches()
    }
  }, [isOpen, currentWorkspace])

  useEffect(() => {
    if (showNewBranch && inputRef.current) {
      inputRef.current.focus()
    }
  }, [showNewBranch])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setShowNewBranch(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const loadBranches = useCallback(async () => {
    if (!currentWorkspace) return
    setIsLoading(true)
    try {
      await getBranches(currentWorkspace.path)
    } catch (err) {
      console.error('Failed to load branches:', err)
    } finally {
      setIsLoading(false)
    }
  }, [currentWorkspace, getBranches])

  const handleSwitchBranch = useCallback(async (branchName: string) => {
    if (!currentWorkspace || branchName === status?.branch) return

    setIsSwitching(true)
    try {
      await checkoutBranch(currentWorkspace.path, branchName)
      await refreshStatus(currentWorkspace.path)
      setIsOpen(false)
    } catch (err) {
      console.error('Failed to switch branch:', err)
    } finally {
      setIsSwitching(false)
    }
  }, [currentWorkspace, status?.branch, checkoutBranch, refreshStatus])

  const handleCreateBranch = useCallback(async () => {
    if (!currentWorkspace || !newBranchName.trim()) return

    setIsSwitching(true)
    try {
      await createBranch(currentWorkspace.path, newBranchName.trim(), true)
      await refreshStatus(currentWorkspace.path)
      setNewBranchName('')
      setShowNewBranch(false)
      setIsOpen(false)
    } catch (err) {
      console.error('Failed to create branch:', err)
    } finally {
      setIsSwitching(false)
    }
  }, [currentWorkspace, newBranchName, createBranch, refreshStatus])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCreateBranch()
    } else if (e.key === 'Escape') {
      setShowNewBranch(false)
      setNewBranchName('')
    }
  }

  const localBranches = branches.filter((b) => !b.isRemote)
  const remoteBranches = branches.filter((b) => b.isRemote)

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2 py-1 text-sm text-text-primary hover:bg-background-hover rounded transition-colors"
      >
        <GitBranchIcon size={14} className="text-text-tertiary" />
        <span className="font-medium max-w-[120px] truncate">
          {status?.branch || 'HEAD'}
        </span>
        <ChevronDown size={12} className="text-text-tertiary" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-background-surface border border-border rounded-lg shadow-lg z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <span className="text-xs font-medium text-text-secondary">
              {t('branch.switch')}
            </span>
            <button
              onClick={() => setShowNewBranch(!showNewBranch)}
              className="p-1 text-text-tertiary hover:text-primary hover:bg-primary/10 rounded"
              title={t('branch.create')}
            >
              <Plus size={14} />
            </button>
          </div>

          {showNewBranch && (
            <div className="px-3 py-2 border-b border-border flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('branch.newBranchPlaceholder')}
                className="flex-1 px-2 py-1 text-sm bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                onClick={handleCreateBranch}
                disabled={!newBranchName.trim() || isSwitching}
                className="p-1 text-primary hover:bg-primary/10 rounded disabled:opacity-50"
              >
                {isSwitching ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              </button>
            </div>
          )}

          <div className="max-h-60 overflow-y-auto">
            {isLoading ? (
              <div className="px-3 py-4 text-center text-text-tertiary">
                <Loader2 size={16} className="animate-spin mx-auto" />
              </div>
            ) : (
              <>
                {localBranches.map((branch) => (
                  <button
                    key={branch.name}
                    onClick={() => handleSwitchBranch(branch.name)}
                    disabled={isSwitching || branch.isCurrent}
                    className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-background-hover ${
                      branch.isCurrent ? 'bg-primary/10 text-primary' : 'text-text-primary'
                    }`}
                  >
                    {branch.isCurrent && <Check size={12} />}
                    <span className={branch.isCurrent ? '' : 'ml-4'}>{branch.name}</span>
                  </button>
                ))}

                {remoteBranches.length > 0 && (
                  <>
                    <div className="px-3 py-1 text-xs text-text-tertiary bg-background">
                      {t('branch.remote')}
                    </div>
                    {remoteBranches.slice(0, 10).map((branch) => (
                      <button
                        key={branch.name}
                        onClick={() => handleSwitchBranch(branch.name)}
                        disabled={isSwitching}
                        className="w-full px-3 py-2 text-left text-sm text-text-secondary hover:bg-background-hover truncate"
                      >
                        {branch.name}
                      </button>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
