export function buildDashboardHtml(_initialToken: string): string {
  // Self-contained modern dashboard; CSS and client JS are bundled into this module.
  // Functional for beta: list, create, start/stop, reindex, verify, playground, delete, logs tail.
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hoolix • Web GUI</title>
  <style>
    :root { --accent: #7dd3fc; color-scheme: dark; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    button, input, select { font: inherit; }
    button { border: 0; cursor: pointer; }
    a { color: inherit; text-decoration: none; }
    .font-display { font-family: "Segoe UI", Inter, ui-sans-serif, system-ui, sans-serif; }
    .card { transition: all 0.1s cubic-bezier(0.4, 0, 0.2, 1); }
    .card:hover { transform: translateY(-1px); box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1); }
    .status-dot { width: 10px; height: 10px; border-radius: 9999px; }
    .monospace { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
    .result-card { border-left: 3px solid #7dd3fc; }
    .nav-active { background-color: #27272a; color: white; border-radius: 6px; }
    .section-title { letter-spacing: -.025em; }
    pre { white-space: pre-wrap; }
    .hidden { display: none !important; }
    .fixed { position: fixed; } .inset-0 { inset: 0; } .z-50 { z-index: 50; }
    .flex { display: flex; } .grid { display: grid; } .block { display: block; }
    .flex-1 { flex: 1 1 0%; } .flex-col { flex-direction: column; } .flex-wrap { flex-wrap: wrap; }
    .items-center { align-items: center; } .items-start { align-items: flex-start; } .justify-center { justify-content: center; } .justify-between { justify-content: space-between; }
    .overflow-hidden { overflow: hidden; } .overflow-auto { overflow: auto; }
    .h-screen { height: 100vh; } .h-14 { height: 3.5rem; } .w-64 { width: 16rem; } .w-9 { width: 2.25rem; } .h-9 { height: 2.25rem; } .w-4 { width: 1rem; }
    .w-full { width: 100%; } .max-w-lg { max-width: 32rem; } .max-w-3xl { max-width: 48rem; } .max-w-sm { max-width: 24rem; } .mx-4 { margin-left: 1rem; margin-right: 1rem; } .mx-auto { margin-left: auto; margin-right: auto; }
    .mt-1 { margin-top: .25rem; } .mt-3 { margin-top: .75rem; } .mt-4 { margin-top: 1rem; } .mt-12 { margin-top: 3rem; } .mb-1 { margin-bottom: .25rem; } .mb-2 { margin-bottom: .5rem; } .mb-3 { margin-bottom: .75rem; } .mb-4 { margin-bottom: 1rem; } .ml-auto { margin-left: auto; } .-mt-1 { margin-top: -.25rem; }
    .p-3 { padding: .75rem; } .p-4 { padding: 1rem; } .p-5 { padding: 1.25rem; } .p-6 { padding: 1.5rem; } .px-1\\.5 { padding-left: .375rem; padding-right: .375rem; } .px-3 { padding-left: .75rem; padding-right: .75rem; } .px-4 { padding-left: 1rem; padding-right: 1rem; } .px-6 { padding-left: 1.5rem; padding-right: 1.5rem; } .py-px { padding-top: 1px; padding-bottom: 1px; } .py-1 { padding-top: .25rem; padding-bottom: .25rem; } .py-1\\.5 { padding-top: .375rem; padding-bottom: .375rem; } .py-2 { padding-top: .5rem; padding-bottom: .5rem; } .py-2\\.5 { padding-top: .625rem; padding-bottom: .625rem; } .py-3 { padding-top: .75rem; padding-bottom: .75rem; } .py-4 { padding-top: 1rem; padding-bottom: 1rem; } .pt-1 { padding-top: .25rem; } .py-12 { padding-top: 3rem; padding-bottom: 3rem; }
    .gap-2 { gap: .5rem; } .gap-3 { gap: .75rem; } .gap-x-1\\.5 { column-gap: .375rem; } .gap-x-2 { column-gap: .5rem; } .gap-x-3 { column-gap: .75rem; } .gap-x-4 { column-gap: 1rem; } .space-y-1 > * + * { margin-top: .25rem; } .space-y-3 > * + * { margin-top: .75rem; } .space-y-4 > * + * { margin-top: 1rem; }
    .rounded { border-radius: .25rem; } .rounded-lg { border-radius: .5rem; } .rounded-xl { border-radius: .75rem; } .rounded-2xl { border-radius: 1rem; } .rounded-3xl { border-radius: 1.5rem; } .rounded-full { border-radius: 9999px; }
    .border { border: 1px solid; } .border-r { border-right: 1px solid; } .border-b { border-bottom: 1px solid; } .border-t { border-top: 1px solid; }
    .border-zinc-700 { border-color: #3f3f46; } .border-zinc-800 { border-color: #27272a; }
    .bg-black\\/60 { background-color: rgb(0 0 0 / .6); } .bg-zinc-950 { background-color: #09090b; } .bg-zinc-900 { background-color: #18181b; } .bg-zinc-800 { background-color: #27272a; } .bg-zinc-700 { background-color: #3f3f46; } .bg-white { background-color: #fff; } .bg-sky-400 { background-color: #38bdf8; } .bg-sky-300 { background-color: #7dd3fc; } .bg-emerald-400 { background-color: #34d399; } .bg-zinc-500 { background-color: #71717a; } .bg-red-900\\/40 { background-color: rgb(127 29 29 / .4); } .bg-red-900\\/60 { background-color: rgb(127 29 29 / .6); } .bg-emerald-900\\/60 { background-color: rgb(6 78 59 / .6); }
    .text-black { color: #000; } .text-white { color: #fff; } .text-zinc-950 { color: #09090b; } .text-zinc-900 { color: #18181b; } .text-zinc-500 { color: #71717a; } .text-zinc-400 { color: #a1a1aa; } .text-zinc-300 { color: #d4d4d8; } .text-zinc-200 { color: #e4e4e7; } .text-sky-400 { color: #38bdf8; } .text-emerald-400 { color: #34d399; } .text-red-400 { color: #f87171; }
    .text-center { text-align: center; } .text-\\[10px\\] { font-size: 10px; } .text-xs { font-size: .75rem; line-height: 1rem; } .text-sm { font-size: .875rem; line-height: 1.25rem; } .text-base { font-size: 1rem; } .text-lg { font-size: 1.125rem; } .text-xl { font-size: 1.25rem; } .text-2xl { font-size: 1.5rem; } .text-4xl { font-size: 2.25rem; }
    .font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; } .font-medium { font-weight: 500; } .font-semibold { font-weight: 600; } .tracking-tight { letter-spacing: 0; } .tracking-tighter { letter-spacing: 0; } .tracking-widest { letter-spacing: .1em; } .uppercase { text-transform: uppercase; }
    .shadow-xl { box-shadow: 0 20px 25px -5px rgb(0 0 0 / .1), 0 8px 10px -6px rgb(0 0 0 / .1); } .backdrop-blur { backdrop-filter: blur(8px); }
    .transition { transition-property: color, background-color, border-color, transform, opacity; transition-duration: 150ms; }
    .hover\\:bg-zinc-800:hover { background-color: #27272a; } .hover\\:bg-zinc-700:hover { background-color: #3f3f46; } .hover\\:bg-zinc-100:hover { background-color: #f4f4f5; } .hover\\:bg-sky-300:hover { background-color: #7dd3fc; } .hover\\:bg-red-900:hover { background-color: #7f1d1d; } .hover\\:bg-emerald-900:hover { background-color: #064e3b; } .hover\\:text-white:hover { color: #fff; } .hover\\:underline:hover { text-decoration: underline; } .focus\\:border-sky-400:focus { border-color: #38bdf8; outline: none; }
    .grid-cols-1 { grid-template-columns: repeat(1, minmax(0, 1fr)); }
    .line-clamp-3 { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
    .fa-solid::before { display: inline-block; width: 1em; text-align: center; font-style: normal; }
    .fa-server::before { content: "H"; font-weight: 700; } .fa-list::before { content: "☰"; } .fa-plus::before { content: "+"; } .fa-search::before { content: "⌕"; } .fa-sync::before { content: "↻"; } .fa-times::before { content: "×"; }
    @media (min-width: 768px) { .md\\:grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); } .md\\:grid-cols-5 { grid-template-columns: repeat(5, minmax(0, 1fr)); } .md\\:col-span-2 { grid-column: span 2 / span 2; } }
    @media (min-width: 1024px) { .lg\\:grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  </style>
</head>
<body class="bg-zinc-950 text-zinc-200">
  <div class="flex h-screen overflow-hidden">
    <!-- Sidebar -->
    <div class="w-64 border-r border-zinc-800 bg-zinc-900 flex flex-col">
      <div class="p-6 border-b border-zinc-800">
        <div class="flex items-center gap-x-3">
          <div class="w-9 h-9 rounded-xl bg-sky-400 flex items-center justify-center">
            <i class="fa-solid fa-server text-zinc-950 text-xl"></i>
          </div>
          <div>
            <div class="font-display text-2xl font-semibold tracking-tighter">Hoolix</div>
            <div class="text-[10px] text-zinc-500 -mt-1">WEB GUI <span class="text-emerald-400">BETA</span></div>
          </div>
        </div>
      </div>

      <div class="p-3 flex-1">
        <div class="space-y-1 text-sm">
          <a href="#" onclick="showView('servers'); return false;" class="nav-link nav-active flex items-center gap-x-3 px-3 py-2 text-sm hover:bg-zinc-800 rounded-lg" data-view="servers">
            <i class="fa-solid fa-list w-4"></i> <span>Servers</span>
          </a>
          <a href="#" onclick="showCreateModal(); return false;" class="nav-link flex items-center gap-x-3 px-3 py-2 text-sm hover:bg-zinc-800 rounded-lg">
            <i class="fa-solid fa-plus w-4"></i> <span>Create Server</span>
          </a>
          <a href="#" onclick="showView('playground'); return false;" class="nav-link flex items-center gap-x-3 px-3 py-2 text-sm hover:bg-zinc-800 rounded-lg" data-view="playground">
            <i class="fa-solid fa-search w-4"></i> <span>Playground</span>
          </a>
          <a href="#" onclick="refreshAll(); return false;" class="flex items-center gap-x-3 px-3 py-2 text-sm hover:bg-zinc-800 rounded-lg text-zinc-400">
            <i class="fa-solid fa-sync w-4"></i> <span>Refresh</span>
          </a>
        </div>
      </div>

      <div class="p-4 border-t border-zinc-800 text-xs text-zinc-500">
        <div class="flex items-center justify-between">
          <div>Local only</div>
          <div id="token-hint" class="font-mono text-[10px] bg-zinc-800 px-1.5 py-px rounded cursor-pointer" onclick="copyToken()">token</div>
        </div>
        <div class="mt-1 text-[10px]">Port: <span id="port-display"></span></div>
      </div>
    </div>

    <!-- Main Content -->
    <div class="flex-1 flex flex-col overflow-hidden">
      <!-- Top bar -->
      <div class="h-14 border-b border-zinc-800 bg-zinc-900 px-6 flex items-center justify-between">
        <div class="flex items-center gap-x-3">
          <div id="view-title" class="font-semibold text-lg">Servers</div>
        </div>
        <div class="flex items-center gap-x-2 text-sm">
          <div class="px-3 py-1 bg-zinc-800 rounded-full text-xs flex items-center gap-x-1.5">
            <div class="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
            <span>Connected</span>
          </div>
          <button onclick="refreshAll()" class="px-3 py-1.5 text-xs rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center gap-x-2">
            <i class="fa-solid fa-sync fa-sm"></i> <span>Refresh</span>
          </button>
        </div>
      </div>

      <!-- Content area -->
      <div class="flex-1 overflow-auto p-6" id="main-content">
        <!-- Servers view (default) -->
        <div id="view-servers">
          <div class="flex items-center justify-between mb-4">
            <div>
              <div class="text-2xl font-semibold tracking-tight">Your MCP Servers</div>
              <div class="text-zinc-500 text-sm">Manage, start, and test your documentation servers</div>
            </div>
            <button onclick="showCreateModal()" class="px-4 py-2 bg-white text-zinc-900 rounded-xl text-sm font-medium flex items-center gap-x-2 hover:bg-zinc-100">
              <i class="fa-solid fa-plus"></i>
              <span>New Server</span>
            </button>
          </div>

          <div id="servers-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <!-- Populated by JS -->
          </div>
          <div id="servers-empty" class="hidden text-center py-12">
            <i class="fa-solid fa-server text-4xl text-zinc-700 mb-3"></i>
            <div class="text-zinc-400">No servers yet. Create your first one!</div>
          </div>
        </div>

        <!-- Playground view -->
        <div id="view-playground" class="hidden">
          <div class="max-w-3xl">
            <div class="mb-4">
              <div class="text-2xl font-semibold tracking-tight">RAG Playground</div>
              <div class="text-sm text-zinc-400">Test searches exactly as your agents will see them. Grounding URLs are always included.</div>
            </div>

            <div class="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <div class="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4">
                <div class="md:col-span-2">
                  <label class="text-xs uppercase tracking-widest text-zinc-500">Server</label>
                  <select id="playground-slug" class="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm mt-1"></select>
                </div>
                <div class="md:col-span-2">
                  <label class="text-xs uppercase tracking-widest text-zinc-500">Query</label>
                  <input id="playground-query" value="authentication" class="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm mt-1" placeholder="Search query...">
                </div>
                <div>
                  <label class="text-xs uppercase tracking-widest text-zinc-500">Mode</label>
                  <select id="playground-mode" class="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm mt-1">
                    <option value="hybrid">hybrid</option>
                    <option value="keyword">keyword</option>
                    <option value="semantic">semantic</option>
                  </select>
                </div>
              </div>

              <div class="flex gap-2">
                <button onclick="runPlaygroundSearch()" class="flex-1 bg-sky-400 hover:bg-sky-300 transition text-zinc-950 font-medium rounded-xl py-2 text-sm flex items-center justify-center gap-x-2">
                  <i class="fa-solid fa-search"></i> <span>Search</span>
                </button>
                <button onclick="runPlaygroundSearch(true)" class="px-4 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-sm">RRF</button>
              </div>

              <div id="playground-results" class="mt-4 space-y-3 text-sm"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Create Modal -->
  <div id="create-modal" onclick="if (event.target.id === 'create-modal') hideCreateModal()" class="hidden fixed inset-0 bg-black/60 backdrop-blur flex items-center justify-center z-50">
    <div onclick="event.stopImmediatePropagation()" class="bg-zinc-900 border border-zinc-700 rounded-3xl w-full max-w-lg mx-4 overflow-hidden">
      <div class="px-6 py-4 border-b border-zinc-700 flex items-center justify-between">
        <div class="font-semibold">Create MCP Server</div>
        <button onclick="hideCreateModal()" class="text-zinc-400 hover:text-white"><i class="fa-solid fa-times"></i></button>
      </div>
      <div class="p-6 space-y-4">
        <div>
          <label class="text-xs font-medium text-zinc-400">Name</label>
          <input id="create-name" class="mt-1 w-full bg-zinc-950 border border-zinc-700 focus:border-sky-400 rounded-xl px-4 py-2.5 text-sm" placeholder="My Project Docs" value="Test Docs">
        </div>
        <div>
          <label class="text-xs font-medium text-zinc-400">Documentation URL</label>
          <input id="create-url" class="mt-1 w-full bg-zinc-950 border border-zinc-700 focus:border-sky-400 rounded-xl px-4 py-2.5 text-sm monospace" placeholder="https://example.com/llms.txt or https://github.com/owner/repo" value="https://raw.githubusercontent.com/modelcontextprotocol/servers/main/README.md">
          <div class="text-[10px] text-zinc-500 mt-1">Supports llms.txt, llms-full.txt, GitHub repos, regular docs pages.</div>
        </div>
        <div class="flex items-center gap-3 pt-1">
          <input type="checkbox" id="create-hybrid" class="accent-sky-400" checked>
          <label for="create-hybrid" class="text-sm">Enable hybrid RAG (BGE semantic + keyword)</label>
        </div>
      </div>
      <div class="px-6 py-4 bg-zinc-950 flex gap-3 border-t border-zinc-700">
        <button onclick="hideCreateModal()" class="flex-1 py-2 rounded-2xl text-sm bg-zinc-800 hover:bg-zinc-700">Cancel</button>
        <button onclick="submitCreate()" class="flex-1 py-2 rounded-2xl text-sm bg-white text-zinc-900 font-medium">Create Server</button>
      </div>
    </div>
  </div>

  <script>
    let CURRENT_TOKEN = new URLSearchParams(location.search).get('token') || '';
    let SERVERS = [];
    let POLL_INTERVAL = null;

    function tailwindInit() {
      document.documentElement.style.setProperty('--accent', '#7dd3fc');
    }

    function setToken(t) {
      CURRENT_TOKEN = t;
      if (t && !location.search.includes('token=')) {
        const u = new URL(location.href);
        u.searchParams.set('token', t);
        history.replaceState({}, '', u.toString());
      }
    }

    function copyToken() {
      if (!CURRENT_TOKEN) return;
      navigator.clipboard.writeText(CURRENT_TOKEN).then(() => {
        const el = document.getElementById('token-hint');
        const old = el.innerHTML;
        el.innerHTML = 'copied!';
        setTimeout(() => el.innerHTML = old, 1200);
      });
    }

    function showView(view) {
      document.querySelectorAll('[id^="view-"]').forEach(el => el.classList.add('hidden'));
      const target = document.getElementById('view-' + view);
      if (target) target.classList.remove('hidden');

      document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('nav-active'));
      const active = document.querySelector('.nav-link[data-view="' + view + '"]');
      if (active) active.classList.add('nav-active');

      if (view === 'servers') refreshServers();
      if (view === 'playground') loadPlaygroundServers();
    }

    async function api(path, opts = {}) {
      const url = path + (path.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(CURRENT_TOKEN);
      const res = await fetch(url, {
        ...opts,
        headers: {
          'Content-Type': 'application/json',
          ...(opts.headers || {})
        }
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Request failed: ' + res.status);
      }
      return res.json();
    }

    async function refreshServers() {
      try {
        const servers = await api('/api/servers');
        SERVERS = servers;
        renderServers(servers);
      } catch (e) {
        console.error(e);
      }
    }

    function renderServers(servers) {
      const grid = document.getElementById('servers-grid');
      const empty = document.getElementById('servers-empty');
      grid.innerHTML = '';
      if (!servers.length) {
        empty.classList.remove('hidden');
        return;
      }
      empty.classList.add('hidden');

      servers.forEach(s => {
        const isRunning = !!s.running;
        const statusColor = isRunning ? 'bg-emerald-400' : 'bg-zinc-500';
        const statusText = isRunning ? 'RUNNING' : 'STOPPED';
        const modelLabel = s.embeddingModel && s.embeddingModel.startsWith('hybrid') ? s.embeddingModel : 'fuse';

        const card = document.createElement('div');
        card.className = 'card bg-zinc-900 border border-zinc-800 rounded-2xl p-4';
        card.innerHTML = \`
          <div class="flex justify-between items-start">
            <div>
              <div class="font-semibold text-base">\${s.name}</div>
              <div class="text-xs text-zinc-500 font-mono">\${s.slug}</div>
            </div>
            <div class="flex items-center gap-x-1.5 text-xs">
              <div class="status-dot \${statusColor}"></div>
              <span class="font-medium \${isRunning ? 'text-emerald-400' : 'text-zinc-400'}">\${statusText}</span>
            </div>
          </div>

          <div class="mt-3 text-xs flex gap-x-4 text-zinc-400">
            <div><span class="font-mono">\${(s.chunkCount || 0).toLocaleString()}</span> chunks</div>
            <div>\${modelLabel}</div>
            \${s.port ? \`<div>:\${s.port}</div>\` : ''}
          </div>

          <div class="mt-4 flex flex-wrap gap-2">
            <button data-action="toggle" data-slug="\${s.slug}" data-running="\${isRunning}" class="text-xs px-3 py-1 rounded-lg \${isRunning ? 'bg-red-900/60 hover:bg-red-900 text-red-400' : 'bg-emerald-900/60 hover:bg-emerald-900 text-emerald-400'}">
              \${isRunning ? 'Stop' : 'Start'}
            </button>
            <button data-action="reindex" data-slug="\${s.slug}" class="text-xs px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700">Reindex</button>
            <button data-action="verify" data-slug="\${s.slug}" class="text-xs px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700">Verify</button>
            <button data-action="play" data-slug="\${s.slug}" class="text-xs px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700">Playground</button>
            <button data-action="delete" data-slug="\${s.slug}" class="text-xs px-3 py-1 rounded-lg bg-red-900/40 hover:bg-red-900 text-red-400 ml-auto">Delete</button>
          </div>
        \`;

        // attach handlers
        card.querySelectorAll('button').forEach(btn => {
          btn.addEventListener('click', async (ev) => {
            ev.stopPropagation();
            const action = btn.dataset.action;
            const slug = btn.dataset.slug;
            if (action === 'toggle') {
              const running = btn.dataset.running === 'true';
              await (running ? stopServer(slug) : startServer(slug));
              refreshServers();
            } else if (action === 'reindex') {
              await reindexServer(slug);
              refreshServers();
            } else if (action === 'verify') {
              await verifyServer(slug);
            } else if (action === 'play') {
              showView('playground');
              setTimeout(() => {
                const sel = document.getElementById('playground-slug');
                if (sel) sel.value = slug;
              }, 50);
            } else if (action === 'delete') {
              if (confirm('Delete server ' + slug + '? This removes all data.')) {
                await deleteServer(slug);
                refreshServers();
              }
            }
          });
        });

        grid.appendChild(card);
      });
    }

    async function startServer(slug) {
      try {
        await api('/api/servers/' + slug + '/start', { method: 'POST' });
        showToast('Server started');
      } catch (e) { alert(e.message); }
    }

    async function stopServer(slug) {
      try {
        await api('/api/servers/' + slug + '/stop', { method: 'POST' });
        showToast('Server stopped');
      } catch (e) { alert(e.message); }
    }

    async function reindexServer(slug) {
      const btns = document.querySelectorAll('button');
      try {
        await api('/api/servers/' + slug + '/reindex', { method: 'POST' });
        showToast('Reindex complete');
      } catch (e) { alert('Reindex failed: ' + e.message); }
    }

    async function verifyServer(slug) {
      try {
        const data = await api('/api/servers/' + slug + '/verify');
        const msg = data.samples.map(s => s.query + ': ' + (s.hits.length ? s.hits[0].metadata.url : 'no hits')).join('\\n');
        alert('Verify results for ' + slug + ':\\n\\n' + msg);
      } catch (e) { alert(e.message); }
    }

    async function deleteServer(slug) {
      await api('/api/servers/' + slug, { method: 'DELETE' });
      showToast('Deleted');
    }

    function showCreateModal() {
      document.getElementById('create-modal').classList.remove('hidden');
      document.getElementById('create-modal').classList.add('flex');
    }

    function hideCreateModal() {
      const m = document.getElementById('create-modal');
      m.classList.add('hidden');
      m.classList.remove('flex');
    }

    async function submitCreate() {
      const name = document.getElementById('create-name').value.trim();
      const url = document.getElementById('create-url').value.trim();
      const hybrid = document.getElementById('create-hybrid').checked;

      if (!name || !url) return alert('Name and URL required');

      try {
        const res = await api('/api/servers', {
          method: 'POST',
          body: JSON.stringify({ name, url, hybrid })
        });
        hideCreateModal();
        showToast('Server created: ' + res.slug);
        showView('servers');
        setTimeout(refreshServers, 400);
      } catch (e) {
        alert('Create failed: ' + e.message);
      }
    }

    async function loadPlaygroundServers() {
      const sel = document.getElementById('playground-slug');
      sel.innerHTML = '';
      try {
        const servers = await api('/api/servers');
        servers.forEach(s => {
          const opt = document.createElement('option');
          opt.value = s.slug;
          opt.textContent = s.name + ' (' + s.slug + ')';
          sel.appendChild(opt);
        });
        if (servers.length) sel.value = servers[0].slug;
      } catch (e) {}
    }

    async function runPlaygroundSearch(useRrf = false) {
      const slug = document.getElementById('playground-slug').value;
      const query = document.getElementById('playground-query').value.trim() || 'overview';
      const mode = document.getElementById('playground-mode').value;

      const container = document.getElementById('playground-results');
      container.innerHTML = '<div class="text-xs text-zinc-500">Searching...</div>';

      try {
        const body = { query, mode, limit: 5 };
        if (useRrf && mode === 'hybrid') body.reranker = 'rrf';

        const data = await api('/api/servers/' + slug + '/search', {
          method: 'POST',
          body: JSON.stringify(body)
        });

        container.innerHTML = '';
        if (!data.results || !data.results.length) {
          container.innerHTML = '<div class="text-sm text-zinc-400">No results.</div>';
          return;
        }

        data.results.forEach(r => {
          const div = document.createElement('div');
          div.className = 'result-card bg-zinc-900 border border-zinc-700 rounded-2xl p-4 text-sm';
          div.innerHTML = \`
            <div class="flex justify-between text-xs mb-1 text-zinc-400">
              <div>score: \${(r.score || 0).toFixed(2)}</div>
              <a href="\${r.metadata.url}" target="_blank" class="text-sky-400 hover:underline">Source →</a>
            </div>
            <div class="font-medium mb-1">\${r.metadata.title || r.metadata.sectionPath || r.metadata.url}</div>
            <div class="text-zinc-300 line-clamp-3">\${r.content.substring(0, 280)}...</div>
          \`;
          container.appendChild(div);
        });
      } catch (e) {
        container.innerHTML = '<div class="text-red-400 text-sm">Search error: ' + e.message + '</div>';
      }
    }

    function showToast(msg) {
      const t = document.createElement('div');
      t.className = 'fixed bottom-4 right-4 bg-zinc-800 border border-zinc-700 text-sm px-4 py-2 rounded-2xl shadow-xl';
      t.textContent = msg;
      document.body.appendChild(t);
      setTimeout(() => t.remove(), 2200);
    }

    async function refreshAll() {
      await refreshServers();
    }

    async function init() {
      tailwindInit();

      const portEl = document.getElementById('port-display');
      if (portEl) portEl.textContent = location.port || '8080';

      const tokenHint = document.getElementById('token-hint');
      if (tokenHint && CURRENT_TOKEN) {
        tokenHint.textContent = CURRENT_TOKEN.slice(0, 8) + '…';
        tokenHint.title = 'Click to copy full token';
      }

      // If no token, show simple unlock
      if (!CURRENT_TOKEN) {
        const main = document.getElementById('main-content');
        main.innerHTML = \`
          <div class="max-w-sm mx-auto mt-12 text-center">
            <div class="text-xl font-semibold mb-2">Unlock Web GUI</div>
            <div class="text-sm text-zinc-400 mb-4">Enter the GUI token printed when you ran <span class="font-mono">hoolix gui</span></div>
            <input id="unlock-token" class="w-full bg-zinc-900 border border-zinc-700 rounded-2xl px-4 py-3 text-sm monospace" placeholder="gui_xxxxxxxxxxxxxxxxxxxxxxxx">
            <button onclick="unlock()" class="mt-3 w-full bg-white text-black font-medium py-2.5 rounded-2xl">Unlock Dashboard</button>
          </div>
        \`;
        window.unlock = () => {
          const t = document.getElementById('unlock-token').value.trim();
          if (t) {
            const u = new URL(location.href);
            u.searchParams.set('token', t);
            location.href = u.toString();
          }
        };
        return;
      }

      setToken(CURRENT_TOKEN);

      // initial load servers
      await refreshServers();
      showView('servers');

      // auto refresh every 3s (good enough for beta)
      if (POLL_INTERVAL) clearInterval(POLL_INTERVAL);
      POLL_INTERVAL = setInterval(() => {
        if (document.getElementById('view-servers') && !document.getElementById('view-servers').classList.contains('hidden')) {
          refreshServers();
        }
      }, 3000);

      // preload playground servers
      loadPlaygroundServers();
    }

    function unlock() { /* defined inline above */ }

    window.onload = init;
  </script>
</body>
</html>`;
}
