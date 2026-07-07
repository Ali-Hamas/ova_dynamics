// Britsync AI Outreach Copilot - Frontend Logic with LocalStorage Chat History, Advanced Campaigns & Sent History

document.addEventListener("DOMContentLoaded", () => {
    const chatForm = document.getElementById("chat-form");
    const userInput = document.getElementById("user-input");
    const messagesContainer = document.getElementById("messages-container");
    const welcomeScreen = document.getElementById("welcome-screen");
    const newChatBtn = document.getElementById("new-chat-btn");
    const chatHistoryList = document.getElementById("chat-history");
    const sentHistoryList = document.getElementById("sent-history-list");

    // Bulk Panel Elements
    const bulkOutreachNavBtn = document.getElementById("bulk-outreach-nav-btn");
    const chatPanel = document.getElementById("chat-panel");
    const bulkPanel = document.getElementById("bulk-panel");
    const panelTitleHeader = document.getElementById("panel-title-header");
    const bulkLeadsTbody = document.getElementById("bulk-leads-tbody");
    const selectAllBulk = document.getElementById("select-all-bulk");
    const runBulkBtn = document.getElementById("run-bulk-btn");
    const bulkProgressContainer = document.getElementById("bulk-progress-container");
    const bulkProgressStatus = document.getElementById("bulk-progress-status");
    const bulkProgressPercent = document.getElementById("bulk-progress-percent");
    const bulkProgressBar = document.getElementById("bulk-progress-bar");

    let sessions = JSON.parse(localStorage.getItem("britsync_sessions") || "[]");
    let sentMessages = JSON.parse(localStorage.getItem("britsync_sent") || "[]");
    let currentSessionId = null;

    // Load sessions and sent messages on startup
    renderSessionsSidebar();
    renderSentHistorySidebar();

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

    // Navigation: Switch to Bulk Outreach Screen
    bulkOutreachNavBtn.addEventListener("click", () => {
        currentSessionId = null;
        chatHistoryList.querySelectorAll("li").forEach(li => li.classList.remove("active"));
        bulkOutreachNavBtn.classList.add("active");
        
        // Toggle Panels
        chatPanel.style.display = "none";
        bulkPanel.style.display = "flex";
        panelTitleHeader.textContent = "Bulk Campaign Manager";

        // Render Directory
        renderBulkLeadsTable();

        // Close sidebar on mobile
        if (window.innerWidth <= 768 && sidebar) {
            sidebar.classList.remove("open");
        }
    });

    // Select/Deselect All Bulk Checkboxes
    if (selectAllBulk) {
        selectAllBulk.addEventListener("change", () => {
            const checkboxes = bulkLeadsTbody.querySelectorAll(".bulk-lead-checkbox");
            checkboxes.forEach(cb => cb.checked = selectAllBulk.checked);
        });
    }

    // Run Bulk Outreach Campaign (Async Loop)
    if (runBulkBtn) {
        runBulkBtn.addEventListener("click", async () => {
            const checkedBoxes = bulkLeadsTbody.querySelectorAll(".bulk-lead-checkbox:checked");
            const productDesc = document.getElementById("bulk-product").value.trim();
            const limitVal = parseInt(document.getElementById("bulk-limit").value) || 5;

            if (checkedBoxes.length === 0) {
                alert("Please select at least one lead from the directory list!");
                return;
            }

            if (!productDesc) {
                alert("Please write a campaign pitch or product description first!");
                return;
            }

            // Gathers selected queue limited by batch size
            const queue = [];
            checkedBoxes.forEach((cb, idx) => {
                if (idx < limitVal) {
                    queue.push({
                        name: cb.getAttribute("data-name"),
                        company: cb.getAttribute("data-company"),
                        email: cb.getAttribute("data-email")
                    });
                }
            });

            if (!confirm(`Launch automated email campaign targeting ${queue.length} leads now?`)) {
                return;
            }

            // Start Progress UI
            runBulkBtn.disabled = true;
            runBulkBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Campaign Active...`;
            bulkProgressContainer.style.display = "flex";
            
            let successCount = 0;
            const total = queue.length;

            for (let i = 0; i < total; i++) {
                const lead = queue[i];
                const percent = Math.round(((i) / total) * 100);
                
                bulkProgressStatus.textContent = `[${i+1}/${total}] Drafting email for ${lead.name} (${lead.email}) via Modal GPU...`;
                bulkProgressPercent.textContent = `${percent}%`;
                bulkProgressBar.style.width = `${percent}%`;

                try {
                    // 1. Generate message using Modal GPU
                    const genRes = await fetch("/api/generate-message", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            name: lead.name,
                            company: lead.company,
                            use_modal_gpu: true
                        })
                    });
                    const genData = await genRes.json();
                    const emailBody = genRes.ok && genData.message ? genData.message : `Hello ${lead.name}, I wanted to reach out regarding our ${productDesc}. Let me know if you have 5 minutes.`;

                    // 2. Deploy email via SMTP
                    bulkProgressStatus.textContent = `[${i+1}/${total}] Sending email to ${lead.email} via SMTP...`;
                    const sendRes = await fetch("/api/send-email", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            email: lead.email,
                            subject: `Collaboration Inquiry regarding ${productDesc.substring(0, 30)}...`,
                            body: emailBody
                        })
                    });
                    const sendData = await sendRes.json();

                    if (sendRes.ok && sendData.success) {
                        successCount++;
                        // Archive in Sent Messages log
                        sentMessages.unshift({
                            id: "sent_" + Date.now() + "_" + i,
                            email: lead.email,
                            subject: `Collaboration Inquiry regarding ${productDesc.substring(0, 30)}...`,
                            body: emailBody,
                            timestamp: new Date().toLocaleString()
                        });
                        localStorage.setItem("britsync_sent", JSON.stringify(sentMessages));
                        renderSentHistorySidebar();
                    }

                } catch (error) {
                    console.error("Outreach campaign step error:", error);
                }

                // Delay 2 seconds between emails to prevent SMTP limits
                await new Promise(r => setTimeout(r, 2000));
            }

            // Finish Progress UI
            bulkProgressStatus.textContent = `Campaign Completed! ${successCount} of ${total} emails sent successfully.`;
            bulkProgressPercent.textContent = `100%`;
            bulkProgressBar.style.width = `100%`;
            runBulkBtn.disabled = false;
            runBulkBtn.innerHTML = `<i class="fa-solid fa-rocket"></i> Start Automated Campaign`;

            alert(`Campaign finished! ${successCount} emails successfully sent and archived in your outbox logs.`);
        });
    }

    // Gathers and displays all unique leads scraped across all chat sessions
    function renderBulkLeadsTable() {
        bulkLeadsTbody.innerHTML = "";
        let allLeads = [];

        sessions.forEach(session => {
            if (session.messages) {
                session.messages.forEach(msg => {
                    if (msg.leads) {
                        msg.leads.forEach(lead => {
                            // Check for duplicates
                            if (!allLeads.find(l => l.Website === lead.Website)) {
                                allLeads.push(lead);
                            }
                        });
                    }
                });
            }
        });

        if (allLeads.length === 0) {
            bulkLeadsTbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px; color: var(--text-secondary);">No target leads scraped yet. Go back to chat and run a scan!</td></tr>`;
            return;
        }

        allLeads.forEach(lead => {
            const tr = document.createElement("tr");
            tr.style.borderBottom = "1px solid var(--border-color)";

            const email = lead.Email || "N/A (Social DM Only)";
            const canEmail = email !== "N/A (Social DM Only)" && !email.includes("Social DM");

            tr.innerHTML = `
                <td style="padding: 10px 8px;">
                    <input type="checkbox" class="bulk-lead-checkbox" 
                        data-name="${lead.Name}" 
                        data-company="${lead.Company}" 
                        data-email="${email}" 
                        ${canEmail ? "checked" : "disabled"}>
                </td>
                <td style="padding: 10px 8px; font-weight: 500; color: white;">${lead.Name}</td>
                <td style="padding: 10px 8px;">${lead.Company}</td>
                <td style="padding: 10px 8px; color: var(--accent-blue);">${email}</td>
                <td style="padding: 10px 8px;">
                    <span class="badge" style="background: rgba(168, 85, 247, 0.15); color: var(--accent-purple); border-radius: 4px; padding: 2px 8px;">${lead.Type}</span>
                </td>
            `;
            bulkLeadsTbody.appendChild(tr);
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
        
        // Reset panels
        chatPanel.style.display = "flex";
        bulkPanel.style.display = "none";
        panelTitleHeader.textContent = "Outreach Copilot";
        bulkOutreachNavBtn.classList.remove("active");

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

    // Load sent outbox messages and render in the sidebar Sent messages list
    function renderSentHistorySidebar() {
        sentHistoryList.innerHTML = "";
        
        if (sentMessages.length === 0) {
            sentHistoryList.innerHTML = `<li class="no-scans-text" style="font-size: 12px; color: var(--text-secondary); text-align: center; padding: 10px;">No sent messages.</li>`;
            return;
        }

        sentMessages.forEach(msg => {
            const li = document.createElement("li");
            li.style = "display: flex; justify-content: space-between; align-items: center;";
            
            const linkSpan = document.createElement("span");
            linkSpan.className = "history-item-link";
            linkSpan.innerHTML = `<i class="fa-solid fa-paper-plane" style="color: var(--accent-purple); font-size: 11px;"></i> to: ${msg.email}`;
            linkSpan.style.cursor = "pointer";
            linkSpan.addEventListener("click", () => {
                viewSentMessage(msg.id);
                if (window.innerWidth <= 768 && sidebar) {
                    sidebar.classList.remove("open");
                }
            });

            const deleteBtn = document.createElement("button");
            deleteBtn.className = "delete-sent-btn";
            deleteBtn.innerHTML = `<i class="fa-solid fa-trash-can"></i>`;
            deleteBtn.addEventListener("click", (e) => deleteSentMessage(e, msg.id));

            li.appendChild(linkSpan);
            li.appendChild(deleteBtn);
            sentHistoryList.appendChild(li);
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

    // Delete Sent Message handler
    window.deleteSentMessage = (event, msgId) => {
        event.stopPropagation();
        
        if (!confirm("Are you sure you want to delete this outbox archive?")) {
            return;
        }

        sentMessages = sentMessages.filter(m => m.id !== msgId);
        localStorage.setItem("britsync_sent", JSON.stringify(sentMessages));
        renderSentHistorySidebar();
    };

    // Load messages from a session into the chat area
    function loadSession(sessionId) {
        currentSessionId = sessionId;
        clearChatArea();
        welcomeScreen.style.display = "none";
        
        // Reset panels
        chatPanel.style.display = "flex";
        bulkPanel.style.display = "none";
        panelTitleHeader.textContent = "Outreach Copilot";
        bulkOutreachNavBtn.classList.remove("active");

        const session = sessions.find(s => s.id === sessionId);
        if (session && session.messages) {
            session.messages.forEach(msg => {
                appendMessage(msg.text, msg.sender, false, msg.leads, msg.query);
            });
        }
        
        renderSessionsSidebar();
    }

    // View Sent Message archive details
    function viewSentMessage(msgId) {
        const msg = sentMessages.find(m => m.id === msgId);
        if (!msg) return;

        // Configure Modal for Read-Only archive view
        document.querySelector("#email-modal h2").innerHTML = `<i class="fa-solid fa-paper-plane text-purple"></i> Sent Message Archive`;
        document.getElementById("modal-to-email").value = msg.email;
        document.getElementById("modal-subject").value = msg.subject;
        emailDraftText.value = msg.body;
        
        // Lock inputs so they can't edit sent logs
        document.getElementById("modal-subject").setAttribute("readonly", true);
        emailDraftText.setAttribute("readonly", true);
        
        // Hide Send button
        sendOutboxBtn.style.display = "none";
        emailModal.classList.add("show");
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
                
                // Save to Sent Messages LocalStorage archive
                sentMessages.unshift({
                    id: "sent_" + Date.now(),
                    email: email,
                    subject: subject,
                    body: body,
                    timestamp: new Date().toLocaleString()
                });
                localStorage.setItem("britsync_sent", JSON.stringify(sentMessages));
                renderSentHistorySidebar();
                
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
        // Unlock inputs for writing mode
        document.getElementById("modal-subject").removeAttribute("readonly");
        emailDraftText.removeAttribute("readonly");
        sendOutboxBtn.style.display = "inline-block";

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

        // Unlock modal fields for analysis view (read-only)
        document.getElementById("modal-subject").setAttribute("readonly", true);
        emailDraftText.setAttribute("readonly", true);
        sendOutboxBtn.style.display = "none";

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
