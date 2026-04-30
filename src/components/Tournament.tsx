/**
 * Tournament — wireframe for a multi-stage Spades LLM tournament culminating
 * in a 2v2 championship final.
 *
 * Visual language matches the rest of the app:
 *   • Outer: dark gray→green gradient (same as GameSetup)
 *   • Top nav: dark navy bar (same as Dashboard)
 *   • Content: bright white/frosted cards with gray text and green accents
 *   • Type: system sans default + `font-mono` for tabular data
 *   • Scroll: `h-screen flex flex-col` + `overflow-y-auto subtle-scroll`
 *     (the established pattern, since index.css forces body overflow hidden)
 *
 * Stages:
 *   I.  Qualifiers — 16 contenders compete in rotating 4-player matches.
 *       Top 8 by record advance.
 *   II. Knockout   — Four 4-player tables. Top scorer at each table advances.
 *   III. The Final — The four survivors are paired into two teams (1+4 vs 2+3
 *        by seed) for the engine's native 2v2 championship match.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, Trophy, Flame, Clock, Eye, Crown } from 'lucide-react';

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

type Match = { id: string; round: 'r8' | 'r4'; players: string[]; winner?: string };

const KNOCKOUT: Match[] = [
  { id: 'qf-a', round: 'r8', players: ['opus47', 'haiku45', 'gpt5m', 'gem3f'], winner: 'opus47' },
  { id: 'qf-b', round: 'r8', players: ['gpt5', 'cmd', 'phi4', 'grok3'], winner: 'gpt5' },
  { id: 'qf-c', round: 'r8', players: ['gem3', 'sonnet46', 'l4s', 'rnd'], winner: 'gem3' },
  { id: 'qf-d', round: 'r8', players: ['l4m', 'qwen3', 'mistr', 'dsr2'], winner: 'l4m' },
];

// Seed-based pairing for the 2v2 finale: 1+4 vs 2+3 (balanced snake).
const TEAM_NORTH = ['opus47', 'l4m'];
const TEAM_SOUTH = ['gpt5', 'gem3'];

const lookup = (id: string) => CONTENDERS.find((c) => c.id === id)!;

// ── Main component ────────────────────────────────────────────────────────

interface TournamentProps {
  onBack?: () => void;
  onPlay?: () => void;
}

type Stage = 'qualifiers' | 'knockout' | 'final';

export const Tournament: React.FC<TournamentProps> = ({ onBack, onPlay }) => {
  const [stage, setStage] = useState<Stage>('final');

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-gray-900 via-green-950 to-gray-900 overflow-hidden">
      {/* ── Top nav (matches Dashboard) ─────────────────── */}
      <nav className="flex items-center justify-between px-6 py-3 bg-[#0a1219] border-b border-white/10 shrink-0 z-20">
        <button
          onClick={onBack}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <ChevronLeft className="w-5 h-5 text-gray-400" />
          <span className="text-2xl">♠</span>
          <span className="text-lg font-bold tracking-tight text-white">
            Spades <span className="text-green-400">LLM Arena</span>
          </span>
        </button>
        <div className="flex gap-1">
          {onPlay && (
            <button
              onClick={onPlay}
              className="px-4 py-1.5 text-sm rounded-lg transition-colors text-gray-400 hover:text-white hover:bg-white/10"
            >
              Play
            </button>
          )}
          <button
            onClick={onBack}
            className="px-4 py-1.5 text-sm rounded-lg transition-colors text-gray-400 hover:text-white hover:bg-white/10"
          >
            Leaderboard
          </button>
          <button className="px-4 py-1.5 text-sm rounded-lg transition-colors bg-white/10 text-white font-medium">
            Tournament
          </button>
        </div>
      </nav>

      {/* ── Scrollable body ──────────────────────────────── */}
      <div className="flex-1 overflow-y-auto subtle-scroll">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6 pb-12">
          {/* Hero card */}
          <HeroCard />

          {/* Stage selector */}
          <StageTabs stage={stage} onChange={setStage} />

          {/* Stage content */}
          <AnimatePresence mode="wait">
            {stage === 'qualifiers' && (
              <motion.div
                key="q"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.35 }}
              >
                <QualifiersStage />
              </motion.div>
            )}
            {stage === 'knockout' && (
              <motion.div
                key="k"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.35 }}
              >
                <KnockoutStage onAdvance={() => setStage('final')} />
              </motion.div>
            )}
            {stage === 'final' && (
              <motion.div
                key="f"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.35 }}
              >
                <FinalStage />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

// ── Hero card ─────────────────────────────────────────────────────────────

const HeroCard: React.FC = () => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5 }}
    className="relative bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl overflow-hidden"
  >
    {/* Decorative ♠ glyphs in the background */}
    <div className="absolute -top-12 -right-8 text-[220px] font-serif text-gray-100 select-none leading-none pointer-events-none">
      ♠
    </div>
    <div className="absolute -bottom-16 left-12 text-[140px] font-serif text-green-50 select-none leading-none pointer-events-none">
      ♠
    </div>

    <div className="relative p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold tracking-widest uppercase text-green-700 mb-2">
          <Trophy className="w-4 h-4" />
          Tournament XII
        </div>
        <h1 className="text-3xl sm:text-4xl font-black text-gray-900 leading-tight">
          The Championship Bracket
        </h1>
        <p className="mt-2 text-gray-500 max-w-2xl">
          Sixteen large language models compete across three stages. The four survivors
          pair into two teams for a championship 2v2 match.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 sm:flex-nowrap">
        <Pill icon={<Flame className="w-3.5 h-3.5" />} label="LIVE" tone="green" pulse />
        <Pill icon={<Eye className="w-3.5 h-3.5" />} label="24,108 watching" tone="gray" />
        <Pill icon={<Clock className="w-3.5 h-3.5" />} label="Day 7 of 7" tone="gray" />
      </div>
    </div>

    {/* Top progress strip */}
    <div className="relative px-6 sm:px-8 pb-5 grid grid-cols-3 gap-3 text-xs">
      <ProgressStat label="Contenders" value="16" sub="started" />
      <ProgressStat label="Active" value="4" sub="finalists" tone="green" />
      <ProgressStat label="Champion" value="—" sub="to be crowned" tone="amber" />
    </div>
  </motion.div>
);

const Pill: React.FC<{
  icon?: React.ReactNode;
  label: string;
  tone?: 'green' | 'gray' | 'amber' | 'red';
  pulse?: boolean;
}> = ({ icon, label, tone = 'gray', pulse }) => {
  const toneStyles = {
    green: 'bg-green-50 text-green-700 border-green-200',
    gray: 'bg-gray-50 text-gray-600 border-gray-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    red: 'bg-red-50 text-red-600 border-red-200',
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${toneStyles[tone]}`}
    >
      {pulse && <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />}
      {icon}
      {label}
    </span>
  );
};

const ProgressStat: React.FC<{
  label: string;
  value: string;
  sub: string;
  tone?: 'gray' | 'green' | 'amber';
}> = ({ label, value, sub, tone = 'gray' }) => {
  const toneText = {
    gray: 'text-gray-800',
    green: 'text-green-700',
    amber: 'text-amber-600',
  } as const;
  return (
    <div className="flex items-baseline gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-100">
      <span className="text-[10px] font-semibold tracking-widest uppercase text-gray-400 shrink-0">
        {label}
      </span>
      <span className={`text-lg font-black font-mono ${toneText[tone]}`}>{value}</span>
      <span className="text-xs text-gray-400 truncate">{sub}</span>
    </div>
  );
};

// ── Stage tabs ────────────────────────────────────────────────────────────

const StageTabs: React.FC<{ stage: Stage; onChange: (s: Stage) => void }> = ({ stage, onChange }) => {
  const tabs: { id: Stage; num: string; title: string; sub: string }[] = [
    { id: 'qualifiers', num: 'I', title: 'Qualifiers', sub: '16 contenders' },
    { id: 'knockout', num: 'II', title: 'Knockout', sub: '8 → 4' },
    { id: 'final', num: 'III', title: 'The Final', sub: '2v2 championship' },
  ];

  return (
    <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-lg p-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
      {tabs.map((t) => {
        const active = stage === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`relative flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all ${
              active
                ? 'bg-green-600 text-white shadow-md'
                : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
            }`}
          >
            <span
              className={`shrink-0 w-9 h-9 rounded-lg grid place-items-center text-sm font-black font-mono ${
                active ? 'bg-white/20 text-white' : 'bg-white text-gray-400 border border-gray-200'
              }`}
            >
              {t.num}
            </span>
            <div>
              <div className="font-bold text-sm">{t.title}</div>
              <div className={`text-xs ${active ? 'text-green-50' : 'text-gray-500'}`}>
                {t.sub}
              </div>
            </div>
            {t.id === 'final' && !active && (
              <span className="absolute top-2 right-2 inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold tracking-wider uppercase bg-green-100 text-green-700 rounded">
                <span className="w-1 h-1 rounded-full bg-green-500 animate-pulse" />
                live
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

// ── Stage I: Qualifiers ──────────────────────────────────────────────────

const QualifiersStage: React.FC = () => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-2 overflow-hidden p-0">
        <SectionHead inset title="Qualifying Ladder" subtitle="Sixteen contenders, ranked by W–L. Top eight advance." />
        <div className="overflow-x-auto subtle-scroll-dark">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr className="text-left">
                {['Seed', 'Contender', 'House', 'W', 'L', 'Bag %', 'Nil', 'Status'].map((h) => (
                  <th key={h} className="px-4 py-3 text-[11px] font-bold tracking-wider uppercase">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CONTENDERS.map((c, idx) => {
                const cutLine = idx === 7;
                return (
                  <React.Fragment key={c.id}>
                    <tr
                      className={`border-t border-gray-100 hover:bg-gray-50 transition-colors ${
                        c.status === 'finalist' ? 'bg-green-50/40' : ''
                      }`}
                    >
                      <td className="px-4 py-3 font-mono text-gray-500">
                        {String(c.seed).padStart(2, '0')}
                      </td>
                      <td className="px-4 py-3 font-bold text-gray-800">{c.name}</td>
                      <td className="px-4 py-3 text-gray-500">{c.house}</td>
                      <td className="px-4 py-3 font-mono font-bold text-green-700">{c.wins}</td>
                      <td className="px-4 py-3 font-mono text-gray-400">{c.losses}</td>
                      <td className="px-4 py-3 font-mono text-gray-600">
                        {(c.bagsRate * 100).toFixed(0)}%
                      </td>
                      <td className="px-4 py-3 font-mono text-gray-600">{c.nilCalls}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={c.status} />
                      </td>
                    </tr>
                    {cutLine && (
                      <tr>
                        <td colSpan={8} className="px-4 py-1.5 bg-gray-100">
                          <div className="flex items-center gap-2 text-[10px] font-bold tracking-widest uppercase text-gray-400">
                            <div className="flex-1 h-px bg-gray-300" />
                            <span>Cut Line · Top 8 Advance</span>
                            <div className="flex-1 h-px bg-gray-300" />
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="space-y-6">
        <Card>
          <SectionHead small title="How qualifying works" />
          <p className="text-sm text-gray-600 leading-relaxed">
            Each contender plays a rotating schedule of 4-player matches across the week.
            Records are pooled into a single ladder. Ties are broken by{' '}
            <span className="font-semibold text-gray-800">bag rate</span> (lower is better),
            then by <span className="font-semibold text-gray-800">successful nil bids</span>.
          </p>
          <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500 flex justify-between">
            <span>Cut at seed 08</span>
            <span className="font-mono text-gray-400">DeepSeek R2</span>
          </div>
        </Card>

        <Card>
          <SectionHead small title="Predicted finalists" />
          <ul className="space-y-2.5">
            {[
              ['Claude Opus 4.7', '32%'],
              ['GPT-5 Pro', '24%'],
              ['Gemini 3 Ultra', '21%'],
              ['Llama 4 Maverick', '11%'],
            ].map(([name, odds]) => (
              <li key={name} className="flex justify-between items-center text-sm">
                <span className="text-gray-700">{name}</span>
                <span className="font-mono font-bold text-green-700">{odds}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
};

// ── Stage II: Knockout ────────────────────────────────────────────────────

const KnockoutStage: React.FC<{ onAdvance: () => void }> = ({ onAdvance }) => {
  return (
    <div className="space-y-6">
      <Card>
        <SectionHead
          title="Knockout · Round of 8"
          subtitle="Four tables of four. The highest scorer at each table is the only one who advances."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {KNOCKOUT.map((m, i) => (
            <BracketTable key={m.id} match={m} index={i} />
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <SectionHead
            title="The Final Four"
            subtitle="These four advance to the championship 2v2. Pairing rule below."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {CONTENDERS.filter((c) => c.status === 'finalist')
              .sort((a, b) => a.seed - b.seed)
              .map((c) => (
                <FinalistCard key={c.id} c={c} />
              ))}
          </div>
          <button
            onClick={onAdvance}
            className="mt-5 w-full py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl shadow-md transition-all hover:scale-[0.99] flex items-center justify-center gap-2"
          >
            <Trophy className="w-4 h-4" />
            Continue to The Final
          </button>
        </Card>

        <Card>
          <SectionHead small title="Pairing rule" />
          <div className="space-y-3 text-sm text-gray-600">
            <p>
              By seeded snake: <span className="font-semibold text-gray-800">1 + 4</span> vs{' '}
              <span className="font-semibold text-gray-800">2 + 3</span>. The highest seed is paired
              with the lowest to balance the teams.
            </p>
            <div className="grid grid-cols-2 gap-2 pt-3 border-t border-gray-100">
              <div className="p-3 rounded-lg bg-green-50 border border-green-200">
                <div className="text-[10px] font-bold tracking-widest uppercase text-green-700">
                  Team North
                </div>
                <div className="mt-1 text-xs font-mono text-gray-700">seed 1 + seed 4</div>
              </div>
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                <div className="text-[10px] font-bold tracking-widest uppercase text-blue-700">
                  Team South
                </div>
                <div className="mt-1 text-xs font-mono text-gray-700">seed 2 + seed 3</div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

const BracketTable: React.FC<{ match: Match; index: number }> = ({ match, index }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.35 }}
      className="rounded-xl border border-gray-200 bg-white overflow-hidden"
    >
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
        <span className="text-xs font-bold tracking-widest uppercase text-gray-500">
          Table {String.fromCharCode(65 + index)}
        </span>
        <span className="text-[10px] font-mono text-gray-400 uppercase tracking-wider">
          Concluded
        </span>
      </div>
      <ul className="divide-y divide-gray-100">
        {match.players.map((pid) => {
          const p = lookup(pid);
          const won = pid === match.winner;
          return (
            <li
              key={pid}
              className={`flex items-center gap-2.5 px-3 py-2.5 ${
                won ? 'bg-green-50' : ''
              }`}
            >
              <span
                className={`shrink-0 w-7 h-7 rounded-md grid place-items-center text-[11px] font-mono font-bold ${
                  won
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-100 text-gray-500 border border-gray-200'
                }`}
              >
                {String(p.seed).padStart(2, '0')}
              </span>
              <div className="min-w-0 flex-1">
                <div
                  className={`text-sm font-bold truncate ${
                    won ? 'text-green-800' : p.status === 'eliminated' ? 'text-gray-500' : 'text-gray-700'
                  }`}
                >
                  {p.name}
                </div>
                <div className="text-[11px] text-gray-400 truncate">{p.house}</div>
              </div>
              {won ? (
                <Trophy className="w-4 h-4 text-green-600" />
              ) : (
                <span className="text-[10px] font-mono text-gray-400">{p.wins}–{p.losses}</span>
              )}
            </li>
          );
        })}
      </ul>
    </motion.div>
  );
};

const FinalistCard: React.FC<{ c: Contender }> = ({ c }) => (
  <div className="p-4 rounded-xl border-2 border-green-200 bg-gradient-to-br from-green-50 to-white">
    <div className="flex items-center gap-3">
      <span className="shrink-0 w-10 h-10 rounded-lg bg-green-600 text-white font-black font-mono grid place-items-center">
        {String(c.seed).padStart(2, '0')}
      </span>
      <div className="min-w-0">
        <div className="font-bold text-gray-800 truncate">{c.name}</div>
        <div className="text-xs text-gray-500 truncate">{c.house}</div>
      </div>
      <Crown className="ml-auto w-4 h-4 text-amber-500 shrink-0" />
    </div>
    <div className="mt-3 pt-3 border-t border-green-200 grid grid-cols-3 gap-1 text-center">
      <div>
        <div className="text-[9px] font-bold tracking-widest uppercase text-gray-400">Record</div>
        <div className="text-sm font-mono font-bold text-gray-800">{c.wins}–{c.losses}</div>
      </div>
      <div>
        <div className="text-[9px] font-bold tracking-widest uppercase text-gray-400">Bags</div>
        <div className="text-sm font-mono font-bold text-gray-800">{(c.bagsRate * 100).toFixed(0)}%</div>
      </div>
      <div>
        <div className="text-[9px] font-bold tracking-widest uppercase text-gray-400">Nils</div>
        <div className="text-sm font-mono font-bold text-gray-800">{c.nilCalls}</div>
      </div>
    </div>
  </div>
);

// ── Stage III: The Final (2v2 championship) ──────────────────────────────

const FinalStage: React.FC = () => {
  const north = TEAM_NORTH.map(lookup);
  const south = TEAM_SOUTH.map(lookup);
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setPulse((p) => p + 1), 1100);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="space-y-6">
      {/* The big 2v2 showdown card */}
      <Card className="overflow-hidden p-0">
        <div className="px-6 sm:px-8 pt-6 pb-3 flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs font-bold tracking-widest uppercase text-green-700 flex items-center gap-2">
              <Crown className="w-4 h-4" /> Championship · 2v2
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-gray-900 mt-1">
              The Final Match
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              First team to <span className="font-bold text-gray-700">250 points</span> takes the
              title.
            </p>
          </div>
          <Pill icon={<Flame className="w-3.5 h-3.5" />} label="LIVE · Hand 9" tone="green" pulse />
        </div>

        {/* Team versus block */}
        <div className="relative grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-stretch gap-4 px-4 sm:px-6 pb-6">
          <TeamPanel
            team={north}
            label="Team North"
            tone="green"
            score={142}
            bid={9}
            tricks={5}
            align="left"
          />

          {/* VS center medallion */}
          <div className="relative flex md:flex-col items-center justify-center py-2 md:py-0 md:px-2">
            <div className="hidden md:block absolute top-0 bottom-0 left-1/2 w-px bg-gradient-to-b from-transparent via-gray-200 to-transparent" />
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br from-gray-900 via-green-900 to-gray-900 grid place-items-center shadow-2xl ring-4 ring-white"
            >
              <div className="text-white font-black text-lg sm:text-xl tracking-widest">VS</div>
              <span className="absolute -top-2 -right-1 text-3xl">♠</span>
            </motion.div>
          </div>

          <TeamPanel
            team={south}
            label="Team South"
            tone="blue"
            score={138}
            bid={8}
            tricks={4}
            align="right"
          />
        </div>

        {/* Live match strip */}
        <div className="border-t border-gray-100 bg-gray-50 px-6 sm:px-8 py-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <LiveStat label="Hand" value="9 of —" />
          <LiveStat label="Trick" value="6 of 13" highlight={pulse % 2 === 0} />
          <LiveStat label="Led suit" value="♠ Spades" />
          <LiveStat label="Spades broken" value="Yes" />
        </div>

        {/* CTA */}
        <div className="px-6 sm:px-8 py-5 border-t border-gray-100 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <button className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl shadow-md transition-all hover:scale-[0.99] flex items-center justify-center gap-2">
            <Eye className="w-4 h-4" /> Watch Live
          </button>
          <button className="px-6 py-3 bg-white hover:bg-gray-50 text-gray-700 font-bold rounded-xl shadow-sm border border-gray-200 transition-all flex items-center justify-center gap-2">
            <Trophy className="w-4 h-4" /> View Bracket
          </button>
        </div>
      </Card>

      {/* Commentary + match log */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <SectionHead title="Live commentary" subtitle="Hand 9, trick 6 in progress." />
          <ul className="space-y-3 text-sm text-gray-600">
            {[
              ['Opus leads the queen of spades — an unhurried claim of authority.', 'now'],
              ['Gem3 hesitates; chain-of-thought briefly debates a covering jack.', '6s ago'],
              ['L4M (north) plays the seven of clubs; trump is broken.', '14s ago'],
              ['GPT-5 captures trick 5 with the king of hearts. South ahead by three tricks.', '38s ago'],
            ].map(([msg, ts], i) => (
              <li key={i} className="flex items-start gap-3 pb-3 border-b border-gray-100 last:border-0">
                <span className="shrink-0 mt-1 w-2 h-2 rounded-full bg-green-500" />
                <span className="flex-1">{msg}</span>
                <span className="shrink-0 text-xs font-mono text-gray-400">{ts}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <SectionHead small title="Hand-by-hand" />
          <div className="space-y-2">
            {[
              ['Hand 1', 71, 64],
              ['Hand 2', 88, 82],
              ['Hand 3', 95, 113],
              ['Hand 4', 119, 138],
              ['Hand 5', 142, 138],
            ].map(([label, n, s]) => (
              <div key={String(label)} className="flex items-center gap-3 text-sm">
                <span className="w-12 text-xs font-mono text-gray-400">{label}</span>
                <div className="flex-1 grid grid-cols-2 gap-1">
                  <div className="text-right pr-2 font-mono text-green-700 font-bold">{n}</div>
                  <div className="pl-2 font-mono text-blue-700 font-bold">{s}</div>
                </div>
              </div>
            ))}
            <div className="pt-2 mt-2 border-t border-gray-100 flex items-center gap-3 text-sm">
              <span className="w-12 text-xs font-bold uppercase tracking-widest text-gray-500">Now</span>
              <div className="flex-1 grid grid-cols-2 gap-1">
                <div className="text-right pr-2 font-mono text-green-700 font-black text-base">142</div>
                <div className="pl-2 font-mono text-blue-700 font-black text-base">138</div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

const TeamPanel: React.FC<{
  team: Contender[];
  label: string;
  tone: 'green' | 'blue';
  score: number;
  bid: number;
  tricks: number;
  align: 'left' | 'right';
}> = ({ team, label, tone, score, bid, tricks, align }) => {
  const tones = {
    green: {
      ring: 'border-green-200',
      bg: 'bg-gradient-to-br from-green-50 to-white',
      label: 'text-green-700',
      score: 'text-green-700',
      seedBg: 'bg-green-600',
    },
    blue: {
      ring: 'border-blue-200',
      bg: 'bg-gradient-to-br from-blue-50 to-white',
      label: 'text-blue-700',
      score: 'text-blue-700',
      seedBg: 'bg-blue-600',
    },
  } as const;
  const t = tones[tone];
  const isLeft = align === 'left';

  return (
    <motion.div
      initial={{ opacity: 0, x: isLeft ? -20 : 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5 }}
      className={`rounded-2xl border-2 ${t.ring} ${t.bg} p-5 ${isLeft ? 'md:text-left' : 'md:text-right'}`}
    >
      <div className={`flex items-center gap-2 ${isLeft ? '' : 'md:flex-row-reverse'}`}>
        <span className={`text-[10px] font-bold tracking-widest uppercase ${t.label}`}>{label}</span>
        <div className={`flex-1 h-px bg-gradient-to-r ${isLeft ? 'from-current to-transparent' : 'from-transparent to-current'} ${t.label} opacity-30`} />
      </div>

      <div className={`mt-3 flex items-baseline gap-2 ${isLeft ? '' : 'md:justify-end'}`}>
        <span className={`text-5xl sm:text-6xl font-black font-mono ${t.score}`}>{score}</span>
        <span className="text-xs text-gray-400">/ 250 pts</span>
      </div>

      <div className={`mt-4 space-y-2`}>
        {team.map((c) => (
          <div
            key={c.id}
            className={`flex items-center gap-3 ${isLeft ? '' : 'md:flex-row-reverse'}`}
          >
            <span
              className={`shrink-0 w-9 h-9 rounded-lg ${t.seedBg} text-white font-black font-mono grid place-items-center text-xs`}
            >
              {String(c.seed).padStart(2, '0')}
            </span>
            <div className={`min-w-0 ${isLeft ? '' : 'md:text-right'}`}>
              <div className="font-bold text-gray-800 truncate text-sm">{c.name}</div>
              <div className="text-xs text-gray-500 truncate">{c.house} · {c.wins}–{c.losses}</div>
            </div>
          </div>
        ))}
      </div>

      <div className={`mt-4 pt-4 border-t border-gray-200/60 grid grid-cols-2 gap-3 ${isLeft ? '' : 'md:text-right'}`}>
        <div>
          <div className="text-[10px] font-bold tracking-widest uppercase text-gray-400">Bid</div>
          <div className="font-mono font-black text-gray-800 text-lg">{bid}</div>
        </div>
        <div>
          <div className="text-[10px] font-bold tracking-widest uppercase text-gray-400">Tricks</div>
          <div className="font-mono font-black text-gray-800 text-lg">{tricks}</div>
        </div>
      </div>
    </motion.div>
  );
};

const LiveStat: React.FC<{ label: string; value: string; highlight?: boolean }> = ({
  label,
  value,
  highlight,
}) => (
  <div>
    <div className="text-[10px] font-bold tracking-widest uppercase text-gray-400">{label}</div>
    <div
      className={`mt-0.5 text-base font-mono font-bold ${
        highlight ? 'text-green-700' : 'text-gray-800'
      } transition-colors`}
    >
      {value}
    </div>
  </div>
);

// ── Shared building blocks ───────────────────────────────────────────────

const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => (
  <div
    className={`bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl ${className.includes('p-0') ? '' : 'p-5 sm:p-6'} ${className}`}
  >
    {children}
  </div>
);

const SectionHead: React.FC<{
  title: string;
  subtitle?: string;
  small?: boolean;
  inset?: boolean;
}> = ({ title, subtitle, small = false, inset = false }) => (
  <div
    className={[
      small ? 'mb-3' : 'mb-4',
      inset ? 'px-5 pt-5 sm:px-6 sm:pt-6' : '',
    ]
      .filter(Boolean)
      .join(' ')}
  >
    <h3 className={`font-black text-gray-800 ${small ? 'text-sm tracking-wide' : 'text-lg sm:text-xl'}`}>
      {title}
    </h3>
    {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
  </div>
);

const StatusBadge: React.FC<{ status: Contender['status'] }> = ({ status }) => {
  const cfg = {
    finalist: { label: 'Finalist', cls: 'bg-green-100 text-green-700 border-green-200' },
    eliminated: { label: 'Out', cls: 'bg-red-50 text-red-500 border-red-200' },
    active: { label: 'Active', cls: 'bg-blue-50 text-blue-600 border-blue-200' },
  } as const;
  const { label, cls } = cfg[status];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase border ${cls}`}
    >
      {label}
    </span>
  );
};

export default Tournament;
