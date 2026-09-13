/**
 * 选中原子工具条（设计文档 §3.2，落地为点选触发）：增加 / 替换 / 连接 / 删除。
 * 位置由 Canvas 计算并钳制在画布内。
 */
interface Props {
  left: number
  top: number
  atomId: number
  onAdd(atomId: number): void
  onReplace(atomId: number): void
  onConnect(atomId: number): void
  onDelete(atomId: number): void
}

export function AtomToolbar({ left, top, atomId, onAdd, onReplace, onConnect, onDelete }: Props) {
  return (
    <div className="atom-toolbar" style={{ left, top }} onPointerDown={(e) => e.stopPropagation()}>
      <button title="增加" aria-label="增加" onClick={() => onAdd(atomId)}>
        ＋ 增加
      </button>
      <button title="替换" aria-label="替换" onClick={() => onReplace(atomId)}>
        ⇄ 替换
      </button>
      <button title="连接：以此为起点，再点目标原子" aria-label="连接" onClick={() => onConnect(atomId)}>
        ⌁ 连接
      </button>
      <button title="删除" aria-label="删除" className="danger" onClick={() => onDelete(atomId)}>
        × 删除
      </button>
    </div>
  )
}
