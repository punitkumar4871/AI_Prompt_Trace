console.log("Gemini Navigator content script is running - v1.3");

// --- Globals ---
let sidebar;
let toggleButton;
let observer;
let debounceTimer;

// --- Main Functions ---

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

    toggleButton = document.createElement('button');
    toggleButton.id = 'gemini-prompt-nav-toggle';
    toggleButton.textContent = '<';
    document.body.appendChild(toggleButton);

    toggleButton.addEventListener('click', toggleSidebar);

    chrome.runtime.sendMessage({ action: "getSidebarState" }, (response) => {
        if (chrome.runtime.lastError) {
            console.warn(`Gemini Navigator: Could not get sidebar state. Error: ${chrome.runtime.lastError.message}`);
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
        chrome.runtime.sendMessage({ action: "saveSidebarState", isOpen: isOpening }, (response) => {
            if (chrome.runtime.lastError) {
                console.warn(`Gemini Navigator: Error during message response: ${chrome.runtime.lastError.message}`);
            }
        });
    } catch (e) {
        console.warn(`Gemini Navigator: Could not send message to save state. Context was likely invalidated. Error: ${e.message}`);
    }
}

function openSidebar() {
    if (!sidebar || !toggleButton) return;
    sidebar.classList.add('open');
    if (document.body) {
        document.body.classList.add('sidebar-open');
    }
    toggleButton.textContent = '>';
}

function closeSidebar() {
    if (!sidebar || !toggleButton) return;
    sidebar.classList.remove('open');
    if (document.body) {
        document.body.classList.remove('sidebar-open');
    }
    toggleButton.textContent = '<';
}

function updatePrompts() {
    const promptList = document.getElementById('prompt-list');
    if (!promptList) return;
    promptList.innerHTML = '';

    const promptElements = document.querySelectorAll('[id^="user-query-content-"]');

    console.log('Gemini Navigator is searching for prompts. Found:', promptElements.length);

    promptElements.forEach((promptEl) => {
        const promptText = promptEl.textContent?.trim();
        if (promptText) {
            const listItem = document.createElement('li');
            listItem.textContent = promptText.length > 50 ? promptText.substring(0, 50) + '...' : promptText;
            listItem.title = promptText;
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

const debouncedUpdatePrompts = debounce(updatePrompts, 500);

function initializeExtension() {
    if (!document.body) {
        window.addEventListener('DOMContentLoaded', initializeExtension, { once: true });
        return;
    }
    createSidebar();
    debouncedUpdatePrompts();
    if (observer) observer.disconnect();
    
    const targetNode = document.body;

    if (!targetNode) {
        setTimeout(initializeExtension, 1000);
        return;
    }
    observer = new MutationObserver(() => debouncedUpdatePrompts());
    observer.observe(targetNode, { childList: true, subtree: true });
}

initializeExtension();