import { useState, useCallback } from 'react'

interface TagEditorProps {
  siteId: string
  tags: string[]
}

function TagEditor({ siteId, tags }: TagEditorProps): React.ReactElement {
  const [adding, setAdding] = useState(false)
  const [newTag, setNewTag] = useState('')

  // Commit the pending tag. Clears the input but stays in "adding" mode so the
  // user can type several in a row (Enter); blur/Escape exits the mode.
  const commit = useCallback(async () => {
    const trimmed = newTag.trim()
    setNewTag('')
    if (!trimmed) return
    if (tags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) return
    await window.electron.updateSiteTags(siteId, [...tags, trimmed])
  }, [siteId, tags, newTag])

  const handleRemove = useCallback(async (tag: string) => {
    await window.electron.updateSiteTags(siteId, tags.filter((t) => t !== tag))
  }, [siteId, tags])

  return (
    <div className="tag-editor">
      <div className="tag-list">
        {tags.map((tag) => (
          <span key={tag} className="tag-chip">
            {tag}
            <button className="tag-remove" onClick={() => handleRemove(tag)} aria-label={`移除標籤 ${tag}`}>×</button>
          </span>
        ))}
        {adding ? (
          <input
            className="tag-input"
            placeholder="標籤名稱…"
            value={newTag}
            autoFocus
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commit()
              } else if (e.key === 'Escape') {
                setNewTag('')
                setAdding(false)
              }
            }}
            onBlur={() => { commit(); setAdding(false) }}
          />
        ) : (
          <button className="tag-chip add" onClick={() => setAdding(true)}>+ 標籤</button>
        )}
      </div>
    </div>
  )
}

export default TagEditor
