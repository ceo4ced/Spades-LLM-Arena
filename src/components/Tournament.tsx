/**
 * Tournament — wireframe for a multi-stage Spades LLM tournament that culminates
 * in a 2v2 championship match ("The Reckoning").
 *
 * Aesthetic: occult tournament ledger — ink, aged gold, bone parchment, ceremonial
 * capitals (Cinzel) with literary serif body (Cormorant Garamond) and JetBrains
 * Mono for tabular data.
 *
 * Stages:
 *   1. QUALIFIERS — 16 individual contenders accumulate scores across rotating
 *      4-player matches (round-robin-ish ladder).
 *   2. KNOCKOUT   — top 8 advance into elimination tables (4 LLMs per table,
 *      top 1 advances). 8 → 4.
 *   3. THE RECKONING — the 4 finalists are paired into two teams (1+4, 2+3 by
 *      seeding) and play the championship 2v2 match in the native engine.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

// ── Self-contained font + base styles ──────────────────────────────────────
const FONT_HREF =
  'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600;700;800;900&family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500&family=JetBrains+Mono:wght@300;400;500;600&display=swap';

if (typeof document !== 'undefined' && !document.querySelector(`link[data-tournament-fonts]`)) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = FONT_HREF;
  link.setAttribute('data-tournament-fonts', 'true');
  document.head.appendChild(link);
}

// ── Mock tournament data ───────────────────────────────────────────────────
type Contender = {
  id: string;
  name: string;
  short: string;
  house: string;
  seed: number;
  wins: number;
  losses: number;
  bagsRate: number;
  nilCalls: number;
  status: 'finalist' | 'eliminated' | 'active';
};

const CONTENDERS: Contender[] = [
  { id: 'opus47', name: 'Claude Opus 4.7', short: 'OPUS', house: 'Anthropic', seed: 1, wins: 11, losses: 1, bagsRate: 0.18, nilCalls: 4, status: 'finalist' },
  { id: 'gpt5', name: 'GPT-5 Pro', short: 'GPT5', house: 'OpenAI', seed: 2, wins: 10, losses: 2, bagsRate: 0.21, nilCalls: 3, status: 'finalist' },
  { id: 'gem3', name: 'Gemini 3 Ultra', short: 'GEM3', house: 'Google', seed: 3, wins: 10, losses: 2, bagsRate: 0.16, nilCalls: 5, status: 'finalist' },
  { id: 'l4m', name: 'Llama 4 Maverick', short: 'L4M', house: 'Meta', seed: 4, wins: 9, losses: 3, bagsRate: 0.27, nilCalls: 2, status: 'finalist' },
  { id: 'sonnet46', name: 'Claude Sonnet 4.6', short: 'SON', house: 'Anthropic', seed: 5, wins: 8, losses: 4, bagsRate: 0.22, nilCalls: 1, status: 'eliminated' },
  { id: 'qwen3', name: 'Qwen 3 Max', short: 'QWN', house: 'Alibaba', seed: 6, wins: 8, losses: 4, bagsRate: 0.31, nilCalls: 2, status: 'eliminated' },
  { id: 'mistr', name: 'Mistral Grand', short: 'MIS', house: 'Mistral', seed: 7, wins: 7, losses: 5, bagsRate: 0.24, nilCalls: 0, status: 'eliminated' },
  { id: 'dsr2', name: 'DeepSeek R2', short: 'DSR', house: 'DeepSeek', seed: 8, wins: 7, losses: 5, bagsRate: 0.19, nilCalls: 3, status: 'eliminated' },
  { id: 'haiku45', name: 'Claude Haiku 4.5', short: 'HAI', house: 'Anthropic', seed: 9, wins: 6, losses: 6, bagsRate: 0.29, nilCalls: 1, status: 'eliminated' },
  { id: 'gpt5m', name: 'GPT-5 Mini', short: 'G5M', house: 'OpenAI', seed: 10, wins: 6, losses: 6, bagsRate: 0.33, nilCalls: 0, status: 'eliminated' },
  { id: 'gem3f', name: 'Gemini 3 Flash', short: 'G3F', house: 'Google', seed: 11, wins: 5, losses: 7, bagsRate: 0.28, nilCalls: 1, status: 'eliminated' },
  { id: 'cmd', name: 'Cohere Command R+', short: 'CMD', house: 'Cohere', seed: 12, wins: 5, losses: 7, bagsRate: 0.30, nilCalls: 2, status: 'eliminated' },
  { id: 'phi4', name: 'Phi-4 Reasoner', short: 'PHI', house: 'Microsoft', seed: 13, wins: 4, losses: 8, bagsRate: 0.36, nilCalls: 0, status: 'eliminated' },
  { id: 'grok3', name: 'Grok 3', short: 'GRK', house: 'xAI', seed: 14, wins: 4, losses: 8, bagsRate: 0.41, nilCalls: 1, status: 'eliminated' },
  { id: 'l4s', name: 'Llama 4 Scout', short: 'L4S', house: 'Meta', seed: 15, wins: 3, losses: 9, bagsRate: 0.38, nilCalls: 0, status: 'eliminated' },
  { id: 'rnd', name: 'House Heuristic', short: 'HEU', house: 'Arena', seed: 16, wins: 2, losses: 10, bagsRate: 0.44, nilCalls: 0, status: 'eliminated' },
];

// Knockout bracket: 8 → 4. Each match has 4 players, top 1 advances.
type Match = { id: string; round: 'r8' | 'r4'; players: string[]; winner?: string };

const KNOCKOUT: Match[] = [
  { id: 'qf-a', round: 'r8', players: ['opus47', 'haiku45', 'gpt5m', 'gem3f'], winner: 'opus47' },
  { id: 'qf-b', round: 'r8', players: ['gpt5', 'cmd', 'phi4', 'grok3'], winner: 'gpt5' },
  { id: 'qf-c', round: 'r8', players: ['gem3', 'sonnet46', 'l4s', 'rnd'], winner: 'gem3' },
  { id: 'qf-d', round: 'r8', players: ['l4m', 'qwen3', 'mistr', 'dsr2'], winner: 'l4m' },
];

// Seed-based pairing for the 2v2 finale: 1+4 vs 2+3.
const TEAM_NORTH = ['opus47', 'l4m']; // seeds 1 + 4
const TEAM_SOUTH = ['gpt5', 'gem3'];   // seeds 2 + 3

// ── Helpers ────────────────────────────────────────────────────────────────
const lookup = (id: string) => CONTENDERS.find((c) => c.id === id)!;

// ── Sub-components ─────────────────────────────────────────────────────────

const Ornament: React.FC<{ className?: string; style?: React.CSSProperties }> = ({
  className = '',
  style,
}) => (
  <svg viewBox="0 0 240 12" className={className} style={style} fill="none" preserveAspectRatio="none">
    <path d="M0 6 L100 6" stroke="currentColor" strokeWidth="0.6" />
    <path d="M140 6 L240 6" stroke="currentColor" strokeWidth="0.6" />
    <path
      d="M100 6 Q108 1 115 6 Q120 11 125 6 Q132 1 140 6"
      stroke="currentColor"
      strokeWidth="0.8"
      fill="none"
    />
    <circle cx="120" cy="6" r="1.5" fill="currentColor" />
  </svg>
);

const SpadeGlyph: React.FC<{ size?: number; className?: string }> = ({ size = 20, className = '' }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} className={className} fill="currentColor">
    <path d="M12 2 C 7 8, 3 11, 3 15 C 3 18, 5 20, 8 20 C 9.5 20, 10.8 19.3, 11.4 18.4 L 10 22 L 14 22 L 12.6 18.4 C 13.2 19.3, 14.5 20, 16 20 C 19 20, 21 18, 21 15 C 21 11, 17 8, 12 2 Z" />
  </svg>
);

const NoiseLayer: React.FC = () => (
  <svg className="pointer-events-none fixed inset-0 z-0 opacity-[0.06] mix-blend-overlay" aria-hidden="true">
    <filter id="tournament-noise">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
      <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.5 0" />
    </filter>
    <rect width="100%" height="100%" filter="url(#tournament-noise)" />
  </svg>
);

const VignetteFrame: React.FC<{ children: React.ReactNode; goldBorder?: boolean }> = ({
  children,
  goldBorder = false,
}) => (
  <div
    className="relative"
    style={{
      boxShadow: goldBorder
        ? 'inset 0 0 0 1px rgba(201,169,106,0.55), inset 0 0 0 4px rgba(10,9,8,0.9), inset 0 0 0 5px rgba(201,169,106,0.25)'
        : 'inset 0 0 0 1px rgba(232,226,213,0.12)',
    }}
  >
    {children}
  </div>
);

// Bracket card showing a single LLM contender.
const ContenderCard: React.FC<{
  c: Contender;
  size?: 'sm' | 'md' | 'lg';
  isWinner?: boolean;
}> = ({ c, size = 'md', isWinner = false }) => {
  const heights = { sm: 'py-2 px-3', md: 'py-3 px-4', lg: 'py-4 px-5' };
  const fontSize = { sm: 'text-[11px]', md: 'text-xs', lg: 'text-sm' };

  return (
    <div
      className={`relative ${heights[size]} ${
        isWinner ? 'bg-[#1a1611]' : 'bg-[#0f0d0a]'
      } transition-colors`}
      style={{
        boxShadow: isWinner
          ? 'inset 0 0 0 1px rgba(201,169,106,0.7), 0 0 24px rgba(201,169,106,0.15)'
          : c.status === 'eliminated'
          ? 'inset 0 0 0 1px rgba(94,20,20,0.4)'
          : 'inset 0 0 0 1px rgba(232,226,213,0.18)',
      }}
    >
      {isWinner && (
        <div
          className="absolute -top-2 left-3 px-1.5 text-[9px] tracking-[0.3em]"
          style={{ background: '#0a0908', color: '#c9a96a', fontFamily: 'Cinzel, serif' }}
        >
          ADVANCES
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="shrink-0 w-7 h-7 grid place-items-center text-[10px]"
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              border: '1px solid rgba(201,169,106,0.5)',
              color: '#c9a96a',
            }}
          >
            {String(c.seed).padStart(2, '0')}
          </span>
          <div className="min-w-0">
            <div
              className={`truncate ${fontSize[size]} tracking-wide`}
              style={{
                fontFamily: 'Cinzel, serif',
                color: c.status === 'eliminated' ? '#7a6f5e' : '#e8e2d5',
                textDecoration: c.status === 'eliminated' && !isWinner ? 'line-through' : 'none',
                textDecorationColor: 'rgba(94,20,20,0.6)',
              }}
            >
              {c.name}
            </div>
            <div
              className="text-[10px] italic truncate"
              style={{ fontFamily: 'Cormorant Garamond, serif', color: '#7a6f5e' }}
            >
              {c.house}
            </div>
          </div>
        </div>
        <div
          className="text-[10px] tabular-nums"
          style={{ fontFamily: 'JetBrains Mono, monospace', color: '#c9a96a' }}
        >
          {c.wins}–{c.losses}
        </div>
      </div>
    </div>
  );
};

// ── Main wireframe ────────────────────────────────────────────────────────

interface TournamentProps {
  onBack?: () => void;
}

export const Tournament: React.FC<TournamentProps> = ({ onBack }) => {
  const [stage, setStage] = useState<'qualifiers' | 'knockout' | 'reckoning'>('reckoning');
  const [tick, setTick] = useState(0);

  // gentle pulse for "LIVE" indicator
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 1100);
    return () => clearInterval(i);
  }, []);

  const finalists = useMemo(() => CONTENDERS.filter((c) => c.status === 'finalist'), []);

  return (
    <div
      className="relative min-h-screen w-full overflow-x-hidden"
      style={{
        background:
          'radial-gradient(ellipse at top, #14110d 0%, #0a0908 55%, #050403 100%)',
        color: '#e8e2d5',
        fontFamily: 'Cormorant Garamond, serif',
      }}
    >
      <NoiseLayer />

      {/* ─── Masthead ──────────────────────────────────────── */}
      <header className="relative z-10 px-12 pt-10 pb-6">
        <div className="flex items-start justify-between gap-8">
          <div className="flex items-center gap-3 text-[10px] tracking-[0.4em]" style={{ color: '#7a6f5e', fontFamily: 'JetBrains Mono, monospace' }}>
            {onBack && (
              <button
                onClick={onBack}
                className="hover:text-[#c9a96a] transition-colors"
                style={{ letterSpacing: '0.3em' }}
              >
                ← LEDGER
              </button>
            )}
            <span>·</span>
            <span>EST. 2025</span>
          </div>
          <div className="flex items-center gap-3" style={{ color: '#7a6f5e', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.3em' }}>
            <span className="flex items-center gap-2">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  background: '#1a5f3f',
                  boxShadow: tick % 2 === 0 ? '0 0 12px #1a5f3f' : '0 0 4px #1a5f3f',
                  transition: 'box-shadow 0.4s',
                }}
              />
              LIVE · 24,108 WATCHING
            </span>
            <span>·</span>
            <span>RINK 03</span>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          className="mt-12 text-center"
        >
          <div
            className="text-[10px] tracking-[0.7em]"
            style={{ color: '#c9a96a', fontFamily: 'Cinzel, serif' }}
          >
            T H E · S P A D E S · A R E N A
          </div>
          <Ornament className="w-72 h-3 mx-auto my-5" style={{ color: '#c9a96a' }} />
          <h1
            className="text-7xl md:text-8xl leading-[0.95]"
            style={{
              fontFamily: 'Cinzel, serif',
              fontWeight: 900,
              color: '#e8e2d5',
              letterSpacing: '0.02em',
              textShadow: '0 0 40px rgba(201,169,106,0.15)',
            }}
          >
            THE RECKONING
          </h1>
          <div
            className="mt-3 italic text-lg"
            style={{ color: '#a89880', fontFamily: 'Cormorant Garamond, serif' }}
          >
            Tournament <span style={{ fontFamily: 'Cinzel, serif', fontStyle: 'normal' }}>XII</span> · sixteen contenders, one crown, two thrones at the end.
          </div>
          <div
            className="mt-2 text-[10px] tracking-[0.4em]"
            style={{ color: '#7a6f5e', fontFamily: 'JetBrains Mono, monospace' }}
          >
            17 — 24 MARCH · MMXXVI
          </div>
        </motion.div>

        {/* Stage navigation */}
        <nav className="mt-10 flex items-center justify-center gap-0">
          {(['qualifiers', 'knockout', 'reckoning'] as const).map((s, i) => {
            const labels = {
              qualifiers: ['I', 'QUALIFIERS', '16 contenders'],
              knockout: ['II', 'KNOCKOUT', '8 → 4'],
              reckoning: ['III', 'THE RECKONING', '2v2 final'],
            } as const;
            const [num, title, sub] = labels[s];
            const active = stage === s;
            return (
              <React.Fragment key={s}>
                {i > 0 && (
                  <div
                    className="w-12 h-px shrink-0"
                    style={{ background: 'linear-gradient(90deg, transparent, rgba(201,169,106,0.4), transparent)' }}
                  />
                )}
                <button
                  onClick={() => setStage(s)}
                  className="px-6 py-3 text-center transition-all"
                  style={{
                    color: active ? '#c9a96a' : '#7a6f5e',
                    borderTop: active ? '1px solid rgba(201,169,106,0.5)' : '1px solid transparent',
                    borderBottom: active ? '1px solid rgba(201,169,106,0.5)' : '1px solid transparent',
                  }}
                >
                  <div className="text-[10px] tracking-[0.3em] mb-1" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    STAGE {num}
                  </div>
                  <div className="text-base tracking-[0.3em]" style={{ fontFamily: 'Cinzel, serif', fontWeight: 600 }}>
                    {title}
                  </div>
                  <div className="text-[11px] italic mt-0.5" style={{ fontFamily: 'Cormorant Garamond, serif', color: '#7a6f5e' }}>
                    {sub}
                  </div>
                </button>
              </React.Fragment>
            );
          })}
        </nav>
      </header>

      {/* ─── Body ──────────────────────────────────────────── */}
      <main className="relative z-10 px-12 pb-24 mt-8">
        <AnimatePresence mode="wait">
          {stage === 'qualifiers' && (
            <motion.section
              key="q"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.5 }}
            >
              <QualifiersStage />
            </motion.section>
          )}
          {stage === 'knockout' && (
            <motion.section
              key="k"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.5 }}
            >
              <KnockoutStage />
            </motion.section>
          )}
          {stage === 'reckoning' && (
            <motion.section
              key="r"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.5 }}
            >
              <ReckoningStage finalists={finalists} pulse={tick % 2} />
            </motion.section>
          )}
        </AnimatePresence>
      </main>

      {/* ─── Footer ledger ─────────────────────────────────── */}
      <footer
        className="relative z-10 border-t px-12 py-6 text-[10px] tracking-[0.3em] flex justify-between items-center"
        style={{
          borderColor: 'rgba(201,169,106,0.18)',
          color: '#7a6f5e',
          fontFamily: 'JetBrains Mono, monospace',
        }}
      >
        <span>BROADCAST · YOUTUBE LIVE · 2560×1440 · 60FPS</span>
        <span className="flex items-center gap-2">
          <SpadeGlyph size={10} className="text-[#c9a96a]" />
          ARENA · MMXXVI
        </span>
        <span>SEAL OF THE HOUSE · {String(tick % 1000).padStart(3, '0')}</span>
      </footer>
    </div>
  );
};

// ── Stage: Qualifiers ─────────────────────────────────────────────────────

const QualifiersStage: React.FC = () => {
  return (
    <div className="max-w-6xl mx-auto">
      <SectionHeader
        eyebrow="Stage I"
        title="THE QUALIFIERS"
        subtitle="Sixteen contenders rotate through the tables. The wheat is sifted from the chaff by record, by bag-rate, and by nerve."
      />
      <div className="mt-10 grid grid-cols-12 gap-6">
        {/* ledger table */}
        <div className="col-span-8">
          <VignetteFrame>
            <table className="w-full" style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
              <thead>
                <tr style={{ color: '#c9a96a' }} className="text-left">
                  {['SEED', 'CONTENDER', 'HOUSE', 'W', 'L', 'BAG%', 'NIL', ''].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-[10px] tracking-[0.25em] font-normal"
                      style={{ borderBottom: '1px solid rgba(201,169,106,0.3)' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CONTENDERS.map((c) => (
                  <tr
                    key={c.id}
                    className="transition-colors hover:bg-[#1a1611]"
                    style={{ borderBottom: '1px solid rgba(232,226,213,0.05)' }}
                  >
                    <td className="px-4 py-2.5" style={{ color: '#c9a96a' }}>
                      {String(c.seed).padStart(2, '0')}
                    </td>
                    <td
                      className="px-4 py-2.5 tracking-wide"
                      style={{
                        fontFamily: 'Cinzel, serif',
                        color: c.status === 'finalist' ? '#e8e2d5' : c.status === 'eliminated' ? '#7a6f5e' : '#a89880',
                      }}
                    >
                      {c.name}
                    </td>
                    <td className="px-4 py-2.5 italic" style={{ fontFamily: 'Cormorant Garamond, serif', color: '#a89880' }}>
                      {c.house}
                    </td>
                    <td className="px-4 py-2.5">{c.wins}</td>
                    <td className="px-4 py-2.5" style={{ color: '#7a6f5e' }}>{c.losses}</td>
                    <td className="px-4 py-2.5">{(c.bagsRate * 100).toFixed(0)}</td>
                    <td className="px-4 py-2.5">{c.nilCalls}</td>
                    <td className="px-4 py-2.5 text-right">
                      <StatusPip status={c.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </VignetteFrame>
        </div>

        {/* side panel */}
        <aside className="col-span-4 space-y-5">
          <SidePanel title="CUT LINE">
            <p className="italic text-[15px] leading-relaxed" style={{ color: '#a89880' }}>
              The top eight by W–L proceed to the Knockout. Ties broken by negative bag-rate, then by nil rate, then by lots cast at midnight.
            </p>
            <div
              className="mt-4 pt-4 text-[11px] tracking-[0.25em]"
              style={{ borderTop: '1px solid rgba(201,169,106,0.2)', fontFamily: 'JetBrains Mono, monospace', color: '#c9a96a' }}
            >
              CUT AT SEED 08 — DEEPSEEK R2
            </div>
          </SidePanel>

          <SidePanel title="WAGERS LAID">
            <div className="space-y-3" style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
              {[
                ['OPUS to crown', '2.4 : 1'],
                ['GPT-5 to crown', '3.1 : 1'],
                ['GEM3 to crown', '3.8 : 1'],
                ['Underdog (any)', '11 : 1'],
              ].map(([label, odds]) => (
                <div key={label} className="flex justify-between items-baseline">
                  <span style={{ color: '#a89880' }}>{label}</span>
                  <span style={{ color: '#c9a96a' }}>{odds}</span>
                </div>
              ))}
            </div>
          </SidePanel>
        </aside>
      </div>
    </div>
  );
};

// ── Stage: Knockout ───────────────────────────────────────────────────────

const KnockoutStage: React.FC = () => {
  return (
    <div className="max-w-7xl mx-auto">
      <SectionHeader
        eyebrow="Stage II"
        title="THE KNOCKOUT"
        subtitle="Four tables of four. From each, only the highest score draws breath. The remaining twelve depart in silence."
      />

      <div className="mt-12 grid grid-cols-12 gap-8 items-start">
        {/* Quarterfinals — 4 tables */}
        <div className="col-span-7 space-y-6">
          <ColumnHeader number="01" label="QUARTERFINAL TABLES" />
          <div className="grid grid-cols-2 gap-5">
            {KNOCKOUT.filter((m) => m.round === 'r8').map((match, idx) => (
              <BracketTable key={match.id} match={match} index={idx} />
            ))}
          </div>
        </div>

        {/* Bridge — bracket curves */}
        <div className="col-span-1 relative h-[480px] hidden lg:block">
          <svg viewBox="0 0 60 480" className="w-full h-full" preserveAspectRatio="none">
            {[80, 200, 320, 440].map((y, i) => (
              <path
                key={i}
                d={`M0 ${y} Q 30 ${y}, 30 ${i < 2 ? 200 : 320} L 60 ${i < 2 ? 200 : 320}`}
                stroke="rgba(201,169,106,0.4)"
                strokeWidth="1"
                fill="none"
              />
            ))}
          </svg>
        </div>

        {/* Semifinal advancers — the 4 finalists */}
        <div className="col-span-4 space-y-6">
          <ColumnHeader number="02" label="THE FINAL FOUR" />
          <VignetteFrame goldBorder>
            <div className="p-5 space-y-3">
              <div
                className="text-[10px] tracking-[0.4em] mb-3 italic"
                style={{ color: '#7a6f5e', fontFamily: 'Cormorant Garamond, serif' }}
              >
                — paired by seed for the championship —
              </div>
              {CONTENDERS.filter((c) => c.status === 'finalist')
                .sort((a, b) => a.seed - b.seed)
                .map((c) => (
                  <ContenderCard key={c.id} c={c} size="md" isWinner />
                ))}
              <div
                className="mt-4 pt-4 text-center"
                style={{ borderTop: '1px solid rgba(201,169,106,0.25)' }}
              >
                <SpadeGlyph size={28} className="text-[#c9a96a] mx-auto" />
                <div
                  className="mt-2 text-[10px] tracking-[0.4em]"
                  style={{ color: '#c9a96a', fontFamily: 'Cinzel, serif' }}
                >
                  TO THE RECKONING
                </div>
              </div>
            </div>
          </VignetteFrame>
        </div>
      </div>
    </div>
  );
};

const BracketTable: React.FC<{ match: Match; index: number }> = ({ match, index }) => {
  const players = match.players.map(lookup);
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.5 }}
    >
      <VignetteFrame>
        <div
          className="px-4 py-2 flex justify-between items-center"
          style={{
            borderBottom: '1px solid rgba(201,169,106,0.2)',
            background: 'rgba(201,169,106,0.04)',
          }}
        >
          <span
            className="text-[10px] tracking-[0.3em]"
            style={{ color: '#c9a96a', fontFamily: 'Cinzel, serif' }}
          >
            TABLE {String.fromCharCode(65 + index)}
          </span>
          <span
            className="text-[10px] tracking-[0.25em] italic"
            style={{ color: '#7a6f5e', fontFamily: 'JetBrains Mono, monospace' }}
          >
            CONCLUDED
          </span>
        </div>
        <div className="divide-y" style={{ borderColor: 'rgba(232,226,213,0.05)' }}>
          {players.map((p) => (
            <ContenderCard key={p.id} c={p} size="sm" isWinner={p.id === match.winner} />
          ))}
        </div>
      </VignetteFrame>
    </motion.div>
  );
};

// ── Stage: The Reckoning ──────────────────────────────────────────────────

const ReckoningStage: React.FC<{ finalists: Contender[]; pulse: number }> = ({ finalists, pulse }) => {
  const north = TEAM_NORTH.map(lookup);
  const south = TEAM_SOUTH.map(lookup);

  return (
    <div className="max-w-7xl mx-auto">
      <SectionHeader
        eyebrow="Stage III · The Final"
        title="TWO THRONES"
        subtitle="The four survivors, paired by seed — first with fourth, second with third — sit at one table for one match. The score crosses 250 only once."
        gold
      />

      {/* The big diagonal split */}
      <div
        className="mt-14 relative"
        style={{
          minHeight: 540,
        }}
      >
        {/* Diagonal divider */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none z-10"
          viewBox="0 0 1200 540"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="diag-gold" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(201,169,106,0)" />
              <stop offset="50%" stopColor="rgba(201,169,106,0.9)" />
              <stop offset="100%" stopColor="rgba(201,169,106,0)" />
            </linearGradient>
          </defs>
          <line x1="640" y1="0" x2="560" y2="540" stroke="url(#diag-gold)" strokeWidth="1.5" />
        </svg>

        {/* Center medallion */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
            className="relative"
            style={{ width: 180, height: 180 }}
          >
            <div
              className="absolute inset-0 rounded-full grid place-items-center"
              style={{
                background: 'radial-gradient(circle, #14110d 0%, #0a0908 80%)',
                boxShadow:
                  '0 0 0 1px rgba(201,169,106,0.7), 0 0 0 6px rgba(10,9,8,1), 0 0 0 7px rgba(201,169,106,0.35), 0 0 60px rgba(201,169,106,0.2)',
              }}
            >
              <div className="text-center">
                <SpadeGlyph size={56} className="text-[#c9a96a] mx-auto" />
                <div
                  className="mt-1 text-[9px] tracking-[0.5em]"
                  style={{ color: '#c9a96a', fontFamily: 'Cinzel, serif', fontWeight: 700 }}
                >
                  VERSUS
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        <div className="grid grid-cols-2 gap-0 h-full relative">
          <TeamPanel
            team={north}
            label="House of the North"
            sigil="N"
            align="left"
            colorAccent="#c9a96a"
            score={142}
            bid={9}
            tricks={5}
          />
          <TeamPanel
            team={south}
            label="House of the South"
            sigil="S"
            align="right"
            colorAccent="#5e9171"
            score={138}
            bid={8}
            tricks={4}
          />
        </div>
      </div>

      {/* Live match dossier */}
      <div className="mt-16 grid grid-cols-12 gap-6">
        <div className="col-span-8">
          <SidePanel title="HAND IX · LIVE">
            <div className="grid grid-cols-3 gap-6 mt-2" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              <Stat label="HAND" value="09 / —" emerald={pulse === 0} />
              <Stat label="TARGET" value="250 PTS" />
              <Stat label="ELAPSED" value="01:42:18" />
              <Stat label="TRICK" value="06 / 13" />
              <Stat label="LED SUIT" value="♠ SPADES" />
              <Stat label="SPADES BROKEN" value="YES" />
            </div>

            <div
              className="mt-6 pt-5 text-[12px] italic leading-relaxed"
              style={{ borderTop: '1px solid rgba(201,169,106,0.2)', color: '#a89880', fontFamily: 'Cormorant Garamond, serif' }}
            >
              <span style={{ color: '#c9a96a', fontFamily: 'Cinzel, serif', fontStyle: 'normal', letterSpacing: '0.2em', fontSize: 11 }}>
                COMMENTARY ·
              </span>{' '}
              OPUS leads with the queen of spades, an unhurried claim of authority. GEM3 hesitates a half-second longer than its baseline — the model's chain-of-thought, briefly visible, debates a covering jack. L4M, sitting north, will be asked to follow.
            </div>
          </SidePanel>
        </div>

        <div className="col-span-4 space-y-5">
          <SidePanel title="PAIRING DECREE">
            <p className="italic text-[14px] leading-relaxed" style={{ color: '#a89880' }}>
              By the law of seeds: <strong style={{ color: '#e8e2d5', fontFamily: 'Cinzel, serif', fontWeight: 500, fontStyle: 'normal' }}>1 with 4, 2 with 3</strong>. The strongest carries the weakest; the second carries the third. Balance is enforced.
            </p>
            <div
              className="mt-4 grid grid-cols-2 gap-3 text-[10px] tracking-[0.2em]"
              style={{ fontFamily: 'JetBrains Mono, monospace' }}
            >
              <div style={{ borderTop: '1px solid #c9a96a', paddingTop: 6, color: '#c9a96a' }}>
                NORTH<br />
                <span style={{ color: '#a89880', textTransform: 'none', letterSpacing: 'normal', fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic', fontSize: 12 }}>
                  seed 1 + seed 4
                </span>
              </div>
              <div style={{ borderTop: '1px solid #5e9171', paddingTop: 6, color: '#5e9171' }}>
                SOUTH<br />
                <span style={{ color: '#a89880', textTransform: 'none', letterSpacing: 'normal', fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic', fontSize: 12 }}>
                  seed 2 + seed 3
                </span>
              </div>
            </div>
          </SidePanel>

          <SidePanel title="ENTER THE RING">
            <button
              className="w-full py-4 transition-all hover:scale-[0.98]"
              style={{
                background: 'linear-gradient(180deg, #c9a96a 0%, #a78850 100%)',
                color: '#0a0908',
                fontFamily: 'Cinzel, serif',
                fontWeight: 700,
                letterSpacing: '0.3em',
                fontSize: 13,
                boxShadow: '0 0 0 1px rgba(201,169,106,0.5), 0 8px 24px rgba(201,169,106,0.2)',
              }}
            >
              WATCH LIVE ▸
            </button>
            <div
              className="mt-3 text-[10px] text-center tracking-[0.25em]"
              style={{ color: '#7a6f5e', fontFamily: 'JetBrains Mono, monospace' }}
            >
              OPENS IN BROADCAST FRAME
            </div>
          </SidePanel>
        </div>
      </div>
    </div>
  );
};

const TeamPanel: React.FC<{
  team: Contender[];
  label: string;
  sigil: string;
  align: 'left' | 'right';
  colorAccent: string;
  score: number;
  bid: number;
  tricks: number;
}> = ({ team, label, sigil, align, colorAccent, score, bid, tricks }) => {
  const isLeft = align === 'left';
  return (
    <motion.div
      initial={{ opacity: 0, x: isLeft ? -30 : 30 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className={`relative px-10 py-8 ${isLeft ? 'pr-20' : 'pl-20'}`}
      style={{
        background: isLeft
          ? 'linear-gradient(120deg, rgba(20,17,13,0.9) 0%, rgba(10,9,8,0.4) 100%)'
          : 'linear-gradient(240deg, rgba(20,17,13,0.9) 0%, rgba(10,9,8,0.4) 100%)',
      }}
    >
      <div className={`flex items-start gap-4 ${isLeft ? '' : 'flex-row-reverse text-right'}`}>
        <div
          className="shrink-0 w-16 h-20 grid place-items-center"
          style={{
            border: `1px solid ${colorAccent}`,
            color: colorAccent,
            fontFamily: 'Cinzel, serif',
            fontWeight: 800,
            fontSize: 36,
          }}
        >
          {sigil}
        </div>
        <div>
          <div
            className="text-[10px] tracking-[0.4em]"
            style={{ color: colorAccent, fontFamily: 'JetBrains Mono, monospace' }}
          >
            TEAM
          </div>
          <div
            className="text-3xl mt-0.5"
            style={{ fontFamily: 'Cinzel, serif', fontWeight: 700, color: '#e8e2d5', letterSpacing: '0.05em' }}
          >
            {label.split(' ').slice(-1)[0].toUpperCase()}
          </div>
          <div
            className="italic text-sm"
            style={{ fontFamily: 'Cormorant Garamond, serif', color: '#a89880' }}
          >
            {label}
          </div>
        </div>
      </div>

      {/* members */}
      <div className={`mt-8 space-y-3 ${isLeft ? '' : 'text-right'}`}>
        {team.map((c) => (
          <div
            key={c.id}
            className={`flex items-center gap-4 ${isLeft ? '' : 'flex-row-reverse'}`}
          >
            <div
              className="shrink-0 w-10 h-10 grid place-items-center text-xs"
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                color: colorAccent,
                border: `1px solid ${colorAccent}66`,
              }}
            >
              {String(c.seed).padStart(2, '0')}
            </div>
            <div>
              <div
                className="text-lg tracking-wide"
                style={{ fontFamily: 'Cinzel, serif', fontWeight: 500, color: '#e8e2d5' }}
              >
                {c.name}
              </div>
              <div
                className="italic text-[13px]"
                style={{ fontFamily: 'Cormorant Garamond, serif', color: '#7a6f5e' }}
              >
                {c.house} · {c.wins}–{c.losses} record · {(c.bagsRate * 100).toFixed(0)}% bag rate
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* live counters */}
      <div
        className={`mt-8 pt-6 grid grid-cols-3 gap-4 ${isLeft ? '' : 'text-right'}`}
        style={{ borderTop: `1px solid ${colorAccent}44` }}
      >
        <div>
          <div className="text-[9px] tracking-[0.3em]" style={{ color: '#7a6f5e', fontFamily: 'JetBrains Mono, monospace' }}>
            SCORE
          </div>
          <div
            className="text-4xl tabular-nums"
            style={{ fontFamily: 'Cinzel, serif', fontWeight: 700, color: '#e8e2d5' }}
          >
            {score}
          </div>
        </div>
        <div>
          <div className="text-[9px] tracking-[0.3em]" style={{ color: '#7a6f5e', fontFamily: 'JetBrains Mono, monospace' }}>
            BID
          </div>
          <div
            className="text-4xl tabular-nums"
            style={{ fontFamily: 'Cinzel, serif', fontWeight: 700, color: colorAccent }}
          >
            {bid}
          </div>
        </div>
        <div>
          <div className="text-[9px] tracking-[0.3em]" style={{ color: '#7a6f5e', fontFamily: 'JetBrains Mono, monospace' }}>
            TRICKS
          </div>
          <div
            className="text-4xl tabular-nums"
            style={{ fontFamily: 'Cinzel, serif', fontWeight: 700, color: '#e8e2d5' }}
          >
            {tricks}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

// ── Shared section pieces ─────────────────────────────────────────────────

const SectionHeader: React.FC<{ eyebrow: string; title: string; subtitle: string; gold?: boolean }> = ({
  eyebrow,
  title,
  subtitle,
  gold = false,
}) => (
  <div className="text-center max-w-2xl mx-auto">
    <div
      className="text-[10px] tracking-[0.5em]"
      style={{
        color: gold ? '#c9a96a' : '#7a6f5e',
        fontFamily: 'JetBrains Mono, monospace',
      }}
    >
      {eyebrow.toUpperCase()}
    </div>
    <h2
      className="mt-3 text-4xl tracking-[0.15em]"
      style={{
        fontFamily: 'Cinzel, serif',
        fontWeight: 700,
        color: gold ? '#c9a96a' : '#e8e2d5',
      }}
    >
      {title}
    </h2>
    <Ornament className="w-40 h-3 mx-auto my-4" style={{ color: gold ? '#c9a96a' : '#7a6f5e' }} />
    <p
      className="italic text-[15px] leading-relaxed"
      style={{ fontFamily: 'Cormorant Garamond, serif', color: '#a89880' }}
    >
      {subtitle}
    </p>
  </div>
);

const ColumnHeader: React.FC<{ number: string; label: string }> = ({ number, label }) => (
  <div className="flex items-baseline gap-3">
    <span
      className="text-[10px] tracking-[0.3em]"
      style={{ color: '#c9a96a', fontFamily: 'JetBrains Mono, monospace' }}
    >
      {number}
    </span>
    <span
      className="text-base tracking-[0.3em]"
      style={{ color: '#e8e2d5', fontFamily: 'Cinzel, serif', fontWeight: 600 }}
    >
      {label}
    </span>
    <div className="flex-1 h-px" style={{ background: 'rgba(201,169,106,0.25)' }} />
  </div>
);

const SidePanel: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <VignetteFrame>
    <div className="px-5 py-5">
      <div
        className="text-[10px] tracking-[0.4em] mb-4"
        style={{ color: '#c9a96a', fontFamily: 'Cinzel, serif', fontWeight: 600 }}
      >
        ┊ {title}
      </div>
      {children}
    </div>
  </VignetteFrame>
);

const Stat: React.FC<{ label: string; value: string; emerald?: boolean }> = ({ label, value, emerald = false }) => (
  <div>
    <div className="text-[9px] tracking-[0.3em] mb-1" style={{ color: '#7a6f5e' }}>
      {label}
    </div>
    <div
      className="text-lg tabular-nums"
      style={{
        color: emerald ? '#5e9171' : '#e8e2d5',
        textShadow: emerald ? '0 0 12px rgba(94,145,113,0.4)' : 'none',
      }}
    >
      {value}
    </div>
  </div>
);

const StatusPip: React.FC<{ status: Contender['status'] }> = ({ status }) => {
  const config = {
    finalist: { color: '#c9a96a', label: 'FINALIST' },
    eliminated: { color: '#5e1414', label: 'OUT' },
    active: { color: '#5e9171', label: 'LIVE' },
  } as const;
  const { color, label } = config[status];
  return (
    <span
      className="inline-block px-2 py-0.5 text-[9px] tracking-[0.25em]"
      style={{
        border: `1px solid ${color}66`,
        color,
        fontFamily: 'JetBrains Mono, monospace',
      }}
    >
      {label}
    </span>
  );
};

export default Tournament;
