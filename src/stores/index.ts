/**
 * 状态管理统一导出
 */

export { useConfigStore } from './configStore';

// 旧版 Chat Store（兼容性保留）
export { useChatStore } from './chatStore';

// 新版 AI Chat Store（基于 AI Runtime 架构）
export { useAIChatStore } from './aiChatStore';

// 事件驱动 Chat Store（基于 EventBus）
export { useEventChatStore } from './eventChatStore';

export { useCommandStore } from './commandStore';
export { useToolPanelStore, updateToolByName, updateToolByToolUseId } from './toolPanelStore';
export { useWorkspaceStore } from './workspaceStore';
export { useFileExplorerStore } from './fileExplorerStore';
export { useFileEditorStore } from './fileEditorStore';
export { useViewStore } from './viewStore';
