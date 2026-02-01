# CLAUDE.md — Polaris 项目配置

## 项目结构

- `src/` - 源代码
- `src/engines/` - AI 引擎实现
- `src/stores/` - 状态管理
- `src/components/` - React 组件

## 技术栈

- **前端**: React + TypeScript + Vite
- **桌面**: Tauri
- **样式**: Tailwind CSS
- **状态**: Zustand

## 编码规范

- 使用 TypeScript 严格模式
- 组件使用函数式组件
- 使用 React Hooks
- 遵循现有代码风格

## 常用命令

```bash
npm run dev      # 启动开发服务器
npm run build    # 构建生产版本
npm run tauri    # 启动 Tauri 应用
```

## Git 工作流

- 使用 Conventional Commits
- 每个功能一个分支
- PR 需要代码审查
