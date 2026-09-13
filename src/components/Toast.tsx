import { useMoleculeStore } from '../store/moleculeStore'

export function Toast() {
  const toast = useMoleculeStore((s) => s.toast)
  const dismiss = useMoleculeStore((s) => s.dismissToast)
  if (!toast) return null
  return (
    <div className={`toast ${toast.type}`} role="status" onClick={dismiss}>
      {toast.message}
    </div>
  )
}