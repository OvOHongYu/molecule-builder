/**
 * 原子端点渲染（设计文档 §6）：
 * - 碳端点：不显示字母与圆，键线在中心相交（§6.1）
 * - 非碳/基团端点：圆形白底 + 元素符号，键线在圆周处截断（§6.2）
 * - 显式 H + C-H 键（showHydrogen 全局开关，仅渲染层，§5）
 */
import type { Atom, MoleculeGraph } from '../types/molecule'
import { labelRadius, clipBondSegment } from './renderUtils'
import { BOND_LEN } from '../layout/geometry'
import { carbonHasFunctionalH } from '../engine/functionalGroups'

interface Props {
  graph: MoleculeGraph
  showHydrogen: boolean
  showAtomIds: boolean
  hoverAtomId: number | null
  selectedAtomId: number | null
  attentionAtomIds: number[]
}

/** 隐式氢的渲染方位：按 k+nH 均分槽位填充（设计文档 §5.3） */
function implicitHydgens(
  atom: Atom,
  graph: MoleculeGraph,
): Array<{ x: number; y: number }> {
  const nH = atom.implicit_h
  if (nH <= 0) return []
  const nbAngles: number[] = []
  for (const b of graph.bonds) {
    if (b.atom1_id !== atom.atom_id && b.atom2_id !== atom.atom_id) continue
    const otherId = b.atom1_id === atom.atom_id ? b.atom2_id : b.atom1_id
    const other = graph.atoms.find((a) => a.atom_id === otherId)
    if (other) nbAngles.push(Math.atan2(other.y - atom.y, other.x - atom.x))
  }
  const total = nbAngles.length + nH
  if (nbAngles.length === 0) {
    // 孤立碳：四方
    const out: Array<{ x: number; y: number }> = []
    for (let i = 0; i < nH; i++) {
      const a = (i * Math.PI) / 2
      out.push({ x: atom.x + Math.cos(a) * BOND_LEN, y: atom.y + Math.sin(a) * BOND_LEN })
    }
    return out
  }
  // 槽位均匀分布，替换被邻居占用的位置
  const step = (Math.PI * 2) / total
  const base = nbAngles[0]
  const free: number[] = []
  for (let i = 0; i < total; i++) {
    const slot = base + i * step
    const isNeighbor = nbAngles.some((na) => {
      const d = Math.abs(((slot - na + Math.PI * 3) % (Math.PI * 2)) - Math.PI)
      return d < step / 2
    })
    if (!isNeighbor) free.push(slot)
  }
  const out: Array<{ x: number; y: number }> = []
  for (let i = 0; i < Math.min(nH, free.length); i++) {
    const a = free[i]
    out.push({ x: atom.x + Math.cos(a) * BOND_LEN, y: atom.y + Math.sin(a) * BOND_LEN })
  }
  return out
}

export function AtomLabels({ graph, showHydrogen, showAtomIds, hoverAtomId, selectedAtomId, attentionAtomIds }: Props) {
  const attentionSet = new Set(attentionAtomIds)
  return (
    <g className="labels">
      {/* 隐式氢（渲染层合成）：
          普通碳上的 C-H 由「显示 C-H 氢」开关控制；
          官能团氢独立常显——杂原子氢合并进标签（OH / NH₂ / SH…），
          醛基甲酰氢、端炔氢即使开关关闭也始终渲染。 */}
      {graph.atoms
        .filter(
          (a) =>
            a.element === 'C' &&
            a.implicit_h > 0 &&
            (showHydrogen || carbonHasFunctionalH(graph, a)),
        )
        .map((a) => (
          <g key={`h-${a.atom_id}`}>
            {implicitHydgens(a, graph).map((p, i) => (
              <g key={i}>
                {renderHBond(a, p)}
                {renderLabel({ ...a, element: 'H' }, p.x, p.y, true, new Set(), false, false, true)}
              </g>
            ))}
          </g>
        ))}
      <g>
        {graph.atoms.map((a) => {
          if (a.element === 'C') {
            // 碳端点不渲染
            if (showAtomIds) {
              const hl = attentionSet.has(a.atom_id)
              const sel = selectedAtomId === a.atom_id
              const hov = hoverAtomId === a.atom_id
              return (
                <text
                  key={`id-${a.atom_id}`}
                  x={a.x + 6}
                  y={a.y + 6}
                  fontSize={9}
                  fill={hl ? '#c0362c' : sel ? '#1f6feb' : hov ? '#555' : '#bbb'}
                  textAnchor="start"
                >
                  {a.atom_id}
                </text>
              )
            }
            return <g key={`c-${a.atom_id}`} />
          }
          return renderLabel(a, a.x, a.y, true, attentionSet, selectedAtomId === a.atom_id, hoverAtomId === a.atom_id, true)
        })}
      </g>
    </g>
  )
}

function renderHBond(atom: Atom, hPos: { x: number; y: number }): React.ReactNode {
  const ra = labelRadius(atom.element)
  const rb = labelRadius('H')
  const seg = clipBondSegment(atom, ra, hPos, rb, { x: 0, y: 0 })
  return (
    <line
      x1={seg.p.x}
      y1={seg.p.y}
      x2={seg.p.x + seg.v.x}
      y2={seg.p.y + seg.v.y}
      stroke="currentColor"
      strokeWidth={1.4}
    />
  )
}

/** 隐式氢下标字符 */
const SUB = ['', '', '₂', '₃', '₄', '₅']

/**
 * 原子标签文本（设计文档 §6.2 端点渲染）：
 * 杂原子的隐式 H 合并显示 —— O(1H)→OH、N(2H)→NH₂、S(1H)→SH，符合骨架式规范；
 * 碳不标字母、显式 H 独立渲染。
 */
export function atomLabelText(atom: Atom): string {
  if (atom.element === 'C' || atom.element === 'H') return atom.element
  const h = atom.implicit_h
  if (h <= 0) return atom.element
  if (h === 1) return `${atom.element}H`
  return `${atom.element}H${SUB[h] ?? h}`
}

function renderLabel(
  atom: Atom,
  x: number,
  y: number,
  withCircle: boolean,
  attentionSet: Set<number>,
  selected: boolean,
  hovered: boolean,
  visible: boolean,
): React.ReactNode {
  const text = atomLabelText(atom)
  const r = labelRadius(text)
  const hl = attentionSet.has(atom.atom_id)
  return (
    <g key={`l-${atom.atom_id}`} className="atom-label">
      {visible && withCircle && (
        <circle
          cx={x}
          cy={y}
          r={r + 1}
          fill="#ffffff"
          stroke={hl ? '#c0362c' : selected ? '#1f6feb' : hovered ? '#98c1f9' : 'none'}
          strokeWidth={hl || selected ? 1.6 : hovered ? 1.2 : 0}
        />
      )}
      {visible && (
        <text
          x={x}
          y={y}
          fontSize={14}
          textAnchor="middle"
          dominantBaseline="central"
          stroke="none"
          fill={hl ? '#c0362c' : '#111'}
        >
          {text}
        </text>
      )}
    </g>
  )
}