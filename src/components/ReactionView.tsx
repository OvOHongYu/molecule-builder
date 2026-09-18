/**
 * 反应工作区（反应模块设计方案 §5.1、§5.3、§5.4、§10.4）：
 * 左面板（组入组分 / 试剂与条件 / 预测）+ 中央反应式画布 + 右面板（箭头与条件 / 配平 / 导出）。
 */
import { useMemo, useRef, useState } from 'react'
import type { ArrowKind, SchemeComponent } from '../types/reaction'
import { ARROW_LABEL } from '../types/reaction'
import { useReactionStore, schemeArrowText, type Side } from '../store/reactionStore'
import { useMoleculeStore } from '../store/moleculeStore'
import { useLibraryStore, entryToGraph } from '../store/libraryStore'
import { useViewStore } from '../store/viewStore'
import { emptyScheme } from '../types/reaction'
import { SchemeCanvas } from './SchemeCanvas'
import { ReagentPanel } from './ReagentPanel'
import { PredictionPanel } from './PredictionPanel'
import { balanceGraphs } from '../engine/balance'
import { molecularFormula } from '../engine/descriptors'
import { toSubscript } from '../lib/formulaText'
import {
  exportReactionSvg,
  exportReactionPng,
  exportRxn,
  exportReactionSmiles,
  exportEquation,
  exportReactionPdf,
} from '../lib/exportReaction'
import { loadExtSettings, saveExtSettings, type ExternalBackendSettings as ExternalBackendSettingsShape } from '../lib/predictionBackends'
import { saveScheme } from '../store/reactionStore'

export function ReactionView() {
  const scheme = useReactionStore((s) => s.scheme)
  const applyBalance = useReactionStore((s) => s.applyBalance)
  const balanceResult = useReactionStore((s) => s.balanceResult)
  const arrow = scheme.arrow.kind
  const setArrow = useReactionStore((s) => s.setArrow)
  const setConditions = useReactionStore((s) => s.setConditions)
  const setAboveText = useReactionStore((s) => s.setAboveText)
  const setBelowText = useReactionStore((s) => s.setBelowText)
  const reset = useReactionStore((s) => s.reset)
  const undo = useReactionStore((s) => s.undo)
  const redo = useReactionStore((s) => s.redo)
  const addReactant = useReactionStore((s) => s.addReactant)
  const addProduct = useReactionStore((s) => s.addProduct)
  const setSaved = useReactionStore((s) => s.setSaved)
  const saved = useReactionStore((s) => s.saved)
  const conserved = useReactionStore((s) => s.conserved)

  const currentGraph = useMoleculeStore((s) => s.graph)
  const entries = useLibraryStore((s) => s.entries)
  const setMode = useViewStore((s) => s.setMode)

  const [highlight, setHighlight] = useState<Record<string, number[]>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const balance = useMemo(
    () =>
      balanceGraphs(
        scheme.reactants.map((c) => c.molecule),
        scheme.products.map((c) => c.molecule),
      ),
    [scheme.reactants, scheme.products],
  )

  const toast = (msg: string): void => useMoleculeStore.getState().showToast('info', msg)
  const toastErr = (msg: string): void => useMoleculeStore.getState().showToast('error', msg)

  const editComponent = (comp: SchemeComponent, side: Side): void => {
    // 把该组分载入分子构建器编辑；返回后用户可手动替换
    useMoleculeStore.getState().commit(comp.molecule, { noRelax: true })
    setMode('molecule')
    toast(`已载入该组分到分子构建器（原属${side === 'reactants' ? '反应物' : '产物'}侧），编辑完成后可重新加入反应式`)
  }

  const doSave = (): void => {
    saveScheme(scheme)
    setSaved(true)
    toast('反应式已保存到本地')
  }

  const selectedComp = useMemo(() => {
    if (!selectedId) return null
    const inR = scheme.reactants.find((c) => c.id === selectedId)
    if (inR) return { comp: inR, side: 'reactants' as Side }
    const inP = scheme.products.find((c) => c.id === selectedId)
    if (inP) return { comp: inP, side: 'products' as Side }
    return null
  }, [selectedId, scheme.reactants, scheme.products])

  const loadLast = (): void => {
    // 从 localStorage 读回上次保存的反应式
    const raw = localStorage.getItem('molecule-reactions-v1')
    if (!raw) {
      toastErr('没有已保存的反应式')
      return
    }
    try {
      const parsed = JSON.parse(raw) as typeof scheme
      if (!Array.isArray(parsed.reactants)) throw new Error('格式不符')
      useReactionStore.setState({ scheme: parsed, saved: true, conserved: false, balanceResult: null, past: [], future: [] })
      toast('已载入上次保存的反应式')
    } catch {
      toastErr('保存的反应式格式无法识别')
    }
  }

  const hasBothSides = scheme.reactants.length > 0 && scheme.products.length > 0

  return (
    <div className="main reaction-mode">
      {/* ---------- 左面板 ---------- */}
      <aside className="left-panel">
        <div className="panel-title">组入组分</div>
        <div className="btn-col">
          <button className="primary" onClick={() => addReactant(currentGraph)}>
            ＋ 当前分子 → 反应物
          </button>
          <button className="primary" onClick={() => addProduct(currentGraph)}>
            ＋ 当前分子 → 产物
          </button>
          <button onClick={() => setMode('molecule')} title="切到分子构建器绘制新结构">
            ✎ 去分子构建器画结构
          </button>
        </div>

        <div className="panel-section">
          <div className="panel-title">从分子库组入</div>
          {entries.length === 0 ? (
            <div className="empty-hint">分子库为空，请先在分子构建器中保存分子</div>
          ) : (
            <ul className="mini-library">
              {entries.slice(0, 12).map((e) => (
                <li key={e.id}>
                  <span className="ml-name" title={e.inChIKey}>
                    {e.name || e.formula}
                  </span>
                  <span className="ml-actions">
                    <button title="加入反应物" onClick={() => addReactant(entryToGraph(e))}>
                      → 反应物
                    </button>
                    <button title="加入产物" onClick={() => addProduct(entryToGraph(e))}>
                      → 产物
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="panel-section">
          <ReagentPanel />
        </div>

        <div className="panel-section">
          <PredictionPanel
            onHighlight={setHighlight}
            onAccepted={() => toast('已将候选产物写入产物侧')}
          />
        </div>

        <div className="panel-section">
          <div className="panel-title">反应式操作</div>
          <div className="btn-row">
            <button onClick={undo} title="撤销 (Ctrl+Z)">↶ 撤销</button>
            <button onClick={redo} title="重做 (Ctrl+Y)">↷ 重做</button>
          </div>
          <div className="btn-row">
            <button onClick={doSave} className={saved ? '' : 'primary'}>
              {saved ? '✓ 已保存' : '保存反应式'}
            </button>
            <button onClick={loadLast}>载入上次</button>
          </div>
          <button
            className="danger"
            onClick={() => {
              reset()
              setHighlight({})
              setSelectedId(null)
              toast('已清空反应式')
            }}
          >
            清空反应式
          </button>
        </div>
      </aside>

      {/* ---------- 中央画布 ---------- */}
      <main className="center">
        <div className="canvas-wrap" ref={rootRef}>
          <SchemeCanvas
            highlightByComponent={highlight}
            onEditComponent={editComponent}
            selectedComponentId={selectedId}
            onSelectComponent={setSelectedId}
          />
        </div>
      </main>

      {/* ---------- 右面板 ---------- */}
      <aside className="right-panel">
        <div className="panel-section">
          <div className="panel-title">箭头与条件</div>
          <div className="kv">
            <span>箭头</span>
            <select value={arrow} onChange={(e) => setArrow(e.target.value as ArrowKind)}>
              {(Object.keys(ARROW_LABEL) as ArrowKind[]).map((k) => (
                <option key={k} value={k}>
                  {ARROW_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
          <label className="cond-field">
            <span>箭头上方</span>
            <input
              value={scheme.aboveText}
              placeholder="如 H2SO4(conc), Δ"
              onChange={(e) => setAboveText(e.target.value)}
            />
          </label>
          <label className="cond-field">
            <span>箭头下方</span>
            <input
              value={scheme.belowText}
              placeholder="如 EtOH, reflux"
              onChange={(e) => setBelowText(e.target.value)}
            />
          </label>
          <div className="small-note">手动改写后不再随结构化条件自动同步</div>

          <div className="cond-grid">
            <label>
              <span>温度</span>
              <input value={scheme.conditions.temperature ?? ''} onChange={(e) => setConditions({ temperature: e.target.value })} placeholder="140 ℃" />
            </label>
            <label>
              <span>溶剂</span>
              <input value={scheme.conditions.solvent ?? ''} onChange={(e) => setConditions({ solvent: e.target.value })} placeholder="EtOH" />
            </label>
            <label>
              <span>催化剂</span>
              <input value={scheme.conditions.catalyst ?? ''} onChange={(e) => setConditions({ catalyst: e.target.value })} placeholder="浓H2SO4" />
            </label>
            <label>
              <span>时间</span>
              <input value={scheme.conditions.time ?? ''} onChange={(e) => setConditions({ time: e.target.value })} placeholder="2 h" />
            </label>
            <label>
              <span>气氛</span>
              <input value={scheme.conditions.atmosphere ?? ''} onChange={(e) => setConditions({ atmosphere: e.target.value })} placeholder="N2" />
            </label>
          </div>
          <button className="ghost" onClick={() => { const t = schemeArrowText(scheme); setAboveText(t.above); setBelowText(t.below) }} title="按当前试剂与条件重新生成箭头文字">
            按条件重新生成箭头文字
          </button>
        </div>

        <div className="panel-section">
          <div className="panel-title">配平</div>
          <div className={`balance-line ${conserved ? 'ok' : hasBothSides ? 'bad' : 'muted'}`}>
            {!hasBothSides
              ? '两侧都加入组分后自动校验'
              : conserved
                ? '元素守恒 ✓'
                : '元素不守恒'}
          </div>
          {hasBothSides && (
            <>
              <div className="balance-elements">
                {balance.elements.map((e) => (
                  <span key={e.element} className={e.left === e.right ? 'ok' : 'bad'}>
                    {e.element} {e.left}={e.right}
                    {e.left === e.right ? ' ✓' : ' ✗'}
                  </span>
                ))}
              </div>
              <button
                className="primary"
                onClick={() => {
                  applyBalance()
                  const r = balanceGraphs(
                    scheme.reactants.map((c) => c.molecule),
                    scheme.products.map((c) => c.molecule),
                  )
                  if (r.ok) toast(r.multiple ? r.message : '已按最小整数系数配平')
                  else toastErr(r.message)
                }}
              >
                一键配平
              </button>
              {balanceResult && !balanceResult.ok && <div className="pred-note">{balanceResult.message}</div>}
            </>
          )}
        </div>

        {selectedComp && (
          <div className="panel-section">
            <div className="panel-title">
              组分属性（{selectedComp.side === 'reactants' ? '反应物' : '产物'}侧）
            </div>
            <div className="kv">
              <span>分子式</span>
              <strong>{toSubscript(molecularFormula(selectedComp.comp.molecule))}</strong>
            </div>
            <div className="kv">
              <span>重原子数</span>
              <strong>{selectedComp.comp.molecule.atoms.filter((a) => a.element !== 'H').length}</strong>
            </div>
            <div className="kv">
              <span>计量系数</span>
              <strong>{selectedComp.comp.coefficient}</strong>
            </div>
            <button onClick={() => editComponent(selectedComp.comp, selectedComp.side)}>
              在分子构建器中编辑
            </button>
          </div>
        )}

        <div className="panel-section">
          <div className="panel-title">导出</div>
          <div className="btn-row">
            <button
              onClick={() => (exportReactionSvg(rootRef.current ?? document.body) ? toast('已导出反应式 SVG') : toastErr('画布为空，无法导出'))}
              title="矢量图，可直接用于论文"
            >
              SVG
            </button>
            <button
              onClick={() => (exportReactionPng(rootRef.current ?? document.body) ? toast('已导出反应式 PNG') : toastErr('画布为空，无法导出'))}
              title="3 倍分辨率位图"
            >
              PNG
            </button>
            <button onClick={exportReactionPdf} title="浏览器打印，可选『另存为 PDF』；中文可选中可搜索">
              PDF
            </button>
          </div>
          <div className="btn-row">
            <button
              onClick={() => (exportRxn(scheme) ? toast('已导出 RXN') : toastErr('需两侧都有组分'))}
              title="RXN V2000，可被 RDKit / ChemDraw 读取"
            >
              RXN
            </button>
            <button
              onClick={() => void exportReactionSmiles(scheme).then((ok) => (ok ? toast('已导出反应 SMILES') : toastErr('需两侧都有组分')))}
              title="反应 SMILES（不表达计量系数）"
            >
              SMILES
            </button>
          </div>
          <div className="panel-title" style={{ marginTop: 8 }}>
            化学方程式
          </div>
          <div className="btn-row">
            <button onClick={() => (exportEquation(scheme, 'unicode') ? toast('已导出 Unicode 方程式') : toastErr('需两侧都有组分'))} title="Unicode 下标，可直接粘贴到 Word">
              下标
            </button>
            <button onClick={() => (exportEquation(scheme, 'latex') ? toast('已导出 LaTeX 方程式') : toastErr('需两侧都有组分'))} title="mhchem 语法">
              LaTeX
            </button>
            <button onClick={() => (exportEquation(scheme, 'ascii') ? toast('已导出 ASCII 方程式') : toastErr('需两侧都有组分'))} title="纯文本">
              ASCII
            </button>
          </div>
          <div className="small-note">
            方程式以分子式表达，会丢失结构信息（同分异构体无法区分）；正式交付建议用 SVG / PDF。
          </div>
        </div>

        <div className="panel-section">
          <div className="panel-title">外部预测服务</div>
          <button className="ghost" onClick={() => setShowSettings((v) => !v)}>
            {showSettings ? '收起设置 ▲' : '配置外部服务 ▼'}
          </button>
          {showSettings && <ExternalBackendSettings />}
        </div>
      </aside>
    </div>
  )
}

/** 外部后端设置（默认关闭；启用时明确提示会把结构发送给第三方） */
function ExternalBackendSettings() {
  const [s, setS] = useState<ExternalBackendSettingsShape>(() => loadExtSettings())
  const update = (patch: Partial<ExternalBackendSettingsShape>): void => {
    const next = { ...s, ...patch }
    setS(next)
    saveExtSettings(next)
  }
  return (
    <div className="ext-settings">
      <label className="toggle-line">
        <input type="checkbox" checked={s.enabled} onChange={(e) => update({ enabled: e.target.checked })} />
        <span>启用外部预测服务</span>
      </label>
      <div className="small-note warn">
        启用后，反应物结构（SMILES）会被发送至你配置的第三方服务。请确认其隐私政策与合规要求。
      </div>
      <label className="cond-field">
        <span>服务地址</span>
        <input
          value={s.endpoint}
          placeholder="https://example.com/api/predict"
          onChange={(e) => update({ endpoint: e.target.value })}
        />
      </label>
      <label className="cond-field">
        <span>密钥</span>
        <input
          type="password"
          value={s.apiKey}
          placeholder="仅存于本地浏览器"
          onChange={(e) => update({ apiKey: e.target.value })}
        />
      </label>
      <label className="cond-field">
        <span>密钥请求头</span>
        <input
          value={s.authHeader}
          placeholder="Authorization"
          onChange={(e) => update({ authHeader: e.target.value })}
        />
      </label>
      <div className="small-note">
        请求体：{'{ reactants: string[], agents: string[], conditions: {...} }'}；
        响应体：{'{ products: [{ smiles: string[], name?: string }] }'}
      </div>
    </div>
  )
}

export { emptyScheme }
