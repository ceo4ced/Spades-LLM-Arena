/**
 * Build a self-contained docs/index.html from the same content modules the
 * React DocsApp consumes. No build step needed to view — open the file in any
 * browser and the docs work, including search, sidebar nav, and the
 * three-layer collapse.
 *
 * Run: npx tsx scripts/build-docs.ts
 *
 * Output: docs/index.html (single file, no external deps).
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIES } from '../src/docs/content';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Output to docs/reference/ so the existing docs/index.html marketing site is
// preserved. This file is the technical reference (engine internals, agent
// interfaces, schema). Both can ship side-by-side on GH Pages later if wanted.
const OUT = resolve(__dirname, '..', 'docs', 'reference', 'index.html');

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function paragraphs(text: string): string {
  return text
    .split(/\n\n+/)
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join('');
}

const STATUS_BADGE: Record<string, { label: string; bg: string; fg: string }> = {
  shipped: { label: 'Shipped', bg: '#1c5e2a', fg: '#a7f3a3' },
  partial: { label: 'Partial', bg: '#5c4314', fg: '#fcd34d' },
  wireframe: { label: 'Wireframe', bg: '#3a3a3a', fg: '#d1d5db' },
  generated: { label: 'Generated', bg: '#1e3a5f', fg: '#93c5fd' },
};

function topicCard(category: string, topic: typeof CATEGORIES[number]['topics'][number]): string {
  const badge = STATUS_BADGE[topic.status];
  const files = topic.files
    .map(
      (f) =>
        `<code class="file">${escapeHtml(f)}</code>`,
    )
    .join('<span class="sep">·</span>');

  return `
    <article class="topic" data-topic="${topic.id}" data-category="${category}" hidden>
      <div class="crumb">${escapeHtml(category)}</div>
      <header>
        <h1>${escapeHtml(topic.title)}</h1>
        <span class="badge" style="background:${badge.bg};color:${badge.fg}">${badge.label}</span>
      </header>
      <p class="summary">${escapeHtml(topic.summary)}</p>
      ${files ? `<div class="files"><span>Source:</span> ${files}</div>` : ''}

      <section class="layer">
        <button class="layer-head" data-toggle>
          <div>
            <div class="layer-title">1. Abstract</div>
            <div class="layer-sub">What it does and why.</div>
          </div>
          <span class="caret">▾</span>
        </button>
        <div class="layer-body prose">${paragraphs(topic.layers.abstract)}</div>
      </section>

      <section class="layer">
        <button class="layer-head" data-toggle>
          <div>
            <div class="layer-title">2. Interface</div>
            <div class="layer-sub">Java-style signatures — how methods and types cooperate.</div>
          </div>
          <span class="caret">▾</span>
        </button>
        <div class="layer-body"><pre class="code java"><code>${escapeHtml(topic.layers.iface)}</code></pre></div>
      </section>

      <section class="layer">
        <button class="layer-head" data-toggle>
          <div>
            <div class="layer-title">3. Pseudocode</div>
            <div class="layer-sub">Step-by-step logic of the actual behavior.</div>
          </div>
          <span class="caret">▾</span>
        </button>
        <div class="layer-body"><pre class="code pseudo"><code>${escapeHtml(topic.layers.pseudocode)}</code></pre></div>
      </section>
    </article>
  `;
}

function sidebarSection(category: typeof CATEGORIES[number]): string {
  const items = category.topics
    .map(
      (t) => {
        const badge = STATUS_BADGE[t.status];
        return `
          <li>
            <button class="nav-link" data-target="${t.id}">
              <span class="nav-title">${escapeHtml(t.title)}</span>
              <span class="nav-badge" style="background:${badge.bg};color:${badge.fg}">${badge.label}</span>
            </button>
          </li>`;
      },
    )
    .join('');
  return `
    <section class="nav-section" data-cat="${category.id}">
      <h2>${escapeHtml(category.title)}</h2>
      <ul>${items}</ul>
    </section>
  `;
}

const FIRST_TOPIC_ID = CATEGORIES[0].topics[0].id;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Spades LLM Arena — Documentation</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; height: 100%; background: #0f1116; color: #e5e7eb;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  body { display: flex; }
  aside { width: 288px; height: 100vh; border-right: 1px solid #2a2f3a; background: #0a0c11;
    overflow-y: auto; flex-shrink: 0; }
  aside .head { padding: 16px; border-bottom: 1px solid #1e232c; }
  aside h1 { font-size: 18px; margin: 0; }
  aside .blurb { font-size: 11px; color: #6b7280; margin-top: 4px; }
  aside .search { width: 100%; margin-top: 12px; padding: 6px 8px; background: #1f242e;
    border: 1px solid #2a2f3a; border-radius: 4px; color: #e5e7eb; font-size: 14px; }
  aside .search::placeholder { color: #6b7280; }
  aside nav { padding: 8px; }
  .nav-section { margin-bottom: 8px; }
  .nav-section h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em;
    color: #9ca3af; padding: 4px 8px; margin: 0; }
  .nav-section ul { list-style: none; padding: 0; margin: 0; }
  .nav-link { width: 100%; text-align: left; padding: 6px 8px; border: 0; border-radius: 4px;
    background: transparent; color: #e5e7eb; font-size: 14px; display: flex;
    align-items: center; justify-content: space-between; gap: 8px; cursor: pointer; }
  .nav-link:hover { background: #1f242e; }
  .nav-link.active { background: #2563eb; color: #fff; }
  .nav-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .nav-badge { flex-shrink: 0; font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em;
    padding: 2px 6px; border-radius: 3px; }
  main { flex: 1; overflow-y: auto; }
  .topic { max-width: 880px; margin: 0 auto; padding: 40px 32px; }
  .crumb { font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.08em;
    margin-bottom: 8px; }
  .topic header { display: flex; align-items: baseline; justify-content: space-between; gap: 16px;
    margin-bottom: 12px; }
  .topic h1 { color: #fff; font-size: 30px; margin: 0; }
  .badge { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; padding: 4px 8px;
    border-radius: 4px; flex-shrink: 0; }
  .summary { color: #d1d5db; margin: 0 0 16px; }
  .files { color: #6b7280; font-size: 12px; margin-bottom: 32px; }
  .files span { color: #9ca3af; margin-right: 8px; }
  .files .file { color: #d1d5db; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .files .sep { color: #4b5563; margin: 0 6px; }
  .layer { margin-bottom: 24px; border: 1px solid #2a2f3a; border-radius: 8px; overflow: hidden; }
  .layer-head { width: 100%; display: flex; align-items: center; justify-content: space-between;
    padding: 12px 16px; background: #181c25; color: #e5e7eb; border: 0; cursor: pointer; text-align: left; }
  .layer-head:hover { background: #1c2130; }
  .layer-title { font-size: 14px; font-weight: 600; color: #fff; }
  .layer-sub { font-size: 12px; color: #9ca3af; margin-top: 2px; }
  .caret { color: #9ca3af; }
  .layer.collapsed .caret { transform: rotate(-90deg); display: inline-block; }
  .layer.collapsed .layer-body { display: none; }
  .layer-body { padding: 16px; background: #0f1116; }
  .prose p { margin: 0 0 12px; color: #d1d5db; line-height: 1.65; }
  .prose p:last-child { margin: 0; }
  .code { background: #07090d; border: 1px solid #1e232c; border-radius: 4px; padding: 16px;
    overflow-x: auto; font-size: 12px; line-height: 1.65; margin: 0; }
  .code.java code { color: #a5f3fc; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .code.pseudo code { color: #fde68a; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .empty { padding: 80px 32px; text-align: center; color: #6b7280; }
  @media (max-width: 768px) {
    body { flex-direction: column; }
    aside { width: 100%; height: auto; max-height: 40vh; }
    main { flex: 1; }
  }
</style>
</head>
<body>
  <aside>
    <div class="head">
      <h1>Documentation</h1>
      <div class="blurb">Three layers per topic: abstract → interface → pseudocode.</div>
      <input class="search" type="text" placeholder="Search…" />
    </div>
    <nav>
      ${CATEGORIES.map(sidebarSection).join('')}
    </nav>
  </aside>
  <main id="main">
    ${CATEGORIES.flatMap((c) => c.topics.map((t) => topicCard(c.title, t))).join('')}
    <div class="empty" id="empty" hidden>No topics match your search.</div>
  </main>
<script>
(function () {
  var FIRST = ${JSON.stringify(FIRST_TOPIC_ID)};

  function show(id) {
    document.querySelectorAll('.topic').forEach(function (el) {
      el.hidden = el.dataset.topic !== id;
    });
    document.querySelectorAll('.nav-link').forEach(function (b) {
      b.classList.toggle('active', b.dataset.target === id);
    });
    document.getElementById('main').scrollTop = 0;
    if (history.replaceState) history.replaceState(null, '', '#' + id);
  }

  document.querySelectorAll('.nav-link').forEach(function (b) {
    b.addEventListener('click', function () { show(b.dataset.target); });
  });

  document.querySelectorAll('[data-toggle]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      btn.parentElement.classList.toggle('collapsed');
    });
  });

  // Search filters the sidebar.
  var search = document.querySelector('.search');
  var empty  = document.getElementById('empty');
  search.addEventListener('input', function () {
    var q = search.value.trim().toLowerCase();
    var visibleCount = 0;
    document.querySelectorAll('.nav-section').forEach(function (sec) {
      var any = false;
      sec.querySelectorAll('.nav-link').forEach(function (b) {
        var hay = (b.textContent || '').toLowerCase();
        var match = !q || hay.indexOf(q) !== -1;
        b.style.display = match ? '' : 'none';
        if (match) { any = true; visibleCount += 1; }
      });
      sec.style.display = any ? '' : 'none';
    });
    if (q && visibleCount === 0) {
      empty.hidden = false;
      document.querySelectorAll('.topic').forEach(function (el) { el.hidden = true; });
    } else {
      empty.hidden = true;
      // Restore the previously-visible topic (or first match) if the active one was filtered out.
      var active = document.querySelector('.nav-link.active');
      if (!active || active.style.display === 'none') {
        var firstVisible = document.querySelector('.nav-link[style=""], .nav-link:not([style*="display: none"])');
        if (firstVisible) show(firstVisible.dataset.target);
      } else {
        show(active.dataset.target);
      }
    }
  });

  // Initial topic — hash, or default.
  var initial = (location.hash || '').replace('#', '') || FIRST;
  if (!document.querySelector('.topic[data-topic="' + initial + '"]')) initial = FIRST;
  show(initial);
})();
</script>
</body>
</html>
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html, 'utf8');
console.log(`Wrote ${OUT} (${(html.length / 1024).toFixed(1)} KB)`);
