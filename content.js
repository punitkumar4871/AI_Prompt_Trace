console.log("Prompt Navigator content script loaded with date-only display.");

// ---------- Site Detection ----------
const Site = Object.freeze({
  GEMINI: "gemini",
  CHATGPT: "chatgpt",
  GROK: "grok",
  UNKNOWN: "unknown",
});

function detectSite() {
  const h = location.hostname;
  if (h.includes("gemini.google.com")) return Site.GEMINI;
  if (h.includes("chat.openai.com") || h.includes("chatgpt.com")) return Site.CHATGPT;
  if (h.includes("grok.com") || h.includes("x.ai")) return Site.GROK;
  return Site.UNKNOWN;
}

const ACTIVE_SITE = detectSite();
document.body.dataset.site = ACTIVE_SITE;

let sidebar, toggleButton, observer, debounceTimer, modal;
let promptDates = {}; 

// ---------- Utils ----------
function debounce(func, delay) {
  return function (...args) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => func.apply(this, args), delay);
  };
}
function formatDate(ts) {
  if (!ts) return "";
  const date = new Date(ts);
  return date.toLocaleDateString(); 
}

function createSidebar() {
  if (document.getElementById("gemini-prompt-nav-sidebar")) return;

  sidebar = document.createElement("div");
  sidebar.id = "gemini-prompt-nav-sidebar";
  sidebar.innerHTML = `
    <div id="sidebar-header">
      <h2>${ACTIVE_SITE === Site.GEMINI ? "Gemini" : (ACTIVE_SITE === Site.CHATGPT?"ChatGPT":"Grok")} Prompt History</h2>
    </div>
    <ul id="prompt-list"></ul>
  `;
  document.body.appendChild(sidebar);

  modal = document.createElement("div");
  modal.id = "gemini-image-modal";
  modal.style.display = "none";
  modal.innerHTML = `<span id="modal-close-button">&times;</span><img id="modal-image-content">`;
  document.body.appendChild(modal);
  document.getElementById("modal-close-button").addEventListener("click", () => (modal.style.display = "none"));
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.style.display = "none";
  });

  toggleButton = document.createElement("button");
  toggleButton.id = "gemini-prompt-nav-toggle";
  toggleButton.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>`;
  document.body.appendChild(toggleButton);
  toggleButton.addEventListener("click", toggleSidebar);

  chrome.runtime.sendMessage({ action: "getSidebarState", site: ACTIVE_SITE }, (response) => {
    if (chrome.runtime.lastError) {
      closeSidebar();
      return;
    }
    if (response && response.sidebarOpen) openSidebar();
    else closeSidebar();
  });
}

function toggleSidebar() {
  if (!sidebar) return;
  const isOpening = !sidebar.classList.contains("open");
  if (isOpening) openSidebar();
  else closeSidebar();
  chrome.runtime.sendMessage({ action: "saveSidebarState", isOpen: isOpening, site: ACTIVE_SITE });
}

function openSidebar() {
  if (!sidebar || !toggleButton) return;
  sidebar.classList.add("open");
  document.body.classList.add("sidebar-open");
  toggleButton.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>`;
}
function closeSidebar() {
  if (!sidebar || !toggleButton) return;
  sidebar.classList.remove("open");
  document.body.classList.remove("sidebar-open");
  toggleButton.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>`;
}

function getPromptElements() {
  if (ACTIVE_SITE === Site.GEMINI) {
    return document.querySelectorAll("user-query");
  }
  if (ACTIVE_SITE === Site.CHATGPT) {
    const selectors = [
      '[data-testid="conversation-turn-user"]',
      '[data-message-author-role="user"]',
      'div[role="presentation"] div[data-message-author-role="user"]'
    ];
    const list = [];
    selectors.forEach((sel) => document.querySelectorAll(sel).forEach((el) => list.push(el)));
    return [...new Set(list)];
  }
  return [];
}

function extractPromptText(promptEl) {
  if (ACTIVE_SITE === Site.GEMINI) {
    const queryTextEl = promptEl.querySelector(".query-content");
    return queryTextEl ? (queryTextEl.textContent || "").trim() : "";
  }
  if (ACTIVE_SITE === Site.CHATGPT) {
    const preferred =
      promptEl.querySelector('.text-base, [data-testid="markdown"], .whitespace-pre-wrap') || promptEl;
    return (preferred.innerText || preferred.textContent || "").trim();
  }
  return "";
}

function findPromptImage(promptEl) {
  if (ACTIVE_SITE === Site.GEMINI) {
    return promptEl.querySelector("img:not(.profile-photo):not(.avatar)");
  }
  if (ACTIVE_SITE === Site.CHATGPT) {
    const candidates = promptEl.querySelectorAll("img");
    for (const img of candidates) {
      const w = img.naturalWidth || img.width || 0;
      const h = img.naturalHeight || img.height || 0;
      const isLikelyAvatar =
        img.classList.contains("rounded-full") ||
        img.classList.contains("h-6") ||
        (w && h && Math.max(w, h) <= 40);
      if (!isLikelyAvatar) return img;
    }
  }
  return null;
}

function updatePrompts() {
  const promptList = document.getElementById("prompt-list");
  if (!promptList) return;
  promptList.innerHTML = "";

  const promptElements = getPromptElements();
  promptElements.forEach((promptEl) => {
    const promptText = extractPromptText(promptEl);
    const imageEl = findPromptImage(promptEl);

    if (!promptText && !imageEl) return;

    const pid = promptText || imageEl?.src || Math.random();
    if (!promptDates[pid]) {
      promptDates[pid] = Date.now();
    }

    const listItem = document.createElement("li");
    listItem.title = promptText || "Image Prompt";

    const itemContent = document.createElement("div");
    itemContent.className = "prompt-item-content";

    const dateSpan = document.createElement("span");
    dateSpan.className = "prompt-date"; 
    dateSpan.textContent = formatDate(promptDates[pid]);
    itemContent.appendChild(dateSpan);

    const textSpan = document.createElement("span");
    textSpan.className = "prompt-text";
    textSpan.textContent = promptText
      ? promptText.length > 80
        ? promptText.substring(0, 80) + "…"
        : promptText
      : "Image Upload";
    itemContent.appendChild(textSpan);

    listItem.appendChild(itemContent);

    if (imageEl) {
    const imageIndicator = document.createElement("span");
    imageIndicator.className = "image-indicator";
    imageIndicator.title = "Click to view image";
    const iconUrl = chrome.runtime.getURL('icons/image.png'); 
    imageIndicator.innerHTML = `<img src="${iconUrl}" alt="Image Attached" height="50" width="50">`;    
    listItem.prepend(imageIndicator);
    imageIndicator.addEventListener("click", (e) => {
        e.stopPropagation();
        console.log("Image icon clicked!");
        const modal = document.getElementById("gemini-image-modal");
        const modalImg = document.getElementById("modal-image-content");
        console.log("Found modal:", modal);
        console.log("Found modal image tag:", modalImg);
        console.log("Source image element:", imageEl);
        if (modalImg && modal && imageEl) {
            console.log("Attempting to open image with src:", imageEl.src);
            modalImg.src = imageEl.src;
            modal.style.display = "flex";
            console.log("Modal display style set to 'flex'.");
        } else {
            console.error("Could not open image preview. One of the required elements was not found.");
        }
    });
}

    listItem.addEventListener("click", () => {
      promptEl.scrollIntoView({ behavior: "smooth", block: "center" });
      promptEl.classList.add("highlight");
      setTimeout(() => promptEl.classList.remove("highlight"), 2000);
    });

    promptList.appendChild(listItem);
  });
}

const debouncedUpdatePrompts = debounce(updatePrompts, 250);

function pickObserverTarget() {
  if (ACTIVE_SITE === Site.GEMINI) {
    return document.querySelector("main") || document.body;
  }
  if (ACTIVE_SITE === Site.CHATGPT) {
    return document.querySelector("#__next") || document.querySelector("main") || document.body;
  }
  return document.body;
}

function initializeExtension() {
  if (document.getElementById("gemini-prompt-nav-sidebar")) return;
  createSidebar();

  let targetNode = pickObserverTarget();
  if (!targetNode) {
    window.addEventListener("DOMContentLoaded", () => {
      initializeExtension();
      debouncedUpdatePrompts();
    }, { once: true });
    return;
  }

  debouncedUpdatePrompts();
  observer = new MutationObserver(() => debouncedUpdatePrompts());
  observer.observe(targetNode, { childList: true, subtree: true });

  setInterval(debouncedUpdatePrompts, 1500);
}

initializeExtension();
