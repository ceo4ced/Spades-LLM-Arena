/**
 * In-app documentation viewer. Sidebar of categories + topics, main pane with
 * the three layers (Abstract / Interface / Pseudocode) as collapsible sections.
 *
 * Content lives in src/docs/content/* and is shared with the standalone HTML
 * build (see scripts/build-docs.ts). Don't add behavior here that the static
 * generator can't replicate — keep both renderers in lockstep.
 */

import React, { useMemo, useState } from 'react';
import { CATEGORIES, ALL_TOPICS, type DocCategory, type DocTopic } from './content';

interface DocsAppProps {
  onBack: () => void;
}

const STATUS_STYLE: Record<DocTopic['status'], { label: string; bg: string; text: string }> = {
  shipped: { label: 'Shipped', bg: 'bg-green-100', text: 'text-green-800' },
  partial: { label: 'Partial', bg: 'bg-amber-100', text: 'text-amber-800' },
  wireframe: { label: 'Wireframe', bg: 'bg-gray-200', text: 'text-gray-700' },
  generated: { label: 'Generated', bg: 'bg-blue-100', text: 'text-blue-800' },
};

export const DocsApp: React.FC<DocsAppProps> = ({ onBack }) => {
  const [activeTopicId, setActiveTopicId] = useState<string>(
    CATEGORIES[0].topics[0].id,
  );
  const [query, setQuery] = useState('');
  const [openLayers, setOpenLayers] = useState({
    abstract: true,
    iface: true,
    pseudocode: true,
  });

  // Build the active topic + its category.
  const active = useMemo(() => {
    const found = ALL_TOPICS.find(({ topic }) => topic.id === activeTopicId);
    return found ?? { category: CATEGORIES[0], topic: CATEGORIES[0].topics[0] };
  }, [activeTopicId]);

  // Filter sidebar by query (matches title + summary + topic id).
  const filteredCategories = useMemo<DocCategory[]>(() => {
    if (!query.trim()) return CATEGORIES;
    const q = query.toLowerCase();
    return CATEGORIES.map((c) => ({
      ...c,
      topics: c.topics.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.summary.toLowerCase().includes(q) ||
          t.id.toLowerCase().includes(q),
      ),
    })).filter((c) => c.topics.length > 0);
  }, [query]);

  return (
    <div className="flex h-screen w-full bg-gray-900 text-gray-100 font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="w-72 shrink-0 border-r border-gray-700 bg-gray-950 overflow-y-auto">
        <div className="p-4 border-b border-gray-800">
          <button
            onClick={onBack}
            className="text-sm text-gray-400 hover:text-gray-100 mb-3"
          >
            ← Back
          </button>
          <h1 className="text-lg font-bold">Documentation</h1>
          <p className="text-[11px] text-gray-500 mt-1">
            Three layers per topic: abstract → interface → pseudocode.
          </p>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="w-full mt-3 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm placeholder-gray-500"
          />
        </div>

        <nav className="p-2">
          {filteredCategories.map((cat) => (
            <section key={cat.id} className="mb-2">
              <h2 className="text-[11px] uppercase tracking-wider text-gray-400 px-2 py-1">
                {cat.title}
              </h2>
              <ul>
                {cat.topics.map((t) => {
                  const isActive = t.id === activeTopicId;
                  const style = STATUS_STYLE[t.status];
                  return (
                    <li key={t.id}>
                      <button
                        onClick={() => setActiveTopicId(t.id)}
                        className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center justify-between gap-2 ${
                          isActive
                            ? 'bg-blue-600 text-white'
                            : 'hover:bg-gray-800 text-gray-200'
                        }`}
                      >
                        <span className="truncate">{t.title}</span>
                        <span
                          className={`text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded ${style.bg} ${style.text} shrink-0`}
                        >
                          {style.label}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <article className="max-w-4xl mx-auto px-8 py-10">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">
            {active.category.title}
          </div>
          <header className="flex items-baseline justify-between gap-4 mb-3">
            <h1 className="text-3xl font-bold text-white">{active.topic.title}</h1>
            <span
              className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded ${STATUS_STYLE[active.topic.status].bg} ${STATUS_STYLE[active.topic.status].text}`}
            >
              {STATUS_STYLE[active.topic.status].label}
            </span>
          </header>
          <p className="text-gray-300 mb-4">{active.topic.summary}</p>

          {active.topic.files.length > 0 && (
            <div className="mb-8 text-xs text-gray-500">
              <span className="text-gray-400 mr-2">Source:</span>
              {active.topic.files.map((f, i) => (
                <span key={f} className="font-mono text-gray-300">
                  {i > 0 && <span className="text-gray-600 mx-1">·</span>}
                  {f}
                </span>
              ))}
            </div>
          )}

          <Layer
            title="1. Abstract"
            subtitle="What it does and why."
            isOpen={openLayers.abstract}
            onToggle={() => setOpenLayers((p) => ({ ...p, abstract: !p.abstract }))}
          >
            <Prose text={active.topic.layers.abstract} />
          </Layer>

          <Layer
            title="2. Interface"
            subtitle="Java-style signatures — how methods and types cooperate."
            isOpen={openLayers.iface}
            onToggle={() => setOpenLayers((p) => ({ ...p, iface: !p.iface }))}
          >
            <CodeBlock language="java">{active.topic.layers.iface}</CodeBlock>
          </Layer>

          <Layer
            title="3. Pseudocode"
            subtitle="Step-by-step logic of the actual behavior."
            isOpen={openLayers.pseudocode}
            onToggle={() => setOpenLayers((p) => ({ ...p, pseudocode: !p.pseudocode }))}
          >
            <CodeBlock language="pseudo">{active.topic.layers.pseudocode}</CodeBlock>
          </Layer>
        </article>
      </main>
    </div>
  );
};

// ─── helpers ────────────────────────────────────────────────────────────

const Layer: React.FC<{
  title: string;
  subtitle: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}> = ({ title, subtitle, isOpen, onToggle, children }) => (
  <section className="mb-6 border border-gray-700 rounded-lg overflow-hidden">
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between px-4 py-3 bg-gray-800 hover:bg-gray-750 transition-colors text-left"
    >
      <div>
        <div className="text-sm font-semibold text-white">{title}</div>
        <div className="text-xs text-gray-400 mt-0.5">{subtitle}</div>
      </div>
      <span className="text-gray-400">{isOpen ? '▾' : '▸'}</span>
    </button>
    {isOpen && <div className="p-4 bg-gray-900">{children}</div>}
  </section>
);

/** Render the abstract text. Splits on double-newline into paragraphs. */
const Prose: React.FC<{ text: string }> = ({ text }) => (
  <div className="space-y-3 text-gray-200 leading-relaxed">
    {text.split(/\n\n+/).map((para, i) => (
      <p key={i}>{para}</p>
    ))}
  </div>
);

const CodeBlock: React.FC<{ language: 'java' | 'pseudo'; children: string }> = ({
  language,
  children,
}) => (
  <pre className="bg-gray-950 border border-gray-800 rounded p-4 overflow-x-auto text-xs leading-relaxed">
    <code
      className={
        language === 'java' ? 'font-mono text-cyan-200' : 'font-mono text-amber-200'
      }
    >
      {children}
    </code>
  </pre>
);

export default DocsApp;
