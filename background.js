chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "saveSidebarState") {
    const key = `sidebarOpen:${request.site || "default"}`;
    chrome.storage.local.set({ [key]: request.isOpen });
    return;
  }

  if (request.action === "getSidebarState") {
    (async () => {
      const key = `sidebarOpen:${request.site || "default"}`;
      const result = await chrome.storage.local.get([key]);
      sendResponse({ sidebarOpen: result[key] });
    })();
    return true;
  }
});
