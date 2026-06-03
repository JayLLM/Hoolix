#!/usr/bin/env node
/**
 * Golden-set RAG eval for a registered hoolix server.
 *
 * Usage:
 *   node --import tsx examples/golden-eval.ts --slug my-docs --golden examples/golden-set.json --json
 */
import fs from 'fs-extra';
import { createRAGForServer } from '../src/rag/store.js';
import { getServerMetadata } from '../src/core/registry.js';
import type { EmbeddingModel } from '../src/rag/types.js';

interface GoldenCase {
  query: string;
  expectUrlContains?: string;
  expectTitleContains?: string;
}

function getArg(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  return idx !== -1 ? args[idx + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const slug = getArg(args, '--slug');
  const goldenPath = getArg(args, '--golden') || 'examples/golden-set.json';
  const asJson = args.includes('--json');

  if (!slug) {
    console.error('Usage: node --import tsx examples/golden-eval.ts --slug <slug> [--golden examples/golden-set.json] [--json]');
    process.exit(1);
  }

  const meta = await getServerMetadata(slug);
  const goldens = await fs.readJson(goldenPath) as GoldenCase[];
  const rag = await createRAGForServer(slug, meta.embeddingModel as EmbeddingModel);

  const cases = [];
  let pass = 0;
  for (const item of goldens) {
    const results = await rag.search(item.query, { limit: 3, mode: 'hybrid' });
    const top = results[0] || null;
    const topUrl = top?.metadata.url || '';
    const topTitle = top?.metadata.title || '';
    const urlOk = item.expectUrlContains ? topUrl.toLowerCase().includes(item.expectUrlContains.toLowerCase()) : true;
    const titleOk = item.expectTitleContains ? topTitle.toLowerCase().includes(item.expectTitleContains.toLowerCase()) : true;
    const ok = !!top && urlOk && titleOk;
    if (ok) pass++;
    cases.push({
      query: item.query,
      ok,
      expected: {
        urlContains: item.expectUrlContains,
        titleContains: item.expectTitleContains,
      },
      top: top ? {
        url: topUrl,
        title: topTitle,
        score: top.score,
      } : null,
    });
  }

  const output = {
    slug,
    goldenPath,
    total: goldens.length,
    passed: pass,
    passRate: goldens.length === 0 ? 0 : Math.round((pass / goldens.length) * 100),
    cases,
  };

  if (asJson) {
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log(`Golden eval for ${slug}: ${output.passed}/${output.total} (${output.passRate}%)`);
    for (const c of cases) {
      console.log(`${c.ok ? 'PASS' : 'FAIL'} ${c.query}`);
      console.log(`  top: ${c.top?.url || 'no result'}`);
    }
  }

  if (pass !== goldens.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
