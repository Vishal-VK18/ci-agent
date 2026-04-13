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
        console.log("Page switch triggered:", pageId);

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
        const thread = document.getElementById('chatMessages');
        const emptyState = document.getElementById('chat-welcome');
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

    function addBotMessage(text, signalsCount = null) {
        const thread = document.getElementById('chatMessages');
        if (!thread) return;

        const msg = document.createElement('div');
        msg.className = 'flex justify-start mb-6';
        
        const cleanText = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

        const countHtml = signalsCount !== null 
            ? `<div class="mt-3 text-[10px] font-bold text-slate-400 tracking-wider uppercase border-t border-slate-100 pt-3 flex items-center gap-1.5"><span class="material-symbols-outlined text-[14px]">database</span> Recalled from ${signalsCount} intelligence signals</div>` 
            : '';

        msg.innerHTML = `
            <div class="bg-white text-slate-900 p-5 px-6 rounded-2xl rounded-tl-sm shadow-sm border border-slate-100 max-w-[90%] flex flex-col">
                <p class="text-sm leading-relaxed whitespace-pre-wrap">${escapeHtml(cleanText)}</p>
                ${countHtml}
            </div>`;
        thread.appendChild(msg);
        scrollChatToBottom();
    }

    function showLoadingMessage() {
        const thread = document.getElementById('chatMessages');
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
            document.getElementById('stat-total-signals').textContent = stats.total_signals || 0;
            document.getElementById('stat-active-competitors').textContent = stats.active_competitors || 0;
            document.getElementById('stat-patterns').textContent = stats.patterns_detected || 0;
            
            const timelineRes = await callApi(`${API_BASE}/analytics/timeline`);
            const tContainer = document.getElementById('dashboardTimelineList');
            if (tContainer && timelineRes.timeline) {
                if (timelineRes.timeline.length === 0) {
                    tContainer.innerHTML = '<p class="text-outline font-medium text-sm text-center py-10">No intelligence signals available yet</p>';
                } else {
                    tContainer.innerHTML = timelineRes.timeline.map(t => `
                        <div class="bg-surface-container-lowest p-4 rounded-lg border border-slate-100 shadow-sm flex flex-col gap-2 relative">
                             <div class="flex justify-between items-start">
                                 <div class="flex items-center gap-2">
                                     <span class="px-2 py-1 bg-surface-container-low text-[10px] font-bold text-slate-600 rounded-md uppercase">${escapeHtml(t.type || 'intelligence')}</span>
                                     <span class="font-bold text-sm text-slate-900">${escapeHtml(t.competitor || 'Unknown')}</span>
                                 </div>
                                 <span class="text-[10px] text-slate-400 font-medium">${new Date(t.date || Date.now()).toLocaleDateString()}</span>
                             </div>
                             <p class="text-sm text-slate-600 leading-snug">${escapeHtml(t.description || t.title || '')}</p>
                        </div>
                    `).join('');
                }
            }

            const patternsRes = await callApi(`${API_BASE}/analytics/patterns`);
            const pContainer = document.getElementById('dashboardPatternAlerts');
            if (pContainer && patternsRes.patterns) {
                if (patternsRes.patterns.length === 0) {
                     pContainer.innerHTML = '<p class="text-outline font-medium text-sm text-center py-10">No alerts detected</p>';
                } else {
                     pContainer.innerHTML = patternsRes.patterns.map(p => `
                        <div class="p-4 bg-red-50 rounded-xl border border-red-100 flex flex-col gap-2">
                             <div class="flex items-center justify-between">
                                 <strong class="text-red-900 text-sm font-headline">${escapeHtml(p.name)}</strong>
                                 <span class="text-[10px] bg-red-200 text-red-800 px-2 py-1 rounded-full font-bold">${escapeHtml(p.confidence || 'Medium')}</span>
                             </div>
                             <p class="text-xs text-red-800 leading-relaxed">${escapeHtml((p.evidence || []).join(" "))}</p>
                        </div>
                     `).join('');
                }
            }
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
        if (event && event.stopPropagation) event.stopPropagation();
        
        console.log("Chat submit triggered");
        showPage('chatPage');
        
        const input = document.getElementById('chatInput');
        const userInput = input ? input.value.trim() : "";
        if (!userInput) return;

        input.value = '';
        
        addUserMessage(userInput);
        showLoadingMessage();

        try {
            const data = await callApi(`${API_BASE}/query`, 'POST', { question: userInput });
            removeLoadingMessage();
            if (data.answer) {
                addBotMessage(data.answer, data.signals_used);
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

        if (!textInput.value.trim()) return alert("Please specify intelligence content.");

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

    async function checkHealth() {
        try {
            const res = await callApi(`${API_BASE}/health`);
            const groqSpan = document.getElementById('health-groq');
            const hindsightSpan = document.getElementById('health-hindsight');
            
            if (groqSpan) {
                if (res.groq === 'online') {
                    groqSpan.className = 'material-symbols-outlined text-green-500';
                    groqSpan.textContent = 'check_circle';
                } else {
                    groqSpan.className = 'material-symbols-outlined text-red-500';
                    groqSpan.textContent = 'error';
                }
            }
            if (hindsightSpan) {
                if (res.hindsight === 'connected') {
                    hindsightSpan.className = 'material-symbols-outlined text-green-500';
                    hindsightSpan.textContent = 'check_circle';
                } else {
                    hindsightSpan.className = 'material-symbols-outlined text-red-500';
                    hindsightSpan.textContent = 'error';
                }
            }
        } catch (err) {
            console.warn("Health check failed");
        }
    }

    return {
        showPage,
        sendQuery,
        ingestSignal,
        seedData,
        init: function() {
            showPage("dashboardPage");
            checkHealth();

            const chatSendBtn = document.getElementById('chatSendBtn');
            if (chatSendBtn) chatSendBtn.onclick = sendQuery;

            const ingestStoreBtn = document.getElementById('ingestStoreBtn');
            if (ingestStoreBtn) ingestStoreBtn.onclick = ingestSignal;

            const seedBtn = document.getElementById('seedBtn');
            if (seedBtn) seedBtn.onclick = seedData;

            const chatInput = document.getElementById('chatInput');
            if (chatInput) {
                chatInput.onkeydown = (e) => {
                    // Only trigger on Enter without shift key to allow newlines if it were a textarea, though it's an input
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        sendQuery(e);
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
        }
    };
})();

// Global Redirects for HTML onclick attributes
function showPage(id)    { app.showPage(id); }
function sendQuery(e)    { app.sendQuery(e); }
function ingestSignal(e) { app.ingestSignal(e); }
function seedData()      { app.seedData(); }

document.addEventListener('DOMContentLoaded', app.init);
