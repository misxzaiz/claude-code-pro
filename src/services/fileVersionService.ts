/**
 * 文件版本历史服务
 * 用于存储和恢复文件修改前的版本，支持撤回功能
 */

import { invoke } from '@tauri-apps/api/core';

/** 文件版本记录 */
export interface FileVersion {
  /** 文件路径 */
  filePath: string;
  /** 版本内容 */
  content: string;
  /** 创建时间戳 */
  timestamp: number;
  /** 关联的工具调用 ID */
  toolCallId: string;
  /** 是否已应用 */
  isApplied: boolean;
}

/** 版本存储键前缀 */
const STORAGE_KEY_PREFIX = 'file_version_';

/**
 * 保存文件版本
 */
export async function saveFileVersion(
  filePath: string,
  content: string,
  toolCallId: string
): Promise<void> {
  const version: FileVersion = {
    filePath,
    content,
    timestamp: Date.now(),
    toolCallId,
    isApplied: true,
  };

  // 使用 localStorage 存储版本信息
  const key = `${STORAGE_KEY_PREFIX}${toolCallId}`;
  try {
    localStorage.setItem(key, JSON.stringify(version));
  } catch (error) {
    console.error('Failed to save file version:', error);
  }
}

/**
 * 获取文件版本
 */
export function getFileVersion(toolCallId: string): FileVersion | null {
  const key = `${STORAGE_KEY_PREFIX}${toolCallId}`;
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

/**
 * 恢复文件到指定版本
 */
export async function restoreFileVersion(toolCallId: string): Promise<boolean> {
  const version = getFileVersion(toolCallId);
  if (!version) {
    console.error('File version not found:', toolCallId);
    return false;
  }

  try {
    // 调用 Tauri 命令写入文件
    await invoke('write_file', {
      path: version.filePath,
      content: version.content,
    });

    // 更新版本状态为未应用
    version.isApplied = false;
    const key = `${STORAGE_KEY_PREFIX}${toolCallId}`;
    localStorage.setItem(key, JSON.stringify(version));

    return true;
  } catch (error) {
    console.error('Failed to restore file version:', error);
    return false;
  }
}

/**
 * 删除文件版本记录
 */
export function deleteFileVersion(toolCallId: string): void {
  const key = `${STORAGE_KEY_PREFIX}${toolCallId}`;
  localStorage.removeItem(key);
}

/**
 * 清理所有版本记录
 */
export function clearAllFileVersions(): void {
  const keys = Object.keys(localStorage);
  for (const key of keys) {
    if (key.startsWith(STORAGE_KEY_PREFIX)) {
      localStorage.removeItem(key);
    }
  }
}

/**
 * 获取所有版本记录
 */
export function getAllFileVersions(): FileVersion[] {
  const keys = Object.keys(localStorage);
  const versions: FileVersion[] = [];

  for (const key of keys) {
    if (key.startsWith(STORAGE_KEY_PREFIX)) {
      try {
        const data = localStorage.getItem(key);
        if (data) {
          versions.push(JSON.parse(data));
        }
      } catch {
        // 忽略解析错误
      }
    }
  }

  // 按时间戳倒序排序
  return versions.sort((a, b) => b.timestamp - a.timestamp);
}
