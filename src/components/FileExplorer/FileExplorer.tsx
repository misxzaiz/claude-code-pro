import { useEffect, useCallback, useState } from 'react';
import { useFileExplorerStore, useWorkspaceStore, useCommandStore } from '../../stores';
import { FileTree } from './FileTree';
import { SearchBar } from './SearchBar';
import { GitStatusIndicator } from './GitStatusIndicator';
import { ContextMenu } from './ContextMenu';
import { InputDialog } from '../Common/InputDialog';
import { IconPlus } from '../Common/Icons';
import type { ContextMenuItem } from './ContextMenu';

export function FileExplorer() {
  // 浏览工作区下拉菜单状态
  const [showViewingMenu, setShowViewingMenu] = useState(false);

  // 新建菜单状态
  const [showNewMenu, setShowNewMenu] = useState(false);

  // 输入对话框状态
  const [inputDialog, setInputDialog] = useState<{
    visible: boolean;
    title: string;
    message: string;
    defaultValue: string;
    action: 'create-file' | 'create-folder';
  }>({ visible: false, title: '', message: '', defaultValue: '', action: 'create-file' });

  // 根目录右键菜单状态
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
  }>({ visible: false, x: 0, y: 0 });

  const {
    current_path,
    loading,
    is_refreshing,
    error,
    load_directory,
    refresh_directory,
    clear_error,
    create_file,
    create_directory,
  } = useFileExplorerStore();

  const {
    getCurrentWorkspace,
    currentWorkspaceId,
    workspaces,
    getAllAccessibleWorkspaces,
    setViewingWorkspace,
    getViewingWorkspace,
  } = useWorkspaceStore();
  const { loadCustomCommands } = useCommandStore();

  // 监听工作区变化，自动加载新工作区
  // 只有当用户正在查看的是被切换掉的工作区时，才自动切换
  useEffect(() => {
    const handleWorkspaceChange = (event: CustomEvent) => {
      const { workspaceId: newWorkspaceId } = event.detail;
      const viewingWorkspace = getViewingWorkspace();

      // 如果用户正在查看的是旧的活动工作区，则切换到新的活动工作区
      // 如果用户正在查看某个关联工作区，则保持不变
      if (!viewingWorkspace || viewingWorkspace.id === newWorkspaceId) {
        const currentWorkspace = getCurrentWorkspace();
        if (currentWorkspace) {
          load_directory(currentWorkspace.path);
          loadCustomCommands(currentWorkspace.path);
        }
      }
    };

    window.addEventListener('workspace-changed', handleWorkspaceChange as EventListener);

    return () => {
      window.removeEventListener('workspace-changed', handleWorkspaceChange as EventListener);
    };
  }, [load_directory, getCurrentWorkspace, getViewingWorkspace, loadCustomCommands]);

  // 快捷键支持
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // F5 或 Ctrl+R 刷新
      if (event.key === 'F5' || (event.ctrlKey && event.key === 'r')) {
        event.preventDefault();
        refresh_directory();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [refresh_directory]);

  // 初始化加载工作区目录
  // 优先使用 viewingWorkspace，如果没有则使用当前工作区
  useEffect(() => {
    const viewingWorkspace = getViewingWorkspace();
    const targetWorkspace = viewingWorkspace || getCurrentWorkspace();

    if (targetWorkspace && current_path !== targetWorkspace.path) {
      load_directory(targetWorkspace.path);
      loadCustomCommands(targetWorkspace.path);
    }
  }, [load_directory, current_path, getCurrentWorkspace, getViewingWorkspace, loadCustomCommands]);

  const handleRefresh = useCallback(() => {
    clear_error();
    refresh_directory();
  }, [clear_error, refresh_directory]);

  // 文件名验证函数
  const isValidFileName = (name: string): boolean => {
    if (!name || name.trim().length === 0) {
      return false;
    }
    const trimmed = name.trim();
    const invalidChars = /[<>:"|?*\\\/]/;
    if (invalidChars.test(trimmed)) {
      return false;
    }
    const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
    if (reservedNames.test(trimmed)) {
      return false;
    }
    if (trimmed.startsWith('.') || trimmed.startsWith(' ') || trimmed.endsWith(' ') || trimmed.endsWith('.')) {
      return false;
    }
    return true;
  };

  // 处理工具栏右键菜单
  const handleToolbarContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
    });
  }, []);

  // 关闭右键菜单
  const closeContextMenu = useCallback(() => {
    setContextMenu({ visible: false, x: 0, y: 0 });
  }, []);

  // 构建根目录右键菜单
  const getContextMenuItems = useCallback((): ContextMenuItem[] => {
    return [
      {
        id: 'create-file',
        label: '新建文件',
        icon: <span className="text-base">📄</span>,
        action: () => {
          setInputDialog({
            visible: true,
            title: '新建文件',
            message: '请输入文件名:',
            defaultValue: '',
            action: 'create-file',
          });
          closeContextMenu();
        },
      },
      {
        id: 'create-folder',
        label: '新建文件夹',
        icon: <span className="text-base">📁</span>,
        action: () => {
          setInputDialog({
            visible: true,
            title: '新建文件夹',
            message: '请输入文件夹名:',
            defaultValue: '',
            action: 'create-folder',
          });
          closeContextMenu();
        },
      },
    ];
  }, [closeContextMenu]);

  // 处理输入对话框确认
  const handleInputDialogConfirm = async (value: string) => {
    if (!value || !current_path) return;

    if (inputDialog.action === 'create-file') {
      if (isValidFileName(value)) {
        const fullPath = `${current_path}/${value}`.replace(/\/+/g, '/');
        await create_file(fullPath, '');
        setInputDialog({ ...inputDialog, visible: false });
      }
    } else if (inputDialog.action === 'create-folder') {
      if (isValidFileName(value)) {
        const fullPath = `${current_path}/${value}`.replace(/\/+/g, '/');
        await create_directory(fullPath);
        setInputDialog({ ...inputDialog, visible: false });
      }
    }
  };

  // 输入对话框验证函数
  const validateInput = (value: string) => {
    if (!value || value.trim().length === 0) {
      return '名称不能为空';
    }
    if (!isValidFileName(value)) {
      return '文件名包含非法字符或使用了保留名称';
    }
    return null;
  };

  // 获取当前正在查看的工作区
  // 注意：不使用 useMemo，因为 Zustand store 已经做了优化
  // 如果使用 useMemo，依赖项函数引用不变会导致缓存不更新
  const viewingWorkspace = getViewingWorkspace();
  const accessibleWorkspaces = getAllAccessibleWorkspaces();

  // 切换浏览工作区
  const handleSwitchViewingWorkspace = useCallback(async (workspaceId: string | null) => {
    setViewingWorkspace(workspaceId);
    setShowViewingMenu(false);

    // 加载新工作区的目录
    const targetWorkspace = workspaceId
      ? workspaces.find(w => w.id === workspaceId)
      : getCurrentWorkspace();

    if (targetWorkspace) {
      load_directory(targetWorkspace.path);
      loadCustomCommands(targetWorkspace.path);
    }
  }, [setViewingWorkspace, workspaces, getCurrentWorkspace, load_directory, loadCustomCommands]);

  const currentWorkspace = getCurrentWorkspace();

  return (
    <div className="h-full flex flex-col">
      {/* 顶部区域 */}
      <div className="border-b border-border bg-background-surface">
        {/* 第一行：工作区名称 */}
        <div className="px-3 py-2">
          {/* 工作区查看选择器 */}
          <div className="relative">
            <button
              onClick={() => setShowViewingMenu(!showViewingMenu)}
              className="w-full flex items-center justify-between gap-2 text-sm font-medium text-text-primary hover:text-primary transition-colors"
              title={`正在查看: ${viewingWorkspace?.name || currentWorkspace?.name || '未选择工作区'}`}
            >
              <span className="flex items-center gap-1.5 truncate">
                {viewingWorkspace?.id === currentWorkspaceId || !viewingWorkspace ? (
                  // 当前工作区
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                    <span className="truncate">{viewingWorkspace?.name || currentWorkspace?.name || '未选择工作区'}</span>
                  </>
                ) : (
                  // 关联工作区
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/50 shrink-0" />
                    <span className="truncate">{viewingWorkspace?.name}</span>
                  </>
                )}
              </span>
              {/* 只有在有多个可访问工作区时才显示下拉箭头 */}
              {accessibleWorkspaces.length > 1 && (
                <svg
                  className={`shrink-0 w-3.5 h-3.5 transition-transform ${showViewingMenu ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              )}
            </button>

            {/* 浏览工作区下拉菜单 */}
            {showViewingMenu && accessibleWorkspaces.length > 1 && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowViewingMenu(false)}
                />
                <div className="absolute left-0 right-0 top-full mt-1 bg-background-elevated border border-border rounded-lg shadow-lg z-20 overflow-hidden">
                  {/* 当前工作区 */}
                  <button
                    onClick={() => handleSwitchViewingWorkspace(null)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                      !viewingWorkspace || viewingWorkspace.id === currentWorkspaceId
                        ? 'bg-primary/10 text-primary'
                        : 'text-text-secondary hover:text-text-primary hover:bg-background-hover'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                    <span className="flex-1 truncate">{currentWorkspace?.name || '未选择工作区'}</span>
                    {(!viewingWorkspace || viewingWorkspace.id === currentWorkspaceId) && (
                      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>

                  {/* 关联工作区列表 */}
                  {accessibleWorkspaces
                    .filter(w => w.id !== currentWorkspaceId)
                    .map(workspace => (
                      <button
                        key={workspace.id}
                        onClick={() => handleSwitchViewingWorkspace(workspace.id)}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                          viewingWorkspace?.id === workspace.id
                            ? 'bg-primary/10 text-primary'
                            : 'text-text-secondary hover:text-text-primary hover:bg-background-hover'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-primary/50 shrink-0" />
                        <span className="flex-1 truncate">{workspace.name}</span>
                        {viewingWorkspace?.id === workspace.id && (
                          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                    ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* 第二行：工具栏 */}
        <div
          className="flex items-center justify-between px-3 py-2 border-t border-border-subtle"
          onContextMenu={handleToolbarContextMenu}
        >
          {/* 左侧：工具按钮区域 */}
          <div className="flex items-center gap-2">
            {/* 新建按钮 */}
            <div className="relative">
              <button
                onClick={() => setShowNewMenu(!showNewMenu)}
                className="p-1.5 rounded-lg transition-all duration-200 text-text-secondary hover:text-text-primary hover:bg-background-hover"
                title="新建"
              >
                <IconPlus size={16} />
              </button>

              {/* 新建下拉菜单 */}
              {showNewMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowNewMenu(false)}
                  />
                  <div className="absolute left-0 top-full mt-1 bg-background-elevated border border-border rounded-lg shadow-lg z-20 overflow-hidden min-w-[120px]">
                    <button
                      onClick={() => {
                        setInputDialog({
                          visible: true,
                          title: '新建文件',
                          message: '请输入文件名:',
                          defaultValue: '',
                          action: 'create-file',
                        });
                        setShowNewMenu(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-text-secondary hover:text-text-primary hover:bg-background-hover transition-colors"
                    >
                      <span>📄</span>
                      <span>新建文件</span>
                    </button>
                    <button
                      onClick={() => {
                        setInputDialog({
                          visible: true,
                          title: '新建文件夹',
                          message: '请输入文件夹名:',
                          defaultValue: '',
                          action: 'create-folder',
                        });
                        setShowNewMenu(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-text-secondary hover:text-text-primary hover:bg-background-hover transition-colors"
                    >
                      <span>📁</span>
                      <span>新建文件夹</span>
                    </button>
                  </div>
                </>
              )}
            </div>
            {/* Git 状态指示器 */}
            <GitStatusIndicator />
          </div>

          {/* 右侧：刷新按钮 */}
          <button
            onClick={handleRefresh}
            disabled={loading || is_refreshing}
            className={`
              p-1.5 rounded-lg transition-all duration-200
              ${loading || is_refreshing
                ? 'text-text-tertiary cursor-not-allowed'
                : 'text-text-secondary hover:text-text-primary hover:bg-background-hover'
              }
            `}
            title="刷新目录 (F5)"
          >
            <svg
              className={`w-4 h-4 ${is_refreshing ? 'animate-spin' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* 搜索栏 */}
      <SearchBar />
      
      {/* 错误提示 */}
      {error && (
        <div className="mx-2 p-2 bg-danger-faint border border-danger/30 rounded-lg text-danger text-xs">
          {error}
        </div>
      )}

      {/* 文件树 */}
      <div className="flex-1 overflow-auto overflow-x-auto">
        <FileTree />
      </div>

      {/* 根目录右键菜单 */}
      <ContextMenu
        visible={contextMenu.visible}
        x={contextMenu.x}
        y={contextMenu.y}
        items={getContextMenuItems()}
        onClose={closeContextMenu}
      />

      {/* 输入对话框 */}
      {inputDialog.visible && (
        <InputDialog
          title={inputDialog.title}
          message={inputDialog.message}
          defaultValue={inputDialog.defaultValue}
          onConfirm={handleInputDialogConfirm}
          onCancel={() => setInputDialog({ ...inputDialog, visible: false })}
          validate={validateInput}
        />
      )}
    </div>
  );
}

/*
TODO: 后续优化方案 - 实现文件系统监听自动刷新
当前实现：手动刷新按钮 + F5快捷键
目标实现：
1. 使用 Rust notify crate 监听文件系统变化
2. 自动检测文件创建、删除、修改、重命名
3. 实时更新文件树，无需手动刷新
4. 优化监听性能，避免过度刷新
5. 处理监听错误和边界情况

技术方案：
- 后端：使用 notify::RecommendedWatcher 监听工作区目录
- 前端：通过 Tauri events 接收文件系统变化通知
- 缓存策略：智能更新受影响的目录节点
- 性能优化：防抖处理，避免频繁更新

实现优先级：高
预期收益：用户体验显著提升，工作流程更加流畅
*/