// ============================================================
// COMPETITIVE INTELLIGENCE — app.js
// ============================================================

var app = (function () {
    'use strict';

    const API_BASE = 'http://localhost:3001';

    // ── Helpers ──────────────────────────────────────────────
    async function callApi(url, method = 'GET', body = null) {
        const opts = { method, headers: { 'Content-Type': 'application/json' } };
        if (body) opts.body = JSON.stringify(body);
        const res = await fetch(url, opts);
        return res.json();
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    // ── Navigation ───────────────────────────────────────────
    function showPage(pageId) {
        document.querySelectorAll('.page').forEach(p => {
            p.classList.add('hidden');
            p.classList.remove('active');
        });
        const target = document.getElementById(pageId);
        if (!target) return;
        target.classList.remove('hidden');
        target.classList.add('active');
        window.scrollTo(0, 0);
        if (pageId === 'dashboardPage') updateDashboard();

        document.querySelectorAll('.sidebar-item').forEach(link => {
            const isActive = link.getAttribute('data-page') === pageId;
            link.classList.toggle('active', isActive);
        });
    }

    // ── Chat ─────────────────────────────────────────────────
    function addUserMessage(text) {
        const thread = document.getElementById('chatMessages');
        const welcome = document.getElementById('chat-welcome');
        if (!thread) return;
        if (welcome) welcome.classList.add('hidden');
        const msg = document.createElement('div');
        msg.className = 'flex justify-end mb-6';
        msg.innerHTML = `<div class="user-bubble text-white p-4 px-6 max-w-[80%]">
            <p class="text-sm font-medium leading-relaxed">${escapeHtml(text)}</p></div>`;
        thread.appendChild(msg);
        thread.scrollTo({ top: thread.scrollHeight, behavior: 'smooth' });
    }

    function formatBotText(raw) {
        // Strip <think> blocks
        let text = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        const lines = text.split('\n');
        let html = '';
        let inList = false;

        lines.forEach(line => {
            // H3 ### heading
            if (/^###\s+/.test(line)) {
                if (inList) { html += '</ul>'; inList = false; }
                html += `<div class="bot-heading">${escapeHtml(line.replace(/^###\s+/, ''))}</div>`;
                return;
            }
            // H2 ## heading
            if (/^##\s+/.test(line)) {
                if (inList) { html += '</ul>'; inList = false; }
                html += `<div class="bot-heading bot-heading-lg">${escapeHtml(line.replace(/^##\s+/, ''))}</div>`;
                return;
            }
            // Bullet - or *
            if (/^[-*]\s+/.test(line)) {
                if (!inList) { html += '<ul class="bot-list">'; inList = true; }
                const content = inlineFormat(line.replace(/^[-*]\s+/, ''));
                html += `<li class="bot-list-item">${content}</li>`;
                return;
            }
            // Numbered list
            if (/^\d+\.\s+/.test(line)) {
                if (!inList) { html += '<ul class="bot-list bot-list-num">'; inList = true; }
                const content = inlineFormat(line.replace(/^\d+\.\s+/, ''));
                html += `<li class="bot-list-item">${content}</li>`;
                return;
            }
            // Empty line
            if (line.trim() === '') {
                if (inList) { html += '</ul>'; inList = false; }
                html += '<div class="bot-spacer"></div>';
                return;
            }
            // Normal paragraph
            if (inList) { html += '</ul>'; inList = false; }
            html += `<p class="bot-para">${inlineFormat(line)}</p>`;
        });

        if (inList) html += '</ul>';
        return html;
    }

    function inlineFormat(text) {
        return escapeHtml(text)
            // **bold**
            .replace(/\*\*(.+?)\*\*/g, '<strong class="bot-bold">$1</strong>')
            // *italic*
            .replace(/\*(.+?)\*/g, '<em class="bot-em">$1</em>')
            // `code`
            .replace(/`([^`]+)`/g, '<code class="bot-code">$1</code>');
    }

    function addBotMessage(text) {
        const thread = document.getElementById('chatMessages');
        if (!thread) return;

        const wrap = document.createElement('div');
        wrap.className = 'flex justify-start mb-6 chat-msg-enter';

        const bubble = document.createElement('div');
        bubble.className = 'bot-bubble-rich';

        // Header row
        const header = document.createElement('div');
        header.className = 'bot-bubble-header';
        header.innerHTML = `
            <div class="bot-avatar">
                <span class="material-symbols-outlined" style="font-size:16px;font-variation-settings:'FILL' 1">smart_toy</span>
            </div>
            <span class="bot-name">CIA Intelligence</span>
            <span class="bot-timestamp">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>`;

        // Content
        const content = document.createElement('div');
        content.className = 'bot-content';

        bubble.appendChild(header);
        bubble.appendChild(content);
        wrap.appendChild(bubble);
        thread.appendChild(wrap);
        thread.scrollTo({ top: thread.scrollHeight, behavior: 'smooth' });

        // Typewriter-style word reveal
        const formatted = formatBotText(text);
        const temp = document.createElement('div');
        temp.innerHTML = formatted;
        const nodes = Array.from(temp.childNodes);

        let delay = 0;
        nodes.forEach(node => {
            const clone = node.cloneNode(true);
            clone.style.opacity = '0';
            clone.style.transform = 'translateY(6px)';
            clone.style.transition = `opacity 0.35s ease ${delay}ms, transform 0.35s ease ${delay}ms`;
            content.appendChild(clone);
            setTimeout(() => {
                clone.style.opacity = '1';
                clone.style.transform = 'translateY(0)';
                thread.scrollTo({ top: thread.scrollHeight, behavior: 'smooth' });
            }, delay + 30);
            delay += 60;
        });
    }

    function showLoadingMessage() {
        const thread = document.getElementById('chatMessages');
        if (!thread) return;
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
                <div class="thinking-label">Processing intelligence</div>
                <div class="thinking-phases">
                    <span class="phase active" data-phase="0">Scanning memory bank</span>
                    <span class="phase" data-phase="1">Cross-referencing signals</span>
                    <span class="phase" data-phase="2">Synthesizing insights</span>
                </div>
                <div class="thinking-bar"><div class="thinking-bar-fill"></div></div>
            </div>
        </div>`;
        thread.appendChild(loader);
        thread.scrollTo({ top: thread.scrollHeight, behavior: 'smooth' });
        // Cycle phase labels
        let p = 0;
        loader._phaseTimer = setInterval(() => {
            const phases = loader.querySelectorAll('.phase');
            phases.forEach(el => el.classList.remove('active'));
            p = (p + 1) % phases.length;
            phases[p].classList.add('active');
        }, 1400);
    }

    function removeLoadingMessage() {
        const el = document.getElementById('chatLoader');
        if (el) {
            clearInterval(el._phaseTimer);
            el.remove();
        }
    }

    async function sendQuery(event) {
        if (event && event.preventDefault) event.preventDefault();
        showPage('chatPage');
        const input = document.getElementById('chatInput');
        const text = input ? input.value.trim() : '';
        if (!text) return;
        input.value = '';
        addUserMessage(text);
        showLoadingMessage();
        try {
            const data = await callApi(`${API_BASE}/query`, 'POST', { question: text });
            removeLoadingMessage();
            addBotMessage(data.answer || ('Error: ' + (data.error || 'Unknown')));
        } catch {
            removeLoadingMessage();
            addBotMessage("Sorry, I can't reach the intelligence bank right now.");
        }
    }

    // ── Ingest ───────────────────────────────────────────────
    async function ingestSignal() {
        const textEl = document.getElementById('ingestText');
        const compEl = document.getElementById('ingestCompetitor');
        if (!textEl.value.trim()) return alert('Please specify intelligence content.');
        try {
            const res = await fetch(`${API_BASE}/ingest`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: textEl.value.trim(), competitor_name: compEl.value.trim() || 'Market General' })
            });
            if (res.ok) {
                alert('Signal committed to intelligence bank.');
                textEl.value = '';
                compEl.value = '';
                updateDashboard();
            } else { alert('Commit failed.'); }
        } catch { alert('Bridge error.'); }
    }

    // ── Admin ────────────────────────────────────────────────
    async function clearMemory() {
        if (!confirm('Permanently delete all signals from the memory bank?')) return;
        const btn = document.getElementById('clearMemoryBtn');
        if (btn) btn.textContent = 'Clearing...';
        try {
            const res = await callApi(`${API_BASE}/reset`, 'POST');
            if (res.deleted !== undefined) { alert('Memory bank cleared.'); updateDashboard(); }
            else alert('Clear failed: ' + (res.error || 'Unknown'));
        } catch { alert('Failed to reach reset endpoint.'); }
        finally { if (btn) btn.innerHTML = '<span class="material-symbols-outlined text-[18px]">delete_forever</span> Clear All Signals'; }
    }

    async function seedData() {
        const btn = document.getElementById('seedBtn');
        if (btn) btn.textContent = 'Syncing...';
        try {
            await callApi(`${API_BASE}/seed`, 'POST');
            alert('Intelligence network synced.');
            updateDashboard();
        } catch { alert('Sync failed.'); }
        finally { if (btn) btn.innerHTML = '<span class="material-symbols-outlined text-[18px]">rocket_launch</span> Execute Seed Protocol'; }
    }

    // ── Dashboard ────────────────────────────────────────────
    async function updateDashboard() {
        try {
            const stats = await callApi(`${API_BASE}/analytics/stats`);
            setText('stat-total-signals', stats.total_signals ?? 0);
            setText('stat-active-competitors', stats.active_competitors ?? 0);
            setText('stat-patterns', stats.patterns_detected ?? 0);
        } catch { /* silent */ }

        try {
            const data = await callApi(`${API_BASE}/signals?limit=200`);
            const signals = data.signals || [];
            renderActivityChart(signals, currentRange);
            renderDonutChart(signals);
            renderCompetitorBars(signals);
        } catch { /* silent */ }
    }

    function setText(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    // ── Time Range State ─────────────────────────────────────
    let currentRange = '1W';

    function setTimeRange(range) {
        currentRange = range;
        document.querySelectorAll('.time-btn').forEach(btn => {
            const active = btn.getAttribute('data-range') === range;
            btn.style.background = active ? 'rgba(43,89,255,0.2)' : 'var(--pill-bg)';
            btn.style.borderColor = active ? 'rgba(43,89,255,0.4)' : 'var(--pill-border)';
            btn.style.color = active ? '#7b9fff' : 'var(--text-secondary)';
        });
        // Re-render with current signals
        callApi(`${API_BASE}/signals?limit=200`)
            .then(d => renderActivityChart(d.signals || [], range))
            .catch(() => renderActivityChart([], range));
    }

    // ── Activity Line Chart ───────────────────────────────────
    function renderActivityChart(signals, range) {
        const W = 600, H = 200, PAD = { top: 10, right: 10, bottom: 28, left: 8 };
        const innerW = W - PAD.left - PAD.right;
        const innerH = H - PAD.top - PAD.bottom;

        // Build time buckets
        const now = new Date();
        let buckets, labelFn;

        if (range === '1D') {
            buckets = Array.from({ length: 24 }, (_, i) => {
                const d = new Date(now);
                d.setHours(now.getHours() - 23 + i, 0, 0, 0);
                return { key: d.toISOString().slice(0, 13), label: i % 4 === 0 ? `${d.getHours()}h` : '', signals: 0, competitors: new Set() };
            });
            labelFn = s => new Date(s.event_date).toISOString().slice(0, 13);
        } else if (range === '1W') {
            buckets = Array.from({ length: 7 }, (_, i) => {
                const d = new Date(now);
                d.setDate(now.getDate() - 6 + i);
                return { key: d.toISOString().slice(0, 10), label: d.toLocaleDateString('en', { weekday: 'short' }), signals: 0, competitors: new Set() };
            });
            labelFn = s => new Date(s.event_date).toISOString().slice(0, 10);
        } else { // 1M
            buckets = Array.from({ length: 30 }, (_, i) => {
                const d = new Date(now);
                d.setDate(now.getDate() - 29 + i);
                return { key: d.toISOString().slice(0, 10), label: i % 5 === 0 ? d.toLocaleDateString('en', { month: 'short', day: 'numeric' }) : '', signals: 0, competitors: new Set() };
            });
            labelFn = s => new Date(s.event_date).toISOString().slice(0, 10);
        }

        const bucketMap = Object.fromEntries(buckets.map(b => [b.key, b]));

        signals.forEach(s => {
            if (!s.event_date || s.event_date === 'unknown') return;
            const key = labelFn(s);
            if (bucketMap[key]) {
                bucketMap[key].signals++;
                if (s.competitor_name) bucketMap[key].competitors.add(s.competitor_name);
            }
        });

        const sigVals = buckets.map(b => b.signals);
        const compVals = buckets.map(b => b.competitors.size);
        const maxSig = Math.max(...sigVals, 1);
        const maxComp = Math.max(...compVals, 1);

        const xOf = i => PAD.left + (i / (buckets.length - 1)) * innerW;
        const yOf = (v, max) => PAD.top + innerH - (v / max) * innerH;

        // Grid lines
        const gridG = document.getElementById('chartGridLines');
        if (!gridG) return;
        gridG.innerHTML = '';
        [0, 0.25, 0.5, 0.75, 1].forEach(t => {
            const y = PAD.top + innerH * (1 - t);
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', PAD.left); line.setAttribute('x2', W - PAD.right);
            line.setAttribute('y1', y); line.setAttribute('y2', y);
            line.setAttribute('class', 'chart-grid-line');
            gridG.appendChild(line);
        });

        // Build path strings
        const linePath = sigVals.map((v, i) => `${i === 0 ? 'M' : 'L'}${xOf(i)},${yOf(v, maxSig)}`).join(' ');
        const areaPath = linePath + ` L${xOf(buckets.length - 1)},${PAD.top + innerH} L${xOf(0)},${PAD.top + innerH} Z`;
        const linePath2 = compVals.map((v, i) => `${i === 0 ? 'M' : 'L'}${xOf(i)},${yOf(v, maxComp)}`).join(' ');

        // Apply paths (reset animation first)
        const lp = document.getElementById('chartLinePath');
        const ap = document.getElementById('chartAreaPath');
        const lp2 = document.getElementById('chartLinePath2');
        if (!lp || !ap || !lp2) return;

        [lp, ap, lp2].forEach(el => { el.classList.remove('animated'); });

        lp.setAttribute('d', linePath);
        ap.setAttribute('d', areaPath);
        lp2.setAttribute('d', linePath2);

        requestAnimationFrame(() => requestAnimationFrame(() => {
            lp.classList.add('animated');
            ap.classList.add('animated');
            lp2.classList.add('animated');
        }));

        // Dots
        const dotsG = document.getElementById('chartDots');
        dotsG.innerHTML = '';
        const tooltip = document.getElementById('chartTooltip');

        buckets.forEach((b, i) => {
            // Signal dot
            const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            dot.setAttribute('cx', xOf(i)); dot.setAttribute('cy', yOf(b.signals, maxSig));
            dot.setAttribute('r', 4); dot.setAttribute('class', 'chart-dot');
            dot.addEventListener('mouseenter', (e) => {
                dot.setAttribute('r', 6);
                showChartTooltip(tooltip, xOf(i), yOf(b.signals, maxSig), b.label || b.key, b.signals, b.competitors.size);
            });
            dot.addEventListener('mouseleave', () => {
                dot.setAttribute('r', 4);
                tooltip.classList.remove('visible');
            });
            dotsG.appendChild(dot);
            setTimeout(() => dot.classList.add('visible'), 400 + i * 30);

            // Competitor dot
            const dot2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            dot2.setAttribute('cx', xOf(i)); dot2.setAttribute('cy', yOf(b.competitors.size, maxComp));
            dot2.setAttribute('r', 3); dot2.setAttribute('class', 'chart-dot-2');
            dotsG.appendChild(dot2);
            setTimeout(() => dot2.classList.add('visible'), 600 + i * 30);
        });

        // X-axis labels
        const axisG = document.getElementById('chartAxisX');
        axisG.innerHTML = '';
        buckets.forEach((b, i) => {
            if (!b.label) return;
            const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            t.setAttribute('x', xOf(i)); t.setAttribute('y', H - 4);
            t.setAttribute('text-anchor', 'middle'); t.setAttribute('class', 'chart-axis-text');
            t.textContent = b.label;
            axisG.appendChild(t);
        });
    }

    function showChartTooltip(tooltip, x, y, label, sig, comp) {
        document.getElementById('ttLabel').textContent = label;
        document.getElementById('ttVal').textContent = `${sig} signals`;
        document.getElementById('ttVal2').textContent = `${comp} competitors`;
        tooltip.style.left = x + 'px';
        tooltip.style.top = y + 'px';
        tooltip.classList.add('visible');
    }

    // ── Donut Chart ───────────────────────────────────────────
    function renderDonutChart(signals) {
        const counts = {};
        signals.forEach(s => {
            const t = s.signal_type || 'other';
            counts[t] = (counts[t] || 0) + 1;
        });

        const colors = ['#2b59ff', '#00e5a0', '#ffb547', '#ff4d6d', '#a78bfa'];
        const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
        const total = entries.reduce((s, [, v]) => s + v, 0) || 1;

        const arcsG = document.getElementById('donutArcs');
        const legend = document.getElementById('donutLegend');
        const centerText = document.getElementById('donutCenter');
        if (!arcsG || !legend) return;

        arcsG.innerHTML = '';
        legend.innerHTML = '';
        if (centerText) centerText.textContent = total;

        const R = 54, r = 34;
        let angle = -Math.PI / 2;

        entries.forEach(([type, count], idx) => {
            const slice = (count / total) * 2 * Math.PI;
            const x1 = Math.cos(angle) * R, y1 = Math.sin(angle) * R;
            const x2 = Math.cos(angle + slice) * R, y2 = Math.sin(angle + slice) * R;
            const ix1 = Math.cos(angle) * r, iy1 = Math.sin(angle) * r;
            const ix2 = Math.cos(angle + slice) * r, iy2 = Math.sin(angle + slice) * r;
            const large = slice > Math.PI ? 1 : 0;
            const color = colors[idx % colors.length];

            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', `M${x1},${y1} A${R},${R} 0 ${large},1 ${x2},${y2} L${ix2},${iy2} A${r},${r} 0 ${large},0 ${ix1},${iy1} Z`);
            path.setAttribute('fill', color);
            path.setAttribute('opacity', '0.85');
            path.style.transition = 'opacity 0.2s';
            path.addEventListener('mouseenter', () => path.setAttribute('opacity', '1'));
            path.addEventListener('mouseleave', () => path.setAttribute('opacity', '0.85'));
            arcsG.appendChild(path);

            // Legend item
            const item = document.createElement('div');
            item.className = 'flex items-center justify-between';
            item.innerHTML = `
                <div class="flex items-center gap-2">
                    <div style="width:10px;height:10px;border-radius:3px;background:${color};flex-shrink:0"></div>
                    <span class="text-xs font-semibold capitalize" style="color:var(--text-secondary)">${escapeHtml(type)}</span>
                </div>
                <span class="text-xs font-bold" style="color:var(--text-primary)">${count}</span>`;
            legend.appendChild(item);

            angle += slice;
        });

        if (entries.length === 0) {
            if (centerText) centerText.textContent = '—';
            legend.innerHTML = `<p class="text-xs text-center" style="color:var(--text-muted)">No signals yet</p>`;
        }
    }

    // ── Competitor Bar Chart ──────────────────────────────────
    function renderCompetitorBars(signals) {
        const container = document.getElementById('competitorBars');
        if (!container) return;

        const counts = {};
        signals.forEach(s => {
            const name = s.competitor_name || 'Unknown';
            counts[name] = (counts[name] || 0) + 1;
        });

        const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
        const max = entries[0]?.[1] || 1;
        const colors = ['#2b59ff', '#00e5a0', '#ffb547', '#ff4d6d', '#a78bfa', '#38bdf8'];

        if (entries.length === 0) {
            container.innerHTML = `<p class="text-xs text-center py-8" style="color:var(--text-muted)">No competitor data yet</p>`;
            return;
        }

        container.innerHTML = entries.map(([name, count], i) => {
            const pct = Math.round((count / max) * 100);
            const color = colors[i % colors.length];
            const initials = name.slice(0, 2).toUpperCase();
            return `
            <div class="flex items-center gap-3">
                <div class="competitor-avatar" style="background:${color}22;color:${color};font-size:0.7rem">${escapeHtml(initials)}</div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between mb-1">
                        <span class="text-xs font-bold truncate" style="color:var(--text-primary)">${escapeHtml(name)}</span>
                        <span class="text-xs font-bold ml-2" style="color:${color}">${count}</span>
                    </div>
                    <div style="height:5px;background:var(--border);border-radius:4px;overflow:hidden">
                        <div class="bar-fill" style="height:100%;width:0%;background:${color};border-radius:4px;transition:width 0.9s cubic-bezier(0.16,1,0.3,1) ${i * 80}ms" data-target="${pct}"></div>
                    </div>
                </div>
            </div>`;
        }).join('');

        // Animate bars
        requestAnimationFrame(() => requestAnimationFrame(() => {
            container.querySelectorAll('.bar-fill').forEach(bar => {
                bar.style.width = bar.getAttribute('data-target') + '%';
            });
        }));
    }

    // ── Init ─────────────────────────────────────────────────
    function init() {
        showPage('dashboardPage');

        // Time range buttons
        document.querySelectorAll('.time-btn').forEach(btn => {
            btn.addEventListener('click', () => setTimeRange(btn.getAttribute('data-range')));
        });
        // Set initial active state
        setTimeRange('1W');

        // Chat input enter key
        const chatInput = document.getElementById('chatInput');
        if (chatInput) chatInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); sendQuery(e); } });

        // Header search
        const searchInput = document.getElementById('headerSearchInput');
        if (searchInput) {
            searchInput.addEventListener('keydown', e => {
                if (e.key === 'Enter') {
                    const q = searchInput.value.trim();
                    if (q) {
                        const ci = document.getElementById('chatInput');
                        if (ci) ci.value = q;
                        sendQuery();
                        searchInput.value = '';
                    }
                }
            });
        }

        // Sidebar nav
        document.querySelectorAll('.sidebar-item').forEach(link => {
            link.addEventListener('click', e => {
                const pageId = link.getAttribute('data-page');
                if (pageId) { e.preventDefault(); showPage(pageId); }
            });
        });
    }

    return { showPage, sendQuery, ingestSignal, seedData, clearMemory, updateDashboard, init };
})();

// Global shims for HTML onclick attributes
function showPage(id)    { app.showPage(id); }
function sendQuery(e)    { app.sendQuery(e); }
function ingestSignal()  { app.ingestSignal(); }
function seedData()      { app.seedData(); }
function clearMemory()   { app.clearMemory(); }

document.addEventListener('DOMContentLoaded', app.init);
