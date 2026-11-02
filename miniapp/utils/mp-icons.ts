/**
 * 商户模块图标集（内联 SVG → base64 data URI）。
 *
 * 规格由 DESIGN.md「M6 · 图标、触控与动效」规定，改图标时必须以下参数同步：
 *   viewBox="0 0 24 24"、fill="none"、stroke-width="2.4"、stroke-linecap/linejoin="round"，
 *   单色 Ash #4c4c4c，页面渲染 36rpx（18px）→ 视觉描边 1.8px。
 *
 * 为什么用 base64 data URI：国内网络拉取 CDN/iconfont 图标失败会让按钮变空白方块（沿用门店详情页既有做法）。
 * 为什么不用字符（＋ › × ✓ →）：字符字形随系统字体变化，无法控制描边粗细与光学尺寸。
 * 每个图标上方注释即其 SVG 源；改路径后按同一模板重新 base64 即可，无额外构建步骤。
 */

export const MP_ICONS = {

  // <path d="M9 5.5 15.5 12 9 18.5"/>
  chevronRight: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNGM0YzRjIiBzdHJva2Utd2lkdGg9IjIuNCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNOSA1LjUgMTUuNSAxMiA5IDE4LjUiLz48L3N2Zz4=",
  // <path d="M5.5 9 12 15.5 18.5 9"/>
  chevronDown: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNGM0YzRjIiBzdHJva2Utd2lkdGg9IjIuNCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNNS41IDkgMTIgMTUuNSAxOC41IDkiLz48L3N2Zz4=",
  // <path d="M12 4.5v15M4.5 12h15"/>
  plus: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNGM0YzRjIiBzdHJva2Utd2lkdGg9IjIuNCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMTIgNC41djE1TTQuNSAxMmgxNSIvPjwvc3ZnPg==",
  // <path d="M6.2 6.2 17.8 17.8M17.8 6.2 6.2 17.8"/>
  close: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNGM0YzRjIiBzdHJva2Utd2lkdGg9IjIuNCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNNi4yIDYuMiAxNy44IDE3LjhNMTcuOCA2LjIgNi4yIDE3LjgiLz48L3N2Zz4=",
  // <path d="M4.8 12.6 9.6 17.4 19.2 6.6"/>
  check: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNGM0YzRjIiBzdHJva2Utd2lkdGg9IjIuNCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNNC44IDEyLjYgOS42IDE3LjQgMTkuMiA2LjYiLz48L3N2Zz4=",
  // <path d="M4.5 12h15M13.4 5.8 19.7 12 13.4 18.2"/>
  arrowRight: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNGM0YzRjIiBzdHJva2Utd2lkdGg9IjIuNCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNNC41IDEyaDE1TTEzLjQgNS44IDE5LjcgMTIgMTMuNCAxOC4yIi8+PC9zdmc+",
  // <path d="M4.6 8.6h3.3L9.4 5.9h5.2l1.5 2.7h3.3v9.5H4.6z"/><circle cx="12" cy="12.9" r="3.1"/>
  camera: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNGM0YzRjIiBzdHJva2Utd2lkdGg9IjIuNCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNNC42IDguNmgzLjNMOS40IDUuOWg1LjJsMS41IDIuN2gzLjN2OS41SDQuNnoiLz48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyLjkiIHI9IjMuMSIvPjwvc3ZnPg==",
  // <path d="M12 20.9c4-4.2 6-7.6 6-10.3A6 6 0 1 0 6 10.6c0 2.7 2 6.1 6 10.3z"/><path d="M9.4 10.4 11.3 12.3 14.6 8.9"/>
  pin: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNGM0YzRjIiBzdHJva2Utd2lkdGg9IjIuNCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMTIgMjAuOWM0LTQuMiA2LTcuNiA2LTEwLjNBNiA2IDAgMSAwIDYgMTAuNmMwIDIuNyAyIDYuMSA2IDEwLjN6Ii8+PHBhdGggZD0iTTkuNCAxMC40IDExLjMgMTIuMyAxNC42IDguOSIvPjwvc3ZnPg==",
  // <path d="M4.5 19.5h4L19 9a2.12 2.12 0 0 0-3-3L5.5 16.5v3z"/><path d="M14.8 6.2 18.3 9.7"/>
  pencil: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNGM0YzRjIiBzdHJva2Utd2lkdGg9IjIuNCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNNC41IDE5LjVoNEwxOSA5YTIuMTIgMi4xMiAwIDAgMC0zLTNMNS41IDE2LjV2M3oiLz48cGF0aCBkPSJNMTQuOCA2LjIgMTguMyA5LjciLz48L3N2Zz4=",
  // <path d="M11.6 3.5H5A1.5 1.5 0 0 0 3.5 5v6.6l8.9 9 8.1-8.1-9-9z"/><circle cx="8" cy="8" r="1.2"/>
  tag: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNGM0YzRjIiBzdHJva2Utd2lkdGg9IjIuNCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMTEuNiAzLjVINUExLjUgMS41IDAgMCAwIDMuNSA1djYuNmw4LjkgOSA4LjEtOC4xLTktOXoiLz48Y2lyY2xlIGN4PSI4IiBjeT0iOCIgcj0iMS4yIi8+PC9zdmc+",
  // <path d="M6.5 3.5h7L18 8v12.5H6.5z"/><path d="M13.3 3.5V8h4.7"/><path d="M9.2 12.5h6"/><path d="M9.2 16.2h6"/>
  file: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNGM0YzRjIiBzdHJva2Utd2lkdGg9IjIuNCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNNi41IDMuNWg3TDE4IDh2MTIuNUg2LjV6Ii8+PHBhdGggZD0iTTEzLjMgMy41VjhoNC43Ii8+PHBhdGggZD0iTTkuMiAxMi41aDYiLz48cGF0aCBkPSJNOS4yIDE2LjJoNiIvPjwvc3ZnPg==",
  // <path d="M4.5 8.2A2.2 2.2 0 0 1 6.7 6H19v3.2"/><path d="M4.5 8.2v9.1A1.7 1.7 0 0 0 6.2 19H19V9.2H6.7"/><path d="M16 13.7h2.2"/>
  wallet: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNGM0YzRjIiBzdHJva2Utd2lkdGg9IjIuNCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNNC41IDguMkEyLjIgMi4yIDAgMCAxIDYuNyA2SDE5djMuMiIvPjxwYXRoIGQ9Ik00LjUgOC4ydjkuMUExLjcgMS43IDAgMCAwIDYuMiAxOUgxOVY5LjJINi43Ii8+PHBhdGggZD0iTTE2IDEzLjdoMi4yIi8+PC9zdmc+",
  // <rect x="4" y="4" width="6" height="6" rx="1.6"/><rect x="14" y="4" width="6" height="6" rx="1.6"/><rect x="4" y="14" width="6" height="6" rx="1.6"/><rect x="14" y="14" width="6" height="6" rx="1.6"/>
  grid: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNGM0YzRjIiBzdHJva2Utd2lkdGg9IjIuNCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cmVjdCB4PSI0IiB5PSI0IiB3aWR0aD0iNiIgaGVpZ2h0PSI2IiByeD0iMS42Ii8+PHJlY3QgeD0iMTQiIHk9IjQiIHdpZHRoPSI2IiBoZWlnaHQ9IjYiIHJ4PSIxLjYiLz48cmVjdCB4PSI0IiB5PSIxNCIgd2lkdGg9IjYiIGhlaWdodD0iNiIgcng9IjEuNiIvPjxyZWN0IHg9IjE0IiB5PSIxNCIgd2lkdGg9IjYiIGhlaWdodD0iNiIgcng9IjEuNiIvPjwvc3ZnPg==",
} as const;

export type MpIconName = keyof typeof MP_ICONS;
