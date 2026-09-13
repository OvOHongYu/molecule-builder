/**
 * 分子图数据模型（设计文档 §8）
 * 渲染坐标 x/y 仅属于渲染层，分子图数据以原子编号 + 连接键唯一标识。
 */

export type BondOrder = 1 | 2 | 3

export interface Atom {
  /** 分子内唯一编号，从 1 开始，删除不回收 */
  atom_id: number
  /** 元素符号 */
  element: string
  /** 形式电荷 */
  charge: number
  /** 同位素质量数（可空） */
  isotope?: number
  /** 自由基电子数 */
  radical: number
  /** 隐式氢数 */
  implicit_h: number
  /** 手性标记 R/S、E/Z（原型预留） */
  stereo: string
  /** 孤对电子数 */
  lone_pairs: number
  /** 渲染坐标（仅渲染层） */
  x: number
  y: number
  /** 是否为环成员（渲染辅助） */
  in_ring?: boolean
  /** 手动拖动锁定，局部重排不覆盖（设计文档 §7.1） */
  manuallyPlaced?: boolean
}

export interface Bond {
  bond_id: number
  atom1_id: number
  atom2_id: number
  /** 键级：1、2、3（芳香键单独用 aromatic 标记） */
  order: BondOrder
  /** 是否为芳香键 */
  aromatic: boolean
  /** 顺反、楔形键等（原型预留） */
  stereo: string
}

export interface MoleculeGraph {
  atoms: Atom[]
  bonds: Bond[]
  nextAtomId: number
  nextBondId: number
}

export type MeasureStatus = 'idle' | 'computing' | 'ok' | 'partial' | 'failed'

export interface Measure {
  formula: string
  heavyCount: number
  canonicalSmiles: string
  inChI: string
  inChIKey: string
  iupacName: string
  chineseName: string
  status: MeasureStatus
}

export interface LibraryEntry {
  id: string
  name: string
  formula: string
  smiles: string
  inChI: string
  inChIKey: string
  atoms: Atom[]
  bonds: Bond[]
  tags: string[]
  createdAt: number
}

/** 增加操作的候选元素（设计文档 §4.1.2） */
export const ADDABLE_ELEMENTS = ['H', 'O', 'N', 'S', 'P', 'F', 'Cl', 'Br', 'I'] as const

/** 基团模板 key（设计文档 §4.1.3） */
export type GroupKey =
  | 'OH'
  | 'NH2'
  | 'CH3'
  | 'COOH'
  | 'CHO'
  | 'NO2'
  | 'SO3H'
  | 'Ph'

export const GROUP_LABELS: Record<GroupKey, string> = {
  OH: '羟基 -OH',
  NH2: '氨基 -NH₂',
  CH3: '甲基 -CH₃',
  COOH: '羧基 -COOH',
  CHO: '醛基 -CHO',
  NO2: '硝基 -NO₂',
  SO3H: '磺酸基 -SO₃H',
  Ph: '苯基 -Ph',
}