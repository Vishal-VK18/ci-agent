// ============================================================
// COMPETITIVE INTELLIGENCE — app.js
// Connects frontend to backend API at http://localhost:3001
// ============================================================

const API_BASE = "";

// ─────────────────────────────────────────────
// PAGE NAVIGATION
// ─────────────────────────────────────────────

function showPage(pageId) {
    console.log("Switching to:", pageId);

    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });

    const selectedPage = document.getElementById(pageId);
    if (selectedPage) {
        selectedPage.classList.add('active');
        
        // Refresh data based on the page being viewed
        if (pageId === 'dashboardPage') updateDashboard();
        if (pageId === 'signalsPage') fetchSignals();
        if (pageId === 'timelinePage') fetchTimeline();
        if (pageId === 'patternsPage') fetchPatterns();
        if (pageId === 'predictionsPage') fetchPredictions();
    } else {
        console.error("Page not found:", pageId);
    }

    document.querySelectorAll('.sidebar-item').forEach(item => {
        item.classList.remove('active');
    });

    const activeNav = document.querySelector('[data-page="' + pageId + '"]');
    if (activeNav) {
        activeNav.classList.add('active');
    }
}

// ─────────────────────────────────────────────
// CHAT UI HELPERS
// ─────────────────────────────────────────────

function addUserMessage(text) {
    const thread = document.getElementById('chatThread');
    const emptyState = document.getElementById('chatEmptyState');
    if (!thread) return;

    // Show thread, hide empty state
    thread.classList.remove('hidden');
    if (emptyState) emptyState.classList.add('hidden');

    const msg = document.createElement('div');
    msg.className = 'flex justify-end pl-24';
    msg.innerHTML = `
        <div class="bg-secondary text-white p-5 rounded-2xl rounded-tr-sm shadow-lg max-w-xl">
            <p class="text-sm leading-relaxed">${escapeHtml(text)}</p>
        </div>`;
    thread.appendChild(msg);
    scrollChatToBottom();
}

function addBotMessage(text) {
    const thread = document.getElementById('chatThread');
    if (!thread) return;

    const msg = document.createElement('div');
    msg.className = 'flex justify-start pr-24';
    
    // STRIP <think> tags for clean display
    const cleanText = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

    msg.innerHTML = `
        <div class="bg-surface-variant text-on-surface p-6 rounded-2xl rounded-tl-sm shadow-sm border-l-4 border-primary/10 max-w-2xl">
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
    loader.className = 'flex justify-start';
    loader.innerHTML = `
        <div class="bg-surface-variant/50 p-4 rounded-2xl flex items-center gap-4">
            <div class="flex gap-1.5">
                <div class="w-1.5 h-1.5 rounded-full bg-secondary animate-bounce" style="animation-delay: 0ms"></div>
                <div class="w-1.5 h-1.5 rounded-full bg-secondary animate-bounce" style="animation-delay: 150ms"></div>
                <div class="w-1.5 h-1.5 rounded-full bg-secondary animate-bounce" style="animation-delay: 300ms"></div>
            </div>
            <span class="text-[10px] font-bold tracking-widest text-secondary uppercase">Analyzing Signal Clusters...</span>
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
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
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

// ─────────────────────────────────────────────
// DATA FETCHING & DYNAMIC RENDERING
// ─────────────────────────────────────────────

async function updateDashboard() {
    console.log("[Dashboard] Refreshing...");
    await fetchDashboardStats();
    await fetchSignals('dashboardSignalsTableBody', 5);
}

async function fetchDashboardStats() {
    try {
        const res = await fetch(`${API_BASE}/analytics/stats`);
        const data = await res.json();
        
        document.getElementById('totalSignalsCount').textContent = data.total_signals || 0;
        document.getElementById('activeCompetitorsCount').textContent = data.active_competitors || 0;
        document.getElementById('patternsDetectedCount').textContent = data.patterns_detected || 0;
        
        renderActivityChart(data.activity || {});
    } catch (err) {
        console.warn("[Stats] Empty or offline");
    }
}

function renderActivityChart(activityData) {
    const container = document.getElementById('activityChartArea');
    const emptyState = document.getElementById('dashboardEmptyState');
    if (!container || !emptyState) return;

    const dates = Object.keys(activityData).sort().slice(-8);
    
    if (dates.length === 0) {
        container.classList.add('hidden');
        emptyState.classList.remove('hidden');
        return;
    }

    container.classList.remove('hidden');
    emptyState.classList.add('hidden');

    const maxVal = Math.max(...Object.values(activityData), 5);
    let html = `<div class="absolute inset-0 flex items-end justify-between px-4 pb-8 h-full">`;
    
    dates.forEach(date => {
        const val = activityData[date] || 0;
        const heightPercent = (val / maxVal) * 80;
        html += `
            <div class="flex flex-col items-center gap-2 group w-12">
                <div class="w-4 bg-secondary rounded-t-lg transition-all duration-500 hover:bg-primary relative" style="height: ${heightPercent}%">
                    <div class="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">${val} signals</div>
                </div>
                <span class="text-[9px] font-bold text-slate-400 rotate-45 mt-2">${date.slice(5)}</span>
            </div>
        `;
    });
    
    html += `</div>`;
    
    const existingBars = container.querySelector('.dynamic-bars');
    if (existingBars) existingBars.remove();
    
    const div = document.createElement('div');
    div.className = 'dynamic-bars absolute inset-0';
    div.innerHTML = html;
    container.appendChild(div);
}

async function fetchSignals(containerId = 'signalsTableBody', limit = 20) {
    const container = document.getElementById(containerId);
    if (!container) return;

    try {
        const res = await fetch(`${API_BASE}/signals?limit=${limit}`);
        const data = await res.json();

        if (data.signals && data.signals.length > 0) {
            container.innerHTML = data.signals.map(s => {
                const date = s.event_date === 'unknown' ? 'N/A' : new Date(s.event_date).toLocaleDateString();
                const score = s.score || 0;
                return `
                    <tr class="hover:bg-surface-container-low transition-colors group">
                        <td class="px-6 py-4">
                            <div class="flex items-center gap-3">
                                <div class="w-8 h-8 rounded-lg bg-primary text-[10px] flex items-center justify-center text-white font-bold">
                                    ${escapeHtml(String(s.competitor_name).slice(0, 2).toUpperCase())}
                                </div>
                                <span class="font-bold text-primary">${escapeHtml(s.competitor_name)}</span>
                            </div>
                        </td>
                        <td class="px-6 py-4">
                            <span class="bg-secondary/10 text-secondary px-3 py-1 rounded-full text-xs font-bold capitalize">${escapeHtml(s.signal_type)}</span>
                        </td>
                        <td class="px-6 py-4 text-sm text-on-surface-variant font-medium">${date}</td>
                        <td class="px-6 py-4 text-sm text-on-surface leading-snug max-w-xs truncate">${escapeHtml(s.summary)}</td>
                        <td class="px-6 py-4">
                            <div class="flex items-center gap-1">
                                <div class="w-2 h-2 rounded-full ${score > 0.7 ? 'bg-error' : 'bg-secondary'}"></div>
                                <span class="text-xs font-bold uppercase">${score > 0.7 ? 'High Impact' : 'Relevant'}</span>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
        } else {
            container.innerHTML = `<tr><td colspan="5" class="p-20 text-center text-on-surface-variant italic">No signals stored yet.</td></tr>`;
        }
    } catch (err) {
        console.error("[Signals] Failed to fetch", err);
    }
}

async function fetchTimeline() {
    const container = document.getElementById('timelineContainer');
    if (!container) return;

    try {
        const res = await fetch(`${API_BASE}/analytics/timeline`);
        const data = await res.json();

        if (!data.timeline || data.timeline.length === 0) {
            container.innerHTML = `<div class="p-20 text-center text-secondary font-bold">No timeline events found. Seed data to begin.</div>`;
            return;
        }

        container.innerHTML = data.timeline.map((item, idx) => {
            const isLeft = idx % 2 === 0;
            return `
                <div class="relative flex flex-col md:flex-row items-center justify-between">
                    ${isLeft ? renderTimelineCard(item) : '<div class="w-full md:w-[45%]"></div>'}
                    <div class="absolute left-1/2 top-0 -translate-x-1/2 w-4 h-4 rounded-full bg-secondary border-4 border-surface shadow-md z-10 hidden md:block"></div>
                    ${!isLeft ? renderTimelineCard(item) : '<div class="w-full md:w-[45%]"></div>'}
                </div>
            `;
        }).join('');
    } catch (err) { console.error(err); }
}

function renderTimelineCard(item) {
    return `
        <div class="w-full md:w-[45%] mb-8 md:mb-0">
            <div class="bg-surface-variant p-8 rounded-xl shadow-sm hover:shadow-xl transition-all duration-300 border-none">
                <div class="flex justify-between items-start mb-4">
                    <span class="bg-primary/10 text-primary text-[10px] font-extrabold tracking-widest px-2 py-1 rounded uppercase">${escapeHtml(item.type)}</span>
                    <span class="text-sm font-bold text-on-surface-variant">${new Date(item.date).toLocaleDateString()}</span>
                </div>
                <h3 class="text-xl font-bold text-primary mb-2">${escapeHtml(item.title)}</h3>
                <p class="text-on-surface-variant leading-relaxed text-sm mb-6">${escapeHtml(item.description)}</p>
                <div class="flex items-center gap-3 mt-4 pt-4 border-t border-outline-variant/10">
                    <span class="text-sm font-bold text-primary">${escapeHtml(item.competitor)}</span>
                </div>
            </div>
        </div>
    `;
}

async function fetchPatterns() {
    const grid = document.getElementById('patternsGrid');
    if (!grid) return;

    try {
        const res = await fetch(`${API_BASE}/analytics/patterns`);
        const data = await res.json();

        grid.innerHTML = data.patterns.map(p => `
            <div class="bg-surface-container-highest rounded-xl p-8 flex flex-col transition-all hover:translate-y-[-4px]">
                <div class="flex justify-between items-start mb-6">
                    <div class="bg-secondary/10 p-3 rounded-xl">
                        <span class="material-symbols-outlined text-secondary">analytics</span>
                    </div>
                    <div class="flex flex-col items-end">
                        <span class="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Confidence</span>
                        <span class="text-3xl font-manrope font-black text-primary">${p.confidence}</span>
                    </div>
                </div>
                <h3 class="font-manrope text-2xl font-bold text-primary mb-3">${p.name}</h3>
                <div class="mt-auto space-y-4">
                    <div class="text-xs font-bold uppercase tracking-widest text-on-surface-variant opacity-60">Evidence Signals</div>
                    <ul class="space-y-3">
                        ${p.evidence.map(e => `
                            <li class="flex items-center gap-3 bg-surface-container-low p-3 rounded-lg text-xs font-medium text-on-surface truncate">
                                ${escapeHtml(e)}
                            </li>
                        `).join('')}
                    </ul>
                </div>
            </div>
        `).join('');
    } catch (err) { console.error(err); }
}

async function fetchPredictions() {
    const grid = document.getElementById('predictionsGrid');
    if (!grid) return;

    try {
        const res = await fetch(`${API_BASE}/analytics/predictions`);
        const data = await res.json();

        grid.innerHTML = data.predictions.map(p => `
            <div class="col-span-4 bg-surface-container-highest rounded-3xl p-6 custom-shadow">
                <div class="flex items-center gap-3 mb-6">
                    <div class="w-10 h-10 bg-surface-container-lowest rounded-xl flex items-center justify-center text-primary shadow-sm">
                        <span class="material-symbols-outlined">online_prediction</span>
                    </div>
                    <div>
                        <span class="text-[9px] uppercase tracking-widest text-secondary font-bold">${escapeHtml(p.competitor)}</span>
                        <h4 class="text-lg font-headline font-bold text-primary leading-tight">Strategic Prediction</h4>
                    </div>
                </div>
                <div class="mb-6">
                    <div class="flex items-center gap-3">
                        <div class="h-2 flex-grow bg-surface-container-low rounded-full overflow-hidden">
                            <div class="h-full bg-secondary rounded-full" style="width: ${p.confidence}"></div>
                        </div>
                        <span class="text-xs font-extrabold text-secondary">${p.confidence}</span>
                    </div>
                </div>
                <p class="text-sm text-on-surface-variant leading-relaxed mb-6">${escapeHtml(p.prediction)}</p>
                <div class="flex flex-wrap gap-2">
                    <span class="px-3 py-1 bg-surface-container-lowest text-[10px] font-bold text-primary rounded-full">${escapeHtml(p.impact)}</span>
                </div>
            </div>
        `).join('');
    } catch (err) { console.error(err); }
}

async function exportToCsv() {
    try {
        const res = await fetch(`${API_BASE}/signals?limit=200`);
        const data = await res.json();
        if (!data.signals.length) return alert("Nothing to export.");

        const csv = [
            ["Competitor", "Type", "Date", "Summary"].join(","),
            ...data.signals.map(s => [s.competitor_name, s.signal_type, s.event_date, `"${s.summary.replace(/"/g, '""')}"`].join(","))
        ].join("\n");

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `intelligence_export_${Date.now()}.csv`;
        a.click();
    } catch (err) { console.error(err); }
}

// ─────────────────────────────────────────────
// CORE ACTIONS — QUERY / INGEST / SEED
// ─────────────────────────────────────────────

async function sendQuery(event) {
    if (event && event.preventDefault) event.preventDefault();
    console.log("[Query] Initiated");

    const input = document.getElementById('chatInput');
    if (!input) {
        console.error("[Query] Input element not found");
        return;
    }

    const userInput = input.value.trim();
    if (!userInput) return;

    // Transition to chat page if coming from a FAB or search
    showPage('chatPage');
    
    // Clear input immediately
    input.value = '';
    
    addUserMessage(userInput);
    const loader = showLoadingMessage();

    try {
        const res = await fetch(`${API_BASE}/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question: userInput })
        });
        
        const data = await res.json();
        removeLoadingMessage();
        
        if (data.answer) {
            addBotMessage(data.answer);
        } else {
            addBotMessage("Intelligence error: " + (data.error || 'Unknown server error.'));
        }
    } catch (err) {
        removeLoadingMessage();
        addBotMessage("Sorry, I'm having trouble connecting to the intelligence bank.");
        console.error("[Query] Fetch failed:", err);
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
        const res = await fetch(`${API_BASE}/seed`, { method: "POST" });
        if (res.ok) {
            const data = await res.json();
            alert(`Intelligence network synced: ${data.count} signals.`);
            updateDashboard();
        }
    } catch (err) { alert("Sync failed."); }
    finally { if (btn) btn.innerHTML = 'Load Demo Data'; }
}

// ─────────────────────────────────────────────
// INITIALIZATION
// ─────────────────────────────────────────────

(function initApp() {
    console.log("COMPETITIVE INTELLIGENCE AGENT INITIALIZING...");

    showPage("dashboardPage");

    const chatSendBtn = document.getElementById('chatSendBtn');
    if (chatSendBtn) chatSendBtn.onclick = sendQuery;

    const ingestStoreBtn = document.getElementById('ingestStoreBtn');
    if (ingestStoreBtn) ingestStoreBtn.onclick = ingestSignal;

    const seedBtn = document.getElementById('seedBtn');
    if (seedBtn) seedBtn.onclick = seedData;

    document.querySelectorAll('button').forEach(btn => {
        if (btn.textContent.includes('Export')) {
            btn.onclick = () => exportToCsv();
        }
    });

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

    console.log("SYSTEM ACTIVE.");
})();
