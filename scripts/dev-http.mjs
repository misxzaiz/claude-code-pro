/**
 * Dev HTTP 模式启动器
 * ==================
 * 用法：pnpm dev:http
 *
 * 作用：临时开启「前端走 HTTP 接口」模式，便于 AI 自动化测试 / 纯浏览器驱动。
 *
 * 原理：
 *   1. 写入 .env.development.local（VITE_FORCE_HTTP=1）— vite dev 自动加载
 *   2. 启动 vite（本脚本等价于 `pnpm dev`，只是预设了开关）
 *   3. 退出时清理该 env 文件，避免影响下次普通 `pnpm dev`
 *
 * 配合：后端需以 debug 构建运行（tauri dev），它会把实际端口 + token md5
 *       写到项目根 .polaris-dev/server.json（经 vite dev middleware 以
 *       /.polaris-dev/server.json 暴露），前端自此自发现，无需手写地址。
 *
 * 注意：本脚本只起前端 vite。完整桌面调试请用 `pnpm tauri:dev:win`（它会触发
 *       beforeDevCommand 跑 vite）。若要让 tauri dev 也走 HTTP 模式，请先
 *       取消 .env.development.local 中 VITE_FORCE_HTTP 的注释，或先跑本脚本。
 */

import { spawn } from 'node:child_process';
import { writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envFile = join(root, '.env.development.local');
const ENV_LINE = 'VITE_FORCE_HTTP=1';

// 记录文件原始内容，退出时恢复（避免覆盖用户手动配置）
const original = existsSync(envFile) ? readFileSync(envFile, 'utf8') : null;

function enableForceHttp() {
  // 若已有未注释的 VITE_FORCE_HTTP 则不动；否则追加一行
  if (original && /^\s*VITE_FORCE_HTTP\s*=\s*1\s*$/m.test(original)) return;
  const base = original && !original.startsWith('#') ? original : (original ?? '');
  writeFileSync(envFile, `${base.trimEnd()}\n${ENV_LINE}\n`, 'utf8');
}

function restore() {
  try {
    if (original === null) rmSync(envFile, { force: true });
    else writeFileSync(envFile, original, 'utf8');
  } catch { /* 尽力而为 */ }
}

enableForceHttp();

const child = spawn('pnpm', ['run', 'dev'], {
  cwd: root,
  stdio: 'inherit',
  shell: true, // Windows 下解析 pnpm
});

const cleanup = () => { restore(); };
process.on('SIGINT', () => { cleanup(); process.exit(130); });
process.on('SIGTERM', () => { cleanup(); process.exit(143); });

child.on('exit', (code) => { cleanup(); process.exit(code ?? 0); });
