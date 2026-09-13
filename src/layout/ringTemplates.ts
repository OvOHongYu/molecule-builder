/**
 * 环模板：正多边形顶点坐标（设计文档 §7.2 环规范：苯正六边形，脂环正多边形）。
 */
import { BOND_LEN } from './geometry'

/** 正 n 边形顶点（第 0 号顶点位于角度 startAngle 处；相邻顶点间距 = 键长） */
export function regularPolygon(
  cx: number,
  cy: number,
  n: number,
  startAngle = Math.PI / 2,
): Array<{ x: number; y: number }> {
  const R = BOND_LEN / (2 * Math.sin(Math.PI / n))
  const pts: Array<{ x: number; y: number }> = []
  for (let k = 0; k < n; k++) {
    const a = startAngle + (k * 2 * Math.PI) / n
    pts.push({ x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) })
  }
  return pts
}