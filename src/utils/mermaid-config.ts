/**
 * Mermaid.js 配置文件
 * 与项目 Tailwind 主题保持一致的暗色主题配置
 */

import type { MermaidConfig } from 'mermaid';

/**
 * 暗色主题配置 - 匹配项目 Tailwind 色系
 * 基于 tailwind.config.js 中的颜色定义
 */
export const mermaidDarkTheme: Partial<MermaidConfig> = {
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'loose', // 允许点击等交互

  // 字体配置
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace',

  // 主题变量 - 精确匹配项目配色
  themeVariables: {
    // === 主色调 (primary: #3B82F6) ===
    primaryColor: '#3B82F6',
    primaryTextColor: '#F8F8F8',
    primaryBorderColor: '#2563EB',

    // === 线条颜色 (text-secondary: #B4B4B8) ===
    lineColor: '#B4B4B8',
    secondaryColor: '#25252B', // background-surface
    tertiaryColor: '#0F0F11',  // background-base

    // === 背景色 ===
    background: '#0F0F11',      // background-base
    mainBkg: '#25252B',         // background-surface
    nodeBorder: 'rgba(255, 255, 255, 0.15)', // border-default

    // === 聚类/分组 ===
    clusterBkg: '#1A1A1F',      // background-elevated
    clusterBorder: 'rgba(255, 255, 255, 0.15)',

    // === 文字颜色 ===
    titleColor: '#F8F8F8',      // text-primary
    edgeLabelBackground: '#25252B',

    // === 时序图 (sequenceDiagram) ===
    actorBkg: '#25252B',
    actorBorder: 'rgba(255, 255, 255, 0.15)',
    actorTextColor: '#F8F8F8',
    actorLineColor: '#3B82F6', // primary
    signalColor: '#F8F8F8',
    signalTextColor: '#F8F8F8',
    labelBoxBkgColor: '#25252B',
    labelBoxBorderColor: 'rgba(255, 255, 255, 0.15)',
    labelTextColor: '#F8F8F8',
    loopTextColor: '#F8F8F8',
    boxBorderColor: 'rgba(255, 255, 255, 0.15)',
    boxBkgColor: '#25252B',

    // === 注释框 ===
    noteBorderColor: 'rgba(255, 255, 255, 0.15)',
    noteBkgColor: '#1A1A1F',
    noteTextColor: '#B4B4B8',

    // === 激活框 ===
    activationBorderColor: '#3B82F6', // primary
    activationBkgColor: '#25252B',

    // === 序号 ===
    sequenceNumberColor: '#F8F8F8',

    // === 类图 (classDiagram) ===
    classText: '#F8F8F8',
    classBorderColor: 'rgba(255, 255, 255, 0.15)',

    // === 状态图 (stateDiagram) ===
    stroke: '#3B82F6',
    fill: '#25252B',

    // === ER图 ===
    entityBackgroundColor: '#25252B',
    entityBorderColor: 'rgba(255, 255, 255, 0.15)',

    // === 甘特图 ===
    sectionBkgColor: '#1A1A1F',
    altSectionBkgColor: '#25252B',
    gridColor: 'rgba(255, 255, 255, 0.08)', // border-subtle

    // === 旅程图 ===
    backgroundSize: '100%, 100%',
    journeyBkgColor: '#25252B',

    // === 思维导图 ===
    pie1: '#3B82F6',  // primary
    pie2: '#34D399',  // success
    pie3: '#FBBF24',  // warning
    pie4: '#F87171',  // danger
    pie5: '#60A5FA',  // info
    pie6: '#93C5FD',
    pie7: '#C4B5FD',
    pie8: '#F9A8D4',
    pie9: '#FCD34D',
    pie10: '#A7F3D0',
    pie11: '#7DD3FC',
    pie12: '#FCA5A5',

    // === 颜色变量 (color0-12 用于不同节点) ===
    color0: '#3B82F6',   // primary
    color1: '#34D399',   // success
    color2: '#FBBF24',   // warning
    color3: '#F87171',   // danger
    color4: '#60A5FA',   // info
    color5: '#93C5FD',
    color6: '#C4B5FD',
    color7: '#F9A8D4',
    color8: '#FCD34D',
    color9: '#A7F3D0',
    color10: '#7DD3FC',
    color11: '#FCA5A5',
    color12: '#E9D5FF',
  },

  // 流图布局配置
  flowchart: {
    useMaxWidth: true,
    htmlLabels: true,
    curve: 'basis', // 平滑曲线
  },

  // 时序图配置
  sequence: {
    useMaxWidth: true,
    diagramMarginX: 20,
    diagramMarginY: 20,
    actorMargin: 50,
    width: 150,
    height: 65,
    boxMargin: 10,
    messageMargin: 35,
    mirrorActors: false,
    bottomMarginAdj: 1,
    rightAngles: false,
    showSequenceNumbers: false,
  },
};

/**
 * 亮色主题配置（预留，未来扩展）
 */
export const mermaidLightTheme: Partial<MermaidConfig> = {
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  themeVariables: {
    primaryColor: '#3B82F6',
    primaryTextColor: '#1e293b',
    primaryBorderColor: '#2563EB',
    lineColor: '#64748b',
    secondaryColor: '#f1f5f9',
    tertiaryColor: '#ffffff',
    background: '#ffffff',
    mainBkg: '#f8fafc',
    nodeBorder: '#e2e8f0',
    // ... 其他配置
  },
};

/**
 * 获取当前主题配置
 * 目前仅支持暗色主题，预留扩展接口
 */
export function getMermaidConfig(theme: 'dark' | 'light' = 'dark'): Partial<MermaidConfig> {
  return theme === 'dark' ? mermaidDarkTheme : mermaidLightTheme;
}
