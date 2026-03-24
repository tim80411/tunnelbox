import { useState, useEffect, useCallback } from 'react'
import type { ConfigField } from '../providers/registry'

interface ProviderConfigFormProps {
  fields: ConfigField[]
  config: Record<string, unknown> | null
  onSave: (config: Record<string, unknown>) => Promise<unknown>
  resetKey?: number
}

function ProviderConfigForm({ fields, config, onSave, resetKey }: ProviderConfigFormProps): React.ReactElement {
  const buildValues = useCallback(() => {
    const v: Record<string, string> = {}
    for (const f of fields) {
      const cfgVal = config?.[f.key]
      v[f.key] = cfgVal != null ? String(cfgVal) : (f.defaultValue != null ? String(f.defaultValue) : '')
    }
    return v
  }, [fields, config])

  const [values, setValues] = useState<Record<string, string>>(buildValues)
  const [errors, setErrors] = useState<Record<string, string | null>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    setValues(buildValues())
    setErrors({})
    setSaveError(null)
  }, [resetKey, config, buildValues])

  const handleChange = useCallback((key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => ({ ...prev, [key]: null }))
    setSaveError(null)
  }, [])

  const handleBlur = useCallback((field: ConfigField) => {
    if (field.validate) {
      const err = field.validate(values[field.key] ?? '')
      setErrors((prev) => ({ ...prev, [field.key]: err }))
    }
  }, [values])

  const handleSave = useCallback(async () => {
    // Validate all fields
    const newErrors: Record<string, string | null> = {}
    let hasError = false

    for (const f of fields) {
      const val = values[f.key] ?? ''
      if (f.required && !val.trim()) {
        newErrors[f.key] = '此欄位為必填'
        hasError = true
      } else if (f.validate) {
        const err = f.validate(val)
        if (err) {
          newErrors[f.key] = err
          hasError = true
        }
      }
    }

    if (hasError) {
      setErrors(newErrors)
      return
    }

    // Build payload — convert number fields to numbers
    const payload: Record<string, unknown> = {}
    for (const f of fields) {
      const val = values[f.key] ?? ''
      if (f.type === 'number') {
        payload[f.key] = Number(val)
      } else {
        payload[f.key] = val
      }
    }

    setSaving(true)
    setSaveError(null)
    try {
      await onSave(payload)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '儲存失敗')
    } finally {
      setSaving(false)
    }
  }, [fields, values, onSave])

  const hasRequired = fields.some((f) => f.required && !(values[f.key] ?? '').trim())

  return (
    <div className="settings-section">
      {saveError && <div className="modal-error" style={{ margin: 0 }}>{saveError}</div>}

      {fields.map((f) => (
        <div className="form-group" key={f.key} style={{ margin: 0 }}>
          <label className="form-label">
            {f.label}{f.required ? '' : '（選填）'}
          </label>
          <input
            className="form-input"
            type={f.type === 'password' ? 'password' : f.type === 'number' ? 'number' : 'text'}
            placeholder={f.placeholder}
            value={values[f.key] ?? ''}
            onChange={(e) => handleChange(f.key, e.target.value)}
            onBlur={() => handleBlur(f)}
          />
          {errors[f.key] && (
            <div className="modal-error" style={{ margin: 0, fontSize: '0.85em' }}>{errors[f.key]}</div>
          )}
        </div>
      ))}

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
        <button
          className="btn btn-sm btn-primary"
          onClick={handleSave}
          disabled={saving || hasRequired}
        >
          {saving ? '儲存中...' : '儲存'}
        </button>
        {saved && <span className="settings-frp-saved">已儲存</span>}
      </div>
    </div>
  )
}

export default ProviderConfigForm
