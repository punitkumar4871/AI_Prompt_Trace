console.log("Prompt Navigator All-in-One loaded.");

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
  if (h.includes("grok.com")) return Site.GROK;
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
    if (ACTIVE_SITE !== Site.GEMINI) {
        chrome.runtime.sendMessage({ action: "getSidebarState", site: ACTIVE_SITE }, (response) => {
          if (chrome.runtime.lastError) {
            closeSidebar();
            return;
          }
          if (response && response.sidebarOpen) openSidebar();
          else closeSidebar();
        });
    } else {
        closeSidebar();
    }
  } catch(e) { console.warn("Prompt Navigator: Could not get sidebar state on initial load.", e); }
}

function toggleSidebar() {
  if (!sidebar) return;
  const isOpening = !sidebar.classList.contains("open");
  if (isOpening) openSidebar();
  else closeSidebar();
  
  if (ACTIVE_SITE !== Site.GEMINI) {
      try {
          if (chrome.runtime?.id) {
              chrome.runtime.sendMessage({ action: "saveSidebarState", isOpen: isOpening, site: ACTIVE_SITE });
          }
      } catch (error) {
          console.warn(`Prompt Navigator: Safely caught an error during toggle: ${error.message}`);
      }
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

function getPromptElements() {
  if (ACTIVE_SITE === Site.GEMINI) return document.querySelectorAll("user-query");
  if (ACTIVE_SITE === Site.CHATGPT) return document.querySelectorAll('[data-message-author-role="user"]');
  if (ACTIVE_SITE === Site.GROK) return document.querySelectorAll('[class*="message-bubble"], .group\\/chip');
  return [];
}

function extractPromptText(promptEl) {
  if (ACTIVE_SITE === Site.GEMINI) return (promptEl.querySelector(".query-content")?.textContent || "").trim();
  
  if (ACTIVE_SITE === Site.CHATGPT) return (promptEl.querySelector('.whitespace-pre-wrap')?.textContent || "").trim();
  if (ACTIVE_SITE === Site.GROK) return (promptEl.querySelector("span.whitespace-pre-wrap")?.textContent || "").trim();
  return "";
}

function findPromptImage(promptEl) {
    if (ACTIVE_SITE === Site.GEMINI) return promptEl.querySelector("img:not(.profile-photo):not(.avatar)");
    if (ACTIVE_SITE === Site.CHATGPT || ACTIVE_SITE === Site.GROK) return promptEl.querySelector("img");
    return null;
}

function updatePrompts() {
  const promptList = document.getElementById("prompt-list");
  if (!promptList) return;

  if (ACTIVE_SITE === Site.GEMINI) {
      promptList.innerHTML = ''; 
  }

  const allElements = Array.from(getPromptElements());
  let processedPrompts = [];
  
  for (let i = 0; i < allElements.length; i++) {
    const currentEl = allElements[i];
    const text = extractPromptText(currentEl);
    const image = findPromptImage(currentEl);
    
    if (ACTIVE_SITE === Site.GROK) {
        const isTextBubble = text && !image;
        if (isTextBubble && (i + 1 < allElements.length)) {
            const nextEl = allElements[i+1];
            const nextImage = findPromptImage(nextEl);
            const nextText = extractPromptText(nextEl);
            if (nextImage && !nextText) {
                processedPrompts.push({ el: currentEl, image: nextImage, text: text, originalIndex: i });
                i++; 
                continue;
            }
        }
    }
    processedPrompts.push({ el: currentEl, image, text, originalIndex: i });
  }

  processedPrompts.forEach((promptData) => {
    const { el, image, text, originalIndex } = promptData;
    const promptId = `${ACTIVE_SITE}-prompt-${originalIndex}`;
    if (document.getElementById(promptId) && ACTIVE_SITE !== Site.GEMINI) return;
    if (!text && !image) return;

    const dateId = text || image?.src || Math.random();
    if (!promptDates[dateId]) promptDates[dateId] = Date.now();

    const listItem = document.createElement("li");
    listItem.id = promptId;
    listItem.title = text || "Image Prompt";
    
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

    if (image) {
      const imageIndicator = document.createElement("span");
      imageIndicator.className = "image-indicator";
      imageIndicator.textContent = "🖼️";
      imageIndicator.title = "Click to view image";
      listItem.prepend(imageIndicator);
      imageIndicator.addEventListener("click", (e) => {
        e.stopPropagation();
        const modalImg = document.getElementById("modal-image-content");
        if (modalImg && modal) {
          modalImg.src = image.src;
          modal.style.display = "flex";
        }
      });
    }

    listItem.addEventListener("click", () => {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      
      const mainEl = allElements[originalIndex];
      mainEl.classList.add("highlight");
      
      if (ACTIVE_SITE === Site.GROK && text && image) {
          const imageEl = allElements[originalIndex + 1];
          imageEl?.classList.add("highlight");
          setTimeout(() => imageEl?.classList.remove("highlight"), 2000);
      }
      
      setTimeout(() => mainEl.classList.remove("highlight"), 2000);
    });

    promptList.appendChild(listItem);
  });
}

const debouncedUpdatePrompts = debounce(updatePrompts, 500);

function pickObserverTarget() {
  if (ACTIVE_SITE === Site.GEMINI) return document.querySelector("main") || document.body;
  if (ACTIVE_SITE === Site.CHATGPT) return document.querySelector("#__next") || document.body;
  if (ACTIVE_SITE === Site.GROK) return document.querySelector('#leaf-content') || document.body;
  return document.body;
}

function initializeExtension() {
  if (document.getElementById("prompt-navigator-sidebar")) return;
  createSidebar();

  let targetNode = pickObserverTarget();
  if (!targetNode) {
    window.addEventListener("DOMContentLoaded", () => initializeExtension(), { once: true });
    return;
  }
  
  debouncedUpdatePrompts();
  observer = new MutationObserver(() => debouncedUpdatePrompts());
  observer.observe(targetNode, { childList: true, subtree: true });
}

if (ACTIVE_SITE !== Site.UNKNOWN) {
    initializeExtension();

    if (ACTIVE_SITE === Site.CHATGPT || ACTIVE_SITE === Site.GROK) {
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