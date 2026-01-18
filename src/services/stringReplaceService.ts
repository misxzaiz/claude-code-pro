/**
 * 字符串替换服务
 * 用于处理 Edit 工具的 old_string + new_string 模式
 */

import { invoke } from '@tauri-apps/api/core';

/** 字符串替换信息 */
export interface StringReplaceInfo {
  filePath: string;
  oldString: string;
  newString: string;
  replaceAll: boolean;
  toolCallId: string;
}

/** 版本存储键前缀 */
const STORAGE_KEY_PREFIX = 'string_replace_';

/**
 * 保存字符串替换信息
 */
export function saveStringReplaceInfo(
  filePath: string,
  input: Record<string, unknown>,
  toolCallId: string
): void {
  const oldString = typeof input.old_string === 'string' ? input.old_string : '';
  const newString = typeof input.new_string === 'string' ? input.new_string : '';
  const replaceAll = input.replace_all === true;

  if (!oldString || !newString) return;

  const info: StringReplaceInfo = {
    filePath,
    oldString,
    newString,
    replaceAll,
    toolCallId,
  };

  try {
    const key = `${STORAGE_KEY_PREFIX}${toolCallId}`;
    localStorage.setItem(key, JSON.stringify(info));
  } catch (error) {
    console.error('[StringReplaceService] Failed to save info:', error);
  }
}

/**
 * 获取字符串替换信息
 */
export function getStringReplaceInfo(toolCallId: string): StringReplaceInfo | null {
  try {
    const key = `${STORAGE_KEY_PREFIX}${toolCallId}`;
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

/**
 * 删除字符串替换信息
 */
export function deleteStringReplaceInfo(toolCallId: string): void {
  const key = `${STORAGE_KEY_PREFIX}${toolCallId}`;
  localStorage.removeItem(key);
}

/**
 * 撤回字符串替换
 * 将文件中的 newString 替换回 oldString
 */
export async function revertStringReplace(
  toolCallId: string,
  filePath?: string,
  oldString?: string,
  newString?: string,
  replaceAll?: boolean
): Promise<boolean> {
  // 尝试从参数或存储中获取信息
  let info: StringReplaceInfo | null;

  if (filePath && oldString && newString) {
    info = {
      filePath,
      oldString,
      newString,
      replaceAll: replaceAll || false,
      toolCallId,
    };
  } else {
    info = getStringReplaceInfo(toolCallId);
  }

  if (!info) {
    console.error('[StringReplaceService] No replace info found for:', toolCallId);
    return false;
  }

  try {
    // 读取当前文件内容
    const currentContent = await invoke<string>('read_file', { path: info.filePath });

    // 将 newString 替换回 oldString
    const revertedContent = info.replaceAll
      ? currentContent.split(info.newString).join(info.oldString)
      : currentContent.replace(info.newString, info.oldString);

    // 检查是否找到了要替换的内容
    if (currentContent === revertedContent) {
      console.warn('[StringReplaceService] No matching string found to revert');
      // 即使找不到也继续，因为文件可能已被手动修改
    }

    // 写回文件
    await invoke('write_file', {
      path: info.filePath,
      content: revertedContent,
    });

    return true;
  } catch (error) {
    console.error('[StringReplaceService] Failed to revert:', error);
    return false;
  }
}

/**
 * 重新应用字符串替换
 * 将文件中的 oldString 替换为 newString
 */
export async function applyStringReplace(
  toolCallId: string
): Promise<boolean> {
  const info = getStringReplaceInfo(toolCallId);
  if (!info) {
    console.error('[StringReplaceService] No replace info found for:', toolCallId);
    return false;
  }

  try {
    // 读取当前文件内容
    const currentContent = await invoke<string>('read_file', { path: info.filePath });

    // 将 oldString 替换为 newString
    const newContent = info.replaceAll
      ? currentContent.split(info.oldString).join(info.newString)
      : currentContent.replace(info.oldString, info.newString);

    // 写回文件
    await invoke('write_file', {
      path: info.filePath,
      content: newContent,
    });

    return true;
  } catch (error) {
    console.error('[StringReplaceService] Failed to apply:', error);
    return false;
  }
}

/**
 * 清理所有字符串替换信息
 */
export function clearAllStringReplaceInfo(): void {
  const keys = Object.keys(localStorage);
  for (const key of keys) {
    if (key.startsWith(STORAGE_KEY_PREFIX)) {
      localStorage.removeItem(key);
    }
  }
}
