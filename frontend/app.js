// ============================================================
// COMPETITIVE INTELLIGENCE — app.js
// Connects frontend to backend API at http://localhost:3001
// ============================================================

var app = (function() {
    'use strict';

    const API_BASE = 'http://localhost:3001';

    async function callApi(url, method = 'GET', body = null) {
        const options = {
            method,
            headers: { 'Content-Type': 'application/json' }
        };
        if (body) options.body = JSON.stringify(body);
        const res = await fetch(url, options);
        return res.json();
    }

    function showPage(pageId) {
        console.log("Switching to page:", pageId);

        // Hide all pages using Tailwind's hidden class
        document.querySelectorAll('.page').forEach(p => {
            p.classList.add('hidden');
            p.classList.remove('active');
        });
        
        // Show target page
        const target = document.getElementById(pageId);
        if (target) {
            target.classList.remove('hidden');
            target.classList.add('active');
            window.scrollTo(0, 0);
            
            // Context-aware data refreshing
            if (pageId === 'dashboardPage') updateDashboard();
        } else {
            console.error("Critical: Page ID not found in DOM:", pageId);
        }

        // Update sidebar active state
        document.querySelectorAll('.sidebar-item').forEach(link => {
            if (link.getAttribute('data-page') === pageId) {
                link.classList.add('active', 'bg-slate-100', 'text-slate-900', 'font-bold');
                link.classList.remove('text-slate-600', 'font-semibold');
            } else {
                link.classList.remove('active', 'bg-slate-100', 'text-slate-900', 'font-bold');
                link.classList.add('text-slate-600', 'font-semibold');
            }
        });
    }

    function addUserMessage(text) {
        const thread = document.getElementById('chatThread');
        const emptyState = document.getElementById('chatEmptyState');
        if (!thread) return;

        thread.classList.remove('hidden');
        if (emptyState) emptyState.classList.add('hidden');

        const msg = document.createElement('div');
        msg.className = 'flex justify-end mb-6';
        msg.innerHTML = `
            <div class="bg-blue-600 text-white p-4 px-6 rounded-2xl rounded-tr-sm shadow-md max-w-[80%]">
                <p class="text-sm font-medium leading-relaxed">${escapeHtml(text)}</p>
            </div>`;
        thread.appendChild(msg);
        scrollChatToBottom();
    }

    function addBotMessage(text) {
        const thread = document.getElementById('chatThread');
        if (!thread) return;

        const msg = document.createElement('div');
        msg.className = 'flex justify-start mb-6';
        
        const cleanText = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

        msg.innerHTML = `
            <div class="bg-white text-slate-900 p-5 px-6 rounded-2xl rounded-tl-sm shadow-sm border border-slate-100 max-w-[90%]">
                <p class="text-sm leading-relaxed whitespace-pre-wrap">${escapeHtml(cleanText)}</p>
            </div>`;
        thread.appendChild(msg);
        scrollChatToBottom();
    }

    function showLoadingMessage() {
        const thread = document.getElementById('chatThread');
        if (!thread) return null;

        const loader = document.createElement('div');
        loader.id = 'chatLoader';
        loader.className = 'flex justify-start mb-6';
        loader.innerHTML = `
            <div class="bg-slate-100 p-4 px-6 rounded-2xl flex items-center gap-4">
                <div class="flex gap-1.5">
                    <div class="w-2 h-2 rounded-full bg-blue-600 animate-bounce" style="animation-delay: 0ms"></div>
                    <div class="w-2 h-2 rounded-full bg-blue-600 animate-bounce" style="animation-delay: 150ms"></div>
                    <div class="w-2 h-2 rounded-full bg-blue-600 animate-bounce" style="animation-delay: 300ms"></div>
                </div>
                <span class="text-[10px] font-bold tracking-widest text-slate-500 uppercase">Analyzing Intelligence...</span>
            </div>`;
        thread.appendChild(loader);
        scrollChatToBottom();
        return loader;
    }

    function removeLoadingMessage() {
        const loader = document.getElementById('chatLoader');
        if (loader) loader.remove();
    }

    function scrollChatToBottom() {
        const messagesContainer = document.getElementById('chatMessages');
        if (messagesContainer) {
            messagesContainer.scrollTo({
                top: messagesContainer.scrollHeight,
                behavior: 'smooth'
            });
        }
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    async function updateDashboard() {
        console.log("[Dashboard] Refreshing...");
        try {
            const stats = await callApi(`${API_BASE}/analytics/stats`);
            document.getElementById('totalSignalsCount').textContent = stats.total_signals || 0;
            document.getElementById('activeCompetitorsCount').textContent = stats.active_competitors || 0;
            document.getElementById('patternsDetectedCount').textContent = stats.patterns_detected || 0;
            
            await fetchSignals('dashboardSignalsTableBody', 10);
        } catch (err) {
            console.warn("[Dashboard] Refresh failed", err);
        }
    }

    async function fetchSignals(containerId, limit = 10) {
        const container = document.getElementById(containerId);
        if (!container) return;

        try {
            const data = await callApi(`${API_BASE}/signals?limit=${limit}`);
            if (data.signals && data.signals.length > 0) {
                container.innerHTML = data.signals.map(s => {
                    const date = s.event_date === 'unknown' ? 'N/A' : new Date(s.event_date).toLocaleDateString();
                    const score = s.score || 0;
                    return `
                        <tr class="hover:bg-slate-50 transition-colors group">
                            <td class="px-6 py-4">
                                <div class="flex items-center gap-3">
                                    <div class="w-8 h-8 rounded-lg bg-blue-600 text-[10px] flex items-center justify-center text-white font-bold">
                                        ${escapeHtml(String(s.competitor_name).slice(0, 2).toUpperCase())}
                                    </div>
                                    <span class="font-bold text-slate-900">${escapeHtml(s.competitor_name)}</span>
                                </div>
                            </td>
                            <td class="px-6 py-4">
                                <span class="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-bold capitalize">${escapeHtml(s.signal_type)}</span>
                            </td>
                            <td class="px-6 py-4 text-sm text-slate-500 font-medium">${date}</td>
                            <td class="px-6 py-4 text-sm text-slate-900 leading-snug max-w-xs truncate">${escapeHtml(s.summary)}</td>
                            <td class="px-6 py-4">
                                <div class="flex items-center gap-1">
                                    <div class="w-2 h-2 rounded-full ${score > 0.7 ? 'bg-red-500' : 'bg-blue-500'}"></div>
                                    <span class="text-xs font-bold uppercase">${score > 0.7 ? 'High Impact' : 'Relevant'}</span>
                                </div>
                            </td>
                        </tr>
                    `;
                }).join('');
            } else {
                container.innerHTML = `<tr><td colspan="5" class="p-20 text-center text-slate-400 italic">No signals stored yet.</td></tr>`;
            }
        } catch (err) {
            console.error("[Signals] Failed to fetch", err);
        }
    }

    async function sendQuery(event) {
        if (event && event.preventDefault) event.preventDefault();
        
        const input = document.getElementById('chatInput');
        const userInput = input ? input.value.trim() : "";
        if (!userInput) return;

        showPage('chatPage');
        input.value = '';
        
        addUserMessage(userInput);
        showLoadingMessage();

        try {
            const data = await callApi(`${API_BASE}/query`, 'POST', { question: userInput });
            removeLoadingMessage();
            if (data.answer) {
                addBotMessage(data.answer);
            } else {
                addBotMessage("Intelligence error: " + (data.error || 'Unknown server error.'));
            }
        } catch (err) {
            removeLoadingMessage();
            addBotMessage("Sorry, I'm having trouble connecting to the intelligence bank.");
        }
    }

    async function ingestSignal(event) {
        if (event) event.preventDefault();
        
        const textInput       = document.getElementById('ingestText');
        const competitorInput = document.getElementById('ingestCompetitor');
        const storeBtn        = document.getElementById('ingestStoreBtn');

        if (!textInput.value.trim()) return alert("Please specify intelligence content.");

        storeBtn.disabled = true;
        storeBtn.textContent = 'Ingesting...';

        try {
            const response = await fetch(`${API_BASE}/ingest`, {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({ 
                    text: textInput.value.trim(), 
                    competitor_name: competitorInput.value.trim() || "Market General" 
                })
            });

            if (response.ok) {
                alert("Signal committed to intelligence bank.");
                textInput.value = '';
                competitorInput.value = '';
                updateDashboard();
            } else {
                alert("Commit failed.");
            }
        } catch (err) { alert("Bridge error."); }
        finally {
            storeBtn.disabled = false;
            storeBtn.textContent = 'Store Signal';
        }
    }

    async function seedData() {
        const btn = document.getElementById('seedBtn');
        if (btn) btn.innerHTML = 'Syncing...';
        try {
            const res = await callApi(`${API_BASE}/seed`, 'POST');
            alert(`Intelligence network synced.`);
            updateDashboard();
        } catch (err) { alert("Sync failed."); }
        finally { if (btn) btn.innerHTML = 'Load Demo Data'; }
    }

    return {
        showPage,
        sendQuery,
        ingestSignal,
        seedData,
        init: function() {
            console.log("CI AGENT INITIALIZING...");
            showPage("dashboardPage");

            const chatSendBtn = document.getElementById('chatSendBtn');
            if (chatSendBtn) chatSendBtn.onclick = sendQuery;

            const ingestStoreBtn = document.getElementById('ingestStoreBtn');
            if (ingestStoreBtn) ingestStoreBtn.onclick = ingestSignal;

            const seedBtn = document.getElementById('seedBtn');
            if (seedBtn) seedBtn.onclick = seedData;

            const chatInput = document.getElementById('chatInput');
            if (chatInput) {
                chatInput.onkeydown = (e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        sendQuery();
                    }
                };
            }

            const searchInput = document.getElementById('headerSearchInput');
            if (searchInput) {
                searchInput.onkeydown = (e) => {
                    if (e.key === 'Enter') {
                        const query = searchInput.value.trim();
                        if (query) {
                            const chatInput = document.getElementById('chatInput');
                            if (chatInput) chatInput.value = query;
                            sendQuery();
                            searchInput.value = '';
                        }
                    }
                };
            }

            // Navigation listener fallback
            document.querySelectorAll('.sidebar-item').forEach(link => {
                link.addEventListener('click', (e) => {
                    const pageId = link.getAttribute('data-page');
                    if (pageId) {
                        e.preventDefault();
                        showPage(pageId);
                    }
                });
            });

            console.log("SYSTEM ACTIVE.");
        }
    };
})();

// Global Redirects for HTML onclick attributes
function showPage(id)    { app.showPage(id); }
function sendQuery()     { app.sendQuery(); }
function ingestSignal()  { app.ingestSignal(); }
function seedData()      { app.seedData(); }

document.addEventListener('DOMContentLoaded', app.init);
