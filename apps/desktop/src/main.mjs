import { app, BrowserWindow, shell } from 'electron'

import {
  deepLinkUrlsFromArgv,
  parseApprovalDeepLink,
  reviewUrlForDesktop,
} from './deeplink.mjs'
import { DASHBOARD_PORT, repoRootFromMain } from './paths.mjs'
import { startDesktopServices, stopChildProcesses } from './services.mjs'

const devMode = process.env.CLAWQL_DESKTOP_DEV === '1' || !app.isPackaged
const mainUrl = import.meta.url

/** @type {BrowserWindow | null} */
let mainWindow = null
/** @type {string | null} */
let pendingReviewId = null
let servicesUrl = `http://127.0.0.1:${DASHBOARD_PORT}`

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

function captureDeepLink(url) {
  const id = parseApprovalDeepLink(url)
  if (id) pendingReviewId = id
  return id
}

for (const url of deepLinkUrlsFromArgv(process.argv)) {
  captureDeepLink(url)
}

async function navigateToPendingReview() {
  if (!mainWindow || !pendingReviewId) return
  const target = reviewUrlForDesktop(pendingReviewId, { port: DASHBOARD_PORT })
  pendingReviewId = null
  await mainWindow.loadURL(target)
}

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
  await navigateToPendingReview()
}

if (gotLock) {
  app.on('second-instance', (_event, argv) => {
    for (const url of deepLinkUrlsFromArgv(argv)) {
      captureDeepLink(url)
    }
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
      void navigateToPendingReview()
    }
  })

  app.on('open-url', (event, url) => {
    event.preventDefault()
    captureDeepLink(url)
    void navigateToPendingReview()
  })

  // Register protocol for packaged + local-dev (no store signup required).
  if (process.defaultApp) {
    const entry = process.argv[1]
    if (entry) {
      app.setAsDefaultProtocolClient('clawql', process.execPath, [entry])
    }
  } else {
    app.setAsDefaultProtocolClient('clawql')
  }

  app.whenReady().then(async () => {
    try {
      const repoRoot = repoRootFromMain(mainUrl)
      const started = await startDesktopServices({ devMode, repoRoot })
      servicesUrl = started.url
      await createWindow(servicesUrl)
    } catch (err) {
      console.error('[clawql-desktop] failed to start:', err)
      app.exit(1)
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        void createWindow(servicesUrl)
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
}
