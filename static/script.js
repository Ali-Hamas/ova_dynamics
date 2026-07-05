// Britsync AI Outreach Copilot - Frontend Logic with LocalStorage Chat History

document.addEventListener("DOMContentLoaded", () => {
    const chatForm = document.getElementById("chat-form");
    const userInput = document.getElementById("user-input");
    const messagesContainer = document.getElementById("messages-container");
    const welcomeScreen = document.getElementById("welcome-screen");
    const newChatBtn = document.getElementById("new-chat-btn");
    const chatHistoryList = document.getElementById("chat-history");

    let sessions = JSON.parse(localStorage.getItem("britsync_sessions") || "[]");
    let currentSessionId = null;

    // Load sessions and show sidebar
    renderSessionsSidebar();

    // Pre-fill input when clicking suggestions
    window.useSuggestion = (text) => {
        userInput.value = text;
        userInput.focus();
    };

    // New Scan / Reset chat
    newChatBtn.addEventListener("click", () => {
        currentSessionId = null;
        clearChatArea();
        welcomeScreen.style.display = "block";
        userInput.value = "";
        renderSessionsSidebar();
    });

    // Handle Form Submit
    chatForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const query = userInput.value.trim();
        if (!query) return;

        // Hide welcome screen
        welcomeScreen.style.display = "none";

        // If no active session, create a new one
        if (!currentSessionId) {
            currentSessionId = "session_" + Date.now();
            const sessionTitle = query.length > 28 ? query.substring(0, 25) + "..." : query;
            sessions.unshift({
                id: currentSessionId,
                title: sessionTitle,
                messages: []
            });
            saveSessionsToStorage();
        }

        // Retrieve current session
        const session = sessions.find(s => s.id === currentSessionId);

        // 1. Add User Message
        appendMessage(query, "user");
        session.messages.push({ sender: "user", text: query });
        saveSessionsToStorage();
        renderSessionsSidebar();
        
        userInput.value = "";

        // Compile history context for the LLM backend
        const historyPayload = session.messages.slice(0, -1).map(m => ({
            role: m.sender === "user" ? "user" : "assistant",
            content: m.text
        }));

        // 2. Add AI Response Placeholder with loading/thinking status
        const aiMessageDiv = appendMessage("", "ai", true);
        const contentDiv = aiMessageDiv.querySelector(".message-content");

        try {
            // Send API request with message and history payload
            const response = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    message: query,
                    history: historyPayload
                })
            });

            if (!response.ok) {
                throw new Error("Server returned an error");
            }

            const data = await response.json();
            
            // Remove loading indicator
            contentDiv.innerHTML = "";

            // Render AI Text Response
            const responseText = document.createElement("p");
            responseText.textContent = data.response || "I couldn't generate a response.";
            contentDiv.appendChild(responseText);

            // Render Leads Grid if leads are present
            let leadsData = null;
            if (data.leads && data.leads.length > 0) {
                leadsData = data.leads;
                const gridDiv = document.createElement("div");
                gridDiv.className = "leads-grid";

                data.leads.forEach(lead => {
                    const card = createLeadCard(lead);
                    gridDiv.appendChild(card);
                });

                contentDiv.appendChild(gridDiv);
            }

            // Save AI response to session memory
            session.messages.push({ 
                sender: "ai", 
                text: data.response || "", 
                leads: leadsData 
            });
            saveSessionsToStorage();

        } catch (error) {
            contentDiv.innerHTML = `<p style="color: var(--accent-red);"><i class="fa-solid fa-triangle-exclamation"></i> Error: Failed to fetch leads. Make sure the backend server is running.</p>`;
            console.error(error);
        }

        // Scroll to bottom
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    });

    // Helper: Create Chat Message bubble
    function appendMessage(text, sender, isLoading = false, leads = null) {
        const messageDiv = document.createElement("div");
        messageDiv.className = `message message-${sender}`;

        const headerDiv = document.createElement("div");
        headerDiv.className = "message-header";
        headerDiv.innerHTML = sender === "user" 
            ? `<span>User</span> <i class="fa-solid fa-user"></i>` 
            : `<i class="fa-solid fa-wand-magic-sparkles"></i> <span>Copilot</span>`;

        const contentDiv = document.createElement("div");
        contentDiv.className = "message-content";

        if (isLoading) {
            contentDiv.innerHTML = `
                <div class="log-message">
                    <i class="fa-solid fa-circle-notch"></i>
                    <span>Searching Tavily and generating lead intelligence...</span>
                </div>
            `;
        } else {
            const p = document.createElement("p");
            p.textContent = text;
            contentDiv.appendChild(p);

            // If history load contains leads, render the grid
            if (leads && leads.length > 0) {
                const gridDiv = document.createElement("div");
                gridDiv.className = "leads-grid";
                leads.forEach(lead => {
                    gridDiv.appendChild(createLeadCard(lead));
                });
                contentDiv.appendChild(gridDiv);
            }
        }

        messageDiv.appendChild(headerDiv);
        messageDiv.appendChild(contentDiv);
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        return messageDiv;
    }

    // Helper: Create Lead HTML Card
    function createLeadCard(lead) {
        const card = document.createElement("div");
        card.className = "lead-card";

        const title = lead.Name || lead.Company || "Target Lead";
        const company = lead.Company || "N/A";
        const website = lead.Website || "#";
        const description = lead.Description || "No description provided.";

        if (lead.Type === "Affiliate/Influencer") {
            // Affiliate / Social Media Influencer Card
            card.innerHTML = `
                <div>
                    <div class="lead-card-header">
                        <h4>${title} <span style="font-size:11px;color:var(--accent-purple);font-weight:bold;margin-left:5px;">${company}</span></h4>
                        <a href="${website}" target="_blank" class="lead-website">
                            <i class="fa-solid fa-link"></i> Profile
                        </a>
                    </div>
                    <p class="lead-desc">${description}</p>
                </div>
                <div class="lead-actions">
                    <a href="${website}" target="_blank" class="action-btn call-btn" style="text-decoration:none;">
                        <i class="fa-solid fa-arrow-up-right-from-square"></i> Open Profile
                    </a>
                    <button class="action-btn secondary-btn" onclick="generateMessage('${title}', '${company}')">
                        <i class="fa-solid fa-comment-dots"></i> Draft DM
                    </button>
                </div>
            `;
        } else {
            // B2B Business Client Card
            card.innerHTML = `
                <div>
                    <div class="lead-card-header">
                        <h4>${title}</h4>
                        <a href="${website}" target="_blank" class="lead-website">
                            <i class="fa-solid fa-arrow-up-right-from-square"></i> Visit
                        </a>
                    </div>
                    <p class="lead-desc">${description}</p>
                </div>
                <div class="lead-actions">
                    <button class="action-btn call-btn" onclick="triggerCall('${title}', '${company}')">
                        <i class="fa-solid fa-phone"></i> Call Lead
                    </button>
                    <button class="action-btn secondary-btn" onclick="generateMessage('${title}', '${company}')">
                        <i class="fa-solid fa-envelope"></i> Draft Email
                    </button>
                </div>
            `;
        }

        return card;
    }

    // Load sessions and render sidebar list
    function renderSessionsSidebar() {
        chatHistoryList.innerHTML = "";
        
        if (sessions.length === 0) {
            chatHistoryList.innerHTML = `<li class="no-scans-text" style="font-size: 12px; color: var(--text-secondary); text-align: center; padding: 10px;">No recent scans.</li>`;
            return;
        }

        sessions.forEach(session => {
            const li = document.createElement("li");
            li.className = session.id === currentSessionId ? "active" : "";
            li.innerHTML = `<i class="fa-solid fa-magnifying-glass"></i> ${session.title}`;
            li.addEventListener("click", () => loadSession(session.id));
            chatHistoryList.appendChild(li);
        });
    }

    // Load messages from a session into the chat area
    function loadSession(sessionId) {
        currentSessionId = sessionId;
        clearChatArea();
        welcomeScreen.style.display = "none";
        
        const session = sessions.find(s => s.id === sessionId);
        if (session && session.messages) {
            session.messages.forEach(msg => {
                appendMessage(msg.text, msg.sender, false, msg.leads);
            });
        }
        
        renderSessionsSidebar();
    }

    // Clear chat helper
    function clearChatArea() {
        const messages = messagesContainer.querySelectorAll(".message");
        messages.forEach(m => m.remove());
    }

    function saveSessionsToStorage() {
        localStorage.setItem("britsync_sessions", JSON.stringify(sessions));
    }

    // Modal elements
    const emailModal = document.getElementById("email-modal");
    const closeModal = document.getElementById("close-modal");
    const emailDraftText = document.getElementById("email-draft-text");
    const copyDraftBtn = document.getElementById("copy-draft-btn");

    // Close Modal Event
    closeModal.addEventListener("click", () => {
        emailModal.classList.remove("show");
    });

    // Close Modal on clicking outside
    window.addEventListener("click", (e) => {
        if (e.target === emailModal) {
            emailModal.classList.remove("show");
        }
    });

    // Copy to clipboard handler
    copyDraftBtn.addEventListener("click", () => {
        emailDraftText.select();
        navigator.clipboard.writeText(emailDraftText.value);
        
        const origText = copyDraftBtn.innerHTML;
        copyDraftBtn.innerHTML = `<i class="fa-solid fa-check"></i> Copied!`;
        setTimeout(() => {
            copyDraftBtn.innerHTML = origText;
        }, 2000);
    });

    // Global Action: Generate Message Draft
    window.generateMessage = async (name, company) => {
        emailDraftText.value = "Drafting personalized message for you...";
        emailModal.classList.add("show");

        try {
            const res = await fetch("/api/generate-message", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: name,
                    company: company
                })
            });

            const data = await res.json();
            if (res.ok && data.message) {
                emailDraftText.value = data.message;
            } else {
                emailDraftText.value = "Failed to draft message: " + (data.error || "Unknown error");
            }
        } catch (error) {
            emailDraftText.value = "Error connecting to message generation API.";
            console.error(error);
        }
    };

    // Global Action: Trigger Call Webhook
    window.triggerCall = async (name, company) => {
        const phoneNumber = prompt(`Enter phone number to call ${name} (${company}):`, "+16814056546");
        if (!phoneNumber) return;

        alert(`Initiating phone call to ${name} at ${phoneNumber}...`);

        try {
            const res = await fetch("/api/trigger-call", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    phone_number: phoneNumber,
                    name: name,
                    company: company
                })
            });

            const result = await res.json();
            if (res.ok && result.success) {
                alert(`Call started successfully! Check your phone.`);
            } else {
                alert(`Failed to trigger call: ${result.error || "Unknown error"}`);
            }
        } catch (error) {
            alert(`Error connecting to telephony gateway.`);
            console.error(error);
        }
    };
});
