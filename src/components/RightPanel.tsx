/**
 * 右侧属性面板（设计文档 §10）：原子属性、键属性、分子信息、命名、保存。
 */
import { useMoleculeStore } from '../store/moleculeStore'
import { atomById, bondsOfAtom } from '../engine/graphUtils'
import { isAromaticLikeBond } from '../engine/ring'
import { ADDABLE_ELEMENTS, GROUP_LABELS, type GroupKey } from '../types/molecule'

function copy(text: string): void {
  navigator.clipboard?.writeText(text)
}

export function RightPanel() {
  const graph = useMoleculeStore((s) => s.graph)
  const measure = useMoleculeStore((s) => s.measure)
  const selectedAtomId = useMoleculeStore((s) => s.selectedAtomId)
  const selectedBondId = useMoleculeStore((s) => s.selectedBondId)
  const hoverBondId = useMoleculeStore((s) => s.hoverBondId)
  const setMeasure = useMoleculeStore((s) => s.setMeasure)
  const attentionAtomIds = useMoleculeStore((s) => s.attentionAtomIds)

  const selectedAtom = selectedAtomId !== null ? atomById(graph, selectedAtomId) : undefined
  // 优先展示选中键，其次悬停键
  const shownBondId = selectedBondId ?? hoverBondId
  const shownBond = shownBondId !== null ? graph.bonds.find((b) => b.bond_id === shownBondId) : undefined
  // 芳香键或处于显式凯库勒交替环上的键，均视为苯环
  const aromaticLike = shownBond ? isAromaticLikeBond(graph, shownBond.bond_id) : false

  const statusMeta: Record<string, { label: string; cls: string }> = {
    idle: { label: '初始化', cls: 'muted' },
    computing: { label: '计算中…', cls: 'warn' },
    ok: { label: '校验通过', cls: 'ok' },
    partial: { label: '部分计算（命名缺失）', cls: 'warn' },
    failed: { label: '命名失败，可手动输入', cls: 'bad' },
  }
  const st = statusMeta[measure.status] ?? statusMeta.idle

  return (
    <aside className="right-panel">
      <div className="panel-section">
        <div className="panel-title">分子信息</div>
        <div className="kv">
          <span>分子式</span>
          <strong>{measure.formula || '—'}</strong>
        </div>
        <div className="kv">
          <span>重原子数</span>
          <strong>{measure.heavyCount}</strong>
        </div>
        <div className="kv">
          <span>验证状态</span>
          <strong className={`badge ${st.cls}`}>
            {st.label}
            {attentionAtomIds.length > 0 ? `（${attentionAtomIds.length} 个原子超价）` : ''}
          </strong>
        </div>
      </div>

      <div className="panel-section">
        <div className="panel-title">命名</div>
        <div className="name-field">
          <span>中文名</span>
          <input
            className="name-input"
            value={measure.chineseName}
            placeholder="自动命名中…超出范围可手动输入"
            onChange={(e) => setMeasure({ ...measure, chineseName: e.target.value })}
          />
        </div>
        <div className="name-field">
          <span>IUPAC 名</span>
          <input
            className="name-input"
            value={measure.iupacName}
            placeholder="命名中…可手动输入"
            onChange={(e) => setMeasure({ ...measure, iupacName: e.target.value })}
          />
        </div>
      </div>

      <div className="panel-section">
        <div className="panel-title">标识符</div>
        <div className="ident-row" title="点击复制">
          <span>SMILES</span>
          <code onClick={() => copy(measure.canonicalSmiles)}>{measure.canonicalSmiles || '—'}</code>
        </div>
        <div className="ident-row" title="点击复制">
          <span>InChI</span>
          <code onClick={() => copy(measure.inChI)}>{measure.inChI || '—'}</code>
        </div>
        <div className="ident-row" title="点击复制">
          <span>InChIKey</span>
          <code onClick={() => copy(measure.inChIKey)}>{measure.inChIKey || '—'}</code>
        </div>
      </div>

      {selectedAtom ? (
        <div className="panel-section">
          <div className="panel-title">原子属性（# {selectedAtom.atom_id}）</div>
          <div className="kv">
            <span>元素</span>
            <strong>{selectedAtom.element}</strong>
          </div>
          <div className="kv">
            <span>隐式氢</span>
            <strong>{selectedAtom.implicit_h}</strong>
          </div>
          <div className="kv">
            <span>孤对电子</span>
            <strong>{selectedAtom.lone_pairs}</strong>
          </div>
          <div className="kv">
            <span>连接键</span>
            <strong>{bondsOfAtom(graph, selectedAtom.atom_id).length}</strong>
          </div>
          <div className="replace-quick">
            <span className="panel-sub">快速替换为</span>
            <div className="menu-grid">
              {ADDABLE_ELEMENTS.map((el) => (
                <button
                  key={el}
                  className={selectedAtom.element === el ? 'active' : ''}
                  onClick={() => useMoleculeStore.getState().applyReplaceAtom(selectedAtom.atom_id, el)}
                >
                  {el}
                </button>
              ))}
            </div>
            <span className="panel-sub">替换为基团</span>
            <div className="menu-grid">
              {(Object.keys(GROUP_LABELS) as GroupKey[]).map((g) => (
                <button
                  key={g}
                  onClick={() => useMoleculeStore.getState().applyReplaceGroup(selectedAtom.atom_id, g)}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="panel-section hint">
          <span>点击原子查看/替换属性</span>
        </div>
      )}

      {shownBond ? (
        <div className="panel-section">
          <div className="panel-title">键属性（# {shownBond.bond_id}）</div>
          <div className="kv">
            <span>连接</span>
            <strong>
              {shownBond.atom1_id} – {shownBond.atom2_id}
            </strong>
          </div>
          <div className="kv">
            <span>键级</span>
            <strong>{aromaticLike ? '芳香键（凯库勒）' : ['', '单键', '双键', '三键'][shownBond.order]}</strong>
          </div>
          {!aromaticLike && (
            <div className="replace-quick">
              <span className="panel-sub">改为</span>
              <div className="menu-grid">
                {([1, 2, 3] as const).map((o) => (
                  <button
                    key={o}
                    className={shownBond.order === o ? 'active' : ''}
                    onClick={() => useMoleculeStore.getState().applySetBondOrder(shownBond.bond_id, o)}
                  >
                    {['', '单键', '双键', '三键'][o]}
                  </button>
                ))}
              </div>
            </div>
          )}
          {aromaticLike && (
            <div className="replace-quick">
              <span className="panel-sub">苯环改为（整体交替）</span>
              <div className="menu-grid">
                {([1, 2, 3] as const).map((o) => (
                  <button
                    key={o}
                    onClick={() => useMoleculeStore.getState().applySetBondOrder(shownBond.bond_id, o)}
                  >
                    {['', '单键', '双键', '三键'][o]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}

      <div className="panel-section">
        <button className="primary save-btn" onClick={() => useMoleculeStore.getState().save()}>
          保存到分子库
        </button>
        <span className="small-note">保存时按 InChIKey 去重</span>
      </div>
    </aside>
  )
}