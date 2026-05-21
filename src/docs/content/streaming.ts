import type { DocCategory } from './types';

export const streaming: DocCategory = {
  id: 'streaming',
  title: 'Streaming & Benchmark',
  intro:
    'Two adjacent subsystems: the streaming orchestrator drives a headless browser so unattended bots can play ' +
    'continuously (and optionally pipe the canvas to YouTube via FFmpeg), and the benchmark module collects ' +
    'aggregate metrics across batches of games.',
  topics: [
    {
      id: 'orchestrator',
      title: 'stream/orchestrator.ts',
      summary: 'Headless Playwright loop that opens the Vite app, watches matches, and restarts them.',
      status: 'shipped',
      files: ['stream/orchestrator.ts'],
      layers: {
        abstract:
          'A Node script that launches Chromium via Playwright, navigates to the local Vite dev server (port 5273), ' +
          'and lets the app\'s 60-second auto-start kick off matches. When a game ends, the orchestrator clicks back ' +
          'to setup and the loop continues. With YOUTUBE=1 set, it also spawns FFmpeg with the page\'s rendered canvas ' +
          'as input and the YOUTUBE_STREAM_KEY as output, producing a live broadcast with zero human attention.',
        iface:
          'public final class Orchestrator {\n' +
          '    public static void main(String[] args);\n' +
          '    // Reads env: YOUTUBE (presence flag), YOUTUBE_STREAM_KEY (required if YOUTUBE)\n' +
          '}',
        pseudocode:
          'main():\n' +
          '    browser = await chromium.launch({headless: true})\n' +
          '    page    = await browser.newContext().newPage()\n' +
          '    await page.goto("http://localhost:5273")\n' +
          '\n' +
          '    if env.YOUTUBE:\n' +
          '        ffmpeg = spawnFfmpeg({input: page.canvas(), output: rtmpUrl(env.YOUTUBE_STREAM_KEY)})\n' +
          '    on SIGINT: graceful shutdown — close browser, kill ffmpeg\n' +
          '\n' +
          '    forever:\n' +
          '        wait for selector indicating "Start Match" or auto-start countdown\n' +
          '        wait for selector indicating game_over\n' +
          '        await page.click("Start Match (or Back to setup)")\n' +
          '        log("game complete, restarting")\n',
      },
    },

    {
      id: 'ffmpeg',
      title: 'stream/ffmpeg.ts',
      summary: 'Spawns FFmpeg with browser-canvas input and YouTube RTMP output.',
      status: 'shipped',
      files: ['stream/ffmpeg.ts'],
      layers: {
        abstract:
          'Thin wrapper around child_process.spawn that constructs the FFmpeg command line for a YouTube RTMP push. ' +
          'Manages the child process: pipes stderr to console (FFmpeg logs are noisy but useful), restarts on ' +
          'unexpected exit. The orchestrator owns the process lifecycle.',
        iface:
          'public final class FfmpegSink {\n' +
          '    public FfmpegSink(String inputDeviceOrPipe, String rtmpUrl);\n' +
          '    public void start();\n' +
          '    public void stop();\n' +
          '    public boolean isAlive();\n' +
          '}',
        pseudocode:
          'start():\n' +
          '    args = [\n' +
          '        "-f", inputFormat, "-i", inputDeviceOrPipe,\n' +
          '        "-c:v", "libx264", "-preset", "veryfast", "-b:v", "3000k",\n' +
          '        "-c:a", "aac", "-b:a", "128k",\n' +
          '        "-f", "flv", rtmpUrl\n' +
          '    ]\n' +
          '    child = spawn("ffmpeg", args, {stdio: ["pipe", "ignore", "inherit"]})\n' +
          '    child.on("exit", code => log("ffmpeg exited with " + code))\n' +
          '\n' +
          'stop(): child?.kill("SIGTERM")\n',
      },
    },

    {
      id: 'benchmark-config',
      title: 'benchmark/config.ts',
      summary: 'Defines a benchmark batch: model roster, repetitions, variant, target.',
      status: 'shipped',
      files: ['src/benchmark/config.ts'],
      layers: {
        abstract:
          'A BenchmarkConfig is the input to a batch run — which models to test, how many games per matchup, the ' +
          'variant, the cheating preset to use, and an optional rng seed sequence so identical batches can be ' +
          'reproduced. Consumed by the benchmark runner (not yet a top-level npm script).',
        iface:
          'public class BenchmarkConfig {\n' +
          '    String[]        models;              // model identifiers\n' +
          '    int             gamesPerMatchup;\n' +
          '    String          variant;\n' +
          '    int             targetScore;\n' +
          '    CheatingPolicy  policy;\n' +
          '    BigInt?         seedBase;            // batch[i] uses seedBase + i\n' +
          '}',
        pseudocode:
          '// No behavior — the file exports the BenchmarkConfig type and a few presets:\n' +
          'export const PRESETS = {\n' +
          '    QUICK:        {models: ["random","heuristic"], gamesPerMatchup: 10, variant: "standard", …},\n' +
          '    SMOKE_LLM:    {models: ["openai/gpt-4o", "anthropic/claude-haiku-4-5"], gamesPerMatchup: 5, …},\n' +
          '    PERMISSIVE_5: {…, policy: PERMISSIVE_LOG_ONLY, gamesPerMatchup: 50}\n' +
          '}\n',
      },
    },

    {
      id: 'benchmark-metrics',
      title: 'benchmark/metrics.ts',
      summary: 'Aggregates per-model stats from a batch of GameResults.',
      status: 'shipped',
      files: ['src/benchmark/metrics.ts'],
      layers: {
        abstract:
          'Pure functions over GameResult[]. Produces per-model win rate, average bid accuracy, renege count, ' +
          'matchup matrix, and (when CheatEvents are passed in) per-model cheat-event counts by kind. Side-effect-free ' +
          'so it can be unit-tested or run inside any orchestration context.',
        iface:
          'public final class Metrics {\n' +
          '    public static Map<String, ModelStats> winRates(GameResult[] games);\n' +
          '    public static Map<{a,b}, MatchupStat>  matchupMatrix(GameResult[] games);\n' +
          '    public static Map<String, CheatStats>  cheatTally(GameResult[], CheatEvent[]);\n' +
          '    public static BatchSummary             summary(BenchmarkConfig cfg, GameResult[] games);\n' +
          '}',
        pseudocode:
          'winRates(games):\n' +
          '    out = {}\n' +
          '    for each game in games:\n' +
          '        winners = game.winner == 1 ? game.team1Models : game.team2Models\n' +
          '        losers  = game.winner == 1 ? game.team2Models : game.team1Models\n' +
          '        for each m in winners: out[m].wins   += 1\n' +
          '        for each m in losers:  out[m].losses += 1\n' +
          '    annotate each entry with winRate = wins / (wins + losses)\n' +
          '    return out\n' +
          '\n' +
          'cheatTally(games, events):\n' +
          '    out = {}\n' +
          '    for each ev in events:\n' +
          '        model = lookupModelForGameSeat(ev.gameId, ev.seat, games)\n' +
          '        out[model][ev.kind] = (out[model][ev.kind] ?? 0) + 1\n' +
          '    return out\n',
      },
    },
  ],
};
