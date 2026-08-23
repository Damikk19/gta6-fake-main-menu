const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('gtavi', {
  openArtworkFolder: () => ipcRenderer.invoke('artwork:open'),
  artworkStatus: () => ipcRenderer.invoke('artwork:status')
})
