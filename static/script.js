// Britsync AI Outreach Copilot - Frontend Logic with LocalStorage Chat History, Advanced Campaigns & Mobile Responsiveness

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

    // Mobile Sidebar Toggle Drawer
    const menuToggleBtn = document.getElementById("menu-toggle-btn");
    const sidebar = document.querySelector(".sidebar");
    
    if (menuToggleBtn && sidebar) {
        menuToggleBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            sidebar.classList.toggle("open");
        });

        // Close sidebar when clicking outside on mobile
        document.addEventListener("click", (e) => {
            if (window.innerWidth <= 768 && sidebar.classList.contains("open") && !sidebar.contains(e.target) && e.target !== menuToggleBtn) {
                sidebar.classList.remove("open");
            }
        });
    }

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
        
        // Collapse sidebar on mobile
        if (window.innerWidth <= 768 && sidebar) {
            sidebar.classList.remove("open");
        }
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

            // Render Tabs and Leads Grid if leads are present
            let leadsData = null;
            if (data.leads && data.leads.length > 0) {
                leadsData = data.leads;

                // 1. Render Campaign Analysis and Tabs Filter controls
                const controlsWrapper = document.createElement("div");
                controlsWrapper.style = "display: flex; justify-content: space-between; align-items: center; margin-top: 15px; flex-wrap: wrap; gap: 10px;";
                
                const tabsDiv = document.createElement("div");
                tabsDiv.className = "leads-tabs";
                tabsDiv.innerHTML = `
                    <button class="tab-btn active" onclick="filterLeads(this, 'all')">All Leads</button>
                    <button class="tab-btn" onclick="filterLeads(this, 'youtube')"><i class="fa-brands fa-youtube" style="color: #ff0000;"></i> YouTubers</button>
                    <button class="tab-btn" onclick="filterLeads(this, 'tiktok')"><i class="fa-brands fa-tiktok"></i> TikTokers</button>
                    <button class="tab-btn" onclick="filterLeads(this, 'client')"><i class="fa-solid fa-briefcase" style="color: var(--accent-blue);"></i> B2B Clients</button>
                `;

                const campaignBtn = document.createElement("button");
                campaignBtn.className = "action-btn campaign-btn";
                campaignBtn.style = "background: var(--accent-purple); color: white; display: inline-flex; align-items: center; gap: 8px; font-size: 12px; padding: 6px 14px; border-radius: 20px;";
                campaignBtn.innerHTML = `<i class="fa-solid fa-brain"></i> Modal GPU Campaign Writer`;
                
                // Keep reference to leadsData via closure
                const currentLeads = [...leadsData];
                campaignBtn.onclick = () => analyzeLeadsCampaign(currentLeads, query);

                controlsWrapper.appendChild(tabsDiv);
                controlsWrapper.appendChild(campaignBtn);
                contentDiv.appendChild(controlsWrapper);

                // 2. Render Grid
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
                leads: leadsData,
                query: query // store the search query used
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
    function appendMessage(text, sender, isLoading = false, leads = null, query = "") {
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

            // If history load contains leads, render the tabs and grid
            if (leads && leads.length > 0) {
                const controlsWrapper = document.createElement("div");
                controlsWrapper.style = "display: flex; justify-content: space-between; align-items: center; margin-top: 15px; flex-wrap: wrap; gap: 10px;";
                
                const tabsDiv = document.createElement("div");
                tabsDiv.className = "leads-tabs";
                tabsDiv.innerHTML = `
                    <button class="tab-btn active" onclick="filterLeads(this, 'all')">All Leads</button>
                    <button class="tab-btn" onclick="filterLeads(this, 'youtube')"><i class="fa-brands fa-youtube" style="color: #ff0000;"></i> YouTubers</button>
                    <button class="tab-btn" onclick="filterLeads(this, 'tiktok')"><i class="fa-brands fa-tiktok"></i> TikTokers</button>
                    <button class="tab-btn" onclick="filterLeads(this, 'client')"><i class="fa-solid fa-briefcase" style="color: var(--accent-blue);"></i> B2B Clients</button>
                `;

                const campaignBtn = document.createElement("button");
                campaignBtn.className = "action-btn campaign-btn";
                campaignBtn.style = "background: var(--accent-purple); color: white; display: inline-flex; align-items: center; gap: 8px; font-size: 12px; padding: 6px 14px; border-radius: 20px;";
                campaignBtn.innerHTML = `<i class="fa-solid fa-brain"></i> Modal GPU Campaign Writer`;
                campaignBtn.onclick = () => analyzeLeadsCampaign(leads, query || "our products");

                controlsWrapper.appendChild(tabsDiv);
                controlsWrapper.appendChild(campaignBtn);
                contentDiv.appendChild(controlsWrapper);

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
        
        // Save metadata on card elements for filtering
        card.setAttribute("data-type", lead.Type);
        card.setAttribute("data-company", lead.Company);

        const title = lead.Name || lead.Company || "Target Lead";
        const company = lead.Company || "N/A";
        const website = lead.Website || "#";
        const description = lead.Description || "No description provided.";
        const email = lead.Email || "info@domain.com";

        if (lead.Type === "Affiliate/Influencer") {
            card.innerHTML = `
                <div>
                    <div class="lead-card-header">
                        <h4>${title} <span style="font-size:11px;color:var(--accent-purple);font-weight:bold;margin-left:5px;">${company}</span></h4>
                        <a href="${website}" target="_blank" class="lead-website">
                            <i class="fa-solid fa-link"></i> Profile
                        </a>
                    </div>
                    <p class="lead-desc">${description}</p>
                    <div class="lead-contact-info" style="margin-top:10px; font-size:11px; display:flex; flex-direction:column; gap:4px; opacity:0.85;">
                        <span style="display:flex; align-items:center; gap:6px;"><i class="fa-solid fa-envelope" style="color:var(--accent-blue); width: 14px;"></i> ${email}</span>
                        <span style="display:flex; align-items:center; gap:6px;"><i class="fa-solid fa-phone" style="color:var(--accent-blue); width: 14px;"></i> ${lead.Phone || "N/A"}</span>
                    </div>
                </div>
                <div class="lead-actions" style="margin-top: 15px;">
                    <a href="${website}" target="_blank" class="action-btn call-btn" style="text-decoration:none;">
                        <i class="fa-solid fa-arrow-up-right-from-square"></i> Open Profile
                    </a>
                    <button class="action-btn secondary-btn" onclick="generateMessage('${title}', '${company}', '${email}')">
                        <i class="fa-solid fa-comment-dots"></i> Draft DM
                    </button>
                </div>
            `;
        } else {
            card.innerHTML = `
                <div>
                    <div class="lead-card-header">
                        <h4>${title}</h4>
                        <a href="${website}" target="_blank" class="lead-website">
                            <i class="fa-solid fa-arrow-up-right-from-square"></i> Visit
                        </a>
                    </div>
                    <p class="lead-desc">${description}</p>
                    <div class="lead-contact-info" style="margin-top:10px; font-size:11px; display:flex; flex-direction:column; gap:4px; opacity:0.85;">
                        <span style="display:flex; align-items:center; gap:6px;"><i class="fa-solid fa-envelope" style="color:var(--accent-blue); width: 14px;"></i> ${email}</span>
                        <span style="display:flex; align-items:center; gap:6px;"><i class="fa-solid fa-phone" style="color:var(--accent-blue); width: 14px;"></i> ${lead.Phone || "N/A"}</span>
                    </div>
                </div>
                <div class="lead-actions" style="margin-top: 15px;">
                    <button class="action-btn call-btn" onclick="triggerCall('${title}', '${company}')">
                        <i class="fa-solid fa-phone"></i> Call Lead
                    </button>
                    <button class="action-btn secondary-btn" onclick="generateMessage('${title}', '${company}', '${email}')">
                        <i class="fa-solid fa-envelope"></i> Draft Email
                    </button>
                </div>
            `;
        }

        return card;
    }

    // Tab Filter Helper
    window.filterLeads = (btn, type) => {
        const parent = btn.parentElement;
        parent.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        const grid = parent.parentElement.nextElementSibling;
        if (grid && grid.classList.contains("leads-grid")) {
            grid.querySelectorAll(".lead-card").forEach(card => {
                const cardType = card.getAttribute("data-type");
                const cardCompany = card.getAttribute("data-company").toLowerCase();
                
                if (type === "all") {
                    card.style.display = "flex";
                } else if (type === "youtube" && cardCompany.includes("youtube")) {
                    card.style.display = "flex";
                } else if (type === "tiktok" && cardCompany.includes("tiktok")) {
                    card.style.display = "flex";
                } else if (type === "client" && cardType === "Business Client") {
                    card.style.display = "flex";
                } else {
                    card.style.display = "none";
                }
            });
        }
    };

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
            
            // Create link span
            const linkSpan = document.createElement("span");
            linkSpan.className = "history-item-link";
            linkSpan.innerHTML = `<i class="fa-solid fa-magnifying-glass"></i> ${session.title}`;
            linkSpan.addEventListener("click", () => {
                loadSession(session.id);
                // Collapse sidebar on mobile
                if (window.innerWidth <= 768 && sidebar) {
                    sidebar.classList.remove("open");
                }
            });

            // Create delete button
            const deleteBtn = document.createElement("button");
            deleteBtn.className = "delete-session-btn";
            deleteBtn.innerHTML = `<i class="fa-solid fa-trash-can"></i>`;
            deleteBtn.addEventListener("click", (e) => deleteSession(e, session.id));

            li.appendChild(linkSpan);
            li.appendChild(deleteBtn);
            chatHistoryList.appendChild(li);
        });
    }

    // Delete Session handler (deletes local scan history)
    window.deleteSession = (event, sessionId) => {
        event.stopPropagation();
        
        if (!confirm("Are you sure you want to delete this scan history from your computer?")) {
            return;
        }

        sessions = sessions.filter(s => s.id !== sessionId);
        saveSessionsToStorage();

        if (currentSessionId === sessionId) {
            currentSessionId = null;
            clearChatArea();
            welcomeScreen.style.display = "block";
        }

        renderSessionsSidebar();
    };

    // Load messages from a session into the chat area
    function loadSession(sessionId) {
        currentSessionId = sessionId;
        clearChatArea();
        welcomeScreen.style.display = "none";
        
        const session = sessions.find(s => s.id === sessionId);
        if (session && session.messages) {
            session.messages.forEach(msg => {
                appendMessage(msg.text, msg.sender, false, msg.leads, msg.query);
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
    const sendOutboxBtn = document.getElementById("send-outbox-btn");

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

    // Send Outbox Button Handler
    sendOutboxBtn.addEventListener("click", async () => {
        const email = document.getElementById("modal-to-email").value;
        const subject = document.getElementById("modal-subject").value;
        const body = emailDraftText.value;

        if (!email || email === "N/A" || email.includes("Social DM")) {
            alert("This lead requires a social DM (like TikTok/Instagram). Please copy the message and send it directly.");
            return;
        }

        sendOutboxBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Deploying...`;

        try {
            const res = await fetch("/api/send-email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, subject, body })
            });

            const data = await res.json();
            if (res.ok && data.success) {
                alert(data.message);
                emailModal.classList.remove("show");
            } else {
                alert("Failed to deploy outbox message: " + (data.error || "Unknown error"));
            }
        } catch (error) {
            alert("Error sending message via outbox.");
            console.error(error);
        } finally {
            sendOutboxBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Send Outbox`;
        }
    });

    // Global Action: Generate Message Draft
    window.generateMessage = async (name, company, email) => {
        // Reset modal headers for draft email mode
        document.querySelector("#email-modal h2").innerHTML = `<i class="fa-solid fa-envelope-open-text text-blue"></i> Personalized Email Draft`;
        document.getElementById("modal-to-email").value = email || "N/A";
        document.getElementById("modal-subject").value = `Partnership / Collaboration Inquiry with Britsync`;
        
        emailDraftText.value = "Drafting personalized message for you...";
        emailModal.classList.add("show");

        try {
            const res = await fetch("/api/generate-message", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: name,
                    company: company,
                    use_modal_gpu: true // Force Modal GPU 70B model to write response
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

    // Global Action: Bulk Modal GPU Campaign Analyzer
    window.analyzeLeadsCampaign = async (leads, query) => {
        if (!leads || leads.length === 0) {
            alert("No leads found in this scan to analyze!");
            return;
        }

        const productDescription = prompt("Briefly describe the product/offer for this campaign:", query || "our products");
        if (!productDescription) return;

        // Customize modal headers for Campaign report mode
        document.querySelector("#email-modal h2").innerHTML = `<i class="fa-solid fa-brain text-purple"></i> Modal GPU Campaign Strategy`;
        document.getElementById("modal-to-email").value = "All Cohort Leads";
        document.getElementById("modal-subject").value = `Strategic Campaign Plan: ${productDescription}`;

        emailDraftText.value = "Your custom Modal GPU 70B is analyzing the scanned leads cohort. Writing strategy, please wait...";
        emailModal.classList.add("show");

        try {
            const res = await fetch("/api/analyze-campaign", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    leads: leads,
                    product_description: productDescription
                })
            });

            const data = await res.json();
            if (res.ok && data.analysis) {
                emailDraftText.value = data.analysis;
            } else {
                emailDraftText.value = "Failed to generate campaign strategy: " + (data.error || "Unknown error");
            }
        } catch (error) {
            emailDraftText.value = "Error connecting to Modal GPU Campaign Analyzer.";
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
