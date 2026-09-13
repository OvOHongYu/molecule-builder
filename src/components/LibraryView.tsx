/**
 * 分子库视图（设计文档 §9.2）：列表、载入、删除、去重提示。
 */
import { useLibraryStore, entryToGraph } from '../store/libraryStore'
import { useMoleculeStore } from '../store/moleculeStore'

interface Props {
  onClose(): void
}

export function LibraryView({ onClose }: Props) {
  const entries = useLibraryStore((s) => s.entries)
  const loadedId = useLibraryStore((s) => s.loadedId)
  const remove = useLibraryStore((s) => s.remove)
  const markLoaded = useLibraryStore((s) => s.markLoaded)

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal library-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>分子库（{entries.length}）</h3>
          <button className="ghost" onClick={onClose}>关闭</button>
        </div>
        {entries.length === 0 ? (
          <p className="modal-hint">暂无分子，点击"保存到分子库"收藏当前结构。</p>
        ) : (
          <ul className="library-list">
            {entries.map((e) => (
              <li key={e.id} className={loadedId === e.id ? 'active' : ''}>
                <div className="lib-main">
                  <strong>{e.name || e.formula}</strong>
                  <code>{e.formula}</code>
                  <code title={e.inChIKey}>{e.inChIKey || '无 InChIKey'}</code>
                </div>
                <div className="lib-actions">
                  <button
                    className="primary"
                    onClick={() => {
                      useMoleculeStore.getState().commit(entryToGraph(e), { noRelax: true })
                      markLoaded(e.id)
                      onClose()
                    }}
                  >
                    载入
                  </button>
                  <button className="danger" onClick={() => remove(e.id)}>
                    删除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}