import { app, BrowserWindow, shell } from 'electron'
import { fileURLToPath } from 'node:url'

import { desktopRootFromMain, repoRootFromMain } from './paths.mjs'
import { startDesktopServices, stopChildProcesses } from './services.mjs'

const devMode = process.env.CLAWQL_DESKTOP_DEV === '1' || !app.isPackaged
const mainUrl = import.meta.url

/** @type {BrowserWindow | null} */
let mainWindow = null

async function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: 'ClawQL',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    void shell.openExternal(target)
    return { action: 'deny' }
  })

  await mainWindow.loadURL(url)
}

app.whenReady().then(async () => {
  try {
    const repoRoot = repoRootFromMain(mainUrl)
    const { url } = await startDesktopServices({ devMode, repoRoot })
    await createWindow(url)
  } catch (err) {
    console.error('[clawql-desktop] failed to start:', err)
    app.exit(1)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && mainWindow) {
      void createWindow(mainWindow.webContents.getURL())
    }
  })
})

app.on('window-all-closed', () => {
  stopChildProcesses()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  stopChildProcesses()
})

process.on('SIGTERM', () => {
  stopChildProcesses()
  app.quit()
})
