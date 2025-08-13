chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "saveSidebarState") {
    chrome.storage.local.set({ sidebarOpen: request.isOpen });
    return; 
  }

  if (request.action === "getSidebarState") {
    (async () => {
      const result = await chrome.storage.local.get(['sidebarOpen']);
      sendResponse({ sidebarOpen: result.sidebarOpen });
    })();
    return true;
  }
});