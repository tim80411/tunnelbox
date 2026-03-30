import { useState, useCallback } from 'react'

interface TagEditorProps {
  siteId: string
  tags: string[]
}

function TagEditor({ siteId, tags }: TagEditorProps): React.ReactElement {
  const [newTag, setNewTag] = useState('')

  const handleAdd = useCallback(async () => {
    const trimmed = newTag.trim()
    if (!trimmed) return
    if (tags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
      setNewTag('')
      return
    }
    await window.electron.updateSiteTags(siteId, [...tags, trimmed])
    setNewTag('')
  }, [siteId, tags, newTag])

  const handleRemove = useCallback(async (tag: string) => {
    await window.electron.updateSiteTags(siteId, tags.filter((t) => t !== tag))
  }, [siteId, tags])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAdd()
    }
  }, [handleAdd])

  return (
    <div className="tag-editor">
      <div className="tag-list">
        {tags.map((tag) => (
          <span key={tag} className="tag-chip">
            {tag}
            <button className="tag-remove" onClick={() => handleRemove(tag)}>x</button>
          </span>
        ))}
      </div>
      <div className="tag-input-row">
        <input
          className="tag-input"
          placeholder="Add tag..."
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button className="btn btn-sm" onClick={handleAdd} disabled={!newTag.trim()}>
          Add
        </button>
      </div>
    </div>
  )
}

export default TagEditor
