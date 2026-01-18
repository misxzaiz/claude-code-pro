/**
 * Git 上下文建议组件
 * 支持 @git diff、@git commit、@git log 等语法
 */

import { useEffect, useRef } from 'react';
import type { GitCommit } from '../../services/gitContextService';
import { formatRelativeTime } from '../../services/gitContextService';

export type GitSuggestionMode =
  | 'root'        // @git
  | 'diff'        // @git diff
  | 'commit'      // @git commit
  | 'log'         // @git log
  | 'branch';     // @git branch

export interface GitSuggestionItem {
  type: 'action' | 'commit';
  id: string;
  label: string;
  description: string;
  commit?: GitCommit;
}

interface GitSuggestionProps {
  mode: GitSuggestionMode;
  items: GitSuggestionItem[];
  selectedIndex: number;
  query: string;
  onSelect: (item: GitSuggestionItem) => void;
  onHover: (index: number) => void;
  position: { top: number; left: number };
  isLoading?: boolean;
}

const gitIcon = (
  <svg className="w-4 h-4 text-orange-400" fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
  </svg>
);

const modeTitles: Record<GitSuggestionMode, string> = {
  root: 'Git 上下文',
  diff: 'Git 差异',
  commit: '选择提交',
  log: 'Git 日志',
  branch: 'Git 分支',
};

export function GitSuggestion({
  mode,
  items,
  selectedIndex,
  query,
  onSelect,
  onHover,
  position,
  isLoading = false,
}: GitSuggestionProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // 滚动选中项到视图
  useEffect(() => {
    if (containerRef.current) {
      const selectedEl = containerRef.current.children[selectedIndex + 1] as HTMLElement; // +1 跳过标题
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  if (items.length === 0 && !isLoading) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="fixed z-50 bg-background-surface border border-border rounded-lg shadow-lg max-h-60 overflow-auto suggestion-fade-in"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        minWidth: '300px',
        maxWidth: '450px',
      }}
    >
      {/* 标题 */}
      <div className="px-3 py-2 text-xs text-text-tertiary border-b border-border flex items-center gap-2 sticky top-0 bg-background-surface">
        {gitIcon}
        <span>{modeTitles[mode]}</span>
        {isLoading && (
          <span className="ml-auto flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-warning rounded-full animate-pulse" />
            加载中
          </span>
        )}
      </div>

      {/* 建议列表 */}
      {items.map((item, index) => (
        <div
          key={item.id}
          className={`px-3 py-2 cursor-pointer flex items-start gap-2 text-sm ${
            index === selectedIndex
              ? 'bg-primary/20 text-text-primary'
              : 'text-text-secondary hover:bg-background-hover'
          }`}
          onClick={() => onSelect(item)}
          onMouseEnter={() => onHover(index)}
        >
          {/* 图标 */}
          <span className="shrink-0 mt-0.5">
            {item.type === 'action' ? (
              <svg className="w-4 h-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </span>

          {/* 内容 */}
          <div className="flex-1 min-w-0">
            {/* 标签 */}
            <div className="font-medium truncate">{item.label}</div>

            {/* 描述 */}
            {item.description && (
              <div className="text-xs text-text-tertiary truncate mt-0.5">
                {item.description}
              </div>
            )}

            {/* 提交信息 */}
            {item.commit && (
              <div className="flex items-center gap-2 mt-1 text-xs text-text-tertiary">
                <span className="font-mono text-orange-400">{item.commit.shortHash}</span>
                <span className="truncate flex-1">{item.commit.message}</span>
                <span className="shrink-0">{formatRelativeTime(item.commit.timestamp)}</span>
              </div>
            )}
          </div>
        </div>
      ))}

      {/* 空状态 */}
      {items.length === 0 && isLoading === false && (
        <div className="px-3 py-4 text-sm text-text-tertiary text-center">
          {query ? `未找到 "${query}" 的结果` : '暂无内容'}
        </div>
      )}

      {/* 加载状态 */}
      {isLoading && items.length === 0 && (
        <div className="px-3 py-4 text-sm text-text-tertiary text-center flex items-center justify-center gap-2">
          <span className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          加载中...
        </div>
      )}
    </div>
  );
}

/**
 * Git 根级别建议项
 */
export function getGitRootSuggestions(): GitSuggestionItem[] {
  return [
    {
      type: 'action',
      id: 'diff',
      label: 'diff',
      description: '当前未提交的变更',
    },
    {
      type: 'action',
      id: 'diff-staged',
      label: 'diff --staged',
      description: '已暂存的变更',
    },
    {
      type: 'action',
      id: 'commit',
      label: 'commit',
      description: '选择历史提交',
    },
    {
      type: 'action',
      id: 'log',
      label: 'log',
      description: '查看提交历史',
    },
    {
      type: 'action',
      id: 'branch',
      label: 'branch',
      description: '查看/切换分支',
    },
    {
      type: 'action',
      id: 'status',
      label: 'status',
      description: '当前状态',
    },
  ];
}

/**
 * 将 Git 提交转换为建议项
 */
export function commitsToSuggestionItems(commits: GitCommit[]): GitSuggestionItem[] {
  return commits.map(commit => ({
    type: 'commit' as const,
    id: commit.hash,
    label: commit.shortHash,
    description: commit.message,
    commit,
  }));
}
