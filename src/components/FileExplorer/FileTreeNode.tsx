import { memo, useEffect, useState, useCallback } from 'react';
import { ChevronRight, ChevronDown, Folder, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { FileIcon } from './FileIcon';
import { ContextMenu, isHtmlFile, type ContextMenuItem } from './ContextMenu';
import { useFileExplorerStore, useFileEditorStore } from '../../stores';
import { openInDefaultApp } from '../../services/tauri';
import { InputDialog } from '../Common/InputDialog';
import { ConfirmDialog } from '../Common/ConfirmDialog';
import { IconFile, IconFolder, IconEdit, IconTrash, IconExternalLink, IconOpen } from '../Common/Icons';
import type { FileInfo } from '../../types';

/**
 * 验证文件名是否合法
 * @param name 文件名
 * @returns 是否合法
 */
function isValidFileName(name: string): boolean {
  if (!name || name.trim().length === 0) {
    return false;
  }

  const trimmed = name.trim();

  // 检查非法字符（Windows 不允许的字符）
  const invalidChars = /[<>:"|?*\\\/]/;
  if (invalidChars.test(trimmed)) {
    return false;
  }

  // 检查保留名称
  const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
  if (reservedNames.test(trimmed)) {
    return false;
  }

  // 检查是否以点或空格开头或结尾
  if (trimmed.startsWith('.') || trimmed.startsWith(' ') || trimmed.endsWith(' ') || trimmed.endsWith('.')) {
    return false;
  }

  return true;
}

/**
 * 路径拼接辅助函数
 * @param basePath 基础路径
 * @param name 文件名
 * @returns 拼接后的路径
 */
function joinPath(basePath: string, name: string): string {
  // 移除路径末尾的分隔符，确保只有一个分隔符
  const cleanBase = basePath.replace(/[\/\\]+$/, '');
  return `${cleanBase}/${name}`;
}

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
  const { load_folder_content, get_cached_folder_content, toggle_folder, select_file, create_file, create_directory, delete_file, rename_file } = useFileExplorerStore();
  const { openFile } = useFileEditorStore();

  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
  }>({ visible: false, x: 0, y: 0 });

  // 输入对话框状态
  const [inputDialog, setInputDialog] = useState<{
    visible: boolean;
    title: string;
    message: string;
    defaultValue: string;
    action: 'create-file' | 'create-folder' | 'rename';
  }>({ visible: false, title: '', message: '', defaultValue: '', action: 'create-file' });

  // 确认对话框状态
  const [confirmDialog, setConfirmDialog] = useState<{
    visible: boolean;
    message: string;
  }>({ visible: false, message: '' });

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
        icon: <IconOpen size={14} />,
        action: async () => {
          if (file.is_dir) {
            toggle_folder(file.path);
          } else {
            await openFile(file.path, file.name);
          }
        },
      },
    ];

    // 如果是文件夹，添加"新建文件"和"新建文件夹"选项
    if (file.is_dir) {
      items.push({
        id: 'create-file',
        label: '新建文件',
        icon: <IconFile size={14} />,
        action: () => {
          setInputDialog({
            visible: true,
            title: '新建文件',
            message: '请输入文件名:',
            defaultValue: '',
            action: 'create-file',
          });
        },
      });

      items.push({
        id: 'create-folder',
        label: '新建文件夹',
        icon: <IconFolder size={14} />,
        action: () => {
          setInputDialog({
            visible: true,
            title: '新建文件夹',
            message: '请输入文件夹名:',
            defaultValue: '',
            action: 'create-folder',
          });
        },
      });
    }

    // 添加分隔符
    items.push({ id: 'separator-1', label: '-', icon: undefined, action: () => {} });

    // 添加"重命名"选项
    items.push({
      id: 'rename',
      label: '重命名',
      icon: <IconEdit size={14} />,
      action: () => {
        setInputDialog({
          visible: true,
          title: '重命名',
          message: '请输入新名称:',
          defaultValue: file.name,
          action: 'rename',
        });
      },
    });

    // 添加"删除"选项
    items.push({
      id: 'delete',
      label: '删除',
      icon: <IconTrash size={14} />,
      action: () => {
        const itemType = file.is_dir ? '文件夹' : '文件';
        setConfirmDialog({
          visible: true,
          message: `确定要删除${itemType} "${file.name}" 吗？\n此操作不可撤销。`,
        });
      },
    });

    // HTML 文件添加"在浏览器中打开"选项
    if (isHtmlFile(file)) {
      items.push({ id: 'separator-2', label: '-', icon: undefined, action: () => {} });
      items.push({
        id: 'open-in-browser',
        label: '在浏览器中打开',
        icon: <IconExternalLink size={14} />,
        action: async () => {
          await openInDefaultApp(file.path);
        },
      });
    }

    return items;
  }, [file, toggle_folder, openFile]);

  // 处理输入对话框确认
  const handleInputDialogConfirm = async (value: string) => {
    if (!value) return;

    if (inputDialog.action === 'create-file') {
      if (isValidFileName(value)) {
        const fullPath = joinPath(file.path, value);
        await create_file(fullPath, '');
        setInputDialog({ ...inputDialog, visible: false });
      }
    } else if (inputDialog.action === 'create-folder') {
      if (isValidFileName(value)) {
        const fullPath = joinPath(file.path, value);
        await create_directory(fullPath);
        setInputDialog({ ...inputDialog, visible: false });
      }
    } else if (inputDialog.action === 'rename') {
      if (value && value !== file.name && isValidFileName(value)) {
        await rename_file(file.path, value);
        setInputDialog({ ...inputDialog, visible: false });
      }
    }
  };

  // 处理确认对话框确认
  const handleConfirmDialogConfirm = async () => {
    await delete_file(file.path);
    setConfirmDialog({ ...confirmDialog, visible: false });
  };

  // 输入对话框验证函数
  const validateInput = (value: string) => {
    if (!value || value.trim().length === 0) {
      return '名称不能为空';
    }
    if (!isValidFileName(value)) {
      return '文件名包含非法字符或使用了保留名称';
    }
    if (inputDialog.action === 'rename' && value === file.name) {
      return '新名称与原名称相同';
    }
    return null;
  };

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

      {/* 确认对话框 */}
      {confirmDialog.visible && (
        <ConfirmDialog
          message={confirmDialog.message}
          onConfirm={handleConfirmDialogConfirm}
          onCancel={() => setConfirmDialog({ ...confirmDialog, visible: false })}
          type="danger"
        />
      )}
    </div>
  );
});

FileTreeNode.displayName = 'FileTreeNode';