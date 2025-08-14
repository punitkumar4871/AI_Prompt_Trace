chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const key = `sidebarOpen:${request.site || "default"}`;

  if (request.action === "saveSidebarState") {
    chrome.storage.local.set({ [key]: request.isOpen });
    return;
  }

  if (request.action === "getSidebarState") {
    (async () => {
      const result = await chrome.storage.local.get([key]);
      sendResponse({ sidebarOpen: result[key] });
    })();
    return true;
  }
});