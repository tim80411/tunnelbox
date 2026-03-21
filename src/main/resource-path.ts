import { app } from 'electron'
import path from 'node:path'

export function getResourcePath(...segments: string[]): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, ...segments)
  }
  return path.join(app.getAppPath(), 'resources', ...segments)
}
