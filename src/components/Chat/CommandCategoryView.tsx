/**
 * 命令分类视图组件
 * 将命令按类别分组显示，提供更好的用户体验
 */

import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';

export interface CommandCategory {
  id: string;
  name: string;
  icon: string;
  commands: Array<{ name: string; description: string }>;
}

interface CommandCategoryViewProps {
  commands: Array<{ name: string; description: string }>;
  selectedIndex: number;
  query: string;
  onSelect: (command: { name: string; description: string }) => void;
  onHover: (index: number) => void;
  position: { top: number; left: number };
}

const categoryIcons: Record<string, JSX.Element> = {
  'git': (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
    </svg>
  ),
  'code': (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
    </svg>
  ),
  'files': (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  'quality': (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  'config': (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  'help': (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

const categoryColors: Record<string, string> = {
  'git': 'text-orange-400',
  'code': 'text-blue-400',
  'files': 'text-purple-400',
  'quality': 'text-green-400',
  'config': 'text-cyan-400',
  'help': 'text-yellow-400',
};

/**
 * 将命令按类别分组
 */
export function groupCommandsByCategory(commands: Array<{ name: string; description: string }>): CommandCategory[] {
  const categories: Record<string, CommandCategory> = {
    'git': { id: 'git', name: 'Git 操作', icon: 'git', commands: [] },
    'quality': { id: 'quality', name: '代码质量', icon: 'quality', commands: [] },
    'files': { id: 'files', name: '文件操作', icon: 'files', commands: [] },
    'code': { id: 'code', name: '代码分析', icon: 'code', commands: [] },
    'config': { id: 'config', name: '配置管理', icon: 'config', commands: [] },
    'help': { id: 'help', name: '帮助', icon: 'help', commands: [] },
  };

  // Git 命令
  const gitCommands = ['commit', 'diff', 'push', 'pull', 'status', 'log', 'branch', 'merge', 'stash', 'pop'];

  // 代码质量命令
  const qualityCommands = ['format', 'lint', 'test', 'build', 'run'];

  // 文件操作命令
  const fileCommands = ['edit', 'search', 'find'];

  // 代码分析命令
  const codeCommands = ['explain', 'review', 'refactor', 'document'];

  // 配置命令
  const configCommands = ['config', 'env', 'install', 'update', 'upgrade', 'database', 'db'];

  // 帮助命令
  const helpCommands = ['help', 'commands', 'guide', 'stats', 'map', 'token'];

  commands.forEach(cmd => {
    if (gitCommands.includes(cmd.name)) {
      categories.git.commands.push(cmd);
    } else if (qualityCommands.includes(cmd.name)) {
      categories.quality.commands.push(cmd);
    } else if (fileCommands.includes(cmd.name)) {
      categories.files.commands.push(cmd);
    } else if (codeCommands.includes(cmd.name)) {
      categories.code.commands.push(cmd);
    } else if (configCommands.includes(cmd.name)) {
      categories.config.commands.push(cmd);
    } else if (helpCommands.includes(cmd.name)) {
      categories.help.commands.push(cmd);
    } else {
      // 默认放到代码分析
      categories.code.commands.push(cmd);
    }
  });

  // 只返回有命令的类别
  return Object.values(categories).filter(cat => cat.commands.length > 0);
}

/**
 * 将命令展平为带类别信息的列表
 */
export function flattenCommands(categories: CommandCategory[]): Array<{ name: string; description: string; category: string }> {
  const result: Array<{ name: string; description: string; category: string }> = [];
  categories.forEach(cat => {
    cat.commands.forEach(cmd => {
      result.push({ ...cmd, category: cat.id });
    });
  });
  return result;
}

export function CommandCategoryView({
  commands,
  selectedIndex,
  query,
  onSelect,
  onHover,
  position,
}: CommandCategoryViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const categories = groupCommandsByCategory(commands);
  const flatCommands = flattenCommands(categories);
  const hasQuery = query.length > 0;

  // 滚动选中项到视图
  useEffect(() => {
    if (containerRef.current && !hasQuery) {
      const selectedEl = containerRef.current.querySelector(`[data-index="${selectedIndex}"]`) as HTMLElement;
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex, hasQuery]);

  // 当有查询时，自动展开所有类别
  useEffect(() => {
    if (hasQuery) {
      setExpandedCategories(new Set(categories.map(c => c.id)));
    }
  }, [hasQuery, categories]);

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId);
      } else {
        newSet.add(categoryId);
      }
      return newSet;
    });
  };

  if (commands.length === 0) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="fixed z-50 bg-background-surface border border-border rounded-lg shadow-lg max-h-72 overflow-auto suggestion-fade-in"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        minWidth: '280px',
        maxWidth: '400px',
      }}
    >
      {/* 有查询时显示搜索结果 */}
      {hasQuery ? (
        <>
          <div className="px-3 py-2 text-xs text-text-tertiary border-b border-border sticky top-0 bg-background-surface">
            搜索结果 ({flatCommands.length})
          </div>
          {flatCommands.map((cmd, index) => (
            <div
              key={cmd.name}
              data-index={index}
              className={`px-3 py-2 cursor-pointer flex items-center gap-2 text-sm ${
                index === selectedIndex
                  ? 'bg-primary/20 text-text-primary'
                  : 'text-text-secondary hover:bg-background-hover'
              }`}
              onClick={() => onSelect(cmd)}
              onMouseEnter={() => onHover(index)}
            >
              <span className={`w-4 h-4 shrink-0 ${categoryColors[cmd.category] ?? 'text-text-tertiary'}`}>
                {categoryIcons[cmd.category]}
              </span>
              <span className="text-primary font-mono">/{cmd.name}</span>
              <span className="flex-1 truncate text-text-tertiary">{cmd.description}</span>
            </div>
          ))}
        </>
      ) : (
        <>
          <div className="px-3 py-2 text-xs text-text-tertiary border-b border-border sticky top-0 bg-background-surface">
            命令 ({commands.length})
          </div>
          {categories.map(category => {
            const isExpanded = expandedCategories.has(category.id);
            const IconComponent = categoryIcons[category.icon];

            return (
              <div key={category.id} className="border-b border-border/50 last:border-b-0">
                {/* 类别标题 */}
                <button
                  type="button"
                  className="w-full px-3 py-2 flex items-center gap-2 text-sm text-text-secondary hover:bg-background-hover transition-colors"
                  onClick={() => toggleCategory(category.id)}
                >
                  <span className={`shrink-0 ${categoryColors[category.icon]}`}>
                    {IconComponent}
                  </span>
                  <span className="flex-1 text-left font-medium">{category.name}</span>
                  <span className="text-xs text-text-tertiary">{category.commands.length}</span>
                  <svg
                    className={`w-4 h-4 text-text-tertiary transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>

                {/* 类别命令 */}
                {isExpanded && (
                  <div className="bg-background-elevated/50">
                    {category.commands.map((cmd) => {
                      const flatIndex = flatCommands.findIndex(c => c.name === cmd.name);
                      return (
                        <div
                          key={cmd.name}
                          data-index={flatIndex}
                          className={`px-3 py-2 pl-9 cursor-pointer flex items-center gap-2 text-sm ${
                            flatIndex === selectedIndex
                              ? 'bg-primary/20 text-text-primary'
                              : 'text-text-secondary hover:bg-background-hover'
                          }`}
                          onClick={() => onSelect(cmd)}
                          onMouseEnter={() => onHover(flatIndex)}
                        >
                          <span className="text-primary font-mono text-sm">/{cmd.name}</span>
                          <span className="flex-1 truncate text-text-tertiary">{cmd.description}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}

      {flatCommands.length === 0 && hasQuery && (
        <div className="px-3 py-4 text-sm text-text-tertiary text-center">
          未找到匹配的命令
        </div>
      )}
    </div>
  );
}
