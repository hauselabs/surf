import type { SurfManifest } from '@surfjs/core';

export interface HtmlOptions {
  title: string;
  manifest: SurfManifest;
  manifestPath: string;
  executePath: string;
}

/**
 * Generate the self-contained DevUI HTML.
 * Scandinavian minimalism: Inter font, clean lines, generous whitespace.
 */
export function generateHtml(options: HtmlOptions): string {
  const { title, manifest, manifestPath, executePath } = options;
  const manifestJson = JSON.stringify(manifest);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)} — Surf DevUI</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: #fafafa;
      --surface: #ffffff;
      --border: #e8e8e8;
      --border-subtle: #f0f0f0;
      --text: #111111;
      --text-muted: #888888;
      --text-light: #aaaaaa;
      --accent: #0066ff;
      --accent-hover: #0052cc;
      --accent-subtle: #e8f0ff;
      --success: #00a651;
      --success-subtle: #e6f6ed;
      --error: #d93025;
      --error-subtle: #fce8e6;
      --warning: #e37400;
      --mono: 'JetBrains Mono', 'SF Mono', monospace;
      --sans: 'Inter', -apple-system, sans-serif;
      --radius: 6px;
      --radius-sm: 4px;
      --shadow: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
      --shadow-md: 0 4px 12px rgba(0,0,0,0.08);
    }

    html, body { height: 100%; }

    body {
      font-family: var(--sans);
      font-size: 14px;
      color: var(--text);
      background: var(--bg);
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }

    /* ── Layout ─────────────────────────────────────────────────────────── */

    .app {
      display: grid;
      grid-template-rows: 52px 1fr;
      grid-template-columns: 260px 1fr;
      height: 100vh;
      overflow: hidden;
    }

    /* ── Header ─────────────────────────────────────────────────────────── */

    .header {
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 0 20px;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      box-shadow: var(--shadow);
      z-index: 10;
    }

    .header-brand {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      font-size: 15px;
      color: var(--text);
    }

    .header-brand .logo {
      font-size: 18px;
    }

    .header-badge {
      font-size: 11px;
      font-weight: 500;
      color: var(--text-muted);
      background: var(--border-subtle);
      border: 1px solid var(--border);
      padding: 2px 8px;
      border-radius: 20px;
    }

    .header-spacer { flex: 1; }

    .auth-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .auth-label {
      font-size: 12px;
      color: var(--text-muted);
      white-space: nowrap;
    }

    .auth-input {
      font-family: var(--mono);
      font-size: 12px;
      padding: 5px 10px;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--bg);
      color: var(--text);
      width: 240px;
      outline: none;
      transition: border-color 0.15s;
    }

    .auth-input:focus {
      border-color: var(--accent);
      background: var(--surface);
    }

    .auth-input::placeholder { color: var(--text-light); }

    /* ── Sidebar ─────────────────────────────────────────────────────────── */

    .sidebar {
      background: var(--surface);
      border-right: 1px solid var(--border);
      overflow-y: auto;
      display: flex;
      flex-direction: column;
    }

    .sidebar-header {
      padding: 16px 16px 12px;
      border-bottom: 1px solid var(--border-subtle);
    }

    .sidebar-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
    }

    .sidebar-count {
      font-size: 11px;
      color: var(--text-light);
      margin-top: 2px;
    }

    .sidebar-search {
      margin: 10px 12px 0;
    }

    .sidebar-search input {
      width: 100%;
      padding: 6px 10px;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--bg);
      font-family: var(--sans);
      font-size: 13px;
      color: var(--text);
      outline: none;
      transition: border-color 0.15s;
    }

    .sidebar-search input:focus { border-color: var(--accent); }
    .sidebar-search input::placeholder { color: var(--text-light); }

    .cmd-list {
      padding: 8px 0;
      flex: 1;
    }

    .cmd-group-label {
      padding: 10px 16px 4px;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--text-light);
    }

    .cmd-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 7px 16px;
      cursor: pointer;
      border-left: 2px solid transparent;
      transition: background 0.1s, border-color 0.1s;
      font-size: 13px;
      color: var(--text);
      user-select: none;
    }

    .cmd-item:hover { background: var(--bg); }

    .cmd-item.active {
      background: var(--accent-subtle);
      border-left-color: var(--accent);
      color: var(--accent);
      font-weight: 500;
    }

    .cmd-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--border);
      flex-shrink: 0;
    }

    .cmd-item.active .cmd-dot { background: var(--accent); }

    .cmd-auth-badge {
      margin-left: auto;
      font-size: 10px;
      padding: 1px 5px;
      border-radius: 3px;
      font-weight: 500;
    }

    .badge-required { background: #fff0e6; color: #c45000; }
    .badge-optional { background: #fffbe6; color: #8a6600; }

    /* ── Main panel ──────────────────────────────────────────────────────── */

    .main {
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--bg);
    }

    .empty-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: var(--text-muted);
      gap: 8px;
    }

    .empty-state .wave { font-size: 48px; }
    .empty-state .empty-title { font-size: 16px; font-weight: 500; color: var(--text); }
    .empty-state .empty-sub { font-size: 13px; }

    /* ── Command detail ──────────────────────────────────────────────────── */

    .cmd-detail {
      flex: 1;
      overflow-y: auto;
      padding: 24px;
      display: none;
      flex-direction: column;
      gap: 20px;
    }

    .cmd-detail.visible { display: flex; }

    .detail-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
    }

    .detail-name {
      font-size: 20px;
      font-weight: 600;
      font-family: var(--mono);
      color: var(--text);
      word-break: break-all;
    }

    .detail-desc {
      font-size: 14px;
      color: var(--text-muted);
      margin-top: 4px;
      line-height: 1.6;
    }

    .detail-meta {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 8px;
    }

    .meta-tag {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 20px;
      font-weight: 500;
    }

    .tag-auth-required { background: #fff0e6; color: #c45000; }
    .tag-auth-optional { background: #fffbe6; color: #8a6600; }
    .tag-auth-none { background: var(--success-subtle); color: var(--success); }
    .tag-hint { background: var(--border-subtle); color: var(--text-muted); border: 1px solid var(--border); }

    /* ── Form ────────────────────────────────────────────────────────────── */

    .section-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
      margin-bottom: 10px;
    }

    .param-form {
      display: flex;
      flex-direction: column;
      gap: 12px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 16px;
    }

    .param-row {
      display: grid;
      grid-template-columns: 1fr 2fr;
      gap: 12px;
      align-items: start;
    }

    .param-label-col { padding-top: 7px; }

    .param-name {
      font-family: var(--mono);
      font-size: 12px;
      font-weight: 500;
      color: var(--text);
    }

    .param-type {
      font-size: 11px;
      color: var(--text-light);
      margin-top: 2px;
    }

    .param-required {
      font-size: 10px;
      color: var(--error);
      font-weight: 500;
    }

    .param-input {
      width: 100%;
      padding: 6px 10px;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--bg);
      font-family: var(--sans);
      font-size: 13px;
      color: var(--text);
      outline: none;
      transition: border-color 0.15s;
    }

    .param-input:focus { border-color: var(--accent); background: var(--surface); }
    .param-input.mono { font-family: var(--mono); font-size: 12px; }

    .param-input[type="checkbox"] {
      width: auto;
      cursor: pointer;
    }

    .no-params {
      font-size: 13px;
      color: var(--text-muted);
      font-style: italic;
    }

    .execute-row {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border: none;
      border-radius: var(--radius-sm);
      font-family: var(--sans);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.15s, transform 0.1s;
      outline: none;
    }

    .btn:active { transform: translateY(1px); }

    .btn-primary {
      background: var(--accent);
      color: #fff;
    }

    .btn-primary:hover { background: var(--accent-hover); }
    .btn-primary:disabled { background: #99bbff; cursor: not-allowed; }

    .btn-ghost {
      background: var(--surface);
      color: var(--text-muted);
      border: 1px solid var(--border);
    }

    .btn-ghost:hover { background: var(--bg); color: var(--text); }

    .exec-status {
      font-size: 12px;
      color: var(--text-muted);
    }

    .kbd-hint {
      font-size: 11px;
      color: var(--text-light);
      background: var(--border-subtle);
      border: 1px solid var(--border);
      padding: 1px 6px;
      border-radius: var(--radius-sm);
      font-family: var(--sans);
    }

    /* ── Log panel ───────────────────────────────────────────────────────── */

    .log-panel {
      border-top: 1px solid var(--border);
      background: #1a1a1a;
      display: flex;
      flex-direction: column;
      max-height: 320px;
      min-height: 44px;
      transition: max-height 0.2s ease;
    }

    .log-panel.collapsed { max-height: 44px; }

    .log-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 0 16px;
      height: 44px;
      border-bottom: 1px solid #2a2a2a;
      cursor: pointer;
      user-select: none;
      flex-shrink: 0;
    }

    .log-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #888;
    }

    .log-count {
      font-size: 11px;
      background: #2a2a2a;
      color: #aaa;
      padding: 1px 6px;
      border-radius: 10px;
    }

    .log-toggle {
      margin-left: auto;
      font-size: 11px;
      color: #666;
    }

    .log-body {
      overflow-y: auto;
      flex: 1;
      padding: 8px 0;
    }

    .log-entry {
      border-bottom: 1px solid #222;
      padding: 10px 16px;
    }

    .log-entry:last-child { border-bottom: none; }

    .log-entry-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }

    .log-cmd {
      font-family: var(--mono);
      font-size: 12px;
      color: #ccc;
      font-weight: 500;
    }

    .log-status {
      font-size: 11px;
      padding: 1px 6px;
      border-radius: 3px;
      font-weight: 600;
    }

    .log-ok { background: #0a2e1a; color: #4caf7d; }
    .log-err { background: #2e0a0a; color: #f56565; }

    .log-time {
      font-size: 11px;
      color: #555;
      margin-left: auto;
    }

    .log-json {
      font-family: var(--mono);
      font-size: 11px;
      line-height: 1.6;
      color: #aaa;
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 120px;
      overflow-y: auto;
    }

    .log-json .key { color: #79b8ff; }
    .log-json .str { color: #9ecbff; }
    .log-json .num { color: #f8c555; }
    .log-json .bool { color: #f97583; }
    .log-json .null-val { color: #f97583; }

    /* ── Scrollbar ───────────────────────────────────────────────────────── */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: #ccc; }

    /* ── Responsive tweaks ──────────────────────────────────────────────── */
    @media (max-width: 640px) {
      .app { grid-template-columns: 1fr; grid-template-rows: 52px 1fr; }
      .sidebar { display: none; }
    }
  </style>
</head>
<body>
<div class="app" id="app">

  <!-- Header -->
  <header class="header">
    <div class="header-brand">
      <span class="logo">🏄</span>
      <span id="app-title">${escapeHtml(title)}</span>
    </div>
    <span class="header-badge">Surf DevUI</span>
    <div class="header-spacer"></div>
    <div class="auth-row">
      <span class="auth-label">Bearer token</span>
      <input type="password" class="auth-input" id="auth-token" placeholder="optional auth token…" />
    </div>
  </header>

  <!-- Sidebar -->
  <nav class="sidebar">
    <div class="sidebar-header">
      <div class="sidebar-title">Commands</div>
      <div class="sidebar-count" id="cmd-count"></div>
    </div>
    <div class="sidebar-search">
      <input type="text" id="search-input" placeholder="Filter commands… ( / )" />
    </div>
    <div class="cmd-list" id="cmd-list"></div>
  </nav>

  <!-- Main -->
  <main class="main" id="main">

    <!-- Empty state -->
    <div class="empty-state" id="empty-state">
      <div class="wave">🏄</div>
      <div class="empty-title">Surf DevUI</div>
      <div class="empty-sub">Select a command from the sidebar to get started.</div>
    </div>

    <!-- Command detail -->
    <div class="cmd-detail" id="cmd-detail">
      <div class="detail-header">
        <div>
          <div class="detail-name" id="detail-name"></div>
          <div class="detail-desc" id="detail-desc"></div>
          <div class="detail-meta" id="detail-meta"></div>
        </div>
      </div>

      <div>
        <div class="section-title">Parameters</div>
        <div class="param-form" id="param-form"></div>
      </div>

      <div class="execute-row">
        <button class="btn btn-primary" id="exec-btn" onclick="executeCommand()" title="⌘Enter">
          ▶ Execute
        </button>
        <button class="btn btn-ghost" onclick="clearForm()">Clear</button>
        <span class="kbd-hint">⌘↵</span>
        <span class="exec-status" id="exec-status"></span>
      </div>
    </div>

    <!-- Log panel -->
    <div class="log-panel" id="log-panel">
      <div class="log-header" onclick="toggleLog()">
        <span class="log-title">Request Log</span>
        <span class="log-count" id="log-count">0</span>
        <span class="log-toggle" id="log-toggle">▲ Expand</span>
      </div>
      <div class="log-body" id="log-body"></div>
    </div>

  </main>
</div>

<script>
(function() {
  const MANIFEST = ${manifestJson};
  const EXECUTE_PATH = ${JSON.stringify(executePath)};

  let selectedCommand = null;
  let logEntries = [];
  let logExpanded = false;
  const inputs = {};

  // ── Build command tree ──────────────────────────────────────────────────

  function getGroups(commands) {
    const groups = {};
    const ungrouped = [];
    for (const [name, def] of Object.entries(commands)) {
      const dot = name.indexOf('.');
      if (dot === -1) {
        ungrouped.push({ name, def });
      } else {
        const group = name.slice(0, dot);
        if (!groups[group]) groups[group] = [];
        groups[group].push({ name, def });
      }
    }
    return { groups, ungrouped };
  }

  function renderSidebar(filter) {
    const list = document.getElementById('cmd-list');
    const allCmds = MANIFEST.commands;
    const count = Object.keys(allCmds).length;
    document.getElementById('cmd-count').textContent = count + ' command' + (count !== 1 ? 's' : '');

    const lc = (filter || '').toLowerCase();
    const filtered = Object.fromEntries(
      Object.entries(allCmds).filter(([name]) => !lc || name.toLowerCase().includes(lc))
    );

    const { groups, ungrouped } = getGroups(filtered);
    list.innerHTML = '';

    // Ungrouped
    for (const { name, def } of ungrouped) {
      list.appendChild(makeCmdItem(name, def));
    }

    // Groups
    for (const [group, items] of Object.entries(groups)) {
      const label = document.createElement('div');
      label.className = 'cmd-group-label';
      label.textContent = group;
      list.appendChild(label);
      for (const { name, def } of items) {
        const item = makeCmdItem(name, def);
        item.querySelector('.cmd-name').textContent = name.slice(group.length + 1);
        list.appendChild(item);
      }
    }
  }

  function makeCmdItem(name, def) {
    const div = document.createElement('div');
    div.className = 'cmd-item' + (selectedCommand === name ? ' active' : '');
    div.dataset.cmd = name;
    div.onclick = () => selectCommand(name);

    const dot = document.createElement('div');
    dot.className = 'cmd-dot';

    const label = document.createElement('span');
    label.className = 'cmd-name';
    label.textContent = name;

    div.appendChild(dot);
    div.appendChild(label);

    if (def.auth === 'required') {
      const badge = document.createElement('span');
      badge.className = 'cmd-auth-badge badge-required';
      badge.textContent = 'auth';
      div.appendChild(badge);
    } else if (def.auth === 'optional') {
      const badge = document.createElement('span');
      badge.className = 'cmd-auth-badge badge-optional';
      badge.textContent = 'auth?';
      div.appendChild(badge);
    }

    return div;
  }

  // ── Select command ──────────────────────────────────────────────────────

  function selectCommand(name) {
    selectedCommand = name;
    document.querySelectorAll('.cmd-item').forEach(el => {
      el.classList.toggle('active', el.dataset.cmd === name);
    });

    const def = MANIFEST.commands[name];
    if (!def) return;

    document.getElementById('empty-state').style.display = 'none';
    const detail = document.getElementById('cmd-detail');
    detail.classList.add('visible');

    document.getElementById('detail-name').textContent = name;
    document.getElementById('detail-desc').textContent = def.description || '';

    // Meta tags
    const meta = document.getElementById('detail-meta');
    meta.innerHTML = '';
    const auth = def.auth || 'none';
    const authTag = document.createElement('span');
    authTag.className = 'meta-tag tag-auth-' + auth;
    authTag.textContent = auth === 'none' ? 'public' : 'auth: ' + auth;
    meta.appendChild(authTag);

    if (def.hints) {
      if (def.hints.idempotent) addTag(meta, 'idempotent');
      if (def.hints.sideEffects) addTag(meta, 'side-effects');
      if (def.hints.estimatedMs) addTag(meta, '~' + def.hints.estimatedMs + 'ms');
    }
    if (def.tags) {
      for (const t of def.tags) addTag(meta, t);
    }

    buildParamForm(def.params || {});
  }

  function addTag(container, text) {
    const span = document.createElement('span');
    span.className = 'meta-tag tag-hint';
    span.textContent = text;
    container.appendChild(span);
  }

  // ── Build param form ────────────────────────────────────────────────────

  function buildParamForm(params) {
    const form = document.getElementById('param-form');
    form.innerHTML = '';

    const keys = Object.keys(params);
    if (keys.length === 0) {
      form.innerHTML = '<div class="no-params">No parameters required.</div>';
      return;
    }

    for (const [name, schema] of Object.entries(params)) {
      const row = document.createElement('div');
      row.className = 'param-row';

      const labelCol = document.createElement('div');
      labelCol.className = 'param-label-col';
      labelCol.innerHTML =
        '<div class="param-name">' + escHtml(name) + '</div>' +
        '<div class="param-type">' + escHtml(schema.type) + (schema.enum ? ' enum' : '') + '</div>' +
        (schema.required ? '<div class="param-required">required</div>' : '');

      const inputCol = document.createElement('div');
      let input;

      if (schema.type === 'boolean') {
        input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'param-input';
      } else if (schema.type === 'object' || schema.type === 'array') {
        input = document.createElement('textarea');
        input.className = 'param-input mono';
        input.rows = 3;
        input.placeholder = schema.type === 'array' ? '[]' : '{}';
      } else if (schema.enum) {
        input = document.createElement('select');
        input.className = 'param-input';
        const empty = document.createElement('option');
        empty.value = '';
        empty.textContent = '— select —';
        input.appendChild(empty);
        for (const opt of schema.enum) {
          const o = document.createElement('option');
          o.value = opt;
          o.textContent = opt;
          input.appendChild(o);
        }
      } else {
        input = document.createElement('input');
        input.type = schema.type === 'number' ? 'number' : 'text';
        input.className = 'param-input';
        input.placeholder = schema.description || schema.type;
        if (schema.default !== undefined) input.value = String(schema.default);
      }

      input.id = 'param-' + name;
      inputCol.appendChild(input);
      row.appendChild(labelCol);
      row.appendChild(inputCol);
      form.appendChild(row);
    }
  }

  // ── Execute ─────────────────────────────────────────────────────────────

  window.executeCommand = async function() {
    if (!selectedCommand) return;

    const def = MANIFEST.commands[selectedCommand];
    const params = {};
    const paramDefs = def.params || {};

    for (const [name, schema] of Object.entries(paramDefs)) {
      const el = document.getElementById('param-' + name);
      if (!el) continue;
      let val;
      if (schema.type === 'boolean') {
        val = el.checked;
      } else if (schema.type === 'object' || schema.type === 'array') {
        const raw = el.value.trim();
        if (!raw) continue;
        try { val = JSON.parse(raw); } catch { showStatus('Invalid JSON in ' + name, 'error'); return; }
      } else if (schema.type === 'number') {
        val = el.value === '' ? undefined : Number(el.value);
      } else {
        val = el.value === '' ? undefined : el.value;
      }
      if (val !== undefined) params[name] = val;
    }

    const btn = document.getElementById('exec-btn');
    btn.disabled = true;
    showStatus('Executing…', 'pending');

    const token = document.getElementById('auth-token').value.trim();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const start = Date.now();
    let response, data;
    try {
      response = await fetch(EXECUTE_PATH, {
        method: 'POST',
        headers,
        body: JSON.stringify({ command: selectedCommand, params }),
      });
      data = await response.json();
    } catch (e) {
      data = { ok: false, error: { code: 'NETWORK_ERROR', message: e.message } };
    }

    const elapsed = Date.now() - start;
    btn.disabled = false;

    if (data.ok) {
      showStatus('✓ ' + elapsed + 'ms', 'ok');
    } else {
      showStatus('✗ ' + (data.error?.code || 'ERROR') + ' · ' + elapsed + 'ms', 'error');
    }

    addLog(selectedCommand, params, data, elapsed);
  };

  window.clearForm = function() {
    if (!selectedCommand) return;
    const def = MANIFEST.commands[selectedCommand];
    for (const name of Object.keys(def.params || {})) {
      const el = document.getElementById('param-' + name);
      if (el) el.type === 'checkbox' ? (el.checked = false) : (el.value = '');
    }
    showStatus('', '');
  };

  function showStatus(msg, type) {
    const el = document.getElementById('exec-status');
    el.textContent = msg;
    el.style.color = type === 'ok' ? 'var(--success)' : type === 'error' ? 'var(--error)' : 'var(--text-muted)';
  }

  // ── Log ──────────────────────────────────────────────────────────────────

  function addLog(command, params, response, elapsedMs) {
    logEntries.unshift({ command, params, response, elapsedMs, ts: new Date() });
    if (logEntries.length > 50) logEntries.pop();
    renderLog();
    if (!logExpanded) toggleLog();
  }

  function renderLog() {
    const body = document.getElementById('log-body');
    document.getElementById('log-count').textContent = logEntries.length;
    body.innerHTML = '';

    for (const entry of logEntries) {
      const div = document.createElement('div');
      div.className = 'log-entry';

      const header = document.createElement('div');
      header.className = 'log-entry-header';
      header.innerHTML =
        '<span class="log-cmd">' + escHtml(entry.command) + '</span>' +
        '<span class="log-status ' + (entry.response.ok ? 'log-ok' : 'log-err') + '">' +
          (entry.response.ok ? '200 OK' : (entry.response.error?.code || 'ERROR')) +
        '</span>' +
        '<span class="log-time">' + entry.elapsedMs + 'ms · ' + entry.ts.toLocaleTimeString() + '</span>';

      const reqLabel = document.createElement('div');
      reqLabel.style.cssText = 'font-size:10px;color:#555;margin:4px 0 2px;text-transform:uppercase;letter-spacing:.06em';
      reqLabel.textContent = 'Request';

      const reqJson = document.createElement('div');
      reqJson.className = 'log-json';
      reqJson.innerHTML = syntaxHighlight(JSON.stringify(entry.params, null, 2));

      const resLabel = document.createElement('div');
      resLabel.style.cssText = 'font-size:10px;color:#555;margin:6px 0 2px;text-transform:uppercase;letter-spacing:.06em';
      resLabel.textContent = 'Response';

      const resJson = document.createElement('div');
      resJson.className = 'log-json';
      resJson.innerHTML = syntaxHighlight(JSON.stringify(entry.response, null, 2));

      div.appendChild(header);
      div.appendChild(reqLabel);
      div.appendChild(reqJson);
      div.appendChild(resLabel);
      div.appendChild(resJson);
      body.appendChild(div);
    }
  }

  window.toggleLog = function() {
    logExpanded = !logExpanded;
    const panel = document.getElementById('log-panel');
    panel.classList.toggle('collapsed', !logExpanded);
    document.getElementById('log-toggle').textContent = logExpanded ? '▼ Collapse' : '▲ Expand';
  };

  // ── Helpers ─────────────────────────────────────────────────────────────

  function syntaxHighlight(json) {
    return json
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function(match) {
        let cls = 'num';
        if (/^"/.test(match)) {
          cls = /:$/.test(match) ? 'key' : 'str';
        } else if (/true|false/.test(match)) {
          cls = 'bool';
        } else if (/null/.test(match)) {
          cls = 'null-val';
        }
        return '<span class="' + cls + '">' + match + '</span>';
      });
  }

  function escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  document.addEventListener('keydown', function(e) {
    // "/" focuses search (when not in an input)
    if (e.key === '/' && !isInputFocused()) {
      e.preventDefault();
      document.getElementById('search-input').focus();
      return;
    }

    // Cmd/Ctrl+Enter executes
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && selectedCommand) {
      e.preventDefault();
      executeCommand();
      return;
    }

    // Escape blurs current input
    if (e.key === 'Escape' && isInputFocused()) {
      document.activeElement.blur();
      return;
    }
  });

  function isInputFocused() {
    const tag = document.activeElement?.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  }

  // ── Init ─────────────────────────────────────────────────────────────────

  document.getElementById('search-input').addEventListener('input', function() {
    renderSidebar(this.value);
  });

  // Start collapsed
  document.getElementById('log-panel').classList.add('collapsed');

  renderSidebar('');
})();
</script>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
