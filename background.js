
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "saveSidebarState") {
    chrome.storage.local.set({ sidebarOpen: request.isOpen });
    return true;
  }

  if (request.action === "getSidebarState") {
    chrome.storage.local.get(['sidebarOpen'], (result) => {
      sendResponse({ sidebarOpen: result.sidebarOpen });
    });
    return true;
  }
});