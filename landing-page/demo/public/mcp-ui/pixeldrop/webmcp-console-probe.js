/**
 * Paste into DevTools console on:
 *   https://clawql.com/mcp-ui/pixeldrop/pixeldrop-broken-demo.html
 * (or local http://127.0.0.1:8765/pixeldrop-broken-demo.html)
 *
 * Prerequisites:
 *   - Chrome 149+ (not 148)
 *   - chrome://flags/#enable-webmcp-testing → Enabled → full relaunch
 *   - Hard-refresh the page after deploy of document-first registration
 *
 * This is the judge-environment gate: discovery + execute + return shape.
 */
;(async () => {
  const out = {
    chromeHint: navigator.userAgent,
    documentMC: !!document.modelContext,
    navigatorMC: !!navigator.modelContext,
    sameRef: document.modelContext === navigator.modelContext,
    tools: /** @type {string[]|null} */ (null),
    executeRaw: /** @type {unknown} */ (null),
    executeRawType: /** @type {string|null} */ (null),
    executeParsed: /** @type {unknown} */ (null),
    galleryGrew: /** @type {boolean|null} */ (null),
    error: /** @type {string|null} */ (null),
  }

  try {
    const mc = document.modelContext ?? navigator.modelContext
    if (!mc?.getTools || !mc?.executeTool) {
      throw new Error('modelContext missing getTools/executeTool — flag off or Chrome < 149?')
    }

    const tools = await mc.getTools()
    out.tools = tools.map((t) => t.name)
    const tool = tools.find((t) => t.name === 'upload_photo')
    if (!tool) {
      throw new Error(
        'upload_photo not in getTools(): [' + out.tools.join(', ') + '] — registration failed or wrong API surface'
      )
    }

    // 1×1 red JPEG (base64 payload only)
    const tiny =
      '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJ/4AD//2Q=='

    const before = document.querySelectorAll('#gallery img').length

    // Chrome Imperative API: second arg is a JSON *string*
    const raw = await mc.executeTool(
      tool,
      JSON.stringify({
        file: tiny,
        filename: 'probe.jpg',
        caption: 'webmcp-console-probe',
      })
    )
    out.executeRaw = raw
    out.executeRawType = typeof raw
    try {
      out.executeParsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    } catch {
      out.executeParsed = { unparsed: raw }
    }

    out.galleryGrew = document.querySelectorAll('#gallery img').length > before
  } catch (e) {
    out.error = e instanceof Error ? e.message : String(e)
  }

  console.log('[PixelDrop WebMCP probe]', out)
  return out
})()
