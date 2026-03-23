import { useState } from 'react'

interface Tab {
  key: string
  label: string
  content: React.ReactNode
}

interface ProviderTabsProps {
  tabs: Tab[]
  defaultTab?: string
}

function ProviderTabs({ tabs, defaultTab }: ProviderTabsProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState(defaultTab ?? tabs[0]?.key ?? '')

  const activeContent = tabs.find((t) => t.key === activeTab)?.content ?? null

  return (
    <div className="provider-tabs">
      <div className="provider-tab-list">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`provider-tab-btn${activeTab === tab.key ? ' provider-tab-btn--active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="provider-tab-content">
        {activeContent}
      </div>
    </div>
  )
}

export default ProviderTabs
