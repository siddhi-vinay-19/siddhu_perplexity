document.addEventListener("DOMContentLoaded", () => {
    // -----------------------------------------
    // Elements
    // -----------------------------------------
    const searchInput = document.getElementById("search-input");
    const submitBtn = document.getElementById("submit-btn");
    const chatStream = document.getElementById("chat-stream");
    const suggestionsArea = document.getElementById("suggestions-area");
    const chatTabs = document.getElementById("chat-header-tabs");
    const scrollDownBtn = document.getElementById("scroll-down-btn");
    const scrollArea = document.getElementById("content-scroll-area");
    const activeDocPill = document.getElementById("active-doc-pill");
    
    // Upload Elements
    const uploadBtn = document.getElementById("upload-btn");
    const pdfUpload = document.getElementById("pdf-upload");

    // Settings Elements
    const settingsToggle = document.getElementById("settings-toggle");
    const settingsModal = document.getElementById("settings-modal");
    const closeSettings = document.getElementById("close-settings");
    const saveKeyBtn = document.getElementById("save-key");
    const clearKeyBtn = document.getElementById("clear-key");
    const apiKeyInput = document.getElementById("custom-api-key");
    const keyStatus = document.getElementById("key-status");
    const statusText = document.getElementById("status-text");

    // -----------------------------------------
    // API Key Storage Logic
    // -----------------------------------------
    const API_KEY_STORAGE = "nexus_gemini_api_key";

    function updateKeyUI() {
        const key = localStorage.getItem(API_KEY_STORAGE);
        if (key) {
            apiKeyInput.value = key;
            keyStatus.classList.add("active");
            statusText.innerText = "Custom Key Active";
        } else {
            apiKeyInput.value = "";
            keyStatus.classList.remove("active");
            statusText.innerText = "Using Default (Public) Key";
        }
    }

    function getHeaders() {
        const key = localStorage.getItem(API_KEY_STORAGE);
        const headers = { 'Content-Type': 'application/json' };
        if (key) headers["X-API-Key"] = key;
        return headers;
    }

    // Modal Control
    settingsToggle.addEventListener("click", (e) => {
        e.preventDefault();
        settingsModal.style.display = "flex";
        updateKeyUI();
    });

    closeSettings.addEventListener("click", () => settingsModal.style.display = "none");
    window.addEventListener("click", (e) => { if (e.target === settingsModal) settingsModal.style.display = "none"; });

    saveKeyBtn.addEventListener("click", () => {
        const val = apiKeyInput.value.trim();
        if (val) {
            localStorage.setItem(API_KEY_STORAGE, val);
            alert("API Key Saved Successfully!");
            settingsModal.style.display = "none";
        }
    });

    clearKeyBtn.addEventListener("click", () => {
        localStorage.removeItem(API_KEY_STORAGE);
        updateKeyUI();
        alert("Key Cleared. Back to Public Quota.");
    });

    // -----------------------------------------
    // Document Pill Management
    // -----------------------------------------
    function showDocPill(filename) {
        activeDocPill.innerHTML = `<i class="fa-solid fa-file-pdf"></i> <span>${filename}</span> <i class="fa-solid fa-xmark remove-doc" title="Remove PDF"></i>`;
        activeDocPill.style.display = "flex";
        
        activeDocPill.querySelector(".remove-doc").addEventListener("click", async () => {
            try {
                await fetch('/api/clear-context', { method: 'POST' });
                activeDocPill.style.display = "none";
                chatStream.innerHTML += `<div class="message-row flex-start"><div class="ai-content" style="color: #666; font-size: 13px;">System: <strong>PDF context cleared.</strong></div></div>`;
                scrollArea.scrollTop = scrollArea.scrollHeight;
            } catch (e) {
                console.error("Clear Context Error:", e);
            }
        });
    }

    // -----------------------------------------
    // File Upload Logic
    // -----------------------------------------
    uploadBtn.addEventListener("click", () => pdfUpload.click());

    pdfUpload.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        chatStream.style.display = "block";
        const uploadMsgId = Date.now();
        chatStream.innerHTML += `
            <div class="message-row flex-start" id="upload-${uploadMsgId}">
                <div class="ai-content-wrapper"><div class="ai-content" style="color: #666; font-size: 16px;"><i class="fa-solid fa-circle-notch fa-spin"></i> Nexus is indexing <strong>${file.name}</strong>...</div></div>
            </div>
        `;
        scrollArea.scrollTop = scrollArea.scrollHeight;

        const formData = new FormData();
        formData.append("file", file);

        try {
            const headers = {};
            const key = localStorage.getItem(API_KEY_STORAGE);
            if (key) headers["X-API-Key"] = key;

            const response = await fetch('/api/upload', { 
                method: 'POST', 
                body: formData,
                headers: headers
            });
            const data = await response.json();
            
            document.getElementById(`upload-${uploadMsgId}`).remove();

            if (response.ok) {
                showDocPill(file.name);
                if (chatStream.style.display !== "block") {
                    suggestionsArea.style.display = "none";
                    document.getElementById("main-logo").style.display = "none";
                    chatTabs.style.display = "flex";
                }
                
                const typeLabel = data.status === 'RAG_ACTIVE' ? "Grounded Context" : "Vision AI";
                chatStream.innerHTML += `<div class="message-row flex-start"><div class="ai-content-wrapper"><div class="ai-content" style="color:#4db8ff; font-size:13px;"><i class="fa-solid fa-file-shield"></i> Nexus RAG: <strong>${data.message}</strong> (${typeLabel})</div></div></div>`;
            } else {
                alert("Upload failed: " + data.error);
            }
        } catch (error) {
            alert("Network error during document upload.");
        }
        scrollArea.scrollTop = scrollArea.scrollHeight;
    });

    // -----------------------------------------
    // Scroll & UI Logic
    // -----------------------------------------
    scrollArea.addEventListener("scroll", () => {
        const remaining = scrollArea.scrollHeight - scrollArea.scrollTop - scrollArea.clientHeight;
        scrollDownBtn.style.display = remaining > 150 ? "flex" : "none";
    });

    scrollDownBtn.addEventListener("click", () => {
        scrollArea.scrollTo({ top: scrollArea.scrollHeight, behavior: 'smooth' });
    });

    // -----------------------------------------
    // Model Selection Logic
    // -----------------------------------------
    const modelSelectBtn = document.getElementById("model-select-btn");
    const modelDropdown = document.getElementById("model-dropdown");
    const modelOptions = document.querySelectorAll(".model-option");
    const currentModelName = document.getElementById("current-model-name");
    let selectedModel = "gemini-2.5-flash";

    modelSelectBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        modelDropdown.style.display = modelDropdown.style.display === "flex" ? "none" : "flex";
    });

    modelOptions.forEach(option => {
        option.addEventListener("click", () => {
            selectedModel = option.getAttribute("data-model");
            modelOptions.forEach(opt => opt.classList.remove("active"));
            option.classList.add("active");
            currentModelName.innerText = option.querySelector(".model-title").innerText.replace("Gemini ", "");
            modelDropdown.style.display = "none";
        });
    });

    document.addEventListener("click", () => {
        modelDropdown.style.display = "none";
    });

    // -----------------------------------------
    // Textarea Auto-resize Logic
    // -----------------------------------------
    searchInput.addEventListener("input", function() {
        this.style.height = 'auto'; // Reset to calculate
        this.style.height = (this.scrollHeight) + 'px';
    });

    // -----------------------------------------
    // History Management
    // -----------------------------------------
    const clearHistoryBtn = document.getElementById("clear-history");
    clearHistoryBtn.addEventListener("click", () => {
        if (confirm("Are you sure you want to clear the entire chat history?")) {
            chatStream.innerHTML = "";
            chatStream.style.display = "none";
            suggestionsArea.style.display = "block";
            document.getElementById("main-logo").style.display = "block";
            chatTabs.style.display = "none";
            
            // Also clear PDF if any
            fetch('/api/clear-context', { method: 'POST' });
            activeDocPill.style.display = "none";
        }
    });

    // -----------------------------------------
    // Main Chat Logic
    // -----------------------------------------
    async function handleSearch() {
        const prompt = searchInput.value.trim();
        if (!prompt) return;

        suggestionsArea.style.display = "none";
        document.getElementById("main-logo").style.display = "none";
        chatTabs.style.display = "flex";
        chatStream.style.display = "block";
        searchInput.value = '';
        searchInput.style.height = 'auto'; // Reset height
        
        chatStream.innerHTML += `
            <div class="message-row flex-end"><div class="user-bubble">${prompt}</div></div>
            <div class="message-row flex-start loading">
                <div class="ai-content-wrapper"><div class="ai-content" style="color: #666; font-size: 16px;"><i class="fa-solid fa-circle-notch fa-spin"></i> Nexus is searching with <strong>${selectedModel}</strong>...</div></div>
            </div>
        `;
        
        setTimeout(() => scrollArea.scrollTop = scrollArea.scrollHeight, 50);

        try {
            const body = { 
                prompt: prompt,
                model: selectedModel
            };
            
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify(body)
            });

            const data = await response.json();
            document.querySelectorAll('.loading').forEach(el => el.remove());

            if (response.ok) {
                const parsedText = marked.parse(data.response);
                chatStream.innerHTML += `
                    <div class="message-row flex-start">
                        <div class="ai-content-wrapper">
                            <div class="ai-content">${parsedText}</div>
                            <div class="ai-actions">
                                <div class="action-group">
                                    <i class="fa-solid fa-share" title="Share"></i>
                                    <i class="fa-solid fa-download" title="Download"></i>
                                    <i class="fa-regular fa-copy" title="Copy" onclick="navigator.clipboard.writeText(this.parentElement.parentElement.previousElementSibling.innerText); alert('Copied!')"></i>
                                    <i class="fa-solid fa-rotate" title="Regenerate"></i>
                                </div>
                                <div class="action-group"><i class="fa-regular fa-thumbs-up"></i><i class="fa-regular fa-thumbs-down"></i><i class="fa-solid fa-ellipsis"></i></div>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                chatStream.innerHTML += `<div class="message-row flex-start"><div class="ai-content" style="color:#ff6b6b"><strong>Error:</strong> ${data.error}</div></div>`;
            }
            setTimeout(() => scrollArea.scrollTop = scrollArea.scrollHeight, 50);
        } catch (error) {
            document.querySelectorAll('.loading').forEach(el => el.remove());
            chatStream.innerHTML += `<div class="message-row flex-start"><div class="ai-content" style="color:#ff6b6b"><strong>Connection Error.</strong></div></div>`;
        }
    }

    // Suggestion Click Logic
    document.querySelectorAll('.suggestion-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            searchInput.value = item.innerText;
            handleSearch();
        });
    });

    searchInput.addEventListener('keydown', (e) => { 
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSearch(); 
        }
    });

    submitBtn.addEventListener('click', handleSearch);
    
    // Initialize UI state
    updateKeyUI();
});
