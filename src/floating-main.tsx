/**
 * 悬浮窗入口
 */

import React from 'react'
import ReactDOM from 'react-dom/client'
import { FloatingWindow } from './components/FloatingWindow'

// 阻止右键菜单，让用户可以通过拖拽来移动窗口
document.addEventListener('contextmenu', (e) => {
  e.preventDefault()
})

// 阻止默认的拖拽行为
document.addEventListener('dragstart', (e) => {
  e.preventDefault()
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <FloatingWindow />
  </React.StrictMode>
)
