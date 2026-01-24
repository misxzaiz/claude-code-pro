/**
 * Git Store
 *
 * Git 操作的状态管理
 */

import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import type {
  GitRepositoryStatus,
  GitDiffEntry,
  GitBranch,
  GitRemote,
  GitHostType,
  PullRequest,
  CreatePROptions,
} from '@/types/git'

interface GitState {
  // 状态数据
  status: GitRepositoryStatus | null
  diffs: GitDiffEntry[]
  worktreeDiffs: GitDiffEntry[]
  indexDiffs: GitDiffEntry[]
  branches: GitBranch[]
  remotes: GitRemote[]
  currentPR: PullRequest | null

  // UI 状态
  isLoading: boolean
  error: string | null
  selectedFilePath: string | null

  // 操作方法
  refreshStatus: (workspacePath: string) => Promise<void>
  getDiffs: (workspacePath: string, baseCommit: string) => Promise<void>
  getWorktreeDiff: (workspacePath: string) => Promise<void>
  getIndexDiff: (workspacePath: string) => Promise<void>
  getBranches: (workspacePath: string) => Promise<void>
  getRemotes: (workspacePath: string) => Promise<void>

  // Git 操作
  isRepository: (workspacePath: string) => Promise<boolean>
  initRepository: (workspacePath: string, initialBranch?: string) => Promise<string>
  createBranch: (workspacePath: string, name: string, checkout?: boolean) => Promise<void>
  checkoutBranch: (workspacePath: string, name: string) => Promise<void>
  commitChanges: (workspacePath: string, message: string, stageAll?: boolean) => Promise<string>
  stageFile: (workspacePath: string, filePath: string) => Promise<void>
  unstageFile: (workspacePath: string, filePath: string) => Promise<void>
  discardChanges: (workspacePath: string, filePath: string) => Promise<void>
  detectHost: (remoteUrl: string) => GitHostType

  // PR 操作
  pushBranch: (workspacePath: string, branchName: string, remoteName?: string, force?: boolean) => Promise<void>
  createPR: (workspacePath: string, options: CreatePROptions) => Promise<PullRequest>
  getPRStatus: (workspacePath: string, prNumber: number) => Promise<PullRequest>

  // 工具方法
  clearError: () => void
  hasChanges: () => boolean
  getChangedFiles: () => string[]
  setSelectedFilePath: (path: string | null) => void
  clearAll: () => void
}

export const useGitStore = create<GitState>((set, get) => ({
  // 初始状态
  status: null,
  diffs: [],
  worktreeDiffs: [],
  indexDiffs: [],
  branches: [],
  remotes: [],
  isLoading: false,
  error: null,
  selectedFilePath: null,

  // 刷新仓库状态
  async refreshStatus(workspacePath: string) {
    set({ isLoading: true, error: null })

    try {
      const status = await invoke<GitRepositoryStatus>('git_get_status', {
        workspacePath,
      })

      set({ status, isLoading: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set({
        error: message,
        isLoading: false,
        status: null,
      })
    }
  },

  // 获取 Diff (HEAD vs base commit)
  async getDiffs(workspacePath: string, baseCommit: string) {
    set({ isLoading: true, error: null })

    try {
      const diffs = await invoke<GitDiffEntry[]>('git_get_diffs', {
        workspacePath,
        baseCommit,
      })

      set({ diffs, isLoading: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set({
        error: message,
        isLoading: false,
        diffs: [],
      })
    }
  },

  // 获取工作区 Diff
  async getWorktreeDiff(workspacePath: string) {
    set({ isLoading: true, error: null })

    try {
      const diffs = await invoke<GitDiffEntry[]>('git_get_worktree_diff', {
        workspacePath,
      })

      set({ worktreeDiffs: diffs, isLoading: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set({
        error: message,
        isLoading: false,
        worktreeDiffs: [],
      })
    }
  },

  // 获取暂存区 Diff
  async getIndexDiff(workspacePath: string) {
    set({ isLoading: true, error: null })

    try {
      const diffs = await invoke<GitDiffEntry[]>('git_get_index_diff', {
        workspacePath,
      })

      set({ indexDiffs: diffs, isLoading: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set({
        error: message,
        isLoading: false,
        indexDiffs: [],
      })
    }
  },

  // 获取分支列表
  async getBranches(workspacePath: string) {
    try {
      const branches = await invoke<GitBranch[]>('git_get_branches', {
        workspacePath,
      })

      set({ branches })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set({ error: message, branches: [] })
    }
  },

  // 获取远程仓库
  async getRemotes(workspacePath: string) {
    try {
      const remotes = await invoke<GitRemote[]>('git_get_remotes', {
        workspacePath,
      })

      set({ remotes })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set({ error: message, remotes: [] })
    }
  },

  // 检查是否为 Git 仓库
  async isRepository(workspacePath: string) {
    try {
      return await invoke<boolean>('git_is_repository', { workspacePath })
    } catch {
      return false
    }
  },

  // 初始化仓库
  async initRepository(workspacePath: string, initialBranch = 'main') {
    set({ isLoading: true, error: null })

    try {
      const commit = await invoke<string>('git_init_repository', {
        workspacePath,
        initialBranch,
      })

      // 刷新状态
      await get().refreshStatus(workspacePath)

      set({ isLoading: false })
      return commit
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set({ error: message, isLoading: false })
      throw err
    }
  },

  // 创建分支
  async createBranch(workspacePath: string, name: string, checkout = false) {
    set({ isLoading: true, error: null })

    try {
      await invoke('git_create_branch', {
        workspacePath,
        name,
        checkout,
      })

      // 刷新状态和分支列表
      await get().refreshStatus(workspacePath)
      await get().getBranches(workspacePath)

      set({ isLoading: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set({ error: message, isLoading: false })
      throw err
    }
  },

  // 切换分支
  async checkoutBranch(workspacePath: string, name: string) {
    set({ isLoading: true, error: null })

    try {
      await invoke('git_checkout_branch', {
        workspacePath,
        name,
      })

      // 刷新状态和分支列表
      await get().refreshStatus(workspacePath)
      await get().getBranches(workspacePath)

      set({ isLoading: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set({ error: message, isLoading: false })
      throw err
    }
  },

  // 提交变更
  async commitChanges(
    workspacePath: string,
    message: string,
    stageAll = true
  ) {
    set({ isLoading: true, error: null })

    try {
      const commit = await invoke<string>('git_commit_changes', {
        workspacePath,
        message,
        stageAll,
      })

      // 刷新状态
      await get().refreshStatus(workspacePath)

      set({ isLoading: false })
      return commit
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set({ error: message, isLoading: false })
      throw err
    }
  },

  // 暂存文件
  async stageFile(workspacePath: string, filePath: string) {
    set({ isLoading: true, error: null })

    try {
      await invoke('git_stage_file', {
        workspacePath,
        filePath,
      })

      // 刷新状态
      await get().refreshStatus(workspacePath)

      set({ isLoading: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set({ error: message, isLoading: false })
      throw err
    }
  },

  // 取消暂存
  async unstageFile(workspacePath: string, filePath: string) {
    set({ isLoading: true, error: null })

    try {
      await invoke('git_unstage_file', {
        workspacePath,
        filePath,
      })

      // 刷新状态
      await get().refreshStatus(workspacePath)

      set({ isLoading: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set({ error: message, isLoading: false })
      throw err
    }
  },

  // 丢弃变更
  async discardChanges(workspacePath: string, filePath: string) {
    set({ isLoading: true, error: null })

    try {
      await invoke('git_discard_changes', {
        workspacePath,
        filePath,
      })

      // 刷新状态
      await get().refreshStatus(workspacePath)

      set({ isLoading: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set({ error: message, isLoading: false })
      throw err
    }
  },

  // 检测 Git Host
  detectHost(remoteUrl: string) {
    return invoke<GitHostType>('git_detect_host', { remoteUrl })
  },

  // 推送分支到远程
  async pushBranch(
    workspacePath: string,
    branchName: string,
    remoteName = 'origin',
    force = false
  ) {
    set({ isLoading: true, error: null })

    try {
      await invoke('git_push_branch', {
        workspacePath,
        branchName,
        remoteName,
        force,
      })

      set({ isLoading: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set({ error: message, isLoading: false })
      throw err
    }
  },

  // 创建 PR
  async createPR(workspacePath: string, options: CreatePROptions) {
    set({ isLoading: true, error: null })

    try {
      const pr = await invoke<PullRequest>('git_create_pr', {
        workspacePath,
        options,
      })

      set({ currentPR: pr, isLoading: false })
      return pr
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set({ error: message, isLoading: false, currentPR: null })
      throw err
    }
  },

  // 获取 PR 状态
  async getPRStatus(workspacePath: string, prNumber: number) {
    set({ isLoading: true, error: null })

    try {
      const pr = await invoke<PullRequest>('git_get_pr_status', {
        workspacePath,
        prNumber,
      })

      set({ currentPR: pr, isLoading: false })
      return pr
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set({ error: message, isLoading: false })
      throw err
    }
  },

  // 清除错误
  clearError() {
    set({ error: null })
  },

  // 检查是否有变更
  hasChanges() {
    const { status } = get()
    if (!status) return false

    return (
      status.staged.length > 0 ||
      status.unstaged.length > 0 ||
      status.untracked.length > 0
    )
  },

  // 获取所有变更文件
  getChangedFiles() {
    const { status } = get()
    if (!status) return []

    return [
      ...status.staged.map((f) => f.path),
      ...status.unstaged.map((f) => f.path),
      ...status.untracked,
    ]
  },

  // 设置选中的文件
  setSelectedFilePath(path: string | null) {
    set({ selectedFilePath: path })
  },

  // 清除所有状态
  clearAll() {
    set({
      status: null,
      diffs: [],
      worktreeDiffs: [],
      indexDiffs: [],
      branches: [],
      remotes: [],
      currentPR: null,
      error: null,
      selectedFilePath: null,
    })
  },
}))
