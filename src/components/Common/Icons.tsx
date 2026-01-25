/**
 * SVG 图标组件
 */

import { type HTMLAttributes } from 'react';

interface IconProps extends HTMLAttributes<SVGSVGElement> {
  size?: number;
}

/** 工具状态 - 等待中 */
export function IconPending({ size = 16, className = '', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      {...props}
    >
      <circle
        cx="8"
        cy="8"
        r="6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeOpacity="0.5"
      />
      <circle
        cx="8"
        cy="8"
        r="2"
        fill="currentColor"
        opacity="0.5"
      />
    </svg>
  );
}

/** 工具状态 - 运行中 */
export function IconRunning({ size = 16, className = '', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      {...props}
    >
      <circle
        cx="8"
        cy="8"
        r="6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeOpacity="0.3"
      />
      <path
        d="M8 8V4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M8 8L11 11"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle
        cx="8"
        cy="8"
        r="1.5"
        fill="currentColor"
      />
    </svg>
  );
}

/** 工具状态 - 完成 */
export function IconCompleted({ size = 16, className = '', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      {...props}
    >
      <circle
        cx="8"
        cy="8"
        r="7"
        fill="currentColor"
        fillOpacity="0.2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M5 8L7 10L11 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 工具状态 - 失败 */
export function IconFailed({ size = 16, className = '', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      {...props}
    >
      <circle
        cx="8"
        cy="8"
        r="7"
        fill="currentColor"
        fillOpacity="0.15"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M5.5 5.5L10.5 10.5M10.5 5.5L5.5 10.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** 工具状态 - 部分完成 */
export function IconPartial({ size = 16, className = '', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      {...props}
    >
      <circle
        cx="8"
        cy="8"
        r="7"
        fill="currentColor"
        fillOpacity="0.15"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M5 8L7 10L9 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx="11"
        cy="10"
        r="1.5"
        fill="currentColor"
      />
    </svg>
  );
}

/** 发送图标 */
export function IconSend({ size = 16, className = '', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      {...props}
    >
      <path
        d="M2.5 8L13.5 8M13.5 8L9 3.5M13.5 8L9 12.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 中止图标 */
export function IconStop({ size = 16, className = '', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      {...props}
    >
      <rect
        x="4"
        y="4"
        width="8"
        height="8"
        rx="1"
        fill="currentColor"
      />
    </svg>
  );
}

/** 复制图标 */
export function IconCopy({ size = 16, className = '', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      {...props}
    >
      <rect
        x="3"
        y="5"
        width="8"
        height="10"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
      <path
        d="M5 5V3C5 2.44772 5.44772 2 6 2H12C12.5523 2 13 2.44772 13 3V11C13 11.5523 12.5523 12 12 12H10"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
    </svg>
  );
}

/** 展开图标 */
export function IconChevronRight({ size = 16, className = '', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      {...props}
    >
      <path
        d="M6 4L10 8L6 12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 折叠图标 */
export function IconChevronDown({ size = 16, className = '', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      {...props}
    >
      <path
        d="M4 6L8 10L12 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 加载中图标 */
export function IconLoading({ size = 16, className = '', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={`animate-spin ${className}`}
      {...props}
    >
      <circle
        cx="8"
        cy="8"
        r="6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeOpacity="0.3"
      />
      <path
        d="M8 2C8 2 11 4 12 8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** 历史图标 */
export function IconHistory({ size = 16, className = '', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      {...props}
    >
      <path
        d="M2.5 8C2.5 4.96243 4.96243 2.5 8 2.5C11.0376 2.5 13.5 4.96243 13.5 8C13.5 11.0376 11.0376 13.5 8 13.5C5.5 13.5 3.5 11.5 3.5 8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M2 5V2.5H4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.5 8H8L10 10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 文件图标 */
export function IconFile({ size = 16, className = '', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      {...props}
    >
      <path
        d="M3.5 2.5H9.5L12.5 5.5V12.5C12.5 13.0523 12.0523 13.5 11.5 13.5H3.5C2.94772 13.5 2.5 13.0523 2.5 12.5V3.5C2.5 2.94772 2.94772 2.5 3.5 2.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M9.5 2.5V5.5H12.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 文件夹图标 */
export function IconFolder({ size = 16, className = '', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      {...props}
    >
      <path
        d="M2.5 4.5C2.5 3.94772 2.94772 3.5 3.5 3.5H6L7.5 5H12.5C13.0523 5 13.5 5.44772 13.5 6V11.5C13.5 12.0523 13.0523 12.5 12.5 12.5H3.5C2.94772 12.5 2.5 12.0523 2.5 11.5V4.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 编辑/重命名图标 */
export function IconEdit({ size = 16, className = '', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      {...props}
    >
      <path
        d="M11.5 2.5L13.5 4.5M11.5 2.5L9 5L8 11L9.5 10.5L13.5 6.5L11.5 2.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3.5 12.5H12.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** 删除图标 */
export function IconTrash({ size = 16, className = '', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      {...props}
    >
      <path
        d="M3.5 4.5H12.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M5.5 4.5V3.5C5.5 2.94772 5.94772 2.5 6.5 2.5H9.5C10.0523 2.5 10.5 2.94772 10.5 3.5V4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 4.5V11.5C5 12.0523 5.44772 12.5 6 12.5H10C10.5523 12.5 11 12.0523 11 11.5V4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 加号/新建图标 */
export function IconPlus({ size = 16, className = '', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      {...props}
    >
      <path
        d="M8 3V13M3 8H13"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** 外部链接图标 */
export function IconExternalLink({ size = 16, className = '', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      {...props}
    >
      <path
        d="M10 3.5H12.5V6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7.5 8.5L12.5 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11.5 9.5V11.5C11.5 12.0523 11.0523 12.5 10.5 12.5H4.5C3.94772 12.5 3.5 12.0523 3.5 11.5V5.5C3.5 4.94772 3.94772 4.5 4.5 4.5H6.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 打开图标 */
export function IconOpen({ size = 16, className = '', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      {...props}
    >
      <path
        d="M8 3V13M3 8H13"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
