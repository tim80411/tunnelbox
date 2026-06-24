import Store from 'electron-store'
import { createLogger } from './logger'
import { DEFAULT_SETTINGS } from '../shared/types'
import type { AppSettings } from '../shared/types'

const log = createLogger('SettingsStore')

const store = new Store<AppSettings>({
  name: 'tunnelbox-settings',
  defaults: { ...DEFAULT_SETTINGS }
})

export function getSettings(): AppSettings {
  try {
    return {
      autoStartServers: store.get('autoStartServers'),
      defaultServeMode: store.get('defaultServeMode'),
      visitorNotifications: store.get('visitorNotifications') ?? DEFAULT_SETTINGS.visitorNotifications,
      remoteConsoleEnabled: store.get('remoteConsoleEnabled') ?? DEFAULT_SETTINGS.remoteConsoleEnabled,
      requestLogMaxEntries: store.get('requestLogMaxEntries') ?? DEFAULT_SETTINGS.requestLogMaxEntries,
      launchAtStartup: store.get('launchAtStartup') ?? DEFAULT_SETTINGS.launchAtStartup,
      dismissedRenewBannerVersion:
        store.get('dismissedRenewBannerVersion') ?? DEFAULT_SETTINGS.dismissedRenewBannerVersion,
      confirmedSensitivePorts:
        store.get('confirmedSensitivePorts') ?? DEFAULT_SETTINGS.confirmedSensitivePorts
    }
  } catch (err) {
    log.error(' Failed to read settings, returning defaults:', err)
    return { ...DEFAULT_SETTINGS }
  }
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  try {
    if (patch.autoStartServers !== undefined) {
      store.set('autoStartServers', patch.autoStartServers)
    }
    if (patch.defaultServeMode !== undefined) {
      store.set('defaultServeMode', patch.defaultServeMode)
    }
    if (patch.visitorNotifications !== undefined) {
      store.set('visitorNotifications', patch.visitorNotifications)
    }
    if (patch.remoteConsoleEnabled !== undefined) {
      store.set('remoteConsoleEnabled', patch.remoteConsoleEnabled)
    }
    if (patch.requestLogMaxEntries !== undefined) {
      store.set('requestLogMaxEntries', patch.requestLogMaxEntries)
    }
    if (patch.launchAtStartup !== undefined) {
      store.set('launchAtStartup', patch.launchAtStartup)
    }
    if (patch.dismissedRenewBannerVersion !== undefined) {
      store.set('dismissedRenewBannerVersion', patch.dismissedRenewBannerVersion)
    }
    if (patch.confirmedSensitivePorts !== undefined) {
      store.set('confirmedSensitivePorts', patch.confirmedSensitivePorts)
    }
    return getSettings()
  } catch (err) {
    log.error(' Failed to update settings:', err)
    return getSettings()
  }
}
