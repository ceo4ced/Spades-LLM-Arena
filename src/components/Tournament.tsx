/**
 * Tournament — wireframe for an 8-team single-elimination Spades tournament.
 *
 * Tournament structure:
 *   • A "team" is a single LLM model paired with itself — two instances of the
 *     same model occupying seats 1 & 3 (Team 1, blue) or 2 & 4 (Team 2, red),
 *     matching the engine's native 2v2 partnership (see engine/types.ts).
 *   • 16 teams compete in qualifying. Top 8 by record advance to the bracket.
 *   • Bracket is single-elimination: QF (8 → 4) → SF (4 → 2) → Final (2 → 1).
 *   • Every match is a regular Spades 2v2, first team to 250 points wins.
 *   • The final is just the last 2v2 standing.
 *
 * Visuals match the rest of the app:
 *   • Outer: dark gray→green gradient (same as GameSetup)
 *   • Top nav: dark navy bar (same as Dashboard)
 *   • Cards: bright frosted-white
 *   • Type: system sans + font-mono for tabular data
 *   • Team colors: blue for Team 1, red for Team 2 (engine convention)
 */

import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, Trophy, Flame, Clock, Eye, Crown, Users } from 'lucide-react';

// ── Mock tournament data ───────────────────────────────────────────────────
type Team = {
  id: string;
  model: string;
  short: string;
  house: string;
  seed: number;
  qualWins: number;
  qualLosses: number;
  status: 'finalist' | 'eliminated' | 'champion' | 'active';
};

// 16 teams in qualifying — each team is one model paired with itself.
const TEAMS: Team[] = [
  { id: 'opus', model: 'Claude Opus 4.7', short: 'OPUS', house: 'Anthropic', seed: 1, qualWins: 11, qualLosses: 1, status: 'finalist' },
  { id: 'gpt5', model: 'GPT-5 Pro', short: 'GPT5', house: 'OpenAI', seed: 2, qualWins: 10, qualLosses: 2, status: 'finalist' },
  { id: 'gem3', model: 'Gemini 3 Ultra', short: 'GEM3', house: 'Google', seed: 3, qualWins: 10, qualLosses: 2, status: 'eliminated' },
  { id: 'l4m', model: 'Llama 4 Maverick', short: 'L4M', house: 'Meta', seed: 4, qualWins: 9, qualLosses: 3, status: 'eliminated' },
  { id: 'sonnet', model: 'Claude Sonnet 4.6', short: 'SON', house: 'Anthropic', seed: 5, qualWins: 8, qualLosses: 4, status: 'eliminated' },
  { id: 'qwen', model: 'Qwen 3 Max', short: 'QWN', house: 'Alibaba', seed: 6, qualWins: 8, qualLosses: 4, status: 'eliminated' },
  { id: 'mistral', model: 'Mistral Grand', short: 'MIS', house: 'Mistral', seed: 7, qualWins: 7, qualLosses: 5, status: 'eliminated' },
  { id: 'dsr', model: 'DeepSeek R2', short: 'DSR', house: 'DeepSeek', seed: 8, qualWins: 7, qualLosses: 5, status: 'eliminated' },
  { id: 'haiku', model: 'Claude Haiku 4.5', short: 'HAI', house: 'Anthropic', seed: 9, qualWins: 6, qualLosses: 6, status: 'eliminated' },
  { id: 'gpt5m', model: 'GPT-5 Mini', short: 'G5M', house: 'OpenAI', seed: 10, qualWins: 6, qualLosses: 6, status: 'eliminated' },
  { id: 'gem3f', model: 'Gemini 3 Flash', short: 'G3F', house: 'Google', seed: 11, qualWins: 5, qualLosses: 7, status: 'eliminated' },
  { id: 'cmd', model: 'Cohere Command R+', short: 'CMD', house: 'Cohere', seed: 12, qualWins: 5, qualLosses: 7, status: 'eliminated' },
  { id: 'phi4', model: 'Phi-4 Reasoner', short: 'PHI', house: 'Microsoft', seed: 13, qualWins: 4, qualLosses: 8, status: 'eliminated' },
  { id: 'grok', model: 'Grok 3', short: 'GRK', house: 'xAI', seed: 14, qualWins: 4, qualLosses: 8, status: 'eliminated' },
  { id: 'l4s', model: 'Llama 4 Scout', short: 'L4S', house: 'Meta', seed: 15, qualWins: 3, qualLosses: 9, status: 'eliminated' },
  { id: 'heu', model: 'House Heuristic', short: 'HEU', house: 'Arena', seed: 16, qualWins: 2, qualLosses: 10, status: 'eliminated' },
];

const ADVANCING = TEAMS.filter((t) => t.seed <= 8);
const lookup = (id: string) => TEAMS.find((t) => t.id === id)!;

// Single-elimination bracket: standard seed pairing (1v8, 4v5, 3v6, 2v7).
type Match = {
  id: string;
  round: 'qf' | 'sf' | 'final';
  position: number; // vertical slot in the bracket column
  teamA: string;    // sits at seats 1 & 3 (Team 1, blue)
  teamB: string;    // sits at seats 2 & 4 (Team 2, red)
  scoreA?: number;
  scoreB?: number;
  winner?: string;
  inProgress?: boolean;
};

const BRACKET: Match[] = [
  { id: 'qf1', round: 'qf', position: 0, teamA: 'opus', teamB: 'dsr', scoreA: 250, scoreB: 178, winner: 'opus' },
  { id: 'qf2', round: 'qf', position: 1, teamA: 'l4m', teamB: 'sonnet', scoreA: 198, scoreB: 250, winner: 'sonnet' },
  { id: 'qf3', round: 'qf', position: 2, teamA: 'gem3', teamB: 'qwen', scoreA: 250, scoreB: 165, winner: 'gem3' },
  { id: 'qf4', round: 'qf', position: 3, teamA: 'gpt5', teamB: 'mistral', scoreA: 250, scoreB: 142, winner: 'gpt5' },
  { id: 'sf1', round: 'sf', position: 0, teamA: 'opus', teamB: 'sonnet', scoreA: 250, scoreB: 211, winner: 'opus' },
  { id: 'sf2', round: 'sf', position: 1, teamA: 'gem3', teamB: 'gpt5', scoreA: 224, scoreB: 250, winner: 'gpt5' },
  { id: 'final', round: 'final', position: 0, teamA: 'opus', teamB: 'gpt5', scoreA: 142, scoreB: 138, inProgress: true },
];

const FINAL_MATCH = BRACKET.find((m) => m.round === 'final')!;

// ── Main component ────────────────────────────────────────────────────────

interface TournamentProps {
  onBack?: () => void;
  onPlay?: () => void;
}

type Stage = 'qualifiers' | 'bracket' | 'final';

export const Tournament: React.FC<TournamentProps> = ({ onBack, onPlay }) => {
  const [stage, setStage] = useState<Stage>('final');

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-gray-900 via-green-950 to-gray-900 overflow-hidden">
      {/* Top nav */}
      <nav className="flex items-center justify-between px-6 py-3 bg-[#0a1219] border-b border-white/10 shrink-0 z-20">
        <button onClick={onBack} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <ChevronLeft className="w-5 h-5 text-gray-400" />
          <span className="text-2xl">♠</span>
          <span className="text-lg font-bold tracking-tight text-white">
            Spades <span className="text-green-400">LLM Arena</span>
          </span>
        </button>
        <div className="flex gap-1">
          {onPlay && (
            <button onClick={onPlay} className="px-4 py-1.5 text-sm rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
              Play
            </button>
          )}
          <button onClick={onBack} className="px-4 py-1.5 text-sm rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
            Leaderboard
          </button>
          <button className="px-4 py-1.5 text-sm rounded-lg bg-white/10 text-white font-medium">
            Tournament
          </button>
        </div>
      </nav>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto subtle-scroll">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6 pb-12">
          <HeroCard />
          <StageTabs stage={stage} onChange={setStage} />

          <AnimatePresence mode="wait">
            {stage === 'qualifiers' && (
              <motion.div key="q" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35 }}>
                <QualifiersStage />
              </motion.div>
            )}
            {stage === 'bracket' && (
              <motion.div key="b" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35 }}>
                <BracketStage onAdvance={() => setStage('final')} />
              </motion.div>
            )}
            {stage === 'final' && (
              <motion.div key="f" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35 }}>
                <FinalStage />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

// ── Hero ──────────────────────────────────────────────────────────────────

const HeroCard: React.FC = () => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5 }}
    className="relative bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl overflow-hidden"
  >
    <div className="absolute -top-12 -right-8 text-[220px] font-serif text-gray-100 select-none leading-none pointer-events-none">♠</div>
    <div className="absolute -bottom-16 left-12 text-[140px] font-serif text-green-50 select-none leading-none pointer-events-none">♠</div>

    <div className="relative p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold tracking-widest uppercase text-green-700 mb-2">
          <Trophy className="w-4 h-4" />
          Tournament XII · 8-Team Bracket
        </div>
        <h1 className="text-3xl sm:text-4xl font-black text-gray-900 leading-tight">
          The Championship Bracket
        </h1>
        <p className="mt-2 text-gray-500 max-w-2xl">
          Sixteen large language models qualify; the top eight enter a single-elimination
          bracket. Each match is a 2v2 partnership of one model against another, first to
          250 points wins.
        </p>
      </div>
      <div className="flex flex-wrap gap-2 sm:flex-nowrap">
        <Pill icon={<Flame className="w-3.5 h-3.5" />} label="LIVE" tone="green" pulse />
        <Pill icon={<Eye className="w-3.5 h-3.5" />} label="24,108 watching" tone="gray" />
        <Pill icon={<Clock className="w-3.5 h-3.5" />} label="Day 7 of 7" tone="gray" />
      </div>
    </div>

    <div className="relative px-6 sm:px-8 pb-5 grid grid-cols-3 gap-3 text-xs">
      <ProgressStat label="Qualified" value="16" sub="teams" />
      <ProgressStat label="Bracket" value="8" sub="advanced" tone="green" />
      <ProgressStat label="Champion" value="—" sub="to be crowned" tone="amber" />
    </div>
  </motion.div>
);

const Pill: React.FC<{ icon?: React.ReactNode; label: string; tone?: 'green' | 'gray' | 'amber' | 'red' | 'blue'; pulse?: boolean }> = ({ icon, label, tone = 'gray', pulse }) => {
  const toneStyles = {
    green: 'bg-green-50 text-green-700 border-green-200',
    gray: 'bg-gray-50 text-gray-600 border-gray-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    red: 'bg-red-50 text-red-600 border-red-200',
    blue: 'bg-blue-50 text-blue-600 border-blue-200',
  } as const;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${toneStyles[tone]}`}>
      {pulse && <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />}
      {icon}
      {label}
    </span>
  );
};

const ProgressStat: React.FC<{ label: string; value: string; sub: string; tone?: 'gray' | 'green' | 'amber' }> = ({ label, value, sub, tone = 'gray' }) => {
  const toneText = { gray: 'text-gray-800', green: 'text-green-700', amber: 'text-amber-600' } as const;
  return (
    <div className="flex items-baseline gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-100">
      <span className="text-[10px] font-semibold tracking-widest uppercase text-gray-400 shrink-0">{label}</span>
      <span className={`text-lg font-black font-mono ${toneText[tone]}`}>{value}</span>
      <span className="text-xs text-gray-400 truncate">{sub}</span>
    </div>
  );
};

// ── Stage tabs ────────────────────────────────────────────────────────────

const StageTabs: React.FC<{ stage: Stage; onChange: (s: Stage) => void }> = ({ stage, onChange }) => {
  const tabs: { id: Stage; num: string; title: string; sub: string }[] = [
    { id: 'qualifiers', num: 'I', title: 'Qualifiers', sub: '16 teams' },
    { id: 'bracket', num: 'II', title: 'Bracket', sub: '8 → 4 → 2' },
    { id: 'final', num: 'III', title: 'The Final', sub: 'Live now' },
  ];
  return (
    <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-lg p-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
      {tabs.map((t) => {
        const active = stage === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`relative flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all ${active ? 'bg-green-600 text-white shadow-md' : 'bg-gray-50 hover:bg-gray-100 text-gray-700'}`}
          >
            <span className={`shrink-0 w-9 h-9 rounded-lg grid place-items-center text-sm font-black font-mono ${active ? 'bg-white/20 text-white' : 'bg-white text-gray-400 border border-gray-200'}`}>
              {t.num}
            </span>
            <div>
              <div className="font-bold text-sm">{t.title}</div>
              <div className={`text-xs ${active ? 'text-green-50' : 'text-gray-500'}`}>{t.sub}</div>
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

const QualifiersStage: React.FC = () => (
  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <Card className="lg:col-span-2 overflow-hidden p-0">
      <SectionHead inset title="Qualifying Ladder" subtitle="Sixteen team-models ranked by W–L. Top eight advance to the bracket." />
      <div className="overflow-x-auto subtle-scroll-dark">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr className="text-left">
              {['Seed', 'Team (Model)', 'House', 'W', 'L', 'Status'].map((h) => (
                <th key={h} className="px-4 py-3 text-[11px] font-bold tracking-wider uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TEAMS.map((t, idx) => {
              const isCutLine = idx === 7;
              const advanced = t.seed <= 8;
              return (
                <React.Fragment key={t.id}>
                  <tr className={`border-t border-gray-100 hover:bg-gray-50 transition-colors ${t.status === 'finalist' ? 'bg-green-50/40' : ''}`}>
                    <td className="px-4 py-3 font-mono text-gray-500">{String(t.seed).padStart(2, '0')}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-800">Team {t.short}</span>
                        <span className="text-xs text-gray-500">· {t.model}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{t.house}</td>
                    <td className="px-4 py-3 font-mono font-bold text-green-700">{t.qualWins}</td>
                    <td className="px-4 py-3 font-mono text-gray-400">{t.qualLosses}</td>
                    <td className="px-4 py-3"><StatusBadge status={t.status} advanced={advanced} /></td>
                  </tr>
                  {isCutLine && (
                    <tr>
                      <td colSpan={6} className="px-4 py-1.5 bg-gray-100">
                        <div className="flex items-center gap-2 text-[10px] font-bold tracking-widest uppercase text-gray-400">
                          <div className="flex-1 h-px bg-gray-300" />
                          <span>Cut Line · Top 8 Advance to Bracket</span>
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
          Each team — one model paired with itself across seats 1 &amp; 3 or 2 &amp; 4 —
          plays a rotating schedule against the other fifteen. Records are pooled into
          a single ladder. Ties are broken by{' '}
          <span className="font-semibold text-gray-800">point differential</span>, then
          by <span className="font-semibold text-gray-800">head-to-head</span>.
        </p>
        <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500 flex justify-between">
          <span>Cut at seed 08</span>
          <span className="font-mono text-gray-400">DeepSeek R2</span>
        </div>
      </Card>

      <Card>
        <SectionHead small title="Bracket seeding" />
        <p className="text-sm text-gray-600 mb-3">First-round matchups by seed:</p>
        <ul className="space-y-2 text-sm font-mono">
          {[
            ['1', 'Opus', '8', 'DSR'],
            ['4', 'L4M', '5', 'Sonnet'],
            ['3', 'Gem3', '6', 'Qwen'],
            ['2', 'GPT5', '7', 'Mistral'],
          ].map(([sa, na, sb, nb], i) => (
            <li key={i} className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded bg-blue-100 text-blue-700 grid place-items-center font-bold">{sa}</span>
                <span className="text-gray-700">{na}</span>
              </span>
              <span className="text-gray-400">vs</span>
              <span className="flex items-center gap-1.5">
                <span className="text-gray-700">{nb}</span>
                <span className="w-5 h-5 rounded bg-red-100 text-red-700 grid place-items-center font-bold">{sb}</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  </div>
);

// ── Stage II: Bracket ─────────────────────────────────────────────────────

const BracketStage: React.FC<{ onAdvance: () => void }> = ({ onAdvance }) => {
  const qf = BRACKET.filter((m) => m.round === 'qf');
  const sf = BRACKET.filter((m) => m.round === 'sf');

  return (
    <div className="space-y-6">
      <Card>
        <SectionHead
          title="Single-Elimination Bracket"
          subtitle="Eight teams, three rounds. Winning team advances; losing team is out."
        />

        {/* 3-column bracket using CSS grid with row-spans for vertical centering */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_1.1fr] gap-4 lg:gap-6">
          {/* Quarterfinals */}
          <BracketColumn label="Quarterfinals" sub="8 → 4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
              {qf.map((m, i) => (
                <BracketMatchCard key={m.id} match={m} index={i} />
              ))}
            </div>
          </BracketColumn>

          {/* Semifinals — vertically centered between QF pairs */}
          <BracketColumn label="Semifinals" sub="4 → 2">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4 lg:gap-[8.5rem] lg:pt-[4.25rem]">
              {sf.map((m, i) => (
                <BracketMatchCard key={m.id} match={m} index={i + 4} />
              ))}
            </div>
          </BracketColumn>

          {/* Final */}
          <BracketColumn label="The Final" sub="Championship · 2v2" emphasis>
            <div className="lg:pt-[10.75rem]">
              <BracketMatchCard match={FINAL_MATCH} index={6} large />
              <button
                onClick={onAdvance}
                className="mt-4 w-full py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-lg shadow-md transition-all hover:scale-[0.99] flex items-center justify-center gap-2"
              >
                <Eye className="w-4 h-4" /> Watch the Final
              </button>
            </div>
          </BracketColumn>
        </div>
      </Card>
    </div>
  );
};

const BracketColumn: React.FC<{ label: string; sub: string; emphasis?: boolean; children: React.ReactNode }> = ({ label, sub, emphasis, children }) => (
  <div>
    <div className={`mb-3 pb-2 border-b ${emphasis ? 'border-green-300' : 'border-gray-200'}`}>
      <div className={`text-[10px] font-bold tracking-widest uppercase ${emphasis ? 'text-green-700' : 'text-gray-400'}`}>
        {sub}
      </div>
      <div className={`text-sm font-bold ${emphasis ? 'text-green-700' : 'text-gray-700'}`}>
        {label}
      </div>
    </div>
    {children}
  </div>
);

const BracketMatchCard: React.FC<{ match: Match; index: number; large?: boolean }> = ({ match, index, large = false }) => {
  const teamA = lookup(match.teamA);
  const teamB = lookup(match.teamB);
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04, duration: 0.3 }}
      className={`rounded-xl border bg-white overflow-hidden ${
        match.inProgress
          ? 'border-green-400 shadow-lg shadow-green-200/40 ring-2 ring-green-100'
          : 'border-gray-200'
      }`}
    >
      <BracketTeamRow
        team={teamA}
        score={match.scoreA}
        isWinner={match.winner === teamA.id}
        teamColor="blue"
        large={large}
      />
      <div className="h-px bg-gray-100" />
      <BracketTeamRow
        team={teamB}
        score={match.scoreB}
        isWinner={match.winner === teamB.id}
        teamColor="red"
        large={large}
      />
      {match.inProgress && (
        <div className="px-3 py-1.5 bg-green-50 border-t border-green-200 flex items-center gap-1.5 text-[10px] font-bold tracking-wider uppercase text-green-700">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          Live · in progress
        </div>
      )}
    </motion.div>
  );
};

const BracketTeamRow: React.FC<{
  team: Team;
  score?: number;
  isWinner: boolean;
  teamColor: 'blue' | 'red';
  large?: boolean;
}> = ({ team, score, isWinner, teamColor, large = false }) => {
  const colorClasses = {
    blue: { seed: 'bg-blue-600 text-white', label: 'text-blue-700' },
    red: { seed: 'bg-red-600 text-white', label: 'text-red-700' },
  } as const;
  const c = colorClasses[teamColor];
  return (
    <div className={`flex items-center gap-2.5 px-3 ${large ? 'py-3' : 'py-2.5'} ${isWinner ? 'bg-green-50' : ''}`}>
      <span className={`shrink-0 w-7 h-7 rounded-md ${c.seed} grid place-items-center text-[11px] font-mono font-bold`}>
        {String(team.seed).padStart(2, '0')}
      </span>
      <div className="min-w-0 flex-1">
        <div className={`font-bold truncate ${isWinner ? 'text-gray-900' : 'text-gray-700'} ${large ? 'text-base' : 'text-sm'}`}>
          Team {team.short}
        </div>
        <div className="text-[11px] text-gray-500 truncate">{team.model}</div>
      </div>
      {score !== undefined && (
        <div className={`font-mono font-black ${large ? 'text-2xl' : 'text-lg'} ${isWinner ? 'text-green-700' : 'text-gray-400'}`}>
          {score}
        </div>
      )}
      {isWinner && !large && <Trophy className="w-4 h-4 text-green-600 shrink-0" />}
    </div>
  );
};

// ── Stage III: The Final ─────────────────────────────────────────────────

const FinalStage: React.FC = () => {
  const teamA = lookup(FINAL_MATCH.teamA);
  const teamB = lookup(FINAL_MATCH.teamB);
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setPulse((p) => p + 1), 1100);
    return () => clearInterval(t);
  }, []);

  // path-to-final for each team
  const pathFor = (teamId: string) =>
    BRACKET.filter((m) => m.round !== 'final' && (m.teamA === teamId || m.teamB === teamId)).map((m) => {
      const isA = m.teamA === teamId;
      const us = isA ? m.scoreA! : m.scoreB!;
      const them = isA ? m.scoreB! : m.scoreA!;
      const oppId = isA ? m.teamB : m.teamA;
      return { round: m.round, us, them, opp: lookup(oppId) };
    });

  return (
    <div className="space-y-6">
      {/* The big 2v2 showdown card */}
      <Card className="overflow-hidden p-0">
        <div className="px-6 sm:px-8 pt-6 pb-3 flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs font-bold tracking-widest uppercase text-green-700 flex items-center gap-2">
              <Crown className="w-4 h-4" /> Championship · 2v2 Final
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-gray-900 mt-1">
              Team {teamA.short} <span className="text-gray-400 font-normal">vs</span> Team {teamB.short}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Each team is two instances of the same model. First to{' '}
              <span className="font-bold text-gray-700">250 points</span> takes the title.
            </p>
          </div>
          <Pill icon={<Flame className="w-3.5 h-3.5" />} label={`LIVE · Hand 9`} tone="green" pulse />
        </div>

        {/* Versus block */}
        <div className="relative grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-stretch gap-4 px-4 sm:px-6 pb-6">
          <TeamPanel team={teamA} tone="blue" score={FINAL_MATCH.scoreA!} bid={9} tricks={5} seats={[1, 3]} align="left" />

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

          <TeamPanel team={teamB} tone="red" score={FINAL_MATCH.scoreB!} bid={8} tricks={4} seats={[2, 4]} align="right" />
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

      {/* Path to the final */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PathCard team={teamA} tone="blue" path={pathFor(teamA.id)} />
        <PathCard team={teamB} tone="red" path={pathFor(teamB.id)} />
      </div>

      {/* Live commentary + hand log */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <SectionHead title="Live commentary" subtitle="Hand 9, trick 6 in progress." />
          <ul className="space-y-3 text-sm text-gray-600">
            {[
              ['Opus (seat 1) leads the queen of spades — an unhurried claim of authority.', 'now'],
              ['GPT-5 (seat 2) hesitates; chain-of-thought briefly debates a covering jack.', '6s ago'],
              ['Opus (seat 3) plays the seven of clubs, drawing trump.', '14s ago'],
              ['GPT-5 (seat 4) captures trick 5 with the king of hearts. Team GPT-5 ahead by three tricks.', '38s ago'],
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
          <div className="grid grid-cols-3 text-[10px] tracking-widest uppercase text-gray-400 mb-2">
            <span>Hand</span>
            <span className="text-blue-700 text-right">Team {teamA.short}</span>
            <span className="text-red-700 text-right">Team {teamB.short}</span>
          </div>
          <div className="space-y-1.5 text-sm">
            {[
              ['1', 71, 64],
              ['2', 88, 82],
              ['3', 95, 113],
              ['4', 119, 138],
              ['5', 142, 138],
            ].map(([h, n, s]) => (
              <div key={String(h)} className="grid grid-cols-3 items-center">
                <span className="text-xs font-mono text-gray-500">Hand {h}</span>
                <span className="font-mono text-blue-700 font-bold text-right">{n}</span>
                <span className="font-mono text-red-700 font-bold text-right">{s}</span>
              </div>
            ))}
            <div className="pt-2 mt-2 border-t border-gray-100 grid grid-cols-3 items-center">
              <span className="text-xs font-bold uppercase tracking-widest text-gray-500">Now</span>
              <span className="font-mono text-blue-700 font-black text-right text-base">{FINAL_MATCH.scoreA}</span>
              <span className="font-mono text-red-700 font-black text-right text-base">{FINAL_MATCH.scoreB}</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

const TeamPanel: React.FC<{
  team: Team;
  tone: 'blue' | 'red';
  score: number;
  bid: number;
  tricks: number;
  seats: [number, number];
  align: 'left' | 'right';
}> = ({ team, tone, score, bid, tricks, seats, align }) => {
  const tones = {
    blue: {
      ring: 'border-blue-200',
      bg: 'bg-gradient-to-br from-blue-50 to-white',
      label: 'text-blue-700',
      score: 'text-blue-700',
      seedBg: 'bg-blue-600',
      seatChip: 'bg-blue-100 text-blue-700 border-blue-200',
    },
    red: {
      ring: 'border-red-200',
      bg: 'bg-gradient-to-br from-red-50 to-white',
      label: 'text-red-700',
      score: 'text-red-700',
      seedBg: 'bg-red-600',
      seatChip: 'bg-red-100 text-red-700 border-red-200',
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
      {/* Team header with seat assignments */}
      <div className={`flex items-center gap-2 ${isLeft ? '' : 'md:flex-row-reverse'}`}>
        <span className={`text-[10px] font-bold tracking-widest uppercase ${t.label}`}>
          Team {tone === 'blue' ? '1' : '2'}
        </span>
        <div className={`flex items-center gap-1 ${isLeft ? '' : 'md:flex-row-reverse'}`}>
          {seats.map((s) => (
            <span key={s} className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${t.seatChip}`}>
              Seat {s}
            </span>
          ))}
        </div>
      </div>

      {/* Team identity */}
      <div className={`mt-2 flex items-baseline gap-2 ${isLeft ? '' : 'md:justify-end'}`}>
        <h3 className="text-2xl sm:text-3xl font-black text-gray-900 truncate">Team {team.short}</h3>
      </div>
      <div className={`text-sm text-gray-500 ${isLeft ? '' : 'md:text-right'}`}>
        Two of <span className="font-semibold text-gray-700">{team.model}</span>
      </div>

      {/* Score */}
      <div className={`mt-4 flex items-baseline gap-2 ${isLeft ? '' : 'md:justify-end'}`}>
        <span className={`text-5xl sm:text-6xl font-black font-mono ${t.score}`}>{score}</span>
        <span className="text-xs text-gray-400">/ 250 pts</span>
      </div>

      {/* The two seat assignments — making the pairing explicit */}
      <div className="mt-4 space-y-2">
        {seats.map((s, i) => (
          <div key={s} className={`flex items-center gap-3 ${isLeft ? '' : 'md:flex-row-reverse'}`}>
            <span className={`shrink-0 w-9 h-9 rounded-lg ${t.seedBg} text-white font-black font-mono grid place-items-center text-xs`}>
              S{s}
            </span>
            <div className={`min-w-0 ${isLeft ? '' : 'md:text-right'}`}>
              <div className="font-bold text-gray-800 truncate text-sm">{team.model}</div>
              <div className="text-xs text-gray-500 truncate">
                {i === 0 ? 'Partner' : 'Partner'} · seat {s}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Bid + tricks */}
      <div className={`mt-4 pt-4 border-t border-gray-200/60 grid grid-cols-2 gap-3 ${isLeft ? '' : 'md:text-right'}`}>
        <div>
          <div className="text-[10px] font-bold tracking-widest uppercase text-gray-400">Team Bid</div>
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

const LiveStat: React.FC<{ label: string; value: string; highlight?: boolean }> = ({ label, value, highlight }) => (
  <div>
    <div className="text-[10px] font-bold tracking-widest uppercase text-gray-400">{label}</div>
    <div className={`mt-0.5 text-base font-mono font-bold ${highlight ? 'text-green-700' : 'text-gray-800'} transition-colors`}>
      {value}
    </div>
  </div>
);

const PathCard: React.FC<{
  team: Team;
  tone: 'blue' | 'red';
  path: { round: 'qf' | 'sf' | 'final'; us: number; them: number; opp: Team }[];
}> = ({ team, tone, path }) => {
  const toneClasses = {
    blue: { border: 'border-blue-200', label: 'text-blue-700', score: 'text-blue-700' },
    red: { border: 'border-red-200', label: 'text-red-700', score: 'text-red-700' },
  } as const;
  const c = toneClasses[tone];
  const roundLabel = { qf: 'Quarterfinal', sf: 'Semifinal', final: 'Final' };

  return (
    <div className={`bg-white rounded-2xl shadow-xl p-5 sm:p-6 border-l-4 ${c.border}`}>
      <div className="flex items-center gap-2 mb-1">
        <Users className={`w-4 h-4 ${c.label}`} />
        <span className={`text-[10px] font-bold tracking-widest uppercase ${c.label}`}>Path to the Final</span>
      </div>
      <h3 className="text-lg font-black text-gray-800">Team {team.short}</h3>
      <p className="text-xs text-gray-500 mb-4">{team.model} · seed {team.seed}</p>

      <div className="space-y-3">
        {path.map((p, i) => (
          <div key={i} className="flex items-center gap-3 text-sm">
            <span className="shrink-0 w-20 text-[10px] font-bold tracking-widest uppercase text-gray-400">
              {roundLabel[p.round]}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-gray-700 truncate">def. <span className="font-semibold">Team {p.opp.short}</span></div>
              <div className="text-xs text-gray-400 truncate">{p.opp.model}</div>
            </div>
            <span className={`font-mono font-black text-sm ${c.score}`}>
              {p.us}–{p.them}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Shared building blocks ───────────────────────────────────────────────

const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl ${className.includes('p-0') ? '' : 'p-5 sm:p-6'} ${className}`}>
    {children}
  </div>
);

const SectionHead: React.FC<{ title: string; subtitle?: string; small?: boolean; inset?: boolean }> = ({ title, subtitle, small = false, inset = false }) => (
  <div className={[small ? 'mb-3' : 'mb-4', inset ? 'px-5 pt-5 sm:px-6 sm:pt-6' : ''].filter(Boolean).join(' ')}>
    <h3 className={`font-black text-gray-800 ${small ? 'text-sm tracking-wide' : 'text-lg sm:text-xl'}`}>{title}</h3>
    {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
  </div>
);

const StatusBadge: React.FC<{ status: Team['status']; advanced: boolean }> = ({ status, advanced }) => {
  const cfg = {
    finalist: { label: 'Finalist', cls: 'bg-green-100 text-green-700 border-green-200' },
    champion: { label: 'Champion', cls: 'bg-amber-100 text-amber-700 border-amber-300' },
    eliminated: advanced
      ? { label: 'Eliminated', cls: 'bg-gray-100 text-gray-500 border-gray-200' }
      : { label: 'Cut', cls: 'bg-red-50 text-red-500 border-red-200' },
    active: { label: 'Active', cls: 'bg-blue-50 text-blue-600 border-blue-200' },
  } as const;
  const { label, cls } = cfg[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase border ${cls}`}>
      {label}
    </span>
  );
};

export default Tournament;
