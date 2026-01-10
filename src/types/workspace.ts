/**
 * 工作区相关类型定义
 */

/** 工作区基础信息 */
export interface Workspace {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  lastAccessed: string;
}

/** 工作区引用解析结果 */
export interface WorkspaceReference {
  workspaceName: string;
  workspacePath: string;
  relativePath: string;
  absolutePath: string;
  originalText: string;
}

/** 解析后的消息 */
export interface ParsedWorkspaceMessage {
  processedMessage: string;
  references: WorkspaceReference[];
  contextHeader: string;
}

/** 工作区状态 */
export interface WorkspaceState {
  workspaces: Workspace[];
  currentWorkspaceId: string | null;
  /** 上下文工作区 ID 列表（AI 可读取） */
  contextWorkspaceIds: string[];
  /** FileExplorer 当前查看的工作区 ID（不持久化） */
  viewingWorkspaceId: string | null;
  isLoading: boolean;
  error: string | null;
}

/** 工作区操作 */
export interface WorkspaceActions {
  // 基础操作
  createWorkspace: (name: string, path: string) => Promise<void>;
  switchWorkspace: (id: string) => Promise<void>;
  deleteWorkspace: (id: string) => Promise<void>;
  updateWorkspace: (id: string, updates: Partial<Workspace>) => Promise<void>;

  // 工具方法
  getCurrentWorkspace: () => Workspace | null;
  validateWorkspacePath: (path: string) => Promise<boolean>;
  clearError: () => void;

  // 上下文工作区操作
  /** 设置上下文工作区列表 */
  setContextWorkspaces: (ids: string[]) => void;
  /** 添加到上下文 */
  addContextWorkspace: (id: string) => void;
  /** 从上下文移除 */
  removeContextWorkspace: (id: string) => void;
  /** 切换上下文状态 */
  toggleContextWorkspace: (id: string) => void;
  /** 清空上下文 */
  clearContextWorkspaces: () => void;
  /** 获取上下文工作区列表 */
  getContextWorkspaces: () => Workspace[];
  /** 获取所有可访问的工作区（当前 + 上下文） */
  getAllAccessibleWorkspaces: () => Workspace[];

  // FileExplorer 查看工作区操作
  /** 设置 FileExplorer 当前查看的工作区 */
  setViewingWorkspace: (id: string | null) => void;
  /** 获取 FileExplorer 当前查看的工作区 */
  getViewingWorkspace: () => Workspace | null;
}

/** 完整的工作区 Store 类型 */
export type WorkspaceStore = WorkspaceState & WorkspaceActions;