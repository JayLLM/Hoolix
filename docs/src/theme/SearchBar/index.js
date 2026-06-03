import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from '@docusaurus/Link';

const SEARCH_ITEMS = [
  ['Quick Start', '/docs/getting-started/quick-start', 'Create and connect your first MCP server in minutes.'],
  ['Installation', '/docs/getting-started/installation', 'Install MCP Portal binaries on Windows, macOS, and Linux.'],
  ['CLI Reference', '/docs/api-reference/cli', 'Every command, flag, and --json automation workflow.'],
  ['Creating Servers', '/docs/guides/creating-servers', 'Ingest llms.txt, GitHub repositories, and regular sites.'],
  ['Connecting Clients', '/docs/guides/connecting-clients', 'Connect Claude Desktop, Cursor, Windsurf, and more.'],
  ['Authentication', '/docs/guides/authentication', 'Keys, Bearer auth, rotation, rate limits, and audit logs.'],
  ['Advanced RAG', '/docs/guides/advanced-rag', 'Hybrid semantic search, embeddings, model choices, and evaluation.'],
  ['Ingestion Pipeline', '/docs/architecture/ingestion-pipeline', 'Fetch, clean, chunk, ground, and persist documentation.'],
  ['RAG & MCP Tools', '/docs/architecture/rag-and-tools', 'Search, read, and table-of-contents tools with source URLs.'],
  ['Host & Process', '/docs/architecture/host-and-process', 'Binary self-spawn model, Streamable HTTP, and process management.'],
  ['Changelog', '/docs/changelog', 'Latest product changes and release notes.'],
  ['Blog', '/blog', 'Field notes and launch updates from the MCP Portal team.'],
];

function scoreItem(item, query) {
  const haystack = item.join(' ').toLowerCase();
  const normalized = query.trim().toLowerCase();
  if (!normalized) return 1;
  if (haystack.includes(normalized)) return 3;
  return normalized.split(/\s+/).filter((term) => haystack.includes(term)).length;
}

export default function SearchBar() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  const results = useMemo(() => {
    return SEARCH_ITEMS.map((item) => ({ item, score: scoreItem(item, query) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(({ item }) => item);
  }, [query]);

  useEffect(() => {
    function onKeyDown(event) {
      const isCommandSearch = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
      if (isCommandSearch) {
        event.preventDefault();
        setOpen(true);
      }
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      window.setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  return (
    <div className="portal-search">
      <button className="portal-search__button" type="button" onClick={() => setOpen(true)} aria-label="Open command search">
        <span>Search docs</span>
        <kbd>⌘K</kbd>
      </button>
      {open && (
        <div className="portal-search__overlay" role="presentation" onMouseDown={() => setOpen(false)}>
          <div
            className="portal-search__dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Command search"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="portal-search__input-row">
              <span aria-hidden="true">⌕</span>
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search MCP Portal docs, guides, and architecture…"
                aria-label="Search query"
              />
              <button type="button" onClick={() => setOpen(false)} aria-label="Close search">
                Esc
              </button>
            </div>
            <div className="portal-search__results" role="listbox">
              {results.map(([title, to, description]) => (
                <Link key={to} to={to} className="portal-search__result" onClick={() => setOpen(false)}>
                  <strong>{title}</strong>
                  <span>{description}</span>
                </Link>
              ))}
              {results.length === 0 && <p className="portal-search__empty">No results. Try “connect”, “rag”, or “auth”.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
