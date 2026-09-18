/**
 * 试剂与条件库面板（反应模块设计方案 §9.3）：
 * 检索（名称 / 英文名 / 缩写 / 标签）、按类别筛选、插入为试剂，或一键填充条件预设。
 */
import { useMemo, useState } from 'react'
import type { ConditionPreset, ReagentCategory } from '../types/reaction'
import { newId } from '../types/reaction'
import { CONDITIONS } from '../data/conditions'
import {
  REAGENT_CATEGORY_LABEL,
  searchReagents,
  type ReagentEntry,
} from '../data/reagents'
import { useReactionStore } from '../store/reactionStore'

const CATEGORY_ORDER: ReagentCategory[] = [
  'acid',
  'base',
  'oxidant',
  'reductant',
  'catalyst',
  'solvent',
  'other',
]

export function ReagentPanel() {
  const addAgent = useReactionStore((s) => s.addAgent)
  const setConditions = useReactionStore((s) => s.setConditions)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<ReagentCategory | ''>('')
  const [tab, setTab] = useState<'reagent' | 'condition'>('reagent')

  const list = useMemo(() => searchReagents(q, cat || undefined), [q, cat])

  const insertReagent = (r: ReagentEntry): void => {
    // 试剂以文字名插入（带缩写时优先用缩写，符合化学式书写习惯）
    addAgent({ id: newId(), text: r.abbr || r.name, reagentId: r.id })
  }

  const applyCondition = (c: ConditionPreset): void => {
    setConditions({
      catalyst: c.catalyst,
      temperature: c.temperature,
      solvent: c.solvent,
      time: c.time,
      atmosphere: c.atmosphere,
    })
  }

  return (
    <div className="reagent-panel">
      <div className="panel-title">试剂与条件</div>
      <div className="tabs">
        <button className={tab === 'reagent' ? 'active' : ''} onClick={() => setTab('reagent')}>
          试剂库
        </button>
        <button className={tab === 'condition' ? 'active' : ''} onClick={() => setTab('condition')}>
          条件预设
        </button>
      </div>

      {tab === 'reagent' ? (
        <>
          <input
            className="reagent-search"
            placeholder="搜索名称 / 英文名 / 缩写 / 标签"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="cat-row">
            <button className={cat === '' ? 'active' : ''} onClick={() => setCat('')}>
              全部
            </button>
            {CATEGORY_ORDER.map((c) => (
              <button key={c} className={cat === c ? 'active' : ''} onClick={() => setCat(c)}>
                {REAGENT_CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
          <ul className="reagent-list">
            {list.map((r) => (
              <li key={r.id}>
                <button className="reagent-item" onClick={() => insertReagent(r)} title={r.hazard ? `危险性：${r.hazard}` : undefined}>
                  <strong>{r.abbr || r.name}</strong>
                  <span className="reagent-sub">{r.name}</span>
                  <span className="reagent-cat">{REAGENT_CATEGORY_LABEL[r.category]}</span>
                </button>
              </li>
            ))}
            {!list.length && <li className="empty-hint">没有匹配的试剂</li>}
          </ul>
          <div className="small-note">点击条目即插入为反应式的试剂（不参与配平）</div>
        </>
      ) : (
        <>
          <ul className="reagent-list">
            {CONDITIONS.map((c) => (
              <li key={c.id}>
                <button className="reagent-item" onClick={() => applyCondition(c)} title="一键填充到箭头条件">
                  <strong>{c.name}</strong>
                  <span className="reagent-sub">
                    {[c.catalyst, c.temperature, c.solvent].filter(Boolean).join(' · ') || '—'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="small-note">
            点击预设即填充箭头上方/下方文字与结构化条件；若已手动改写过箭头文字，则只更新结构化字段
          </div>
        </>
      )}
    </div>
  )
}
