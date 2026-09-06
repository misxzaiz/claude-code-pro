/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Dev-only: 强制前端走 HTTP 接口模式（而非 Tauri IPC）。
   * 值 '1' 时生效，仅 vite dev (DEV=true) 下读取。
   * 用于 AI 自动化测试 / 纯浏览器驱动桌面 dev 前端。
   * 生产构建不含此变量，detectTransport 行为不变。
   */
  readonly VITE_FORCE_HTTP?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
