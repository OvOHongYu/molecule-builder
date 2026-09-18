/**
 * 规则集总入口（反应模块设计方案 §8.13 批次划分）。
 *
 * 交付批次：
 *   R3a 单分子、单反应中心、无条件分流
 *   R3b 条件分流、电荷、多点位、跨分子
 *   R3c 定性结论（B 类）与聚合提示（C 类）
 */
import type { ReactionRule } from '../../types/rule'
import { HYDROCARBON_RULES } from './hydrocarbon'
import { FUNCTIONAL_RULES } from './functional'
import { BIO_RULES } from './bio'

export const ALL_RULES: ReactionRule[] = [...HYDROCARBON_RULES, ...FUNCTIONAL_RULES, ...BIO_RULES]

/** R3a：无条件分流、单反应中心的基础变换规则 */
const R3A_IDS = new Set([
  'R-ENE-01', 'R-ENE-02', 'R-ENE-03', 'R-ENE-04',
  'R-YNE-01', 'R-YNE-02', 'R-YNE-03', 'R-YNE-04', 'R-YNE-05',
  'R-ALC-01', 'R-ALC-05', 'R-ALC-06',
  'R-ALD-01', 'R-ALD-04', 'R-KET-01',
  'R-EST-01', 'R-EST-02', 'R-EST-FORM',
  'R-HAL-01',
  'R-FAT-01', 'R-FAT-02', 'R-FAT-03',
  'R-ARE-05',
  'R-SAC-01',
  'R-PRO-01',
])

/** R3c：B 类定性结论与 C 类聚合提示 */
const R3C_IDS = new Set(
  ALL_RULES.filter((r) => r.kind !== 'transform').map((r) => r.id),
)

export type Batch = 'R3a' | 'R3b' | 'R3c'

export function batchOf(rule: ReactionRule): Batch {
  if (R3C_IDS.has(rule.id)) return 'R3c'
  if (R3A_IDS.has(rule.id)) return 'R3a'
  return 'R3b'
}

export const RULES_BY_BATCH: Record<Batch, ReactionRule[]> = {
  R3a: ALL_RULES.filter((r) => batchOf(r) === 'R3a'),
  R3b: ALL_RULES.filter((r) => batchOf(r) === 'R3b'),
  R3c: ALL_RULES.filter((r) => batchOf(r) === 'R3c'),
}

/** 按 id 查规则 */
export function findRule(id: string): ReactionRule | undefined {
  return ALL_RULES.find((r) => r.id === id)
}

/** 规则集统计（供自检与文档核对） */
export function ruleStats(): {
  total: number
  byKind: Record<string, number>
  byCategory: Record<string, number>
  byBatch: Record<string, number>
} {
  const byKind: Record<string, number> = {}
  const byCategory: Record<string, number> = {}
  for (const r of ALL_RULES) {
    byKind[r.kind] = (byKind[r.kind] ?? 0) + 1
    byCategory[r.category] = (byCategory[r.category] ?? 0) + 1
  }
  return {
    total: ALL_RULES.length,
    byKind,
    byCategory,
    byBatch: {
      R3a: RULES_BY_BATCH.R3a.length,
      R3b: RULES_BY_BATCH.R3b.length,
      R3c: RULES_BY_BATCH.R3c.length,
    },
  }
}
