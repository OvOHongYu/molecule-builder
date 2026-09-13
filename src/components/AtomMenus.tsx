/**
 * 增加/替换/连接二级菜单（设计文档 §4.1、§4.2）：键 / 原子 / 基团三组。
 * connect：仅显示键级选择，用于把已选起点原子与目标原子连键。
 */
import { ADDABLE_ELEMENTS, GROUP_LABELS, type GroupKey } from '../types/molecule'

export type MenuKind = 'add' | 'replace' | 'connect'

interface Props {
  kind: MenuKind
  x: number
  y: number
  onPickBond(kind: 'single' | 'double' | 'triple'): void
  onPickAtom(element: string): void
  onPickGroup(group: GroupKey): void
  onClose(): void
}

export function AtomMenus({ kind, x, y, onPickBond, onPickAtom, onPickGroup, onClose }: Props) {
  return (
    <div
      className="atom-menu"
      style={{ left: x, top: y }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {kind === 'connect' ? (
        <div className="menu-group">
          <div className="menu-title">选择键级并连接</div>
          <div className="menu-row">
            <button onClick={() => onPickBond('single')}>
              <span className="bond-preview single" aria-hidden="true" /> 单键
            </button>
            <button onClick={() => onPickBond('double')}>
              <span className="bond-preview double" aria-hidden="true" /> 双键
            </button>
            <button onClick={() => onPickBond('triple')}>
              <span className="bond-preview triple" aria-hidden="true" /> 三键
            </button>
          </div>
        </div>
      ) : (
        <>
          {kind === 'add' && (
            <div className="menu-group">
              <div className="menu-title">增加键（默认生成隐形碳端点）</div>
              <div className="menu-row">
                <button onClick={() => onPickBond('single')}>
                  <span className="bond-preview single" aria-hidden="true" /> 单键
                </button>
                <button onClick={() => onPickBond('double')}>
                  <span className="bond-preview double" aria-hidden="true" /> 双键
                </button>
                <button onClick={() => onPickBond('triple')}>
                  <span className="bond-preview triple" aria-hidden="true" /> 三键
                </button>
              </div>
            </div>
          )}
          <div className="menu-group">
            <div className="menu-title">{kind === 'add' ? '增加原子' : '替换为原子'}</div>
            <div className="menu-grid">
              {ADDABLE_ELEMENTS.map((el) => (
                <button key={el} onClick={() => onPickAtom(el)} title={elLabel(el)}>
                  {el}
                </button>
              ))}
            </div>
          </div>
          <div className="menu-group">
            <div className="menu-title">{kind === 'add' ? '增加基团' : '替换为基团'}</div>
            <div className="menu-grid">
              {(Object.keys(GROUP_LABELS) as GroupKey[]).map((g) => (
                <button key={g} onClick={() => onPickGroup(g)} title={GROUP_LABELS[g]}>
                  {g}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      <div className="menu-close">
        <button onClick={onClose}>关闭</button>
      </div>
    </div>
  )
}

function elLabel(el: string): string {
  const names: Record<string, string> = {
    H: '氢', O: '氧', N: '氮', S: '硫', P: '磷', F: '氟', Cl: '氯', Br: '溴', I: '碘',
  }
  return `${el}（${names[el] ?? el}）`
}