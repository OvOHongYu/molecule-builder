interface Props {
  checked: boolean
  onChange(): void
  label: string
}

export function ToggleSwitch({ checked, onChange, label }: Props) {
  return (
    <label className="toggle-row">
      <span className="toggle-track" aria-hidden="true">
        <span className={`toggle-thumb ${checked ? 'on' : ''}`} />
      </span>
      <span className="toggle-label">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="toggle-input"
        aria-label={label}
      />
    </label>
  )
}