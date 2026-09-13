/**
 * 不可见热区（设计文档 §3.1）：原子圆形 r≈0.6×键长，键矩形宽≈0.4×键长。
 */
import type { MoleculeGraph } from '../types/molecule'
import { ATOM_HIT_R, BOND_HIT_W, BOND_LEN } from '../layout/geometry'
import type { Pt } from './renderUtils'

interface Props {
  graph: MoleculeGraph
  hoverAtomId: number | null
  hoverBondId: number | null
  selectedAtomId: number | null
  selectedBondId: number | null
  /** 连键起点原子（虚线高亮） */
  connectFromId: number | null
  pendingDeleteId: number | null
  onAtomHover(id: number | null): void
  onBondHover(id: number | null): void
  onAtomDown(e: React.PointerEvent, id: number): void
  onAtomMove(e: React.PointerEvent, id: number): void
  onAtomUp(e: React.PointerEvent, id: number): void
  onAtomClick(id: number): void
  onBondClick(id: number): void
  toCanvas(clientX: number, clientY: number): Pt
}

/** 与键一致的边框色：悬停浅、选中深 */
const HOVER_STROKE = '#98c1f9'
const SELECT_STROKE = '#1f6feb'

export function HitAreas({
  graph,
  hoverAtomId,
  hoverBondId,
  selectedAtomId,
  selectedBondId,
  connectFromId,
  pendingDeleteId,
  onAtomHover,
  onBondHover,
  onAtomDown,
  onAtomMove,
  onAtomUp,
  onAtomClick,
  onBondClick,
  toCanvas,
}: Props) {
  return (
    <g className="hitareas">
      {graph.atoms.map((a) => {
        const hovered = hoverAtomId === a.atom_id
        const selected = selectedAtomId === a.atom_id
        const connectFrom = connectFromId === a.atom_id
        const pending = pendingDeleteId === a.atom_id
        const stroke = pending
          ? '#c0362c'
          : connectFrom || selected
            ? SELECT_STROKE
            : hovered
              ? HOVER_STROKE
              : 'none'
        const width = pending || connectFrom || selected ? 1.6 : hovered ? 1.2 : 0
        return (
          <circle
            key={`ha-${a.atom_id}`}
            cx={a.x}
            cy={a.y}
            r={pending ? ATOM_HIT_R + 6 : ATOM_HIT_R}
            fill="transparent"
            fillOpacity={0}
            stroke={stroke}
            strokeWidth={width}
            strokeDasharray={pending || connectFrom ? '4 3' : undefined}
            style={{ cursor: 'pointer' }}
            onPointerEnter={() => onAtomHover(a.atom_id)}
            onPointerLeave={() => onAtomHover(null)}
            onPointerDown={(e) => {
              e.stopPropagation()
              onAtomDown(e, a.atom_id)
            }}
            onPointerMove={(e) => onAtomMove(e, a.atom_id)}
            onPointerUp={(e) => onAtomUp(e, a.atom_id)}
            onClick={(e) => {
              e.stopPropagation()
              onAtomClick(a.atom_id)
            }}
          />
        )
      })}
      {graph.bonds.map((b) => {
        const a1 = graph.atoms.find((x) => x.atom_id === b.atom1_id)
        const a2 = graph.atoms.find((x) => x.atom_id === b.atom2_id)
        if (!a1 || !a2) return null
        const dx = a2.x - a1.x
        const dy = a2.y - a1.y
        const len = Math.hypot(dx, dy) || 1
        const ux = dx / len
        const uy = dy / len
        const px = -uy
        const py = ux
        const mx = (a1.x + a2.x) / 2
        const my = (a1.y + a2.y) / 2
        const halfL = len / 2
        const halfW = BOND_HIT_W / 2
        const pts = [
          { x: mx - ux * halfL - px * halfW, y: my - uy * halfL - py * halfW },
          { x: mx + ux * halfL - px * halfW, y: my + uy * halfL - py * halfW },
          { x: mx + ux * halfL + px * halfW, y: my + uy * halfL + py * halfW },
          { x: mx - ux * halfL + px * halfW, y: my - uy * halfL + py * halfW },
        ]
        const hovered = hoverBondId === b.bond_id
        const selected = selectedBondId === b.bond_id
        void BOND_LEN
        void toCanvas
        void onBondClick
        return (
          <polygon
            key={`hb-${b.bond_id}`}
            points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="transparent"
            stroke={selected ? SELECT_STROKE : hovered ? HOVER_STROKE : 'none'}
            strokeWidth={selected ? 1.6 : hovered ? 1.2 : 0}
            style={{ cursor: 'pointer' }}
            onPointerEnter={() => onBondHover(b.bond_id)}
            onPointerLeave={() => onBondHover(null)}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              onBondClick(b.bond_id)
            }}
          />
        )
      })}
    </g>
  )
}