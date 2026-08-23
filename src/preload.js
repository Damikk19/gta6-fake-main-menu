const { contextBridge, ipcRenderer, webUtils } = require('electron')

contextBridge.exposeInMainWorld('gtavi', {
  openArtworkFolder: () => ipcRenderer.invoke('artwork:open'),
  artworkStatus: () => ipcRenderer.invoke('artwork:status'),
  framing: () => ipcRenderer.invoke('artwork:framing'),
  // File.path was removed from the renderer, so paths are resolved here.
  importDropped: (fileList, fallbackSlot) => {
    const paths = Array.from(fileList).map(f => webUtils.getPathForFile(f)).filter(Boolean)
    return ipcRenderer.invoke('artwork:import', paths, fallbackSlot)
  },
  // Screenshot tooling needs the menu, not the boot sequence.
  skipBoot: !!process.env.SHOT && !process.env.SHOT_BOOT
})
