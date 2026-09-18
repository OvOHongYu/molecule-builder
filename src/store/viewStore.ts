/**
 * 视图 store：画布平移缩放（viewBox），不动分子图坐标（设计文档 §8.4）。
 * 同时承载顶层视图切换（分子构建器 / 反应）。
 */
import { create } from 'zustand'

/** 顶层视图：分子构建器 / 反应 */
export type WorkMode = 'molecule' | 'reaction'

interface ViewState {
  panX: number
  panY: number
  scale: number
  /** 当前顶层视图 */
  mode: WorkMode
  setMode(mode: WorkMode): void
  setPan(x: number, y: number): void
  zoomAt(cx: number, cy: number, factor: number): void
  fit(bounds: { minX: number; minY: number; maxX: number; maxY: number }, viewW: number, viewH: number): void
  reset(): void
}

export const useViewStore = create<ViewState>((set, get) => ({
  panX: 0,
  panY: 0,
  scale: 1,
  mode: 'molecule',

  setMode: (mode) => set({ mode }),

  setPan: (x, y) => set({ panX: x, panY: y }),

  // 以画布内一点 (cx, cy) 为锚缩放：保持该点对应内容不移动
  zoomAt: (cx, cy, factor) => {
    const { panX, panY, scale } = get()
    const ns = Math.min(4, Math.max(0.2, scale * factor))
    const k = ns / scale
    set({
      scale: ns,
      panX: cx - (cx - panX) * k,
      panY: cy - (cy - panY) * k,
    })
  },

  fit: (bounds, viewW, viewH) => {
    const { minX, minY, maxX, maxY } = bounds
    const w = Math.max(1, maxX - minX)
    const h = Math.max(1, maxY - minY)
    const pad = 60
    const scale = Math.min((viewW - pad * 2) / w, (viewH - pad * 2) / h, 1.6)
    set({
      scale: Math.max(0.3, scale),
      panX: (viewW - w * scale) / 2 - minX * scale,
      panY: (viewH - h * scale) / 2 - minY * scale,
    })
  },

  reset: () => set({ panX: 0, panY: 0, scale: 1 }),
}))