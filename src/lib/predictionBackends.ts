/**
 * 外部预测后端（反应模块设计方案 §7.7、§11 R5）。
 *
 * 重要：默认**关闭**。启用需用户在设置中显式打开、填入服务地址与密钥，
 * 且界面会明确提示「反应物结构将被发送至第三方」。
 *
 * 为什么做成「用户自备地址」而非硬编码某家服务：
 * 免费且稳定的公开反应预测接口并不存在（IBM RXN 需申请 Key、ASKCOS 需自托管），
 * 硬编码某个具体服务的请求格式会随对方接口变动而失效，也会把未经验证的调用约定写死。
 * 因此这里实现一个**通用的 JSON 预测服务适配器**，调用约定由使用方按文档自行对接。
 */
import type { PredictionBackend, PredictionInput } from '../types/backend'
import type { Candidate } from '../engine/reactionPredict'
import type { MoleculeGraph } from '../types/molecule'
import { loadJSON, saveJSON } from './localStore'
import { molecularFormula } from '../engine/descriptors'
import { toFallbackSmiles } from '../engine/serialize'

const LS_KEY = 'molecule-reaction-ext-backend-v1'

export interface ExternalBackendSettings {
  enabled: boolean
  /** 服务地址（POST JSON） */
  endpoint: string
  /** 访问密钥（存于本地，仅随请求头发送） */
  apiKey: string
  /** 自定义请求头名，默认 Authorization */
  authHeader: string
}

export const DEFAULT_EXT_SETTINGS: ExternalBackendSettings = {
  enabled: false,
  endpoint: '',
  apiKey: '',
  authHeader: 'Authorization',
}

export function loadExtSettings(): ExternalBackendSettings {
  return { ...DEFAULT_EXT_SETTINGS, ...loadJSON<Partial<ExternalBackendSettings>>(LS_KEY, {}) }
}

export function saveExtSettings(s: ExternalBackendSettings): void {
  saveJSON(LS_KEY, s)
}

/** 请求体：反应物 SMILES + 试剂 + 条件，均为通用字段 */
export interface ExternalRequestBody {
  reactants: string[]
  agents: string[]
  conditions: Record<string, string | undefined>
}

/** 响应体：期望 `{ products: [{ smiles: string[], name?: string }] }` */
interface ExternalResponse {
  products?: Array<{ smiles?: string[]; name?: string; confidence?: number }>
  error?: string
}

/**
 * 通用 HTTP JSON 预测后端。
 * 请求：POST endpoint，JSON 体见 ExternalRequestBody；密钥放在 authHeader 指定的头上。
 * 响应：`{ products: [{ smiles: ["..."], name?: "..." }] }`
 */
export class HttpJsonPredictionBackend implements PredictionBackend {
  readonly id = 'http-json'
  readonly name: string

  constructor(private readonly settings: ExternalBackendSettings) {
    let host = settings.endpoint
    try {
      host = new URL(settings.endpoint).host
    } catch {
      /* 保持原文 */
    }
    this.name = host ? `外部服务（${host}）` : '外部服务'
  }

  async available(): Promise<boolean> {
    if (!this.settings.enabled || !this.settings.endpoint.trim()) return false
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false
    return true
  }

  async predict(input: PredictionInput): Promise<Candidate[]> {
    const body: ExternalRequestBody = {
      reactants: input.reactants.map((g) => toFallbackSmiles(g)),
      agents: input.agents,
      conditions: {
        temperature: input.conditions.temperature,
        solvent: input.conditions.solvent,
        time: input.conditions.time,
        atmosphere: input.conditions.atmosphere,
        catalyst: input.conditions.catalyst,
      },
    }
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this.settings.apiKey.trim()) {
      headers[this.settings.authHeader || 'Authorization'] = this.settings.apiKey.trim()
    }
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 15000)
    try {
      const res = await fetch(this.settings.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: ctrl.signal,
      })
      if (!res.ok) return []
      const json = (await res.json()) as ExternalResponse
      if (!Array.isArray(json.products)) return []
      // 外部返回的是 SMILES：需要转成分子图才能进入画布。
      // 转换依赖 RDKit，故此处只做结构占位，由调用方在 RDKit 可用时填充。
      return json.products
        .filter((p) => p.smiles?.length)
        .map((p, i) => ({
          id: `ext-${i}`,
          kind: 'transform' as const,
          ruleId: 'external',
          ruleName: p.name || '外部服务候选',
          category: 'other',
          products: [],
          hitAtoms: [],
          why: ['来自外部服务，未经本地化学校验', ...(p.smiles ?? []).map((s) => `产物 SMILES：${s}`)],
          tempOk: true,
          priorityScore: 0,
          externalSmiles: p.smiles,
        })) as Candidate[]
    } catch {
      return []
    } finally {
      clearTimeout(timer)
    }
  }
}

/** 取得当前已启用的外部后端；未启用或未配置时返回 null（该路径完全不可见） */
export async function getEnabledExternalBackend(): Promise<PredictionBackend | null> {
  const s = loadExtSettings()
  if (!s.enabled || !s.endpoint.trim()) return null
  const b = new HttpJsonPredictionBackend(s)
  return (await b.available()) ? b : null
}

/** 供 UI 展示：当前配置下的后端名称（未启用返回 null） */
export function describeExtBackend(): string | null {
  const s = loadExtSettings()
  if (!s.enabled || !s.endpoint.trim()) return null
  return new HttpJsonPredictionBackend(s).name
}

/** 供测试/展示：分子式列表（不依赖 RDKit） */
export function formulasOf(graphs: MoleculeGraph[]): string[] {
  return graphs.map((g) => molecularFormula(g))
}
