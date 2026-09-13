/**
 * 选中键工具条（设计文档 §3.3）：单/双/三键切换 + 删除键。
 * 芳香键（苯环）点击后会将整圈实体化为 Kekulé 交替单/双键，便于继续编辑。
 * 位置由 Canvas 钳制在画布内。
 */
import type { BondOrder } from '../types/molecule'

interface Props {
  left: number
  top: number
  /** 当前键级（1/2/3） */
  order: BondOrder
  /** 芳香键：点击后实体化整圈并应用所选键级 */
  aromatic: boolean
  onSetOrder(order: BondOrder): void
  onDelete(): void
}

const ORDER_LABEL: Record<number, string> = { 1: '单键', 2: '双键', 3: '三键' }

export function BondToolbar({ left, top, order, aromatic, onSetOrder, onDelete }: Props) {
  return (
    <div className="bond-delete" style={{ left, top }} onPointerDown={(e) => e.stopPropagation()}>
      {aromatic && <span className="bond-toolbar-note">芳香环</span>}
      {([1, 2, 3] as BondOrder[]).map((o) => (
        <button
          key={o}
          title={aromatic ? `苯环整体交替，并设为${ORDER_LABEL[o]}` : `改为${ORDER_LABEL[o]}`}
          aria-label={aromatic ? `苯环整体交替，并设为${ORDER_LABEL[o]}` : `改为${ORDER_LABEL[o]}`}
          className={!aromatic && order === o ? 'active' : ''}
          onClick={() => onSetOrder(o)}
        >
          {ORDER_LABEL[o]}
        </button>
      ))}
      <button title="删除键" aria-label="删除键" className="danger" onClick={onDelete}>
        × 删除
      </button>
    </div>
  )
}
