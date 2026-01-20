import { memo, useEffect, useState, useCallback } from 'react';
import { ChevronRight, ChevronDown, Folder, Loader2, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';
import { FileIcon } from './FileIcon';
import { ContextMenu, isHtmlFile, type ContextMenuItem } from './ContextMenu';
import { useFileExplorerStore, useFileEditorStore } from '../../stores';
import { openInDefaultApp } from '../../services/tauri';
import type { FileInfo } from '../../types';

interface FileTreeNodeProps {
  file: FileInfo;
  level: number;
  isExpanded: boolean;
  isSelected: boolean;
  expandedFolders: Set<string>;
  loadingFolders: Set<string>;
}

export const FileTreeNode = memo<FileTreeNodeProps>(({
  file,
  level,
  isExpanded,
  isSelected,
  expandedFolders,
  loadingFolders,
}) => {
  const { load_folder_content, get_cached_folder_content, toggle_folder, select_file } = useFileExplorerStore();
  const { openFile } = useFileEditorStore();

  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
  }>({ visible: false, x: 0, y: 0 });

  // 删除确认对话框状态
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // 获取父目录路径
  const getParentPath = useCallback((filePath: string): string => {
    const parts = filePath.split(/[/\\]/);
    parts.pop();
    return parts.join('/');
  }, []);

  // 懒加载逻辑：展开文件夹时加载内容
  useEffect(() => {
    if (file.is_dir && isExpanded) {
      const cached = get_cached_folder_content(file.path);
      
      // 如果没有缓存且没有子项，触发加载
      if (!cached && (!file.children || file.children.length === 0)) {
        load_folder_content(file.path);
      }
    }
  }, [file.is_dir, file.path, isExpanded, file.children, load_folder_content, get_cached_folder_content]);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (file.is_dir) {
      // 直接调用 store 的 toggle_folder
      toggle_folder(file.path);

      // 展开时检查是否需要加载内容
      if (!isExpanded) {
        const cached = get_cached_folder_content(file.path);

        // 如果没有缓存且没有子项，触发加载
        if (!cached && (!file.children || file.children.length === 0)) {
          await load_folder_content(file.path);
        }
      }
    } else {
      // 直接调用 store 的 openFile
      await openFile(file.path, file.name);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick(e as any);
    }
  };

  // 检查是否正在加载
  const isLoading = file.is_dir && loadingFolders.has(file.path);

  // 检查是否有子内容
  const hasChildren = file.children && file.children.length > 0;

  // 关闭右键菜单
  const closeContextMenu = useCallback(() => {
    setContextMenu({ visible: false, x: 0, y: 0 });
  }, []);

  // 删除文件/文件夹
  const handleDelete = useCallback(async () => {
    setShowDeleteConfirm(false);
    closeContextMenu();

    const { delete_file, load_directory } = useFileExplorerStore.getState();

    try {
      await delete_file(file.path);

      // 如果删除的是文件夹，需要刷新父目录
      if (file.is_dir) {
        const parentPath = getParentPath(file.path);
        await load_directory(parentPath);
      }
    } catch (error) {
      console.error('删除失败:', error);
    }
  }, [file, closeContextMenu, getParentPath]);

  // 右键菜单处理
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // 选中当前文件
    select_file(file);

    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
    });
  }, [file, select_file]);

  // 构建菜单项
  const getMenuItems = useCallback((): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [
      {
        id: 'open',
        label: file.is_dir ? '打开文件夹' : '打开文件',
        icon: file.is_dir ? '📂' : '📄',
        action: async () => {
          if (file.is_dir) {
            toggle_folder(file.path);
          } else {
            await openFile(file.path, file.name);
          }
        },
      },
      {
        id: 'delete',
        label: '删除',
        icon: '🗑️',
        action: () => {
          setShowDeleteConfirm(true);
        },
      },
    ];

    // HTML 文件添加"在浏览器中打开"选项
    if (isHtmlFile(file)) {
      items.splice(1, 0, {
        id: 'open-in-browser',
        label: '在浏览器中打开',
        icon: '🌐',
        action: async () => {
          await openInDefaultApp(file.path);
        },
      });
    }

    return items;
  }, [file, toggle_folder, openFile]);

  return (
    <div>
      <div
        className={clsx(
          'flex items-center px-2 py-1.5 cursor-pointer rounded transition-colors',
          'hover:bg-background-hover',
          isSelected && 'bg-primary/20 border-l-2 border-primary'
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-label={file.is_dir ? `文件夹 ${file.name}` : `文件 ${file.name}`}
      >
        {/* 展开/收起图标 - 使用 lucide-react 图标 */}
        {file.is_dir && (
          <span className="mr-1 flex-shrink-0">
            {isLoading ? (
              <Loader2 className="w-3.5 h-3.5 text-text-muted animate-spin" />
            ) : isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-text-muted" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-text-muted" />
            )}
          </span>
        )}

        {/* 占位符（非目录文件） */}
        {!file.is_dir && <span className="mr-1 w-3.5 flex-shrink-0" />}

        {/* 文件/文件夹图标 */}
        {file.is_dir ? (
          <Folder className={clsx(
            'mr-2 w-4 h-4 flex-shrink-0',
            isExpanded ? 'text-primary' : 'text-text-muted'
          )} />
        ) : (
          <FileIcon
            file={file}
            className="mr-2 w-4 h-4 flex-shrink-0"
          />
        )}

        {/* 文件名 */}
        <span
          className="text-sm text-text-primary truncate flex-1 min-w-0"
          title={file.name}
        >
          {file.name}
        </span>
      </div>
      
      {/* 子文件 */}
      {file.is_dir && isExpanded && hasChildren && (
        <div className="animate-in slide-in-from-top-1 duration-200">
          {file.children?.map(child => (
            <FileTreeNode
              key={child.path}
              file={child}
              level={level + 1}
              isExpanded={expandedFolders.has(child.path)}
              isSelected={false}
              expandedFolders={expandedFolders}
              loadingFolders={loadingFolders}
            />
          ))}
        </div>
      )}
      
      {/* 加载中提示 */}
      {file.is_dir && isExpanded && isLoading && (
        <div 
          style={{ paddingLeft: `${(level + 1) * 16 + 8}px` }} 
          className="text-xs text-text-tertiary py-1 animate-pulse"
        >
          加载中...
        </div>
      )}
      
      {/* 空文件夹提示 */}
      {file.is_dir && isExpanded && !isLoading && !hasChildren && (
        <div
          style={{ paddingLeft: `${(level + 1) * 16 + 8}px` }}
          className="text-xs text-text-tertiary py-1 italic"
        >
          空文件夹
        </div>
      )}

      {/* 右键菜单 */}
      <ContextMenu
        visible={contextMenu.visible}
        x={contextMenu.x}
        y={contextMenu.y}
        items={getMenuItems()}
        onClose={closeContextMenu}
      />

      {/* 删除确认对话框 */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background-surface border border-border rounded-lg shadow-xl p-6 w-80 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-danger/10 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-danger" />
              </div>
              <div>
                <h3 className="font-medium text-text-primary">确认删除</h3>
                <p className="text-sm text-text-secondary">
                  {file.is_dir ? '此操作将删除文件夹及其所有内容' : '此操作将永久删除该文件'}
                </p>
              </div>
            </div>
            <div className="bg-background-hover rounded px-3 py-2 mb-4">
              <p className="text-sm text-text-secondary font-mono truncate">{file.name}</p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-background-hover rounded-md transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 text-sm text-white bg-danger hover:bg-danger/90 rounded-md transition-colors"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

FileTreeNode.displayName = 'FileTreeNode';