/**
 * 分支删除对话框（设计文档 §4.3.1）：保留左/右/取消，多分支列方位。
 */
import { useMoleculeStore } from '../store/moleculeStore'

export function BranchDialog() {
  const pendingDelete = useMoleculeStore((s) => s.pendingDelete)
  const confirmDelete = useMoleculeStore((s) => s.confirmDelete)
  const cancelDelete = useMoleculeStore((s) => s.cancelDelete)
  if (!pendingDelete) return null
  const { branches, kind, id } = pendingDelete
  return (
    <div className="modal-backdrop" onClick={cancelDelete}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{kind === 'atom' ? '删除碳原子' : '删除键'}：请选择保留的分支</h3>
        <p className="modal-hint">
          {kind === 'atom'
            ? `将删除该碳原子（#${id}）与未保留一侧的所有结构；保留侧直接相连原子成为新端点。`
            : '将删除未保留一侧的所有原子与键；保留侧成为新端点。'}
        </p>
        <div className="modal-actions">
          {branches.map((b, i) => (
            <button key={i} className="primary" onClick={() => confirmDelete(b.branchAtomId)}>
              {b.label}
            </button>
          ))}
          <button onClick={cancelDelete}>取消</button>
        </div>
      </div>
    </div>
  )
}