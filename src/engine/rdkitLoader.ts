/**
 * RDKit wasm 单例异步加载器。
 * 通过 <script> 注入加载（RDKit_minimal.js 定义全局 initRDKitModule），
 * locateFile 指向 /rdkit/ 下的 .wasm（见 scripts/copy-rdkit.mjs）。
 * 设置初始化超时（10s），失败降级到自研引擎，且不阻塞命名管线。
 */
type RDKitModule = any

export type RdkitStatus = 'idle' | 'loading' | 'ready' | 'failed'

let module: RDKitModule | null = null
let loading: Promise<RDKitModule | null> | null = null
let status: RdkitStatus = 'idle'
const listeners = new Set<(s: RdkitStatus) => void>()

function setStatus(s: RdkitStatus): void {
  status = s
  listeners.forEach((l) => l(s))
}

export function getRdkitStatus(): RdkitStatus {
  return status
}

export function onRdkitStatus(cb: (s: RdkitStatus) => void): () => void {
  listeners.add(cb)
  cb(status)
  return () => {
    listeners.delete(cb)
  }
}

const INIT_TIMEOUT = 10000

export function initRdkit(): Promise<RDKitModule | null> {
  if (module) {
    return Promise.resolve(module)
  }
  if (loading) return loading
  loading = new Promise<RDKitModule | null>((resolve) => {
    setStatus('loading')
    let settled = false
    const finish = (m: RDKitModule | null, st: RdkitStatus): void => {
      if (settled) return
      settled = true
      module = m
      setStatus(st)
      resolve(m)
    }
    const timer = setTimeout(() => {
      finish(null, 'failed')
    }, INIT_TIMEOUT)

    const existing = document.querySelector('script[data-rdkit]') as HTMLScriptElement | null
    if (existing) {
      // 已注入则复用（等待其加载完成）
      resolveModuleAfterLoad(existing, finish)
      return
    }
    const s = document.createElement('script')
    s.src = '/rdkit/RDKit_minimal.js'
    s.dataset.rdkit = '1'
    s.async = true
    s.onload = () => {
      const init = (window as unknown as Record<string, any>).initRDKitModule
      if (typeof init === 'function') {
        init({ locateFile: (f: string) => `/rdkit/${f}` })
          .then((mod: RDKitModule) => finish(mod, 'ready'))
          .catch(() => finish(null, 'failed'))
      } else {
        finish(null, 'failed')
      }
    }
    s.onerror = () => finish(null, 'failed')
    document.head.appendChild(s)
    void timer
  })
  return loading
}

function resolveModuleAfterLoad(
  s: HTMLScriptElement,
  finish: (m: RDKitModule | null, st: RdkitStatus) => void,
): void {
  const init = (window as unknown as Record<string, any>).initRDKitModule
  if (typeof init === 'function') {
    init({ locateFile: (f: string) => `/rdkit/${f}` })
      .then((mod: RDKitModule) => finish(mod, 'ready'))
      .catch(() => finish(null, 'failed'))
    return
  }
  s.addEventListener(
    'load',
    () => {
      const init2 = (window as unknown as Record<string, any>).initRDKitModule
      if (typeof init2 === 'function') {
        init2({ locateFile: (f: string) => `/rdkit/${f}` })
          .then((mod: RDKitModule) => finish(mod, 'ready'))
          .catch(() => finish(null, 'failed'))
      } else finish(null, 'failed')
    },
    { once: true },
  )
}

export function rdkitReady(): boolean {
  return module !== null
}