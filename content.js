console.log("Prompt Navigator All-in-One loaded.");

const Site = Object.freeze({
  GEMINI: "gemini",
  CHATGPT: "chatgpt",
  GROK: "grok",
  CLAUDE: "claude",
  UNKNOWN: "unknown",
});

function detectSite() {
  const h = location.hostname;
  if (h.includes("gemini.google.com")) return Site.GEMINI;
  if (h.includes("chat.openai.com") || h.includes("chatgpt.com")) return Site.CHATGPT;
  if (h.includes("grok.com")) return Site.GROK;
  if (h.includes("claude.ai")) return Site.CLAUDE;
  return Site.UNKNOWN;
}

const ACTIVE_SITE = detectSite();
let sidebar, toggleButton, observer, debounceTimer, modal;
let promptDates = {};

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
  if (document.getElementById("prompt-navigator-sidebar")) return;

  sidebar = document.createElement("div");
  sidebar.id = "prompt-navigator-sidebar";
  sidebar.innerHTML = `
    <div id="sidebar-header">
      <h2>${ACTIVE_SITE.charAt(0).toUpperCase() + ACTIVE_SITE.slice(1)} Prompt History</h2>
    </div>
    <ul id="prompt-list"></ul>
  `;
  document.body.appendChild(sidebar);

  modal = document.createElement("div");
  modal.id = "prompt-navigator-image-modal";
  modal.style.display = "none";
  modal.innerHTML = `<span id="modal-close-button">&times;</span><img id="modal-image-content">`;
  document.body.appendChild(modal);
  document.getElementById("modal-close-button").addEventListener("click", () => (modal.style.display = "none"));
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.style.display = "none";
  });

  toggleButton = document.createElement("button");
  toggleButton.id = "prompt-navigator-toggle";
  toggleButton.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>`;
  document.body.appendChild(toggleButton);
  toggleButton.addEventListener("click", toggleSidebar);

  try {
    chrome.runtime.sendMessage({ action: "getSidebarState", site: ACTIVE_SITE }, (response) => {
      if (chrome.runtime.lastError) {
        closeSidebar(); return;
      }
      if (response && response.sidebarOpen) openSidebar();
      else closeSidebar();
    });
  } catch(e) { console.warn("Prompt Navigator: Could not get sidebar state on initial load.", e); }
}

function toggleSidebar() {
  if (!sidebar) return;
  const isOpening = !sidebar.classList.contains("open");
  if (isOpening) openSidebar();
  else closeSidebar();
  
  try {
    if (chrome.runtime?.id) {
      chrome.runtime.sendMessage({ action: "saveSidebarState", isOpen: isOpening, site: ACTIVE_SITE });
    }
  } catch (error) {
    console.warn(`Prompt Navigator: Safely caught an error during toggle: ${error.message}`);
  }
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

// ---------- Site-Specific Logic ----------
function getPromptElements() {
  switch (ACTIVE_SITE) {
    case Site.GEMINI: return document.querySelectorAll("user-query");
    case Site.CHATGPT: return document.querySelectorAll('[data-message-author-role="user"]');
    case Site.GROK: return document.querySelectorAll('[class*="message-bubble"], .group\\/chip');
    case Site.CLAUDE: return document.querySelectorAll('div[data-testid="user-message"]');
    default: return [];
  }
}

function extractPromptText(promptEl) {
  switch (ACTIVE_SITE) {
    case Site.GEMINI: return (promptEl.querySelector(".query-content")?.textContent || "").trim();
    case Site.CHATGPT: return (promptEl.querySelector('.whitespace-pre-wrap')?.textContent || "").trim();
    case Site.GROK: return (promptEl.querySelector("span.whitespace-pre-wrap")?.textContent || "").trim();
    case Site.CLAUDE: return (promptEl.querySelector('p.whitespace-pre-wrap')?.textContent || "").trim();
    default: return "";
  }
}

function findPromptImage(promptEl) {
  switch (ACTIVE_SITE) {
    case Site.GEMINI: return promptEl.querySelector("img:not(.profile-photo):not(.avatar)");
    case Site.CHATGPT:
    case Site.GROK: return promptEl.querySelector("img");
    case Site.CLAUDE: {
        const textBubble = promptEl.closest('.group.relative');
        const imageContainer = textBubble?.previousElementSibling;
        return imageContainer?.querySelector('img[src^="/api/"]');
    }
    default: return null;
  }
}

function updatePrompts() {
  const promptList = document.getElementById("prompt-list");
  if (!promptList) return;

  promptList.innerHTML = ''; 
  const allElements = Array.from(getPromptElements());

  for (let i = 0; i < allElements.length; i++) {
    const promptEl = allElements[i];
    let text = extractPromptText(promptEl);
    let image = findPromptImage(promptEl);
    let elementsToHighlight = [promptEl];

    if (ACTIVE_SITE === Site.GROK && text && !image && (i + 1 < allElements.length)) {
        const nextEl = allElements[i+1];
        const nextImage = findPromptImage(nextEl);
        if (nextImage && !extractPromptText(nextEl)) {
            image = nextImage;
            elementsToHighlight.push(nextEl);
            i++; 
        }
    }
    
    if (ACTIVE_SITE === Site.CLAUDE) {
        const mainElement = promptEl.closest('.group.relative');
        elementsToHighlight = [mainElement];
        if (image) {
            const imageElement = image.closest('.group\\/thumbnail');
            if (imageElement) elementsToHighlight.push(imageElement);
        }
    }

    if (!text && !image) continue;

    const promptId = `${ACTIVE_SITE}-prompt-${i}`;
    const dateId = text || image?.src || Math.random();
    if (!promptDates[dateId]) promptDates[dateId] = Date.now();

    const listItem = document.createElement("li");
    listItem.id = promptId;
    listItem.title = text || "Image Prompt";
    
    if (image) {
        if (chrome.runtime?.id) {
            const imageIndicator = document.createElement("span");
            imageIndicator.className = "image-indicator";
            const iconUrl = chrome.runtime.getURL('icons/image.png');
            imageIndicator.innerHTML = `<img src="${iconUrl}" alt="Image Attached" height="50" width="50">`;
            imageIndicator.title = "Click to view image";
            listItem.appendChild(imageIndicator);
            imageIndicator.addEventListener("click", (e) => {
                e.stopPropagation();
                const modalImg = document.getElementById("modal-image-content");
                if (modalImg && modal) {
                    modalImg.src = image.src;
                    modal.style.display = "flex";
                }
            });
        }
    }
    
    const itemContent = document.createElement("div");
    itemContent.className = "prompt-item-content";
    const dateSpan = document.createElement("span");
    dateSpan.className = "prompt-date";
    dateSpan.textContent = formatDate(promptDates[dateId]);
    itemContent.appendChild(dateSpan);
    const textSpan = document.createElement("span");
    textSpan.className = "prompt-text";
    textSpan.textContent = text ? (text.length > 80 ? text.substring(0, 80) + "…" : text) : "[Image Prompt]";
    itemContent.appendChild(textSpan);
    listItem.appendChild(itemContent);

    listItem.addEventListener("click", () => {
      const firstEl = elementsToHighlight[0];
      firstEl.scrollIntoView({ behavior: "smooth", block: "center" });
      elementsToHighlight.forEach(el => el?.classList.add("highlight"));
      setTimeout(() => elementsToHighlight.forEach(el => el?.classList.remove("highlight")), 2500);
    });

    promptList.appendChild(listItem);
  }
}

const debouncedUpdatePrompts = debounce(updatePrompts, 500);

function pickObserverTarget() {
  switch (ACTIVE_SITE) {
    case Site.GEMINI: return document.querySelector("main") || document.body;
    case Site.CHATGPT: return document.querySelector("#__next") || document.body;
    case Site.GROK: return document.querySelector('#leaf-content') || document.body;
    case Site.CLAUDE: return document.querySelector("main") || document.body;
    default: return document.body;
  }
}

function initializeExtension() {
  if (document.getElementById("prompt-navigator-sidebar")) return;
  createSidebar();

  let targetNode = pickObserverTarget();
  if (!targetNode) {
    window.addEventListener("load", initializeExtension, { once: true });
    return;
  }
  
  debouncedUpdatePrompts();
  const observer = new MutationObserver(() => debouncedUpdatePrompts());
  observer.observe(targetNode, { childList: true, subtree: true });
}

if (ACTIVE_SITE !== Site.UNKNOWN) {
    initializeExtension();

    if (ACTIVE_SITE === Site.CHATGPT || ACTIVE_SITE === Site.GROK || ACTIVE_SITE === Site.CLAUDE) {
        let currentUrl = location.href;
        setInterval(() => {
            if (location.href !== currentUrl) {
                console.log(`Prompt Navigator: URL changed on ${ACTIVE_SITE}, clearing prompt history.`);
                currentUrl = location.href;
                const promptList = document.getElementById("prompt-list");
                if (promptList) promptList.innerHTML = "";
                promptDates = {};
                debouncedUpdatePrompts();
            }
        }, 500);
    }
}