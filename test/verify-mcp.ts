#!/usr/bin/env node
/**
 * Local RAG verification helper (simulates the 3 MCP tools without a client).
 * Usage: node --import tsx test/verify-mcp.ts --slug <slug>
 *
 * Prints sample search / read / toc output + Source URLs so you can judge quality quickly.
 */

import { createRAGForServer } from '../src/rag/store.js';

async function main() {
  const args = process.argv.slice(2);
  const slugIdx = args.indexOf('--slug');
  if (slugIdx === -1 || !args[slugIdx + 1]) {
    console.error('Usage: node --import tsx test/verify-mcp.ts --slug <slug>');
    process.exit(1);
  }
  const slug = args[slugIdx + 1];

  console.log(`Verifying MCP tools simulation for slug: ${slug}\n`);

  const rag = await createRAGForServer(slug);

  // Simulate search_documentation
  console.log('=== search_documentation("architecture") ===');
  const searchRes = await rag.search('architecture', { limit: 3 });
  if (searchRes.length === 0) {
    console.log('  (no results)\n');
  } else {
    searchRes.forEach((r, i) => {
      console.log(`  [${i+1}] ${r.metadata.sectionPath || r.metadata.title || r.metadata.url}`);
      console.log(`      ${r.content.substring(0, 160).replace(/\n/g, ' ')}...`);
      console.log(`      Source: ${r.metadata.url}\n`);
    });
  }

  // Simulate get_table_of_contents
  console.log('=== get_table_of_contents() (first 5) ===');
  const toc = await rag.getTableOfContents();
  toc.slice(0, 5).forEach(item => {
    const indent = '  '.repeat(item.level - 1);
    console.log(`${indent}- ${item.title}  (url: ${item.url || 'n/a'})`);
  });
  console.log(`  ... (${toc.length} total entries)\n`);

  // Simulate read_documentation_page (use first TOC entry or a common term)
  const firstUrl = toc[0]?.url || 'overview';
  console.log(`=== read_documentation_page("${firstUrl}") (first 2 chunks) ===`);
  const page = await rag.readPage(firstUrl, 2);
  if (page) {
    console.log(`  Title: ${page.title}`);
    console.log(`  URL:   ${page.url}`);
    console.log(`  Content preview (concat of chunks):\n${page.content.substring(0, 400)}...\n`);
  } else {
    console.log('  Page not found for that term.\n');
  }

  console.log('Verification complete. If you see relevant results with Source URLs, the RAG behind the MCP tools is working.');
}

main().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
