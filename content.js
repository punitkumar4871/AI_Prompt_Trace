console.log("Prompt Navigator All-in-One loaded.");

const Site = Object.freeze({
  GEMINI: "gemini",
  CHATGPT: "chatgpt",
  GROK: "grok",
  CLAUDE: "claude",
  DEEPSEEK: "deepseek",
  UNKNOWN: "unknown",
});

function detectSite() {
  const h = location.hostname;
  if (h.includes("gemini.google.com")) return Site.GEMINI;
  if (h.includes("chat.openai.com") || h.includes("chatgpt.com")) return Site.CHATGPT;
  if (h.includes("grok.com")) return Site.GROK;
  if (h.includes("claude.ai")) return Site.CLAUDE;
  if (h.includes("chat.deepseek.com")) return Site.DEEPSEEK;
  return Site.UNKNOWN;
}

const ACTIVE_SITE = detectSite();
let sidebar, toggleButton, observer, debounceTimer, modal;
let promptDates = {};

// Self-contained image data for the toggle button icons to prevent SVG errors
const ICON_CLOSE = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNCIgaGVpZ2h0PSIxNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTE1IDE4bC02LTYgNi02Ii8+PC9zdmc+';
const ICON_OPEN = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNCIgaGVpZ2h0PSIxNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTkgMThsNi02LTYtNiIvPjwvc3ZnPg==';


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
  toggleButton.innerHTML = `<img src="${ICON_CLOSE}" />`;
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
  toggleButton.innerHTML = `<img src="${ICON_OPEN}" />`;
}

function closeSidebar() {
  if (!sidebar || !toggleButton) return;
  sidebar.classList.remove("open");
  document.body.classList.remove("sidebar-open");
  toggleButton.innerHTML = `<img src="${ICON_CLOSE}" />`;
}

// ---------- Site-Specific Logic ----------
function getPromptElements() {
  switch (ACTIVE_SITE) {
    case Site.GEMINI: return document.querySelectorAll("user-query");
    case Site.CHATGPT: return document.querySelectorAll('[data-message-author-role="user"]');
    case Site.GROK: return document.querySelectorAll('[class*="message-bubble"], .group\\/chip');
    case Site.CLAUDE: return document.querySelectorAll('div[data-testid="user-message"]');
    case Site.DEEPSEEK: {
        const contentElements = document.querySelectorAll('div[class^="fbb737a4"], div[class^="_76cd190"]');
        const parentElements = Array.from(contentElements).map(el => el.parentElement);
        return [...new Set(parentElements)];
    }
    default: return [];
  }
}

function extractPromptText(promptEl) {
  switch (ACTIVE_SITE) {
    case Site.GEMINI: return (promptEl.querySelector(".query-content")?.textContent || "").trim();
    case Site.CHATGPT: return (promptEl.querySelector('.whitespace-pre-wrap')?.textContent || "").trim();
    case Site.GROK: return (promptEl.querySelector("span.whitespace-pre-wrap")?.textContent || "").trim();
    case Site.CLAUDE: return (promptEl.querySelector('p.whitespace-pre-wrap')?.textContent || "").trim();
    case Site.DEEPSEEK: {
      const textContent = (promptEl.querySelector('div[class^="fbb737a4"]')?.textContent || "").trim();
      const imageFilename = (promptEl.querySelector('div[class*="f3a54b52"]')?.textContent || "").trim();
      if (textContent && imageFilename) return `${textContent} [Image: ${imageFilename}]`;
      return textContent;
    }
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
    case Site.DEEPSEEK: return promptEl.querySelector('div[class*="_76cd190"]');
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

    // Site-specific logic for handling prompt/image grouping
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
      
    if (ACTIVE_SITE === Site.DEEPSEEK) {
        const hasText = promptEl.querySelector('div[class^="fbb737a4"]');
        const hasImage = promptEl.querySelector('div[class^="_76cd190"]');
        if (hasImage && !hasText) {
            const nextEl = allElements[i + 1];
            if (nextEl && nextEl.querySelector('div[class^="fbb737a4"]')) {
                continue; // Skip duplicate image-only part of a prompt
            }
        }
    }

    if (!text && !image) continue;

    if (!text && image && ACTIVE_SITE === Site.DEEPSEEK) {
      const imageFilename = (promptEl.querySelector('div[class*="f3a54b52"]')?.textContent || "Image").trim();
      text = `[Image: ${imageFilename}]`;
    }

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
            listItem.appendChild(imageIndicator);
            
            imageIndicator.title = "Click to view image";

            if (ACTIVE_SITE === Site.DEEPSEEK) {
                // Special handler for DeepSeek's dynamic image loading
                imageIndicator.addEventListener("click", (e) => {
                    e.stopPropagation();
                    const placeholder = promptEl.querySelector('div[class*="_76cd190"]');
                    if (placeholder) {
                        placeholder.click();
                        setTimeout(() => {
                            const viewerImage = document.querySelector('img[src*="deepseek-api-files"]');
                            if (viewerImage && viewerImage.src) {
                                const modalImg = document.getElementById("modal-image-content");
                                modalImg.src = viewerImage.src;
                                modal.style.display = "flex";

                                let container = viewerImage.parentElement;
                                for (let i = 0; i < 5 && container; i++) {
                                    const closeButton = container.querySelector('div.ds-icon-button');
                                    if (closeButton) {
                                        closeButton.click();
                                        break; 
                                    }
                                    container = container.parentElement;
                                }
                            } else {
                                alert("Prompt Navigator could not find the image viewer. The site's code may have changed.");
                            }
                        }, 500);
                    }
                });
            } else {
                // Standard handler for all other sites
                imageIndicator.addEventListener("click", (e) => {
                    e.stopPropagation();
                    const modalImg = document.getElementById("modal-image-content");
                    if (modalImg && modal && image.src) {
                        modalImg.src = image.src;
                        modal.style.display = "flex";
                    }
                });
            }
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
      // FIX: Changed block from "center" to "start" to scroll to the top of the prompt.
      firstEl.scrollIntoView({ behavior: "smooth", block: "start" });
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
    case Site.DEEPSEEK: return document.querySelector('div[class*="--chat-container--"], div[class*="--chat-list--"]') || document.body;
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
    if (document.readyState === "complete" || document.readyState === "interactive") {
        initializeExtension();
    } else {
        window.addEventListener("load", initializeExtension);
    }

    if (ACTIVE_SITE === Site.CHATGPT || ACTIVE_SITE === Site.GROK || ACTIVE_SITE === Site.CLAUDE || ACTIVE_SITE === Site.DEEPSEEK) {
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