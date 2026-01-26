/**
 * 日志工具
 *
 * 提供条件日志输出，仅在开发环境中输出
 */

const isDev = import.meta.env.DEV;

export const logger = {
  /**
   * 调试日志 - 仅在开发环境输出
   */
  debug: (message: string, ...args: any[]) => {
    if (isDev) {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  },

  /**
   * 信息日志 - 仅在开发环境输出
   */
  info: (message: string, ...args: any[]) => {
    if (isDev) {
      console.info(`[INFO] ${message}`, ...args);
    }
  },

  /**
   * 警告日志 - 始终输出
   */
  warn: (message: string, ...args: any[]) => {
    console.warn(`[WARN] ${message}`, ...args);
  },

  /**
   * 错误日志 - 始终输出
   */
  error: (message: string, ...args: any[]) => {
    console.error(`[ERROR] ${message}`, ...args);
  },
};
