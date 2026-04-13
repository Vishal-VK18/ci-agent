// ============================================================
// COMPETITIVE INTELLIGENCE - app.js
// ============================================================

var app = (function () {
    'use strict';

    const API_BASE = 'http://localhost:3001';
    const cache = {};
    const pendingRequests = {};
    const pageConfig = {
        dashboardPage: { route: '/dashboard', loader: updateDashboard },
        chatPage: { route: '/chat' },
        ingestPage: { route: '/ingest' },
        predictionsPage: { route: '/predictions', loader: updatePredictions },
        patternsPage: { route: '/patterns', loader: updatePatterns },
        timelinePage: { route: '/timeline', loader: updateTimeline },
        adminPage: { route: '/admin' }
    };
    const routeToPage = Object.fromEntries(
        Object.entries(pageConfig).map(([pageId, config]) => [config.route, pageId])
    );
    const pageLoadState = {};
    const state = {
        currentPage: 'dashboardPage',
        currentRange: '1W',
        chartDataByRange: { '1D': [], '1W': [], '1M': [] },
        chartSignals: [],
        chatController: null,
        chatLoading: false,
        chatResponseCache: {},
        searchQuery: '',
        notificationsOpen: false,
        suggestionsHidden: false
    };

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    async function callApi(path, options = {}) {
        const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
        const method = options.method || 'GET';
        const cacheKey = options.cacheKey || `${method}:${url}`;
        const useCache = options.useCache !== false;
        const body = options.body ?? null;
        const fetchOptions = {
            method,
            headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
            signal: options.signal
        };

        if (body !== null) {
            fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
        }

        if (useCache && cache[cacheKey]) {
            return cache[cacheKey];
        }

        if (useCache && pendingRequests[cacheKey]) {
            return pendingRequests[cacheKey];
        }

        console.time(cacheKey);
        const request = fetch(url, fetchOptions)
            .then(async res => {
                let data = null;
                try {
                    data = await res.json();
                } catch {
                    data = null;
                }

                if (!res.ok) {
                    throw new Error(data?.error || `Request failed with status ${res.status}`);
                }

                if (useCache) {
                    cache[cacheKey] = data;
                }

                return data;
            })
            .finally(() => {
                console.timeEnd(cacheKey);
                delete pendingRequests[cacheKey];
            });

        if (useCache) {
            pendingRequests[cacheKey] = request;
        }

        return request;
    }

    function invalidateCache(prefixes = []) {
        Object.keys(cache).forEach(key => {
            if (prefixes.some(prefix => key.includes(prefix))) {
                delete cache[key];
            }
        });
    }

    function setText(id, value) {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = value;
        }
    }

    function normalizeText(value) {
        return String(value || '').toLowerCase();
    }

    function matchesSearch(value) {
        if (!state.searchQuery) return true;
        return normalizeText(value).includes(normalizeText(state.searchQuery));
    }

    function filterSignals(signals) {
        if (!state.searchQuery) return signals;
        return signals.filter(signal => matchesSearch([
            signal.competitor_name,
            signal.signal_type,
            signal.summary,
            signal.event_date
        ].join(' ')));
    }

    function filterTimelineItems(items) {
        if (!state.searchQuery) return items;
        return items.filter(item => matchesSearch([
            item.competitor,
            item.type,
            item.title,
            item.description,
            item.date
        ].join(' ')));
    }

    function filterPatternItems(items) {
        if (!state.searchQuery) return items;
        return items.filter(item => matchesSearch([
            item.name,
            item.confidence,
            (item.evidence || []).join(' ')
        ].join(' ')));
    }

    function filterPredictionItems(items) {
        if (!state.searchQuery) return items;
        return items.filter(item => matchesSearch([
            item.competitor,
            item.prediction,
            item.confidence,
            item.impact
        ].join(' ')));
    }

    function showLoading(container, isGrid) {
        if (!container) return;
        const gridStyle = isGrid ? 'grid-column:1/-1;' : '';
        container.innerHTML = `<div class="glass-card p-6 text-center text-sm" style="${gridStyle}color:var(--text-muted)"><span class="material-symbols-outlined" style="font-size:20px;vertical-align:middle;animation:spin 1s linear infinite">progress_activity</span> Loading...</div>`;
    }

    function showEmpty(container, message, isGrid) {
        if (!container) return;
        const gridStyle = isGrid ? 'grid-column:1/-1;' : '';
        container.innerHTML = `<div class="glass-card p-6 text-center text-sm" style="${gridStyle}color:var(--text-muted)">${escapeHtml(message)}</div>`;
    }

    function showPage(pageId, updateHistory = true) {
        const target = document.getElementById(pageId);
        if (!target) return;

        state.currentPage = pageId;

        document.querySelectorAll('.page').forEach(page => {
            const isActive = page.id === pageId;
            page.classList.toggle('hidden', !isActive);
            page.classList.toggle('active', isActive);
            page.style.display = isActive ? '' : 'none';
        });

        document.querySelectorAll('.sidebar-item').forEach(link => {
            link.classList.toggle('active', link.getAttribute('data-page') === pageId);
        });

        if (updateHistory) {
            const route = pageConfig[pageId]?.route || '/dashboard';
            const nextUrl = route;
            if (window.location.pathname !== nextUrl) {
                window.history.pushState({ pageId }, '', nextUrl);
            }
        }

        const loader = pageConfig[pageId]?.loader;
        if (loader && !pageLoadState[pageId]) {
            pageLoadState[pageId] = true;
            loader();
        } else if (loader && pageId === 'dashboardPage') {
            loader();
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function resolveInitialPage() {
        const route = window.location.pathname.replace(/\/+$/, '') || '/';
        return routeToPage[route] || 'dashboardPage';
    }

    function addUserMessage(text) {
        const thread = document.getElementById('chatMessages');
        const welcome = document.getElementById('chat-welcome');
        if (!thread) return;
        if (welcome) {
            welcome.classList.add('hidden');
        }

        const msg = document.createElement('div');
        msg.className = 'flex justify-end mb-6';
        msg.innerHTML = `<div class="user-bubble text-white p-4 px-6 max-w-[80%]"><p class="text-sm font-medium leading-relaxed">${escapeHtml(text)}</p></div>`;
        thread.appendChild(msg);
        scrollChatToBottom();
    }

    function addBotMessage(text, signalsCount = null) {
        const thread = document.getElementById('chatMessages');
        if (!thread) return;

        const msg = document.createElement('div');
        msg.className = 'flex justify-start mb-6';
        const countHtml = signalsCount !== null
            ? `<div class="mt-3 text-[10px] font-bold text-slate-400 tracking-wider uppercase border-t border-slate-100 pt-3 flex items-center gap-1.5"><span class="material-symbols-outlined text-[14px]">database</span> Recalled from ${signalsCount} intelligence signals</div>`
            : '';

        msg.innerHTML = `
            <div class="p-5 px-6 rounded-2xl rounded-tl-sm shadow-sm max-w-[90%] flex flex-col" style="background:#F5E6C8;border:1px solid rgba(120,60,20,0.2);color:#3B1F0E">
                <p class="text-sm leading-relaxed whitespace-pre-wrap">${escapeHtml(String(text || ''))}</p>
                ${countHtml}
            </div>`;

        thread.appendChild(msg);
        scrollChatToBottom();
    }

    function scrollChatToBottom() {
        const thread = document.getElementById('chatMessages');
        const inputWrap = document.getElementById('chat-input-container');
        if (thread) {
            thread.scrollTo({ top: thread.scrollHeight, behavior: 'smooth' });
        }
        inputWrap?.scrollIntoView({ block: 'end', behavior: 'smooth' });
    }

    function setSuggestionsVisible(visible) {
        state.suggestionsHidden = !visible;
        const suggestions = document.getElementById('chatSuggestions');
        if (suggestions) {
            suggestions.classList.toggle('hidden', !visible);
        }
    }

    function updateChatActionButton() {
        const sendBtn = document.getElementById('send-btn');
        if (!sendBtn) return;

        if (state.chatLoading) {
            sendBtn.setAttribute('aria-label', 'Stop response');
            sendBtn.setAttribute('title', 'Stop');
            sendBtn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <rect x="4" y="4" width="10" height="10" rx="2" fill="white"/>
                </svg>`;
        } else {
            sendBtn.setAttribute('aria-label', 'Send message');
            sendBtn.setAttribute('title', 'Send');
            sendBtn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M16 22L16 10M16 10L11 15M16 10L21 15" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>`;
        }
    }

    function setChatLoading(isLoading) {
        state.chatLoading = isLoading;
        updateChatActionButton();
    }

    function createBotMessageShell() {
        const thread = document.getElementById('chatMessages');
        if (!thread) return null;

        const msg = document.createElement('div');
        msg.className = 'flex justify-start mb-6';
        msg.innerHTML = `
            <div class="p-5 px-6 rounded-2xl rounded-tl-sm shadow-sm max-w-[90%] flex flex-col" style="background:#F5E6C8;border:1px solid rgba(120,60,20,0.2);color:#3B1F0E">
                <p class="text-sm leading-relaxed whitespace-pre-wrap"></p>
                <div class="bot-count-wrap mt-3 text-[10px] font-bold text-slate-400 tracking-wider uppercase border-t border-slate-100 pt-3 flex items-center gap-1.5 hidden">
                    <span class="material-symbols-outlined text-[14px]">database</span>
                    <span class="bot-signal-count"></span>
                </div>
            </div>`;
        thread.appendChild(msg);
        scrollChatToBottom();
        return {
            wrapper: msg,
            textEl: msg.querySelector('p'),
            countWrap: msg.querySelector('.bot-count-wrap'),
            countText: msg.querySelector('.bot-signal-count')
        };
    }

    function debounce(fn, wait) {
        let timer = null;
        return function debounced(...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn(...args), wait);
        };
    }

    function showLoadingMessage() {
        const thread = document.getElementById('chatMessages');
        if (!thread) return;
        removeLoadingMessage();
        const loader = document.createElement('div');
        loader.id = 'chatLoader';
        loader.className = 'flex justify-start mb-6 chat-msg-enter';
        loader.innerHTML = `
            <div class="thinking-bubble">
                <div class="thinking-orb-wrap">
                    <div class="thinking-orb">
                        <div class="orb-ring"></div>
                        <div class="orb-ring orb-ring-2"></div>
                        <div class="orb-core"></div>
                    </div>
                </div>
                <div class="thinking-text-wrap">
                    <div class="thinking-label">Analyzing signals...</div>
                    <div class="thinking-phases">
                        <span class="phase active">Scanning memory bank</span>
                        <span class="phase">Cross-referencing signals</span>
                        <span class="phase">Synthesizing insights</span>
                    </div>
                    <div class="thinking-bar"><div class="thinking-bar-fill"></div></div>
                </div>
            </div>`;
        thread.appendChild(loader);

        let activePhase = 0;
        loader._phaseTimer = setInterval(() => {
            const phases = loader.querySelectorAll('.phase');
            phases.forEach(phase => phase.classList.remove('active'));
            activePhase = (activePhase + 1) % phases.length;
            phases[activePhase].classList.add('active');
        }, 1400);

        scrollChatToBottom();
    }

    function removeLoadingMessage() {
        const el = document.getElementById('chatLoader');
        if (el) {
            clearInterval(el._phaseTimer);
            el.remove();
        }
    }

    function stopCurrentResponse() {
        if (state.chatController) {
            state.chatController.abort();
            state.chatController = null;
        }
        removeLoadingMessage();
        setChatLoading(false);
        const input = document.getElementById('chat-input');
        input?.focus();
    }

    async function sendStreamQuery(text) {
        const response = await fetch(`${API_BASE}/query/stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question: text }),
            signal: state.chatController?.signal
        });

        if (!response.ok || !response.body) {
            throw new Error(`Stream request failed with status ${response.status}`);
        }

        let shell = null;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let finalAnswer = '';
        let resolved = false;

        // Failsafe: if stream stalls for 15s, bail out with fallback
        const failsafeTimer = setTimeout(() => {
            if (resolved) return;
            resolved = true;
            reader.cancel().catch(() => {});
            removeLoadingMessage();
            setChatLoading(false);
            if (!shell) {
                addBotMessage('Intelligence analysis timed out. Please try again.');
            } else if (!finalAnswer) {
                shell.textEl.textContent = 'Intelligence analysis timed out. Please try again.';
            }
        }, 15000);

        try {
            while (true) {
                const { value, done } = await reader.read();
                buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.trim()) continue;
                    let payload;
                    try { payload = JSON.parse(line); } catch { continue; }

                    if (payload.type === 'status') continue;

                    if (payload.type === 'chunk') {
                        if (!shell) {
                            shell = createBotMessageShell();
                            if (!shell) return;
                        }
                        removeLoadingMessage();
                        setChatLoading(false);
                        finalAnswer += payload.content || '';
                        shell.textEl.textContent = finalAnswer;
                        scrollChatToBottom();
                    }

                    if (payload.type === 'done') {
                        resolved = true;
                        if (!shell) {
                            shell = createBotMessageShell();
                            if (!shell) return;
                        }
                        removeLoadingMessage();
                        setChatLoading(false);
                        finalAnswer = payload.answer || finalAnswer;
                        shell.textEl.textContent = finalAnswer;
                        if (payload.signals_used !== undefined && shell.countWrap && shell.countText) {
                            shell.countWrap.classList.remove('hidden');
                            shell.countText.textContent = `Recalled from ${payload.signals_used} intelligence signals`;
                        }
                        state.chatResponseCache[text] = {
                            answer: finalAnswer,
                            signals_used: payload.signals_used ?? null
                        };
                        scrollChatToBottom();
                    }
                }

                if (done) break;
            }
        } finally {
            clearTimeout(failsafeTimer);
        }
    }

    async function sendQuery(event, forcedText) {
        if (event?.preventDefault) {
            event.preventDefault();
        }

        showPage('chatPage');

        const input = document.getElementById('chat-input');
        const text = (typeof forcedText === 'string' ? forcedText : input?.value || '').trim();
        if (!text) return;

        if (input) {
            input.value = '';
            input.style.height = '24px';
        }

        setSuggestionsVisible(false);
        addUserMessage(text);
        showLoadingMessage();
        setChatLoading(true);

        if (state.chatController) {
            stopCurrentResponse();
        }

        const cachedResponse = state.chatResponseCache[text];
        if (cachedResponse) {
            removeLoadingMessage();
            setChatLoading(false);
            addBotMessage(cachedResponse.answer, cachedResponse.signals_used);
            return;
        }

        state.chatController = new AbortController();

        try {
            await sendStreamQuery(text);
        } catch (error) {
            removeLoadingMessage();
            setChatLoading(false);
            if (error.name !== 'AbortError') {
                addBotMessage("Sorry, I can't reach the intelligence bank right now.");
            }
        } finally {
            removeLoadingMessage();
            setChatLoading(false);
            state.chatController = null;
        }
    }

    function sendSuggestion(text) {
        const input = document.getElementById('chat-input');
        if (input) {
            input.value = text;
            input.style.height = '24px';
            input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
        }
        setSuggestionsVisible(false);
        sendQuery(null, text);
    }

    async function ingestSignal() {
        const textEl = document.getElementById('ingestText');
        const compEl = document.getElementById('ingestCompetitor');
        const text = textEl?.value.trim() || '';
        const competitor = compEl?.value.trim() || 'Market General';

        if (!text) {
            alert('Please specify intelligence content.');
            return;
        }

        try {
            await callApi('/ingest', {
                method: 'POST',
                body: { text, competitor_name: competitor },
                useCache: false
            });

            invalidateCache(['/analytics/', '/signals']);
            Object.keys(pageLoadState).forEach(key => { pageLoadState[key] = false; });
            textEl.value = '';
            compEl.value = '';
            alert('Signal committed to intelligence bank.');
            syncAllPages();
        } catch {
            alert('Commit failed.');
        }
    }

    async function clearMemory() {
        if (!confirm('Permanently delete all signals from the memory bank?')) {
            return;
        }

        const btn = document.getElementById('clearMemoryBtn');
        if (btn) {
            btn.textContent = 'Clearing...';
        }

        try {
            await callApi('/reset', { method: 'POST', useCache: false });
            invalidateCache(['/analytics/', '/signals', '/query']);
            state.chartSignals = [];
            state.chartDataByRange = { '1D': [], '1W': [], '1M': [] };
            Object.keys(pageLoadState).forEach(key => { pageLoadState[key] = false; });
            alert('Memory bank cleared.');
            syncAllPages();
        } catch {
            alert('Failed to reach reset endpoint.');
        } finally {
            if (btn) {
                btn.innerHTML = '<span class="material-symbols-outlined text-[18px]">delete_forever</span> Clear All Signals';
            }
        }
    }

    async function seedData() {
        const btn = document.getElementById('seedBtn');
        if (btn) {
            btn.textContent = 'Syncing...';
        }

        try {
            await callApi('/seed', { method: 'POST', useCache: false });
            invalidateCache(['/analytics/', '/signals']);
            Object.keys(pageLoadState).forEach(key => { pageLoadState[key] = false; });
            alert('Intelligence network synced.');
            syncAllPages();
        } catch {
            alert('Sync failed.');
        } finally {
            if (btn) {
                btn.innerHTML = '<span class="material-symbols-outlined text-[18px]">rocket_launch</span> Execute Seed Protocol';
            }
        }
    }

    function syncAllPages() {
        preloadData(true).then(() => {
            updateDashboard();
            updateTimeline();
            updatePatterns();
            updatePredictions();
        }).catch(() => {
            updateDashboard();
            updateTimeline();
            updatePatterns();
            updatePredictions();
        });
    }

    async function preloadData(force = false) {
        if (force) {
            invalidateCache(['/analytics/', '/signals']);
        }

        await Promise.all([
            loadSignals(force),
            callApi('/analytics/stats', { useCache: !force, cacheKey: 'GET:/analytics/stats' }),
            callApi('/analytics/timeline', { useCache: !force, cacheKey: 'GET:/analytics/timeline' }),
            callApi('/analytics/patterns', { useCache: !force, cacheKey: 'GET:/analytics/patterns' }),
            callApi('/analytics/predictions', { useCache: !force, cacheKey: 'GET:/analytics/predictions' })
        ]);
    }

    async function loadSignals(force = false) {
        const cacheKey = 'GET:/signals?limit=200';
        if (force) {
            delete cache[cacheKey];
        }

        const data = await callApi('/signals?limit=200', {
            cacheKey,
            useCache: !force
        });

        const signals = Array.isArray(data?.signals) ? data.signals : [];
        state.chartSignals = signals;
        state.chartDataByRange = buildAllChartData(signals);
        const filteredSignals = filterSignals(signals);
        renderActivityChart(buildAllChartData(filteredSignals)[state.currentRange]);
        renderCompetitorBars(filteredSignals);
        return signals;
    }

    function buildAllChartData(signals) {
        return {
            '1D': aggregateSignals(signals, '1D'),
            '1W': aggregateSignals(signals, '1W'),
            '1M': aggregateSignals(signals, '1M')
        };
    }
    function aggregateSignals(signals, range) {
        const now = new Date();
        let buckets = [];

        if (range === '1D') {
            buckets = Array.from({ length: 24 }, (_, index) => {
                const date = new Date(now);
                date.setHours(now.getHours() - 23 + index, 0, 0, 0);
                return {
                    key: date.toISOString().slice(0, 13),
                    time: index % 4 === 0 ? `${date.getHours()}h` : '',
                    value: 0,
                    competitors: 0,
                    competitorSet: new Set()
                };
            });
        } else if (range === '1W') {
            buckets = Array.from({ length: 7 }, (_, index) => {
                const date = new Date(now);
                date.setDate(now.getDate() - 6 + index);
                return {
                    key: date.toISOString().slice(0, 10),
                    time: date.toLocaleDateString('en', { weekday: 'short' }),
                    value: 0,
                    competitors: 0,
                    competitorSet: new Set()
                };
            });
        } else {
            buckets = Array.from({ length: 30 }, (_, index) => {
                const date = new Date(now);
                date.setDate(now.getDate() - 29 + index);
                return {
                    key: date.toISOString().slice(0, 10),
                    time: index % 5 === 0 ? date.toLocaleDateString('en', { month: 'short', day: 'numeric' }) : '',
                    value: 0,
                    competitors: 0,
                    competitorSet: new Set()
                };
            });
        }

        const bucketMap = Object.fromEntries(buckets.map(bucket => [bucket.key, bucket]));
        signals.forEach(signal => {
            const date = new Date(signal.event_date || signal.date || Date.now());
            if (Number.isNaN(date.getTime())) {
                return;
            }

            const key = range === '1D'
                ? date.toISOString().slice(0, 13)
                : date.toISOString().slice(0, 10);
            const bucket = bucketMap[key];
            if (!bucket) {
                return;
            }

            bucket.value += 1;
            bucket.competitorSet.add(signal.competitor_name || 'Unknown');
            bucket.competitors = bucket.competitorSet.size;
        });

        const data = buckets.map(bucket => ({
            time: bucket.time || bucket.key,
            value: bucket.value,
            competitors: bucket.competitors,
            key: bucket.key
        }));
        console.log('Graph data:', data);
        return data;
    }

    function buildSmoothPath(points) {
        if (!points.length) return '';
        if (points.length === 1) return `M${points[0].x},${points[0].y}`;

        let path = `M${points[0].x},${points[0].y}`;
        for (let index = 0; index < points.length - 1; index++) {
            const current = points[index];
            const next = points[index + 1];
            const controlX = current.x + (next.x - current.x) / 2;
            path += ` C${controlX},${current.y} ${controlX},${next.y} ${next.x},${next.y}`;
        }
        return path;
    }

    const debouncedRenderRange = debounce(range => {
        renderActivityChart(buildAllChartData(filterSignals(state.chartSignals))[range] || []);
    }, 100);

    function setTimeRange(range) {
        state.currentRange = range;
        document.querySelectorAll('.time-btn').forEach(btn => {
            const active = btn.getAttribute('data-range') === range;
            btn.style.background = active ? 'rgba(114,47,55,0.25)' : 'var(--pill-bg)';
            btn.style.borderColor = active ? 'rgba(114,47,55,0.5)' : 'var(--pill-border)';
            btn.style.color = active ? '#722F37' : 'var(--text-secondary)';
        });

        debouncedRenderRange(range);
    }

    function renderActivityChart(data) {
        const gridG = document.getElementById('chartGridLines');
        const areaPath = document.getElementById('chartAreaPath');
        const linePath = document.getElementById('chartLinePath');
        const linePath2 = document.getElementById('chartLinePath2');
        const dotsG = document.getElementById('chartDots');
        const axisG = document.getElementById('chartAxisX');
        const wrap = document.getElementById('activityChartWrap');

        if (!gridG || !areaPath || !linePath || !linePath2 || !dotsG || !axisG || !wrap) {
            return;
        }

        if (!Array.isArray(data) || data.length === 0) {
            wrap.classList.add('chart-empty');
            wrap.setAttribute('data-empty-message', 'No data available');
            gridG.innerHTML = '';
            areaPath.setAttribute('d', '');
            linePath.setAttribute('d', '');
            linePath2.setAttribute('d', '');
            dotsG.innerHTML = '';
            axisG.innerHTML = '';
            return;
        }

        wrap.classList.remove('chart-empty');
        wrap.removeAttribute('data-empty-message');

        const W = 600;
        const H = 200;
        const PAD = { top: 16, right: 14, bottom: 34, left: 14 };
        const innerW = W - PAD.left - PAD.right;
        const innerH = H - PAD.top - PAD.bottom;
        const maxSignals = Math.max(...data.map(point => point.value), 1);
        const maxCompetitors = Math.max(...data.map(point => point.competitors), 1);
        const xOf = index => data.length === 1 ? PAD.left + innerW / 2 : PAD.left + (index / (data.length - 1)) * innerW;
        const yOf = (value, max) => PAD.top + innerH - (value / max) * innerH;
        const signalPoints = data.map((point, index) => ({ x: xOf(index), y: yOf(point.value, maxSignals) }));
        const competitorPoints = data.map((point, index) => ({ x: xOf(index), y: yOf(point.competitors, maxCompetitors) }));

        gridG.innerHTML = '';
        [0, 0.25, 0.5, 0.75, 1].forEach(tick => {
            const y = PAD.top + innerH * (1 - tick);
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', PAD.left);
            line.setAttribute('x2', W - PAD.right);
            line.setAttribute('y1', y);
            line.setAttribute('y2', y);
            line.setAttribute('class', 'chart-grid-line');
            gridG.appendChild(line);
        });

        const signalPath = buildSmoothPath(signalPoints);
        const competitorPath = buildSmoothPath(competitorPoints);
        const filledArea = `${signalPath} L${signalPoints[signalPoints.length - 1].x},${PAD.top + innerH} L${signalPoints[0].x},${PAD.top + innerH} Z`;

        [linePath, areaPath, linePath2].forEach(el => el.classList.remove('animated'));
        linePath.setAttribute('d', signalPath);
        areaPath.setAttribute('d', filledArea);
        linePath2.setAttribute('d', competitorPath);

        dotsG.innerHTML = '';
        const tooltip = document.getElementById('chartTooltip');
        data.forEach((point, index) => {
            const signalDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            signalDot.setAttribute('cx', xOf(index));
            signalDot.setAttribute('cy', yOf(point.value, maxSignals));
            signalDot.setAttribute('r', 4);
            signalDot.setAttribute('class', 'chart-dot');
            signalDot.addEventListener('mouseenter', () => {
                signalDot.setAttribute('r', 6);
                showChartTooltip(tooltip, xOf(index), yOf(point.value, maxSignals), point.time, point.value, point.competitors);
            });
            signalDot.addEventListener('mouseleave', () => {
                signalDot.setAttribute('r', 4);
                tooltip?.classList.remove('visible');
            });
            dotsG.appendChild(signalDot);

            const competitorDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            competitorDot.setAttribute('cx', xOf(index));
            competitorDot.setAttribute('cy', yOf(point.competitors, maxCompetitors));
            competitorDot.setAttribute('r', 3);
            competitorDot.setAttribute('class', 'chart-dot-2');
            dotsG.appendChild(competitorDot);
        });

        axisG.innerHTML = '';
        const maxLabels = 6;
        const labelStep = Math.max(1, Math.ceil(data.length / maxLabels));
        data.forEach((point, index) => {
            if (!point.time || (index !== data.length - 1 && index % labelStep !== 0)) return;
            const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            label.setAttribute('x', xOf(index));
            label.setAttribute('y', H - 4);
            label.setAttribute('text-anchor', 'middle');
            label.setAttribute('class', 'chart-axis-text');
            label.textContent = point.time;
            axisG.appendChild(label);
        });

        requestAnimationFrame(() => requestAnimationFrame(() => {
            linePath.classList.add('animated');
            areaPath.classList.add('animated');
            linePath2.classList.add('animated');
        }));
    }

    function showChartTooltip(tooltip, x, y, label, signals, competitors) {
        if (!tooltip) return;
        const labelEl = document.getElementById('ttLabel');
        const valEl = document.getElementById('ttVal');
        const val2El = document.getElementById('ttVal2');
        if (labelEl) labelEl.textContent = label;
        if (valEl) valEl.textContent = `${signals} signals`;
        if (val2El) val2El.textContent = `${competitors} competitors`;
        tooltip.style.left = `${x}px`;
        tooltip.style.top = `${y}px`;
        tooltip.classList.add('visible');
    }

    function renderCompetitorBars(signals) {
        const container = document.getElementById('competitorBars');
        if (!container) return;

        if (!Array.isArray(signals) || signals.length === 0) {
            container.innerHTML = `<p class="text-xs text-center py-8" style="color:var(--text-muted)">No competitor data available</p>`;
            return;
        }

        const counts = signals.reduce((acc, signal) => {
            const name = signal.competitor_name || 'Unknown';
            acc[name] = (acc[name] || 0) + 1;
            return acc;
        }, {});

        const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
        const max = entries[0]?.[1] || 1;
        const colors = ['#722F37', '#9e6b50', '#a07830', '#5c3d2e', '#7a4f3a', '#4a2c2a'];

        container.innerHTML = entries.map(([name, count], index) => {
            const pct = Math.round((count / max) * 100);
            const color = colors[index % colors.length];
            const initials = name.slice(0, 2).toUpperCase();
            return `
                <div class="flex items-center gap-3">
                    <div class="competitor-avatar" style="background:${color}22;color:${color};font-size:0.7rem">${escapeHtml(initials)}</div>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center justify-between mb-1">
                            <span class="text-xs font-bold truncate" style="color:#2a0d10">${escapeHtml(name)}</span>
                            <span class="text-xs font-bold ml-2" style="color:${color}">${count}</span>
                        </div>
                        <div style="height:5px;background:rgba(114,47,55,0.18);border-radius:4px;overflow:hidden">
                            <div class="bar-fill" style="height:100%;width:0%;background:${color};border-radius:4px;transition:width 0.9s cubic-bezier(0.16,1,0.3,1) ${index * 80}ms" data-target="${pct}"></div>
                        </div>
                    </div>
                </div>`;
        }).join('');

        requestAnimationFrame(() => requestAnimationFrame(() => {
            container.querySelectorAll('.bar-fill').forEach(bar => {
                bar.style.width = `${bar.getAttribute('data-target')}%`;
            });
        }));
    }

    function renderDashboardTimeline(timeline) {
        const container = document.getElementById('dashboardTimelineList');
        if (!container) return;

        if (!Array.isArray(timeline)) {
            container.innerHTML = '<p class="text-outline font-medium text-sm text-center py-10">Loading...</p>';
            return;
        }

        const filteredTimeline = filterTimelineItems(timeline);
        if (filteredTimeline.length === 0) {
            container.innerHTML = `<p class="text-outline font-medium text-sm text-center py-10">${state.searchQuery ? 'No matches found' : 'No data available'}</p>`;
            return;
        }

        container.innerHTML = filteredTimeline.slice(0, 8).map(item => `
            <div class="glass-card p-4">
                <div class="flex items-start justify-between gap-3">
                    <div>
                        <div class="font-bold text-sm" style="color:var(--text-primary)">${escapeHtml(item.competitor || 'Unknown')}</div>
                        <div class="text-xs mt-1" style="color:var(--text-secondary)">${escapeHtml(item.description || item.title || 'Signal detected')}</div>
                    </div>
                    <div class="text-[10px] font-bold uppercase tracking-wider whitespace-nowrap" style="color:var(--text-muted)">${escapeHtml(formatTimelineDate(item.date))}</div>
                </div>
            </div>
        `).join('');
    }

    function renderDashboardAlerts(patterns) {
        const container = document.getElementById('dashboardPatternAlerts');
        if (!container) return;

        if (!Array.isArray(patterns)) {
            container.innerHTML = '<div class="text-center py-10 text-sm" style="color:var(--text-muted)">Loading...</div>';
            return;
        }

        const filteredPatterns = filterPatternItems(patterns);
        if (filteredPatterns.length === 0) {
            container.innerHTML = '<div class="text-center py-10 text-sm" style="color:var(--text-muted)">No alerts detected</div>';
            return;
        }

        container.innerHTML = filteredPatterns.map(pattern => `
            <div class="p-4 rounded-xl border flex flex-col gap-2" style="background:var(--surface-card);border-color:var(--border)">
                <div class="flex items-center justify-between gap-2">
                    <strong class="text-sm font-headline" style="color:var(--text-primary)">${escapeHtml(pattern.name || 'Pattern')}</strong>
                    <span class="text-[10px] px-2 py-1 rounded-full font-bold" style="background:rgba(114,47,55,0.12);color:var(--primary);border:1px solid rgba(114,47,55,0.18)">${escapeHtml(pattern.confidence || 'Medium')}</span>
                </div>
                <p class="text-xs leading-relaxed" style="color:var(--text-secondary)">${escapeHtml((pattern.evidence || []).join(' ') || 'Monitoring strategic movement.')}</p>
            </div>
        `).join('');
    }
    async function updateDashboard() {
        renderDashboardTimeline(null);
        renderDashboardAlerts(null);

        try {
            const [stats, timelineData, patternsData, signals] = await Promise.all([
                callApi('/analytics/stats', { cacheKey: 'GET:/analytics/stats' }),
                callApi('/analytics/timeline', { cacheKey: 'GET:/analytics/timeline' }),
                callApi('/analytics/patterns', { cacheKey: 'GET:/analytics/patterns' }),
                loadSignals()
            ]);

            setText('stat-total-signals', stats?.total_signals ?? 0);
            setText('stat-active-competitors', stats?.active_competitors ?? 0);
            setText('stat-patterns', stats?.patterns_detected ?? 0);

            const confidence = stats?.total_signals
                ? Math.min(100, Math.floor(((stats.patterns_detected || 0) / Math.max(stats.total_signals, 1)) * 100) + 70)
                : 70;
            setText('stat-confidence', `${confidence}%`);
            const bar = document.getElementById('stat-confidence-bar');
            if (bar) {
                bar.style.width = `${confidence}%`;
            }

            renderDashboardTimeline(timelineData?.timeline || []);
            renderDashboardAlerts(patternsData?.patterns || []);
            const filteredSignals = filterSignals(signals || state.chartSignals);
            renderCompetitorBars(filteredSignals);
            renderActivityChart(buildAllChartData(filteredSignals)[state.currentRange] || []);
        } catch (error) {
            console.warn('[Dashboard] Refresh failed', error);
            renderDashboardTimeline([]);
            renderDashboardAlerts([]);
        }
    }

    function formatTimelineDate(value) {
        const date = new Date(value || Date.now());
        if (Number.isNaN(date.getTime())) {
            return 'Unknown';
        }
        const today = new Date();
        if (date.toDateString() === today.toDateString()) {
            return `Today ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        }
        return date.toLocaleDateString();
    }

    async function updateTimeline() {
        const container = document.getElementById('timelineContainer');
        if (!container) return;
        showLoading(container, false);

        try {
            const data = await callApi('/analytics/timeline', { cacheKey: 'GET:/analytics/timeline' });
            const timeline = filterTimelineItems(Array.isArray(data?.timeline) ? data.timeline : []);

            if (timeline.length === 0) {
                showEmpty(container, state.searchQuery ? 'No matches found' : 'No data available', false);
                return;
            }

            container.innerHTML = timeline.map(item => `
                <div class="glass-card p-5 relative pl-10">
                    <div class="absolute left-4 top-6 w-2 h-2 rounded-full" style="background:#722F37"></div>
                    <div class="absolute left-[19px] top-9 bottom-0 w-px" style="background:var(--border)"></div>
                    <div class="flex items-start justify-between gap-4">
                        <div>
                            <div class="font-bold text-sm mb-1" style="color:var(--text-primary)">
                                <span style="color:#722F37">${escapeHtml(item.competitor || 'Unknown')}</span>
                                <span style="color:var(--text-muted);font-weight:normal;margin:0 4px">·</span>
                                ${escapeHtml(item.type || 'Alert')}
                            </div>
                            <p class="text-sm leading-relaxed" style="color:var(--text-secondary)">${escapeHtml(item.description || item.title || 'Signal detected')}</p>
                        </div>
                        <div class="text-[10px] font-bold uppercase tracking-wider whitespace-nowrap" style="color:var(--text-muted)">${escapeHtml(formatTimelineDate(item.date))}</div>
                    </div>
                </div>
            `).join('');
        } catch {
            showEmpty(container, 'Failed to load timeline', false);
        }
    }

    async function updatePatterns() {
        const container = document.getElementById('patternsContainer');
        if (!container) return;
        showLoading(container, true);

        try {
            const data = await callApi('/analytics/patterns', { cacheKey: 'GET:/analytics/patterns' });
            const patterns = filterPatternItems(Array.isArray(data?.patterns) ? data.patterns : []);

            if (patterns.length === 0) {
                showEmpty(container, state.searchQuery ? 'No matches found' : 'No data available', true);
                return;
            }

            container.innerHTML = patterns.map(pattern => `
                <div class="glass-card p-6 flex flex-col h-full">
                    <div class="flex items-center justify-between mb-4 gap-2">
                        <div class="w-10 h-10 rounded-xl flex items-center justify-center" style="background:rgba(114,47,55,0.15)">
                            <span class="material-symbols-outlined text-[20px]" style="color:var(--primary)">hub</span>
                        </div>
                        <span class="text-xs font-bold px-2 py-1 rounded" style="background:rgba(200,169,110,0.15);color:#a07830">${escapeHtml(pattern.confidence || 'Medium')} Confidence</span>
                    </div>
                    <h3 class="font-bold text-base mb-2" style="color:var(--text-primary)">${escapeHtml(pattern.name || 'Pattern')}</h3>
                    <p class="text-sm leading-relaxed mb-4 flex-1" style="color:var(--text-secondary)">${escapeHtml(pattern.evidence?.[0] || 'Strategic movement detected.')}</p>
                    <div class="text-xs font-semibold" style="color:var(--primary)">Support Signals: ${pattern.evidence?.length || 1}</div>
                </div>
            `).join('');
        } catch {
            showEmpty(container, 'Failed to load patterns', true);
        }
    }

    async function updatePredictions() {
        const container = document.getElementById('predictionsContainer');
        if (!container) return;
        showLoading(container, true);

        try {
            const [stats, predictionData] = await Promise.all([
                callApi('/analytics/stats', { cacheKey: 'GET:/analytics/stats' }),
                callApi('/analytics/predictions', { cacheKey: 'GET:/analytics/predictions' })
            ]);

            const predictions = filterPredictionItems(Array.isArray(predictionData?.predictions) ? predictionData.predictions : []);
            if ((stats?.total_signals || 0) < 2 || predictions.length === 0) {
                showEmpty(container, state.searchQuery ? 'No matches found' : 'No data available', true);
                return;
            }

            container.innerHTML = predictions.map(prediction => `
                <div class="glass-card p-6 flex flex-col h-full" style="border-color:rgba(239,223,187,0.1)">
                    <div class="flex items-center justify-between mb-4 gap-2">
                        <div class="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded" style="background:rgba(0,229,160,0.1);color:var(--green)">
                            Impact: ${escapeHtml(prediction.impact || 'High')}
                        </div>
                        <span class="text-xs font-bold" style="color:var(--text-secondary)">${escapeHtml(prediction.confidence || 'N/A')} Prob</span>
                    </div>
                    <h3 class="font-bold text-base mb-2" style="color:var(--text-primary)">${escapeHtml(prediction.competitor || 'Competitor')} Move</h3>
                    <p class="text-sm leading-relaxed font-medium flex-1" style="color:var(--text-primary)">${escapeHtml(prediction.prediction || 'No prediction available.')}</p>
                    <div class="mt-4 pt-4 border-t border-[rgba(255,255,255,0.05)] text-xs font-semibold" style="color:var(--text-muted)">Based on recent market signals</div>
                </div>
            `).join('');
        } catch {
            showEmpty(container, 'Failed to load predictions', true);
        }
    }

    function newAnalysis() {
        const thread = document.getElementById('chatMessages');
        const welcome = document.getElementById('chat-welcome');
        const chatInput = document.getElementById('chat-input');
        if (thread) {
            thread.innerHTML = '';
        }
        if (welcome) {
            welcome.classList.remove('hidden');
        }
        if (chatInput) {
            chatInput.value = '';
            chatInput.style.height = '24px';
        }
        setSuggestionsVisible(true);
        showPage('chatPage');
        requestAnimationFrame(() => chatInput?.focus());
    }

    async function checkHealth() {
        try {
            const res = await callApi('/health', { cacheKey: 'GET:/health' });
            const groqSpan = document.getElementById('health-groq');
            const hindsightSpan = document.getElementById('health-hindsight');

            if (groqSpan) {
                groqSpan.className = `material-symbols-outlined ${res?.groq === 'online' ? 'text-green-500' : 'text-red-500'}`;
                groqSpan.textContent = res?.groq === 'online' ? 'check_circle' : 'error';
            }

            if (hindsightSpan) {
                hindsightSpan.className = `material-symbols-outlined ${res?.hindsight === 'connected' ? 'text-green-500' : 'text-red-500'}`;
                hindsightSpan.textContent = res?.hindsight === 'connected' ? 'check_circle' : 'error';
            }
        } catch {
            console.warn('Health check failed');
        }
    }

    function toggleNotifications(forceState) {
        state.notificationsOpen = typeof forceState === 'boolean' ? forceState : !state.notificationsOpen;
        const panel = document.getElementById('notificationsPanel');
        if (panel) {
            panel.classList.toggle('hidden', !state.notificationsOpen);
        }
    }

    function runSearch(query) {
        state.searchQuery = (query || '').trim();
        updateDashboard();
        updateTimeline();
        updatePatterns();
        updatePredictions();
    }

    function refreshDashboard() {
        syncAllPages();
    }

    function bindEvents() {
        document.querySelectorAll('.time-btn').forEach(btn => {
            btn.addEventListener('click', () => setTimeRange(btn.getAttribute('data-range')));
        });

        const chatInput = document.getElementById('chat-input');
        const sendBtn = document.getElementById('send-btn');
        const wrapper = document.getElementById('chat-input-wrapper');
        const ripples = document.getElementById('chat-ripples');
        const glow = document.getElementById('chat-glow');
        const notificationsBtn = document.getElementById('notificationsBtn');

        if (chatInput) {
            chatInput.addEventListener('keydown', event => {
                if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    sendQuery(event);
                }
            });

            chatInput.addEventListener('input', () => {
                chatInput.style.height = '24px';
                chatInput.style.height = `${Math.min(chatInput.scrollHeight, 120)}px`;
            });
        }

        if (sendBtn) {
            sendBtn.addEventListener('click', event => {
                event.preventDefault();
                if (state.chatLoading) {
                    stopCurrentResponse();
                    return;
                }
                sendQuery(event);
            });
        }

        if (wrapper) {
            wrapper.addEventListener('mousemove', event => {
                const rect = wrapper.getBoundingClientRect();
                const x = ((event.clientX - rect.left) / rect.width) * 100;
                const y = ((event.clientY - rect.top) / rect.height) * 100;
                if (glow) {
                    glow.style.opacity = '1';
                    glow.style.background = `radial-gradient(circle 120px at ${x}% ${y}%, rgba(114,47,55,0.08) 0%, transparent 100%)`;
                }
            });

            wrapper.addEventListener('mouseleave', () => {
                if (glow) {
                    glow.style.opacity = '0';
                }
            });

            wrapper.addEventListener('mousedown', event => {
                if (!ripples) return;
                const rect = wrapper.getBoundingClientRect();
                const ripple = document.createElement('div');
                ripple.className = 'chat-ripple';
                ripple.style.left = `${event.clientX - rect.left}px`;
                ripple.style.top = `${event.clientY - rect.top}px`;
                ripple.style.marginLeft = '-20px';
                ripple.style.marginTop = '-20px';
                ripple.style.width = '40px';
                ripple.style.height = '40px';
                ripples.appendChild(ripple);
                setTimeout(() => ripple.remove(), 600);
            });
        }

        const searchInput = document.getElementById('headerSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', event => {
                runSearch(event.target.value);
            });
            searchInput.addEventListener('keydown', event => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    runSearch(searchInput.value);
                    showPage('timelinePage');
                }
            });
        }

        if (notificationsBtn) {
            notificationsBtn.addEventListener('click', event => {
                event.preventDefault();
                toggleNotifications();
            });
        }

        document.querySelectorAll('.sidebar-item').forEach(link => {
            link.addEventListener('click', event => {
                const pageId = link.getAttribute('data-page');
                if (pageId) {
                    event.preventDefault();
                    showPage(pageId);
                }
            });
        });

        window.addEventListener('popstate', event => {
            const pageId = event.state?.pageId || resolveInitialPage();
            showPage(pageId, false);
        });

        document.addEventListener('click', event => {
            const panel = document.getElementById('notificationsPanel');
            const trigger = document.getElementById('notificationsBtn');
            if (!panel || !trigger || panel.classList.contains('hidden')) return;
            if (!panel.contains(event.target) && !trigger.contains(event.target)) {
                toggleNotifications(false);
            }
        });
    }

    async function init() {
        bindEvents();
        setChatLoading(false);
        setSuggestionsVisible(true);
        setTimeRange(state.currentRange);
        showPage(resolveInitialPage(), false);
        checkHealth();
        preloadData().then(() => {
            updateDashboard();
            updateTimeline();
            updatePatterns();
            updatePredictions();
        }).catch(error => {
            console.warn('Preload failed', error);
            updateDashboard();
            updateTimeline();
            updatePatterns();
            updatePredictions();
        });
    }

    return {
        init,
        showPage,
        sendQuery,
        sendSuggestion,
        toggleNotifications,
        ingestSignal,
        seedData,
        clearMemory,
        newAnalysis,
        refreshDashboard,
        updateDashboard,
        updateTimeline,
        updatePatterns,
        updatePredictions
    };
})();

function showPage(id)   { app.showPage(id); }
function sendQuery(e)   { app.sendQuery(e); }
function sendSuggestion(text) { app.sendSuggestion(text); }
function toggleNotifications() { app.toggleNotifications(); }
function ingestSignal() { app.ingestSignal(); }
function seedData()     { app.seedData(); }
function clearMemory()  { app.clearMemory(); }
function newAnalysis()  { app.newAnalysis(); }
function refreshDashboard() { app.refreshDashboard(); }

document.addEventListener('DOMContentLoaded', app.init);

