/**
 * 聊天输入组件 - 支持斜杠命令、工作区引用、文件引用和 Git 上下文
 */

import { useState, useRef, KeyboardEvent, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../Common';
import { IconSend, IconStop } from '../Common/Icons';
import { useCommandStore, useWorkspaceStore, useConfigStore } from '../../stores';
import { parseCommandInput, generateCommandsListMessage, generateHelpMessage } from '../../services/commandService';
import { FileSuggestion, CommandSuggestion, WorkspaceSuggestion } from './FileSuggestion';
import { GitSuggestion, getGitRootSuggestions, commitsToSuggestionItems, type GitSuggestionItem } from './GitSuggestion';
import { ContextChips } from './ContextChips';
import type { FileMatch } from '../../services/fileSearch';
import type { Workspace } from '../../types';
import type { ContextChipWithId } from '../../types/context';
import { addChipId } from '../../types/context';
import { AutoResizingTextarea } from './AutoResizingTextarea';
import { useFileSearch } from '../../hooks/useFileSearch';
import { getGitCommits } from '../../services/gitContextService';
import { baiduTranslate } from '../../services/tauri';

interface ChatInputProps {
  onSend: (message: string, workspaceDir?: string) => void;
  disabled?: boolean;
  isStreaming?: boolean;
  onInterrupt?: () => void;
  currentWorkDir?: string | null;
}

type SuggestionMode = 'command' | 'workspace' | 'file' | 'git' | null;

export function ChatInput({
  onSend,
  disabled = false,
  isStreaming = false,
  onInterrupt,
  currentWorkDir,
}: ChatInputProps) {
  const { t } = useTranslation('chat');
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 上下文芯片状态
  const [contextChips, setContextChips] = useState<ContextChipWithId[]>([]);

  // 命令建议状态
  const [showCommandSuggestions, setShowCommandSuggestions] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const [commandPosition, setCommandPosition] = useState({ top: 0, left: 0 });

  // 工作区建议状态
  const [showWorkspaceSuggestions, setShowWorkspaceSuggestions] = useState(false);
  const [selectedWorkspaceIndex, setSelectedWorkspaceIndex] = useState(0);
  const [workspaceQuery, setWorkspaceQuery] = useState('');
  const [workspacePosition, setWorkspacePosition] = useState({ top: 0, left: 0 });

  // 文件建议状态
  const [showFileSuggestions, setShowFileSuggestions] = useState(false);
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);
  const [filePosition, setFilePosition] = useState({ top: 0, left: 0 });
  const [fileWorkspace, setFileWorkspace] = useState<Workspace | null>(null);

  // Git 建议状态
  const [showGitSuggestions, setShowGitSuggestions] = useState(false);
  const [gitMode, setGitMode] = useState<'root' | 'commit'>('root');
  const [gitQuery, setGitQuery] = useState('');
  const [selectedGitIndex, setSelectedGitIndex] = useState(0);
  const [gitPosition, setGitPosition] = useState({ top: 0, left: 0 });
  const [gitCommits, setGitCommits] = useState<Array<{ hash: string; shortHash: string; message: string; author: string; timestamp: number }>>([]);
  const [isGitLoading, setIsGitLoading] = useState(false);

  const { getCommands, searchCommands } = useCommandStore();
  const { currentWorkspaceId, workspaces } = useWorkspaceStore();
  const { fileMatches, searchFiles, clearResults } = useFileSearch();
  const { config } = useConfigStore();

  const [isTranslating, setIsTranslating] = useState(false);

  // 缓存命令搜索结果
  const suggestedCommands = useMemo(
    () => searchCommands(commandQuery),
    [commandQuery, searchCommands]
  );

  // 过滤工作区列表
  const filteredWorkspaces = useMemo(
    () => workspaces.filter(w =>
      w.name.toLowerCase().includes(workspaceQuery.toLowerCase())
    ),
    [workspaces, workspaceQuery]
  );

  const gitSuggestions = useMemo(() => {
    if (gitMode === 'root') {
      return getGitRootSuggestions(t);
    }
    if (gitMode === 'commit' && gitQuery) {
      return commitsToSuggestionItems(gitCommits);
    }
    return gitCommits.length > 0 ? commitsToSuggestionItems(gitCommits) : [];
  }, [gitMode, gitQuery, gitCommits, t]);

  // 当前建议模式
  const suggestionMode: SuggestionMode = useMemo(() => {
    if (showCommandSuggestions) return 'command';
    if (showWorkspaceSuggestions) return 'workspace';
    if (showFileSuggestions) return 'file';
    if (showGitSuggestions) return 'git';
    return null;
  }, [showCommandSuggestions, showWorkspaceSuggestions, showFileSuggestions, showGitSuggestions]);

  // 智能定位建议框
  const calculateSuggestionPosition = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return { top: 0, left: 0, shouldShowAbove: false };

    const rect = textarea.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const suggestionHeight = 260;
    const shouldShowAbove = spaceBelow < suggestionHeight;

    return {
      top: shouldShowAbove ? rect.top - suggestionHeight - 8 : rect.bottom + 8,
      left: rect.left,
      shouldShowAbove,
    };
  }, []);

  // 检测触发符
  const handleInputChange = useCallback(async (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setValue(newValue);

    const textarea = textareaRef.current;
    if (!textarea || !containerRef.current) return;

    const cursorPosition = textarea.selectionStart;
    const textBeforeCursor = newValue.slice(0, cursorPosition);

    // 1. 检测 Git 上下文引用 (@git)
    const gitMatch = textBeforeCursor.match(/@git(?::(\w*))?(?:\s([^\s]*))?$/);
    if (gitMatch) {
      const gitAction = gitMatch[1] || '';
      const query = gitMatch[2] || '';

      setShowGitSuggestions(true);
      setShowCommandSuggestions(false);
      setShowWorkspaceSuggestions(false);
      setShowFileSuggestions(false);
      clearResults();

      if (gitAction === 'commit' || (!gitAction && query)) {
        setGitMode('commit');
        setGitQuery(query);
        setSelectedGitIndex(0);

        // 加载提交列表（如果还没加载或查询变化）
        if (currentWorkDir && gitCommits.length === 0) {
          setIsGitLoading(true);
          try {
            const commits = await getGitCommits(currentWorkDir, { limit: 50 });
            setGitCommits(commits);
          } finally {
            setIsGitLoading(false);
          }
        }
      } else {
        setGitMode('root');
        setGitQuery('');
        setSelectedGitIndex(0);
      }

      const position = calculateSuggestionPosition();
      setGitPosition({ top: position.top, left: position.left });
      return;
    }

    // 2. 检测跨工作区引用 (@workspace:path)
    const workspaceMatch = textBeforeCursor.match(/@([\w\u4e00-\u9fa5-]+):([^\s]*)$/);
    if (workspaceMatch) {
      const workspaceName = workspaceMatch[1];
      const pathPart = workspaceMatch[2] || '';

      const matchedWorkspace = workspaces.find(w =>
        w.name.toLowerCase() === workspaceName.toLowerCase()
      );

      if (matchedWorkspace) {
        setShowWorkspaceSuggestions(false);
        setShowFileSuggestions(true);
        setShowCommandSuggestions(false);
        setShowGitSuggestions(false);
        setFileWorkspace(matchedWorkspace);
        setSelectedFileIndex(0);
        searchFiles(pathPart, matchedWorkspace);
      } else {
        setShowWorkspaceSuggestions(true);
        setShowFileSuggestions(false);
        setShowCommandSuggestions(false);
        setShowGitSuggestions(false);
        setWorkspaceQuery(workspaceName);
        setSelectedWorkspaceIndex(0);
      }

      const position = calculateSuggestionPosition();
      setWorkspacePosition({ top: position.top, left: position.left });
      return;
    }

    // 3. 检测用户正在输入工作区名
    const partialWorkspaceMatch = textBeforeCursor.match(/@([\w\u4e00-\u9fa5-]*)$/);
    if (partialWorkspaceMatch) {
      const workspaceName = partialWorkspaceMatch[1];
      if (workspaceName.length > 0 && workspaceName !== 'git') {
        setShowWorkspaceSuggestions(true);
        setShowFileSuggestions(false);
        setShowCommandSuggestions(false);
        setShowGitSuggestions(false);
        setWorkspaceQuery(workspaceName);
        setSelectedWorkspaceIndex(0);

        const position = calculateSuggestionPosition();
        setWorkspacePosition({ top: position.top, left: position.left });
        return;
      }
    }

    // 4. 检测当前工作区文件引用 (@/path)
    const fileMatch = textBeforeCursor.match(/@\/(.*)$/);
    if (fileMatch) {
      setShowWorkspaceSuggestions(false);
      setShowFileSuggestions(true);
      setShowCommandSuggestions(false);
      setShowGitSuggestions(false);
      setFileWorkspace(null);
      setSelectedFileIndex(0);
      searchFiles(fileMatch[1]);

      const position = calculateSuggestionPosition();
      setFilePosition({ top: position.top, left: position.left });
      return;
    }

    // 5. 检测命令触发 (/)
    const commandMatch = textBeforeCursor.match(/\/([^\s]*)$/);
    if (commandMatch) {
      setCommandQuery(commandMatch[1]);
      setSelectedCommandIndex(0);
      setShowCommandSuggestions(true);
      setShowWorkspaceSuggestions(false);
      setShowFileSuggestions(false);
      setShowGitSuggestions(false);

      const position = calculateSuggestionPosition();
      setCommandPosition({ top: position.top, left: position.left });
      return;
    }

    // 隐藏所有建议
    setShowCommandSuggestions(false);
    setShowWorkspaceSuggestions(false);
    setShowFileSuggestions(false);
    setShowGitSuggestions(false);
    clearResults();
  }, [workspaces, searchFiles, clearResults, calculateSuggestionPosition, gitCommits, currentWorkDir]);

  // 选择命令
  const selectCommand = useCallback((name: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPosition = textarea.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPosition);
    const textAfterCursor = value.slice(cursorPosition);

    const newText = textBeforeCursor.replace(/\/[^\s]*$/, `/${name} `) + textAfterCursor;
    setValue(newText);
    setShowCommandSuggestions(false);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(newText.length - textAfterCursor.length, newText.length - textAfterCursor.length);
    }, 0);
  }, [value]);

  // 选择工作区
  const selectWorkspace = useCallback((workspace: Workspace) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPosition = textarea.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPosition);
    const textAfterCursor = value.slice(cursorPosition);

    const newText = textBeforeCursor.replace(/@[\w\u4e00-\u9fa5-]*$/, `@${workspace.name}:`) + textAfterCursor;
    setValue(newText);
    setShowWorkspaceSuggestions(false);

    setTimeout(() => {
      textarea.focus();
      const newCursorPos = newText.length - textAfterCursor.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
      const inputEvent = new Event('input', { bubbles: true });
      textarea.dispatchEvent(inputEvent);
    }, 0);
  }, [value]);

  // 选择文件
  const selectFile = useCallback((file: FileMatch) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPosition = textarea.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPosition);
    const textAfterCursor = value.slice(cursorPosition);

    let replacement: string;
    if (fileWorkspace) {
      replacement = textBeforeCursor.replace(/@[\w\u4e00-\u9fa5-]+:[^\s]*$/, `@${fileWorkspace.name}:${file.relativePath} `);
    } else {
      replacement = textBeforeCursor.replace(/@\/[^\s]*$/, `@/${file.relativePath} `);
    }

    const newText = replacement + textAfterCursor;
    setValue(newText);
    setShowFileSuggestions(false);

    // 添加文件上下文芯片
    const newChip = addChipId({
      type: 'file',
      path: fileWorkspace ? `${fileWorkspace.name}:${file.relativePath}` : file.relativePath,
      size: file.size || 0,
      workspace: fileWorkspace ?? undefined,
    });
    setContextChips(prev => [...prev, newChip]);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(newText.length - textAfterCursor.length, newText.length - textAfterCursor.length);
    }, 0);
  }, [value, fileWorkspace]);

  // 选择 Git 建议
  const selectGitSuggestion = useCallback((item: GitSuggestionItem) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPosition = textarea.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPosition);
    const textAfterCursor = value.slice(cursorPosition);

    let newText = '';
    if (item.type === 'action') {
      if (item.id === 'diff') {
        newText = textBeforeCursor.replace(/@git(?::\w*)?\s?[^\s]*$/, '@git:diff ') + textAfterCursor;
      } else if (item.id === 'diff-staged') {
        newText = textBeforeCursor.replace(/@git(?::\w*)?\s?[^\s]*$/, '@git:diff:staged ') + textAfterCursor;
      } else if (item.id === 'commit') {
        newText = textBeforeCursor.replace(/@git(?::\w*)?\s?[^\s]*$/, '@git:commit ') + textAfterCursor;
        setGitMode('commit');
        setShowGitSuggestions(true);
        setValue(newText);
        setTimeout(() => {
          textarea.focus();
          const newCursorPos = newText.length - textAfterCursor.length;
          textarea.setSelectionRange(newCursorPos, newCursorPos);
        }, 0);
        return;
      } else {
        newText = textBeforeCursor.replace(/@git(?::\w*)?\s?[^\s]*$/, `@git:${item.id} `) + textAfterCursor;
      }
    } else if (item.type === 'commit' && item.commit) {
      newText = textBeforeCursor.replace(/@git(?::commit)?\s?[^\s]*$/, `@git:commit:${item.commit.shortHash} `) + textAfterCursor;

      // 添加提交上下文芯片
      const newChip = addChipId({
        type: 'commit',
        hash: item.commit.hash,
        shortHash: item.commit.shortHash,
        message: item.commit.message,
        author: item.commit.author,
        timestamp: item.commit.timestamp,
      });
      setContextChips(prev => [...prev, newChip]);
    }

    setValue(newText);
    setShowGitSuggestions(false);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(newText.length - textAfterCursor.length, newText.length - textAfterCursor.length);
    }, 0);
  }, [value]);

  // 移除上下文芯片
  const removeContextChip = useCallback((chip: ContextChipWithId) => {
    setContextChips(prev => prev.filter(c => c.id !== chip.id));
  }, []);

  // 键盘事件处理
  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      // 如果建议框打开，选择建议
      if (showCommandSuggestions) {
        e.preventDefault();
        if (suggestedCommands.length > 0) {
          selectCommand(suggestedCommands[selectedCommandIndex].name);
        }
        return;
      }

      if (showWorkspaceSuggestions) {
        e.preventDefault();
        if (filteredWorkspaces.length > 0) {
          selectWorkspace(filteredWorkspaces[selectedWorkspaceIndex]);
        }
        return;
      }

      if (showFileSuggestions) {
        e.preventDefault();
        if (fileMatches.length > 0) {
          selectFile(fileMatches[selectedFileIndex]);
        }
        return;
      }

      if (showGitSuggestions) {
        e.preventDefault();
        if (gitSuggestions.length > 0) {
          selectGitSuggestion(gitSuggestions[selectedGitIndex]);
        }
        return;
      }

      // 正常发送
      e.preventDefault();
      handleSend();
      return;
    }

    // 上下箭头选择建议
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') &&
        (showCommandSuggestions || showWorkspaceSuggestions || showFileSuggestions || showGitSuggestions)) {
      e.preventDefault();

      let items: any[] = [];
      let setState: (fn: (prev: number) => number) => void;

      if (showCommandSuggestions) {
        items = suggestedCommands;
        setState = setSelectedCommandIndex;
      } else if (showWorkspaceSuggestions) {
        items = filteredWorkspaces;
        setState = setSelectedWorkspaceIndex;
      } else if (showFileSuggestions) {
        items = fileMatches;
        setState = setSelectedFileIndex;
      } else {
        items = gitSuggestions;
        setState = setSelectedGitIndex;
      }

      if (items.length === 0) return;

      const maxIndex = items.length - 1;
      const direction = e.key === 'ArrowUp' ? -1 : 1;

      setState(prev => {
        const newIndex = prev + direction;
        if (newIndex < 0) return maxIndex;
        if (newIndex > maxIndex) return 0;
        return newIndex;
      });
      return;
    }

    // ESC 关闭建议
    if (e.key === 'Escape') {
      setShowCommandSuggestions(false);
      setShowWorkspaceSuggestions(false);
      setShowFileSuggestions(false);
      setShowGitSuggestions(false);
      clearResults();
      return;
    }

    // Tab 选择建议
    if (e.key === 'Tab' && !e.shiftKey) {
      if (showCommandSuggestions) {
        e.preventDefault();
        if (suggestedCommands.length > 0) {
          selectCommand(suggestedCommands[selectedCommandIndex].name);
        }
        return;
      }

      if (showWorkspaceSuggestions) {
        e.preventDefault();
        if (filteredWorkspaces.length > 0) {
          selectWorkspace(filteredWorkspaces[selectedWorkspaceIndex]);
        }
        return;
      }

      if (showFileSuggestions) {
        e.preventDefault();
        if (fileMatches.length > 0) {
          selectFile(fileMatches[selectedFileIndex]);
        }
        return;
      }

      if (showGitSuggestions) {
        e.preventDefault();
        if (gitSuggestions.length > 0) {
          selectGitSuggestion(gitSuggestions[selectedGitIndex]);
        }
        return;
      }
    }
  }, [
    showCommandSuggestions,
    showWorkspaceSuggestions,
    showFileSuggestions,
    showGitSuggestions,
    suggestedCommands,
    filteredWorkspaces,
    fileMatches,
    gitSuggestions,
    selectedCommandIndex,
    selectedWorkspaceIndex,
    selectedFileIndex,
    selectedGitIndex,
    selectCommand,
    selectWorkspace,
    selectFile,
    selectGitSuggestion,
    clearResults
  ]);

  const handleSend = useCallback(async () => {
    const trimmed = value.trim();
    if (!trimmed || disabled || isStreaming) return;

    // ========== @todo 命令解析 ==========
    const { parseTodoCommand, removeTodoCommand } = await import('./TodoCommandParser')
    const todoCommand = parseTodoCommand(trimmed)

    if (todoCommand && todoCommand.shouldCreate) {
      let aiPrompt = t('todo.createPrompt') + ': ' + todoCommand.content

      if (todoCommand.priority) {
        const priorityNames = {
          low: t('todo.priority.low'),
          normal: t('todo.priority.normal'),
          high: t('todo.priority.high'),
          urgent: t('todo.priority.urgent')
        }
        aiPrompt += `\n${t('todo.priority.label')}: ${priorityNames[todoCommand.priority]}`
      }

      if (todoCommand.tags && todoCommand.tags.length > 0) {
        aiPrompt += `\n${t('todo.tags')}: ${todoCommand.tags.join(', ')}`
      }

      // 移除 @todo 命令后的消息
      const cleanedMessage = removeTodoCommand(trimmed)

      // 发送组合消息：@todo 转换的提示 + 用户的其他输入
      const finalMessage = cleanedMessage
        ? `${aiPrompt}\n\n${cleanedMessage}`
        : aiPrompt

      onSend(finalMessage)
      resetInput()
      return
    }
    // ========== @todo 命令解析结束 ==========

    // 构建包含上下文信息的消息
    let finalMessage = trimmed;

    // 将上下文芯片信息附加到消息中
    if (contextChips.length > 0) {
      const contextInfo = contextChips.map(chip => {
        switch (chip.type) {
          case 'file':
            return `[文件: ${chip.path}]`;
          case 'commit':
            return `[提交: ${chip.shortHash} - ${chip.message}]`;
          case 'diff':
            return `[差异: ${chip.target === 'staged' ? '已暂存' : '未暂存'}]`;
          case 'workspace':
            return `[工作区: ${chip.workspace.name}]`;
          case 'directory':
            return `[目录: ${chip.path}]`;
          case 'symbol':
            return `[符号: ${chip.name}]`;
          default:
            return '';
        }
      }).join('\n');
      finalMessage = `${contextInfo}\n\n${trimmed}`;
    }

    // 检查是否是命令
    const commands = getCommands();
    const result = parseCommandInput(trimmed, commands);

    if (result.type === 'command') {
      const { command } = result;
      if (!command) return;

      if (command.name === 'commands') {
        onSend(generateCommandsListMessage(commands));
        resetInput();
        return;
      }

      if (command.name === 'help') {
        onSend(generateHelpMessage());
        resetInput();
        return;
      }

      const messageToSend = command.fullCommand || command.raw;
      onSend(messageToSend);
    } else {
      onSend(finalMessage);
    }

    resetInput();
  }, [value, disabled, isStreaming, getCommands, onSend, contextChips]);

  const resetInput = useCallback(() => {
    setValue('');
    setContextChips([]);
    setShowCommandSuggestions(false);
    setShowWorkspaceSuggestions(false);
    setShowFileSuggestions(false);
    setShowGitSuggestions(false);
    clearResults();
  }, [clearResults]);

  const handleTranslateAndSend = useCallback(async () => {
    const trimmed = value.trim();
    if (!trimmed || disabled || isStreaming || isTranslating) return;

    const baiduConfig = config?.baiduTranslate;
    if (!baiduConfig?.appId || !baiduConfig?.secretKey) {
      alert(t('error.apiKeyNotSet'));
      return;
    }

    setIsTranslating(true);
    try {
      const result = await baiduTranslate(trimmed, baiduConfig.appId, baiduConfig.secretKey);
      if (result.success && result.result) {
        const translatedMessage = result.result;
        let finalMessage = translatedMessage;

        if (contextChips.length > 0) {
          const contextInfo = contextChips.map(chip => {
            switch (chip.type) {
              case 'file':
                return `[File: ${chip.path}]`;
              case 'commit':
                return `[Commit: ${chip.shortHash} - ${chip.message}]`;
              case 'diff':
                return `[Diff: ${chip.target === 'staged' ? 'Staged' : 'Unstaged'}]`;
              case 'workspace':
                return `[Workspace: ${chip.workspace.name}]`;
              case 'directory':
                return `[Directory: ${chip.path}]`;
              case 'symbol':
                return `[Symbol: ${chip.name}]`;
              default:
                return '';
            }
          }).join('\n');
          finalMessage = `${contextInfo}\n\n${translatedMessage}`;
        }

        onSend(finalMessage);
        resetInput();
      } else {
        alert(t('error.translateFailed') + ': ' + (result.error || 'Unknown error'));
      }
    } catch (e) {
      alert(t('error.translateFailed') + ': ' + (e instanceof Error ? e.message : 'Unknown error'));
    } finally {
      setIsTranslating(false);
    }
  }, [value, disabled, isStreaming, isTranslating, config, contextChips, onSend, resetInput]);

  // 点击外部关闭建议
  useEffect(() => {
    const handleClickOutside = () => {
      setShowCommandSuggestions(false);
      setShowWorkspaceSuggestions(false);
      setShowFileSuggestions(false);
      setShowGitSuggestions(false);
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  return (
    <div className="border-t border-border bg-background-elevated" ref={containerRef}>
      <div className="p-3">
        {/* 上下文芯片栏 */}
        <ContextChips chips={contextChips} onRemove={removeContextChip} />

        {/* 输入框容器 - 紧凑布局 */}
        <div className="relative flex items-end gap-2 bg-background-surface border border-border rounded-xl p-2 focus-within:ring-2 focus-within:ring-border focus-within:border-primary transition-all shadow-soft hover:shadow-medium">
          <AutoResizingTextarea
            ref={textareaRef}
            value={value}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={t('input.placeholder')}
            className="flex-1 px-2 py-1.5 bg-transparent text-text-primary placeholder:text-text-tertiary resize-none outline-none text-sm leading-relaxed"
            disabled={disabled}
            maxHeight={180}
            minHeight={36}
          />

          {isStreaming && onInterrupt ? (
            <Button
              variant="danger"
              size="sm"
              onClick={onInterrupt}
              className="shrink-0 h-8 px-3 text-xs"
            >
              <IconStop size={12} className="mr-1" />
              {t('input.interrupt')}
            </Button>
          ) : (
            <>
              {config?.baiduTranslate?.appId && config?.baiduTranslate?.secretKey && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleTranslateAndSend}
                  disabled={disabled || isStreaming || isTranslating || !value.trim()}
                  className="shrink-0 h-8 px-3 text-xs"
                >
                  {isTranslating ? t('input.translating') : t('input.translateAndSend')}
                </Button>
              )}
              <Button
                onClick={handleSend}
                disabled={disabled || isStreaming || !value.trim()}
                size="sm"
                className="shrink-0 h-8 px-3 text-xs shadow-glow"
              >
                <IconSend size={12} className="mr-1" />
                {t('input.send')}
              </Button>
            </>
          )}
        </div>

        {/* 紧凑状态栏 - 仅在必要时显示 */}
        {(isStreaming || suggestionMode || value.length > 0) && (
          <div className="flex items-center justify-between mt-1.5 px-1">
            <div className="text-xs text-text-tertiary">
              {isStreaming ? (
                <span className="flex items-center gap-2">
                  <span className="w-1 h-1 bg-warning rounded-full animate-pulse" />
                  {t('status.generating')}
                </span>
              ) : suggestionMode === 'workspace' ? (
                <span>{t('input.selectWorkspace')}</span>
              ) : suggestionMode === 'file' ? (
                <span>{t('input.selectFile')}</span>
              ) : suggestionMode === 'git' ? (
                <span>{t('input.gitContext')}</span>
              ) : (
                <span>{t('input.hint')}</span>
              )}
            </div>
            {value.length > 0 && (
              <div className="text-xs text-text-tertiary">
                {value.length}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 命令建议 */}
      {showCommandSuggestions && suggestedCommands.length > 0 && (
        <CommandSuggestion
          commands={suggestedCommands.map(c => ({ name: c.name, description: c.description }))}
          selectedIndex={selectedCommandIndex}
          onSelect={(cmd) => selectCommand(cmd.name)}
          onHover={setSelectedCommandIndex}
          position={commandPosition}
        />
      )}

      {/* 工作区建议 */}
      {showWorkspaceSuggestions && filteredWorkspaces.length > 0 && (
        <WorkspaceSuggestion
          workspaces={filteredWorkspaces}
          currentWorkspaceId={currentWorkspaceId}
          selectedIndex={selectedWorkspaceIndex}
          onSelect={selectWorkspace}
          onHover={setSelectedWorkspaceIndex}
          position={workspacePosition}
        />
      )}

      {/* 文件建议 */}
      {showFileSuggestions && fileMatches.length > 0 && (
        <FileSuggestion
          files={fileMatches}
          selectedIndex={selectedFileIndex}
          onSelect={selectFile}
          onHover={setSelectedFileIndex}
          position={filePosition}
        />
      )}

      {/* Git 建议 */}
      {showGitSuggestions && (
        <GitSuggestion
          mode={gitMode}
          items={gitSuggestions}
          selectedIndex={selectedGitIndex}
          query={gitQuery}
          onSelect={selectGitSuggestion}
          onHover={setSelectedGitIndex}
          position={gitPosition}
          isLoading={isGitLoading}
        />
      )}
    </div>
  );
}
