console.log("Gemini Navigator content script is running - v1.8");

let sidebar;
let toggleButton;
let observer;
let debounceTimer;
let modal;


function debounce(func, delay) {
    return function(...args) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            func.apply(this, args);
        }, delay);
    };
}

function createSidebar() {
    if (document.getElementById('gemini-prompt-nav-sidebar')) return;

    sidebar = document.createElement('div');
    sidebar.id = 'gemini-prompt-nav-sidebar';
    sidebar.innerHTML = `<div id="sidebar-header"><h2>Prompt History</h2></div><ul id="prompt-list"></ul>`;
    document.body.appendChild(sidebar);

    modal = document.createElement('div');
    modal.id = 'gemini-image-modal';
    modal.style.display = 'none';
    modal.innerHTML = `<span id="modal-close-button">&times;</span><img id="modal-image-content">`;
    document.body.appendChild(modal);
    document.getElementById('modal-close-button').addEventListener('click', () => modal.style.display = 'none');
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });

    toggleButton = document.createElement('button');
    toggleButton.id = 'gemini-prompt-nav-toggle';
    toggleButton.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>`;
    document.body.appendChild(toggleButton);
    toggleButton.addEventListener('click', toggleSidebar);

    chrome.runtime.sendMessage({ action: "getSidebarState" }, (response) => {
        if (chrome.runtime.lastError) {
            console.log(`Gemini Navigator: Could not get sidebar state. ${chrome.runtime.lastError.message}`);
        } else if (response) {
            if (response.sidebarOpen) openSidebar();
            else closeSidebar();
        }
    });
}

function toggleSidebar() {
    if (!sidebar) return;
    const isOpening = !sidebar.classList.contains('open');
    if (isOpening) {
        openSidebar();
    } else {
        closeSidebar();
    }
    try {
        chrome.runtime.sendMessage({ action: "saveSidebarState", isOpen: isOpening });
    } catch (e) {
        console.warn(`Gemini Navigator: Could not send message to save state. Error: ${e.message}`);
    }
}

function openSidebar() {
    if (!sidebar || !toggleButton) return;
    sidebar.classList.add('open');
    document.body.classList.add('sidebar-open');
    toggleButton.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>`;
}

function closeSidebar() {
    if (!sidebar || !toggleButton) return;
    sidebar.classList.remove('open');
    document.body.classList.remove('sidebar-open');
    toggleButton.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>`;
}

function updatePrompts() {
    const promptList = document.getElementById('prompt-list');
    if (!promptList) return;
    promptList.innerHTML = '';

    const promptElements = document.querySelectorAll('user-query');

    promptElements.forEach((promptEl) => {
        const queryTextEl = promptEl.querySelector('.query-content');
        const promptText = queryTextEl ? queryTextEl.textContent?.trim() : '';

        // Finds an image that is NOT the user's avatar.
        const imageEl = promptEl.querySelector('img:not(.profile-photo):not(.avatar)');

        if (promptText || imageEl) {
            const listItem = document.createElement('li');
            listItem.title = promptText || "Image Prompt";

            const itemContent = document.createElement('div');
            itemContent.className = 'prompt-item-content';

            const textSpan = document.createElement('span');
            textSpan.className = 'prompt-text';
            textSpan.textContent = promptText ? (promptText.length > 40 ? promptText.substring(0, 40) + '...' : promptText) : "Image Upload";
            itemContent.appendChild(textSpan);
            listItem.appendChild(itemContent);

            if (imageEl) {
                const imageIndicator = document.createElement('span');
                imageIndicator.className = 'image-indicator';
                imageIndicator.textContent = '🖼️';
                imageIndicator.title = 'Click to view image';
                listItem.prepend(imageIndicator);

                imageIndicator.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const modalImg = document.getElementById('modal-image-content');
                    if (modalImg && modal) {
                        modalImg.src = imageEl.src;
                        modal.style.display = 'flex';
                    }
                });
            }

            // Scrolls directly to the prompt element itself, which is accurate.
            listItem.addEventListener('click', () => {
                promptEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                promptEl.classList.add('highlight');
                setTimeout(() => {
                    promptEl.classList.remove('highlight');
                }, 2000);
            });
            promptList.appendChild(listItem);
        }
    });
}

const debouncedUpdatePrompts = debounce(updatePrompts, 250);

function initializeExtension() {
    if (document.getElementById('gemini-prompt-nav-sidebar')) return;
    
    createSidebar();
    
    const targetNode = document.querySelector('main') || document.body;
    if (!targetNode) {
        window.addEventListener('DOMContentLoaded', () => {
            initializeExtension();
            debouncedUpdatePrompts();
        }, { once: true });
        return;
    }

    debouncedUpdatePrompts();
    observer = new MutationObserver(() => debouncedUpdatePrompts());
    observer.observe(targetNode, { childList: true, subtree: true });
}

initializeExtension();