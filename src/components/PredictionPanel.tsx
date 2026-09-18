/**
 * 预测面板（反应模块设计方案 §7.5、§7.6）：
 * 按产物形态**分区展示**三类候选，避免 B/C 类被读作「预测失败」：
 *   A 结构候选   → 可采纳到产物侧 / 插入画布
 *   B 典型性质   → 文字结论，可复制；不写入产物侧
 *   C 聚合提示   → 重复单元 + 聚合物名；明确标注不参与配平
 */
import { useEffect, useMemo, useState } from 'react'
import type { MoleculeGraph } from '../types/molecule'
import { newId } from '../types/reaction'
import { CATEGORY_LABEL } from '../types/rule'
import { StaticMoleculeSvg } from '../render/StaticMoleculeSvg'
import { useReactionStore } from '../store/reactionStore'
import { useMoleculeStore } from '../store/moleculeStore'
import { runPredictionWithAllRules, combustionEquation, type Candidate } from '../engine/reactionPredict'
import { initRdkit } from '../engine/rdkitLoader'
import { smilesToGraph } from '../engine/smarts'
import { getEnabledExternalBackend } from '../lib/predictionBackends'
import type { PredictionBackend } from '../types/backend'
import { molecularFormula } from '../engine/descriptors'
import { toSubscript } from '../lib/formulaText'

/** 聚合物重复单元预览：把 SMILES 解析为结构式后渲染（解析失败时降级为文字） */
function RepeatUnitPreview({ smiles }: { smiles: string }) {
  const [graph, setGraph] = useState<MoleculeGraph | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    void smilesToGraph(smiles).then((g) => {
      if (!alive) return
      if (g) setGraph(g)
      else setFailed(true)
    })
    return () => {
      alive = false
    }
  }, [smiles])
  if (failed) return null
  if (!graph) return <div className="repeat-loading">重复单元结构解析中…</div>
  return (
    <div className="pred-structure">
      <StaticMoleculeSvg graph={graph} />
      <span className="pred-formula">{toSubscript(molecularFormula(graph))}</span>
    </div>
  )
}

interface Props {
  /** 候选命中位点回传给画布高亮 */
  onHighlight(byComponent: Record<string, number[]>): void
  /** 采纳产物后同步选中 */
  onAccepted(): void
}

type Prepared = {
  candidates: Candidate[]
  unparseable: boolean
  engineNote: string
  external?: { backend: string; candidates: Candidate[] }
}

export function PredictionPanel({ onHighlight, onAccepted }: Props) {
  const scheme = useReactionStore((s) => s.scheme)
  const addProduct = useReactionStore((s) => s.addProduct)
  const addReactant = useReactionStore((s) => s.addReactant)
  const graph = useMoleculeStore((s) => s.graph)
  const [result, setResult] = useState<Prepared | null>(null)
  const [busy, setBusy] = useState(false)
  const [extBackend, setExtBackend] = useState<PredictionBackend | null>(null)

  useEffect(() => {
    let alive = true
    void getEnabledExternalBackend().then((b) => {
      if (alive) setExtBackend(b)
    })
    return () => {
      alive = false
    }
  }, [])

  /** 试剂文字 → 试剂库 id（用于规则匹配；无法识别的保留原文以便展示） */
  const agentIds = useMemo(() => {
    const out: string[] = []
    for (const a of scheme.agents) {
      if (a.reagentId) out.push(a.reagentId)
      else out.push(a.text.trim())
    }
    return out
  }, [scheme.agents])

  const reactantGraphs: MoleculeGraph[] = useMemo(
    () => scheme.reactants.map((c) => c.molecule),
    [scheme.reactants],
  )

  const run = async (): Promise<void> => {
    if (!reactantGraphs.length) {
      setResult({ candidates: [], unparseable: false, engineNote: '请先加入反应物' })
      onHighlight({})
      return
    }
    setBusy(true)
    try {
      const mod = await initRdkit()
      if (!mod) {
        setResult({
          candidates: [],
          unparseable: false,
          engineNote: 'RDKit 未能加载（离线或资源缺失），结构预测不可用；请检查 public/rdkit 资源',
        })
        onHighlight({})
        return
      }
      const r = runPredictionWithAllRules(mod, { reactants: reactantGraphs, agents: agentIds })
      // 本地位点 → 组分 id 映射（合并图的 atom_id 偏移需还原到各组分）
      const byComp: Record<string, number[]> = {}
      let offset = 0
      for (const comp of scheme.reactants) {
        const ids = r.candidates.flatMap((c) => c.hitAtoms).filter((id) => id > offset && id <= offset + comp.molecule.atoms.length)
        if (ids.length) byComp[comp.id] = ids.map((id) => id - offset)
        offset += comp.molecule.atoms.length
      }
      onHighlight(byComp)

      const note = r.unparseable
        ? '结构无法被引擎解析，预测不可用'
        : r.candidates.length
          ? ''
          : '未命中任何规则（可尝试补充试剂，或该反应不在首批规则范围内）'

      // 本地未命中且外部后端已启用 → 调用外部兜底
      let external: Prepared['external']
      if (!r.candidates.length && extBackend) {
        try {
          const ext = await extBackend.predict({
            reactants: reactantGraphs,
            agents: agentIds,
            conditions: scheme.conditions,
          })
          if (ext.length) external = { backend: extBackend.name, candidates: ext }
        } catch {
          /* 静默降级为仅本地结果 */
        }
      }
      setResult({ candidates: r.candidates, unparseable: r.unparseable, engineNote: note, external })
    } finally {
      setBusy(false)
    }
  }

  const structural = result?.candidates.filter((c) => c.kind === 'transform') ?? []
  const qualitative = result?.candidates.filter((c) => c.kind === 'qualitative') ?? []
  const polymers = result?.candidates.filter((c) => c.kind === 'polymer') ?? []

  const acceptProducts = (c: Candidate): void => {
    if (!c.products?.length) return
    for (const p of c.products) addProduct(p, 1)
    // 采纳后清空高亮
    onHighlight({})
    onAccepted()
  }

  const insertToCanvas = (g: MoleculeGraph): void => {
    useMoleculeStore.getState().commit(g, { noRelax: true })
    useMoleculeStore.getState().showToast('info', '已插入分子画布')
  }

  return (
    <div className="prediction-panel">
      <div className="panel-title">反应预测</div>
      <button className="primary" onClick={() => void run()} disabled={busy || !reactantGraphs.length}>
        {busy ? '预测中…' : '按规则预测产物'}
      </button>
      <div className="small-note">
        基于本地规则库（{`${(scheme.agents.length ? '已选试剂参与筛选' : '未指定试剂，结果仅供参考')}`}）。结果为「候选」而非概率结论。
      </div>

      {result?.engineNote && <div className="pred-note">{result.engineNote}</div>}

      {result && !result.engineNote && (
        <>
          {/* A 类：结构候选 */}
          <div className="pred-section">
            <div className="pred-section-head">
              <span className="pred-tag a">结构候选</span>
              <span className="pred-count">{structural.length}</span>
            </div>
            {structural.length === 0 && <div className="empty-hint">无结构候选</div>}
            {structural.map((c) => (
              <div className="pred-card" key={c.id}>
                <div className="pred-card-head">
                  <strong>{c.ruleName}</strong>
                  <span className="pred-cat">{CATEGORY_LABEL[c.category as keyof typeof CATEGORY_LABEL] ?? c.category}</span>
                </div>
                <div className="pred-structures">
                  {c.products?.map((p, i) => (
                    <div className="pred-structure" key={i}>
                      <StaticMoleculeSvg graph={p} />
                      <span className="pred-formula">{toSubscript(molecularFormula(p))}</span>
                    </div>
                  ))}
                </div>
                <ul className="pred-why">
                  {c.why.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
                <div className="pred-actions">
                  <button className="primary" onClick={() => acceptProducts(c)}>
                    采纳为产物
                  </button>
                  {c.products?.[0] && (
                    <button onClick={() => insertToCanvas(c.products![0])}>插入画布</button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* B 类：典型性质与现象 */}
          {qualitative.length > 0 && (
            <div className="pred-section">
              <div className="pred-section-head">
                <span className="pred-tag b">典型性质与现象</span>
                <span className="pred-count">{qualitative.length}</span>
              </div>
              <div className="pred-explain">
                此类为鉴别现象或整体性质，<strong>没有可绘制的产物结构</strong>，故不写入产物侧、不参与配平。
              </div>
              {qualitative.map((c) => (
                <div className="pred-card qualitative" key={c.id}>
                  <div className="pred-card-head">
                    <strong>{c.ruleName}</strong>
                    <span className="pred-cat">性质</span>
                  </div>
                  <div className="pred-conclusion">{c.conclusion?.text}</div>
                  {c.conclusion?.phenomenon && <div className="pred-phenomenon">现象：{c.conclusion.phenomenon}</div>}
                  {(() => {
                    const eq = c.ruleId.startsWith('R-ENE-07') || c.ruleId.startsWith('R-YNE-07') || c.ruleId === 'R-ALC-07' || c.ruleId === 'R-KET-02' || c.ruleId === 'R-SAC-02'
                      ? combustionEquation(scheme.reactants.map((x) => x.molecule))
                      : ''
                    return eq ? <div className="pred-equation">燃烧方程式：{eq}</div> : null
                  })()}
                  <ul className="pred-why">
                    {c.why.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                  <div className="pred-actions">
                    <button onClick={() => navigator.clipboard?.writeText(c.conclusion?.text ?? '')}>复制结论</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* C 类：聚合提示 */}
          {polymers.length > 0 && (
            <div className="pred-section">
              <div className="pred-section-head">
                <span className="pred-tag c">聚合提示</span>
                <span className="pred-count">{polymers.length}</span>
              </div>
              <div className="pred-explain">
                聚合度 n 是变量，元素守恒方程无解，故<strong>聚合反应不参与配平</strong>，产物侧不写入。
              </div>
              {polymers.map((c) => (
                <div className="pred-card polymer" key={c.id}>
                  <div className="pred-card-head">
                    <strong>{c.polymer?.name}</strong>
                    <span className="pred-cat">聚合</span>
                  </div>
                  {c.polymer?.repeatUnitSmiles && (
                    <div className="pred-structures">
                      <RepeatUnitPreview smiles={c.polymer.repeatUnitSmiles} />
                    </div>
                  )}
                  {c.polymer?.degreeNote && <div className="pred-phenomenon">{c.polymer.degreeNote}</div>}
                  <ul className="pred-why">
                    {c.why.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                  {c.polymer?.repeatUnitSmiles && (
                    <div className="pred-actions">
                      <button
                        onClick={() => {
                          void smilesToGraph(c.polymer!.repeatUnitSmiles!).then((g) => {
                            if (g) insertToCanvas(g)
                            else useMoleculeStore.getState().showToast('error', '重复单元结构解析失败')
                          })
                        }}
                        title="把重复单元结构插入分子画布，便于自行补全聚合度表达"
                      >
                        插入重复单元到画布
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 外部后端结果：与本地结果分组展示，来源标注清晰 */}
          {result.external && (
            <div className="pred-section external">
              <div className="pred-section-head">
                <span className="pred-tag ext">外部服务</span>
                <span className="pred-count">{result.external.candidates.length}</span>
              </div>
              <div className="pred-explain">
                来源：{result.external.backend}。此结果由第三方服务返回，未经本地校验。
              </div>
              {result.external.candidates.map((c) => (
                <div className="pred-card" key={c.id}>
                  <div className="pred-card-head">
                    <strong>{c.ruleName}</strong>
                  </div>
                  <div className="pred-structures">
                    {c.products?.map((p, i) => (
                      <div className="pred-structure" key={i}>
                        <StaticMoleculeSvg graph={p} />
                      </div>
                    ))}
                  </div>
                  <div className="pred-actions">
                    <button className="primary" onClick={() => acceptProducts(c)}>
                      采纳为产物
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* 便捷：把画布当前分子加入反应物/产物 */}
      <div className="pred-extra">
        <button onClick={() => addReactant(graph)} title="把分子构建器当前分子加入反应物侧">
          ＋ 当前分子 → 反应物
        </button>
        <button onClick={() => addProduct(graph)} title="把分子构建器当前分子加入产物侧">
          ＋ 当前分子 → 产物
        </button>
      </div>
    </div>
  )
}

export { newId }
