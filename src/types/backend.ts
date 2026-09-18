/**
 * 外部预测后端类型（反应模块设计方案 §7.7）。
 *
 * 设计约束：外部兜底**默认关闭**，需用户在设置中显式启用并自备凭据；
 * 启用时明确提示「结构将被发送至第三方」。未启用时该代码路径不可见。
 */
import type { MoleculeGraph } from './molecule'
import type { ReactionConditions } from './reaction'
import type { Candidate } from '../engine/reactionPredict'

export interface PredictionInput {
  reactants: MoleculeGraph[]
  agents: string[]
  conditions: ReactionConditions
}

export interface PredictionBackend {
  id: string
  name: string
  /** 是否具备可用条件（凭据已配置且网络可用） */
  available(): Promise<boolean>
  predict(input: PredictionInput): Promise<Candidate[]>
}
