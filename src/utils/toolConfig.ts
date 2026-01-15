/**
 * 工具调用配置 - 图标、颜色、标签映射
 * 使用 lucide-react 图标库
 */

import type { ToolCategory, ToolConfig } from './toolConfig.types';
import {
  // 读取类
  FileText,
  FileSearch,
  // 编辑类
  Edit2,
  Edit3,
  Pencil,
  // 写入类
  Save,
  FilePlus,
  FileDown,
  // 执行类
  Terminal,
  TerminalSquare,
  // 搜索类
  Search,
  Globe,
  // Git 类
  GitBranch,
  GitCommit,
  GitPullRequest,
  GitMerge,
  // 列表类
  List,
  FolderOpen,
  // 删除类
  Trash2,
  X,
  XCircle,
  // 其他
  Database,
  Wrench,
  Cpu,
  Layers,
} from 'lucide-react';

/** 工具图标映射 */
const TOOL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  // 读取类图标
  'read_file': FileText,
  'Read': FileText,
  'ReadFile': FileText,
  'Glob': FileSearch,
  'Grep': FileSearch,

  // 编辑类图标
  'str_replace_editor': Edit2,
  'Edit': Edit2,
  'Edit3': Edit3,
  'Pencil': Pencil,

  // 写入类图标
  'write_file': Save,
  'WriteFile': Save,
  'create_file': FilePlus,
  'CreateFile': FilePlus,
  'Write': FileDown,

  // 执行类图标
  'Bash': Terminal,
  'BashCommand': Terminal,
  'run_command': Terminal,
  'execute': TerminalSquare,

  // 搜索类图标
  'search_files': Search,
  'SearchFiles': Search,
  'web_search': Globe,
  'WebSearch': Globe,
  'api_call': Globe,
  'APICall': Globe,

  // Git 类图标
  'git_command': GitBranch,
  'GitCommand': GitBranch,
  'git_commit': GitCommit,
  'git_pull': GitPullRequest,
  'git_merge': GitMerge,

  // 列表类图标
  'list_files': List,
  'ListFiles': List,
  'file_browser': FolderOpen,
  'FileBrowser': FolderOpen,

  // 删除类图标
  'delete_file': Trash2,
  'DeleteFile': Trash2,
  'remove': X,
  'Remove': XCircle,

  // 其他图标
  'database_query': Database,
  'DatabaseQuery': Database,
  'task': Cpu,
  'Task': Cpu,
  'Skill': Layers,
  'skill': Layers,
  'default': Wrench,
};

/**
 * 工具类别到配置的映射
 */
const CATEGORY_CONFIG: Record<ToolCategory, {
  color: string;
  borderColor: string;
  bgColor: string;
}> = {
  read: {
    color: 'text-blue-500',
    borderColor: 'border-l-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  write: {
    color: 'text-green-500',
    borderColor: 'border-l-green-500',
    bgColor: 'bg-green-500/10',
  },
  edit: {
    color: 'text-orange-500',
    borderColor: 'border-l-orange-500',
    bgColor: 'bg-orange-500/10',
  },
  execute: {
    color: 'text-purple-500',
    borderColor: 'border-l-purple-500',
    bgColor: 'bg-purple-500/10',
  },
  search: {
    color: 'text-cyan-500',
    borderColor: 'border-l-cyan-500',
    bgColor: 'bg-cyan-500/10',
  },
  list: {
    color: 'text-indigo-500',
    borderColor: 'border-l-indigo-500',
    bgColor: 'bg-indigo-500/10',
  },
  git: {
    color: 'text-pink-500',
    borderColor: 'border-l-pink-500',
    bgColor: 'bg-pink-500/10',
  },
  delete: {
    color: 'text-red-500',
    borderColor: 'border-l-red-500',
    bgColor: 'bg-red-500/10',
  },
  other: {
    color: 'text-gray-500',
    borderColor: 'border-l-gray-500',
    bgColor: 'bg-gray-500/10',
  },
};

/**
 * 工具名称到类别的映射
 */
const TOOL_CATEGORY: Record<string, ToolCategory> = {
  // 读取类
  'read_file': 'read',
  'Read': 'read',
  'ReadFile': 'read',
  'Glob': 'read',
  'Grep': 'search',

  // 编辑类
  'str_replace_editor': 'edit',
  'Edit': 'edit',
  'Edit3': 'edit',
  'Pencil': 'edit',

  // 写入类
  'write_file': 'write',
  'WriteFile': 'write',
  'create_file': 'write',
  'CreateFile': 'write',
  'Write': 'write',

  // 执行类
  'Bash': 'execute',
  'BashCommand': 'execute',
  'run_command': 'execute',
  'execute': 'execute',

  // 搜索类
  'search_files': 'search',
  'SearchFiles': 'search',
  'web_search': 'search',
  'WebSearch': 'search',
  'api_call': 'search',
  'APICall': 'search',

  // Git 类
  'git_command': 'git',
  'GitCommand': 'git',
  'git_commit': 'git',
  'git_pull': 'git',
  'git_merge': 'git',

  // 列表类
  'list_files': 'list',
  'ListFiles': 'list',
  'file_browser': 'list',
  'FileBrowser': 'list',

  // 删除类
  'delete_file': 'delete',
  'DeleteFile': 'delete',
  'remove': 'delete',
  'Remove': 'delete',

  // 其他
  'database_query': 'other',
  'DatabaseQuery': 'other',
  'task': 'other',
  'Task': 'other',
  'Skill': 'other',
  'skill': 'other',
};

/**
 * 工具中文标签映射
 */
const TOOL_LABELS: Record<string, string> = {
  'read_file': '读取',
  'Read': '读取',
  'ReadFile': '读取',
  'str_replace_editor': '编辑',
  'Edit': '编辑',
  'write_file': '写入',
  'WriteFile': '写入',
  'create_file': '创建',
  'CreateFile': '创建',
  'Write': '写入',
  'Bash': '执行',
  'BashCommand': '执行',
  'run_command': '执行',
  'Glob': '搜索文件',
  'Grep': '搜索内容',
  'search_files': '搜索',
  'SearchFiles': '搜索',
  'web_search': '网络搜索',
  'WebSearch': '网络搜索',
  'git_command': 'Git',
  'GitCommand': 'Git',
  'list_files': '列表',
  'ListFiles': '列表',
  'delete_file': '删除',
  'DeleteFile': '删除',
  'database_query': '数据库',
  'DatabaseQuery': '数据库',
  'task': '任务',
  'Task': '任务',
  'Skill': '技能',
  'skill': '技能',
};

/**
 * 获取工具配置
 */
export function getToolConfig(toolName: string): ToolConfig {
  const category = TOOL_CATEGORY[toolName] || 'other';
  const categoryStyle = CATEGORY_CONFIG[category];
  const IconComponent = TOOL_ICONS[toolName] || TOOL_ICONS['default']!;
  const label = TOOL_LABELS[toolName] || toolName;

  return {
    icon: IconComponent,
    category,
    color: categoryStyle.color,
    borderColor: categoryStyle.borderColor,
    bgColor: categoryStyle.bgColor,
    label,
  };
}

/**
 * 从工具输入中提取文件名
 */
export function extractFileName(input: Record<string, unknown> | undefined): string {
  if (!input) return '';

  const pathKeys = ['path', 'file_path', 'filePath', 'filename', 'file'];
  for (const key of pathKeys) {
    const value = input[key];
    if (typeof value === 'string') {
      // 只显示文件名，不显示完整路径
      const parts = value.split('/');
      const parts2 = value.split('\\');
      const fileName = parts.length > parts2.length
        ? parts[parts.length - 1]
        : parts2[parts2.length - 1];
      return fileName || value;
    }
  }
  return '';
}

/**
 * 从工具输入中提取命令
 */
export function extractCommand(input: Record<string, unknown> | undefined): string {
  if (!input) return '';

  const cmdKeys = ['command', 'cmd', 'command_string', 'commands'];
  for (const key of cmdKeys) {
    const value = input[key];
    if (typeof value === 'string') {
      // 截断过长的命令
      return value.length > 40 ? value.slice(0, 37) + '...' : value;
    }
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') {
      return value[0].length > 40 ? value[0].slice(0, 37) + '...' : value[0];
    }
  }
  return '';
}

/**
 * 从工具输入中提取搜索关键词
 */
export function extractSearchQuery(input: Record<string, unknown> | undefined): string {
  if (!input) return '';

  const queryKeys = ['query', 'q', 'search', 'keyword', 'pattern', 'regex'];
  for (const key of queryKeys) {
    const value = input[key];
    if (typeof value === 'string') {
      return value.length > 30 ? value.slice(0, 27) + '...' : value;
    }
  }
  return '';
}

/**
 * 根据工具类型提取关键信息
 */
export function extractToolKeyInfo(toolName: string, input: Record<string, unknown> | undefined): string {
  const category = TOOL_CATEGORY[toolName];

  switch (category) {
    case 'read':
    case 'edit':
    case 'write':
    case 'delete':
      return extractFileName(input);
    case 'execute':
    case 'git':
      return extractCommand(input);
    case 'search':
      return extractSearchQuery(input);
    case 'list':
      return extractFileName(input) || '目录';
    default:
      return extractFileName(input) || extractCommand(input) || extractSearchQuery(input) || '';
  }
}
