/**
 * 反应式画布（反应模块设计方案 §5.1、§5.5）：
 * 横向排布 [反应物 + … + 反应物] —箭头(含条件)— [产物 + … + 产物]，
 * 组分以卡片呈现（复用 StaticMoleculeSvg），长反应式自动换行。
 *
 * 交互：卡片可拖拽在两侧之间迁移；系数可点击编辑；点击卡片选中并进入分子构建器编辑。
 */
import { useMemo, useState } from 'react'
import type { AgentEntry, SchemeComponent } from '../types/reaction'
import { ARROW_SYMBOL } from '../types/reaction'
import { StaticMoleculeSvg } from '../render/StaticMoleculeSvg'
import { useReactionStore } from '../store/reactionStore'
import { molecularFormula } from '../engine/descriptors'
import { toSubscript } from '../lib/formulaText'

interface Props {
  /** 预测命中位点（按组分 id 分组），用于在卡片上高亮 */
  highlightByComponent?: Record<string, number[]>
  /** 双击卡片：进入分子构建器编辑该组分 */
  onEditComponent?(comp: SchemeComponent, side: 'reactants' | 'products'): void
  /** 当前选中的组分（用于右侧属性面板） */
  selectedComponentId?: string | null
  onSelectComponent?(id: string | null): void
  /** 导出时给根节点加 class，便于采集 SVG */
  rootClassName?: string
}

/** 单张组分卡片 */
function ComponentCard({
  comp,
  side,
  highlight,
  selected,
  onSelect,
  onEdit,
}: {
  comp: SchemeComponent
  side: 'reactants' | 'products'
  highlight: number[]
  selected: boolean
  onSelect(): void
  onEdit?(): void
}) {
  const setCoefficient = useReactionStore((s) => s.setCoefficient)
  const removeComponent = useReactionStore((s) => s.removeComponent)
  const moveComponent = useReactionStore((s) => s.moveComponent)
  const [editingCoeff, setEditingCoeff] = useState(false)

  return (
    <div
      className={`scheme-comp${selected ? ' selected' : ''}`}
      onClick={onSelect}
      onDoubleClick={onEdit}
      title="双击可进入分子构建器编辑该组分"
    >
      <button
        className="comp-coeff"
        title="计量系数：点击编辑，右键还原为 1"
        onClick={(e) => {
          e.stopPropagation()
          setEditingCoeff(true)
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          setCoefficient(side, comp.id, 1)
        }}
      >
        {editingCoeff ? (
          <input
            type="number"
            min={1}
            max={99}
            autoFocus
            defaultValue={comp.coefficient}
            onBlur={(e) => {
              setCoefficient(side, comp.id, Number(e.target.value))
              setEditingCoeff(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              if (e.key === 'Escape') setEditingCoeff(false)
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          comp.coefficient
        )}
      </button>
      <div className="comp-drawing">
        <StaticMoleculeSvg graph={comp.molecule} highlightAtomIds={highlight} />
      </div>
      <div className="comp-meta">
        <span className="comp-formula">{toSubscript(molecularFormula(comp.molecule))}</span>
        <span className="comp-actions">
          {side === 'reactants' ? (
            <button
              title="移到产物侧"
              onClick={(e) => {
                e.stopPropagation()
                moveComponent(side, comp.id, 'products')
              }}
            >
              ▶
            </button>
          ) : (
            <button
              title="移到反应物侧"
              onClick={(e) => {
                e.stopPropagation()
                moveComponent(side, comp.id, 'reactants')
              }}
            >
              ◀
            </button>
          )}
          <button
            className="danger"
            title="移除组分"
            onClick={(e) => {
              e.stopPropagation()
              removeComponent(side, comp.id)
            }}
          >
            ×
          </button>
        </span>
      </div>
    </div>
  )
}

/** 未配平角标 */
function BalanceBadge() {
  const conserved = useReactionStore((s) => s.conserved)
  const scheme = useReactionStore((s) => s.scheme)
  if (!scheme.reactants.length || !scheme.products.length) return null
  return (
    <span className={`balance-badge ${conserved ? 'ok' : 'bad'}`} title="按元素总量比较两侧，与系数无关">
      {conserved ? '元素守恒' : '未配平'}
    </span>
  )
}

export function SchemeCanvas({
  highlightByComponent = {},
  onEditComponent,
  selectedComponentId = null,
  onSelectComponent,
  rootClassName,
}: Props) {
  const scheme = useReactionStore((s) => s.scheme)
  const agents = scheme.agents
  const conditions = scheme.conditions
  const arrowText = useMemo(
    () => ({ above: scheme.aboveText, below: scheme.belowText }),
    [scheme.aboveText, scheme.belowText],
  )

  const hasContent = scheme.reactants.length || scheme.products.length || agents.length
  const condLine = [conditions.solvent, conditions.time, conditions.atmosphere].filter(Boolean).join(', ')

  return (
    <div className={`scheme-canvas ${rootClassName ?? ''}`}>
      <div className="scheme-toolbar">
        <BalanceBadge />
        <span className="scheme-hint">从左侧组入反应物/产物 · 双击卡片进入分子构建器编辑 · 点击系数可修改</span>
      </div>

      <div className="scheme-body">
        {!hasContent && (
          <div className="scheme-empty">
            反应式为空。请从左侧「组入组分」加入反应物与产物，或从「试剂与条件」插入试剂。
          </div>
        )}

        {hasContent && (
          <div className="scheme-row">
            {/* 反应物侧 */}
            <div className="scheme-side">
              {scheme.reactants.map((c, i) => (
                <span className="scheme-item" key={c.id}>
                  {i > 0 && <span className="scheme-plus">+</span>}
                  <ComponentCard
                    comp={c}
                    side="reactants"
                    highlight={highlightByComponent[c.id] ?? []}
                    selected={selectedComponentId === c.id}
                    onSelect={() => onSelectComponent?.(c.id)}
                    onEdit={() => onEditComponent?.(c, 'reactants')}
                  />
                </span>
              ))}
            </div>

            {/* 箭头与条件 */}
            <div className="scheme-arrow" title="箭头与条件可在右侧属性面板编辑">
              <div className="arrow-above">{arrowText.above || '\u00a0'}</div>
              <div className="arrow-line">
                <svg viewBox="0 0 120 24" preserveAspectRatio="none" aria-label="反应箭头">
                  <defs>
                    <marker id="arrow-head" markerWidth="9" markerHeight="9" refX="7" refY="4" orient="auto">
                      <path d="M0,0 L8,4 L0,8 Z" fill="currentColor" />
                    </marker>
                  </defs>
                  {scheme.arrow.kind === 'equilibrium' ? (
                    <>
                      <line x1="2" y1="10" x2="118" y2="10" stroke="currentColor" strokeWidth="1.8" markerEnd="url(#arrow-head)" />
                      <line x1="118" y1="16" x2="2" y2="16" stroke="currentColor" strokeWidth="1.8" markerEnd="url(#arrow-head)" />
                    </>
                  ) : scheme.arrow.kind === 'resonance' ? (
                    <>
                      <line x1="2" y1="12" x2="118" y2="12" stroke="currentColor" strokeWidth="1.8" markerEnd="url(#arrow-head)" />
                      <line x1="118" y1="18" x2="2" y2="18" stroke="currentColor" strokeWidth="1.8" markerEnd="url(#arrow-head)" />
                    </>
                  ) : (
                    <line x1="2" y1="12" x2="118" y2="12" stroke="currentColor" strokeWidth="1.8" markerEnd="url(#arrow-head)" />
                  )}
                </svg>
                <span className="arrow-symbol">{ARROW_SYMBOL[scheme.arrow.kind]}</span>
              </div>
              <div className="arrow-below">{arrowText.below || condLine || '\u00a0'}</div>
            </div>

            {/* 产物侧 */}
            <div className="scheme-side">
              {scheme.products.map((c, i) => (
                <span className="scheme-item" key={c.id}>
                  {i > 0 && <span className="scheme-plus">+</span>}
                  <ComponentCard
                    comp={c}
                    side="products"
                    highlight={highlightByComponent[c.id] ?? []}
                    selected={selectedComponentId === c.id}
                    onSelect={() => onSelectComponent?.(c.id)}
                    onEdit={() => onEditComponent?.(c, 'products')}
                  />
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 试剂列表（不进入配平，仅作条件展示） */}
        {agents.length > 0 && (
          <div className="scheme-agents">
            <span className="scheme-agents-title">试剂 / 催化剂</span>
            {agents.map((a) => (
              <AgentChip key={a.id} agent={a} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function AgentChip({ agent }: { agent: AgentEntry }) {
  const removeAgent = useReactionStore((s) => s.removeAgent)
  return (
    <span className="agent-chip" title={agent.reagentId ? `来自试剂库：${agent.reagentId}` : '自定义试剂'}>
      {agent.text}
      <button
        className="chip-x"
        title="移除"
        onClick={() => removeAgent(agent.id)}
      >
        ×
      </button>
    </span>
  )
}
