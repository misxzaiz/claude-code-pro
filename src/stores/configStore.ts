/**
 * 配置状态管理
 */

import { create } from 'zustand';
import type { Config, HealthStatus } from '../types';
import * as tauri from '../services/tauri';

interface ConfigState {
  /** 当前配置 */
  config: Config | null;
  /** 健康状态 */
  healthStatus: HealthStatus | null;
  /** 加载中 */
  loading: boolean;
  /** 连接中（首次启动） */
  isConnecting: boolean;
  /** 连接状态 */
  connectionState: 'connecting' | 'success' | 'failed';
  /** 错误 */
  error: string | null;

  /** 加载配置 */
  loadConfig: () => Promise<void>;
  /** 更新配置 */
  updateConfig: (config: Config) => Promise<void>;
  /** 设置工作目录 */
  setWorkDir: (path: string | null) => Promise<void>;
  /** 设置 Claude 命令 */
  setClaudeCmd: (cmd: string) => Promise<void>;
  
  /** 刷新健康状态 */
  refreshHealth: () => Promise<void>;
  /** 重新连接并更新路径 */
  retryConnection: (claudeCmd?: string) => Promise<void>;
}

export const useConfigStore = create<ConfigState>((set) => ({
  config: null,
  healthStatus: null,
  loading: false,
  isConnecting: true,  // 默认为 true，显示连接蒙板
  connectionState: 'connecting',
  error: null,

  loadConfig: async () => {
    set({ loading: true, isConnecting: true, error: null, connectionState: 'connecting' });
    try {
      const [config, health] = await Promise.all([
        tauri.getConfig(),
        tauri.healthCheck(),
      ]);

      // 检查 OpenAI 配置（如果使用 OpenAI 引擎）
      if (config?.defaultEngine === 'openai-compat' || config?.openaiCompat) {
        try {
          const { loadOpenAIConfigFile } = await import('../services/tauri')
          const backendConfig = await loadOpenAIConfigFile()
          health.openaiAvailable = !!backendConfig?.apiKey
          health.openaiModel = backendConfig?.model
        } catch (e) {
          console.warn('[ConfigStore] OpenAI 配置检查失败:', e)
        }
      }

      const connectionState =
        health.claudeAvailable ||
        health.iflowAvailable ||
        health.openaiAvailable ? 'success' : 'failed';

      set({ config, healthStatus: health, loading: false, isConnecting: false, connectionState });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : '加载配置失败',
        loading: false,
        isConnecting: false,
        connectionState: 'failed'
      });
    }
  },

  updateConfig: async (config) => {
    set({ loading: true, error: null });
    try {
      await tauri.updateConfig(config);
      set({ config, loading: false });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : '更新配置失败',
        loading: false
      });
    }
  },

  setWorkDir: async (path) => {
    set({ loading: true, error: null });
    try {
      await tauri.setWorkDir(path);
      const config = await tauri.getConfig();
      set({ config, loading: false });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : '设置工作目录失败',
        loading: false
      });
    }
  },

  setClaudeCmd: async (cmd) => {
    set({ loading: true, error: null });
    try {
      await tauri.setClaudeCmd(cmd);
      const config = await tauri.getConfig();
      set({ config, loading: false });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : '设置 Claude 命令失败',
        loading: false
      });
    }
  },

  

  refreshHealth: async () => {
    try {
      const health = await tauri.healthCheck();

      // 检查 OpenAI 配置（如果使用 OpenAI 引擎）
      const currentConfig = get().config
      if (currentConfig?.defaultEngine === 'openai-compat' || currentConfig?.openaiCompat) {
        try {
          const { loadOpenAIConfigFile } = await import('../services/tauri')
          const backendConfig = await loadOpenAIConfigFile()
          health.openaiAvailable = !!backendConfig?.apiKey
          health.openaiModel = backendConfig?.model
        } catch (e) {
          // OpenAI 配置检查失败，不影响其他引擎
          console.warn('[ConfigStore] OpenAI 配置检查失败:', e)
        }
      }

      const connectionState =
        health.claudeAvailable ||
        health.iflowAvailable ||
        health.openaiAvailable ? 'success' : 'failed'

      set({ healthStatus: health, connectionState })
    } catch (e) {
      console.error('刷新健康状态失败:', e)
      set({ connectionState: 'failed' })
    }
  },

  /** 重新连接并更新路径 */
  retryConnection: async (claudeCmd?: string) => {
    set({ loading: true, error: null, connectionState: 'connecting' });
    try {
      // 如果提供了新的路径，先更新配置
      if (claudeCmd) {
        await tauri.setClaudeCmd(claudeCmd);
        const config = await tauri.getConfig();
        set({ config });
      }
      
      // 重新检测健康状态
      const health = await tauri.healthCheck();
      const connectionState = health.claudeAvailable ? 'success' : 'failed';
      
      if (connectionState === 'failed') {
        set({
          error: `Claude CLI 未找到。当前路径: ${claudeCmd || '未设置'}`,
          loading: false,
          connectionState: 'failed'
        });
      } else {
        set({
          healthStatus: health,
          loading: false,
          connectionState: 'success',
          error: null
        });
      }
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : '连接失败',
        loading: false,
        connectionState: 'failed'
      });
    }
  },
}));
