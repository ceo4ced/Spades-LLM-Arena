/**
 * Spades LLM Arena — Headless YouTube Streaming Orchestrator
 *
 * This script automates the entire Spades Arena lifecycle for 24/7 unattended
 * broadcasting. It:
 *   1. Optionally starts an Xvfb virtual display (Linux servers only)
 *   2. Boots the Vite dev server on localhost:3000
 *   3. Launches Playwright Chromium pointed at the game
 *   4. Auto-configures and starts a 4-bot match
 *   5. Monitors for game completion and auto-restarts new matches
 *   6. Optionally pipes the display to FFmpeg for YouTube RTMP streaming
 *
 * Usage:
 *   npm run stream                        # Headful mode (local dev, no FFmpeg)
 *   HEADLESS=1 npm run stream             # Headless mode (server, no display)
 *   YOUTUBE_STREAM_KEY=xxxx npm run stream # Full streaming to YouTube
 *
 * Environment variables:
 *   HEADLESS          - Run Chromium in headless mode (default: false)
 *   YOUTUBE_STREAM_KEY - YouTube RTMP stream key (enables FFmpeg)
 *   DISPLAY           - X11 display for Xvfb (default: :99)
 *   GAME_URL          - URL to the game (default: http://localhost:3000)
 *   VARIANT           - Game variant: 'standard' | 'jokers' (default: jokers)
 *   TARGET_SCORE      - Target score: 250 | 500 | 1000 (default: 250)
 *   RESTART_DELAY_MS  - Delay before restarting a match (default: 15000)
 */

import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';

// Load .env.local from the project root
loadEnv({ path: resolve(process.cwd(), '.env.local') });

import { chromium, type Browser, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'child_process';
import { startFFmpegStream, stopFFmpegStream } from './ffmpeg';

// ─── Configuration ───────────────────────────────────────────
const CONFIG = {
    headless: process.env.HEADLESS === '1',
    gameUrl: process.env.GAME_URL || 'http://localhost:3000',
    variant: (process.env.VARIANT as 'standard' | 'jokers') || 'jokers',
    targetScore: parseInt(process.env.TARGET_SCORE || '250', 10),
    restartDelayMs: parseInt(process.env.RESTART_DELAY_MS || '15000', 10),
    youtubeStreamKey: process.env.YOUTUBE_STREAM_KEY || '',
    display: process.env.DISPLAY || ':99',
    pollIntervalMs: 5000,
    viewportWidth: 1920,
    viewportHeight: 1080,
};

// ─── Logging ─────────────────────────────────────────────────
function log(msg: string) {
    const ts = new Date().toISOString();
    console.log(`[${ts}] [orchestrator] ${msg}`);
}

function logError(msg: string) {
    const ts = new Date().toISOString();
    console.error(`[${ts}] [orchestrator] ❌ ${msg}`);
}

// ─── Xvfb Management (Linux only) ───────────────────────────
let xvfbProcess: ChildProcess | null = null;

function startXvfb(): Promise<void> {
    return new Promise((resolve, reject) => {
        if (process.platform !== 'linux') {
            log('Skipping Xvfb (not Linux)');
            return resolve();
        }

        log(`Starting Xvfb on display ${CONFIG.display} (${CONFIG.viewportWidth}x${CONFIG.viewportHeight}x24)`);
        xvfbProcess = spawn('Xvfb', [
            CONFIG.display,
            '-screen', '0', `${CONFIG.viewportWidth}x${CONFIG.viewportHeight}x24`,
            '-ac',
        ], { stdio: 'ignore' });

        xvfbProcess.on('error', (err) => {
            logError(`Xvfb failed to start: ${err.message}`);
            logError('Install with: sudo apt install xvfb');
            reject(err);
        });

        // Give Xvfb a moment to boot
        setTimeout(() => {
            process.env.DISPLAY = CONFIG.display;
            log(`Xvfb running on ${CONFIG.display}`);
            resolve();
        }, 1000);
    });
}

function stopXvfb() {
    if (xvfbProcess) {
        xvfbProcess.kill();
        xvfbProcess = null;
        log('Xvfb stopped');
    }
}

// ─── Vite Dev Server ─────────────────────────────────────────
let viteProcess: ChildProcess | null = null;

function startViteServer(): Promise<void> {
    return new Promise((resolve, reject) => {
        log('Starting Vite dev server...');
        viteProcess = spawn('npm', ['run', 'dev'], {
            cwd: process.cwd(),
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env },
        });

        let started = false;

        viteProcess.stdout?.on('data', (data: Buffer) => {
            const output = data.toString();
            if (!started && output.includes('localhost')) {
                started = true;
                log(`Vite dev server ready at ${CONFIG.gameUrl}`);
                resolve();
            }
        });

        viteProcess.stderr?.on('data', (data: Buffer) => {
            const output = data.toString().trim();
            if (output) console.error(`  [vite] ${output}`);
        });

        viteProcess.on('error', (err) => {
            logError(`Vite failed: ${err.message}`);
            reject(err);
        });

        viteProcess.on('exit', (code) => {
            if (!started) {
                reject(new Error(`Vite exited early with code ${code}`));
            }
        });

        // Timeout: if Vite hasn't started in 30 seconds, reject
        setTimeout(() => {
            if (!started) {
                started = true;
                log('Vite timeout — assuming it\'s ready');
                resolve();
            }
        }, 30000);
    });
}

function stopViteServer() {
    if (viteProcess) {
        viteProcess.kill();
        viteProcess = null;
        log('Vite dev server stopped');
    }
}

// ─── Game Automation ─────────────────────────────────────────

async function setupAndStartMatch(page: Page): Promise<void> {
    log(`Navigating to ${CONFIG.gameUrl}...`);
    await page.goto(CONFIG.gameUrl, { waitUntil: 'networkidle' });
    log('Page loaded');

    // Wait for the setup screen to be visible
    await page.waitForTimeout(2000);

    // Select the game variant
    if (CONFIG.variant === 'jokers') {
        log('Selecting Jokers variant...');
        const jokersBtn = page.getByText('Jokers (Big/Little)');
        if (await jokersBtn.isVisible()) {
            await jokersBtn.click();
            log('✓ Jokers variant selected');
        }
    } else {
        log('Selecting Standard variant...');
        const standardBtn = page.getByText('Standard (52 Cards)');
        if (await standardBtn.isVisible()) {
            await standardBtn.click();
            log('✓ Standard variant selected');
        }
    }

    // Select the target score
    log(`Selecting target score: ${CONFIG.targetScore}...`);
    const scoreBtn = page.getByText(CONFIG.targetScore.toString(), { exact: true });
    if (await scoreBtn.isVisible()) {
        await scoreBtn.click();
        log(`✓ Target score set to ${CONFIG.targetScore}`);
    }

    // Wait a moment for selections to register
    await page.waitForTimeout(500);

    // Click "Start Match"
    log('Clicking Start Match...');
    const startBtn = page.getByText('Start Match', { exact: true });
    await startBtn.waitFor({ state: 'visible', timeout: 10000 });
    await startBtn.click();
    log('✓ Match started!');
}

async function waitForGameOver(page: Page): Promise<void> {
    log('Monitoring for game completion...');

    // Poll the DOM for game over signals
    while (true) {
        await page.waitForTimeout(CONFIG.pollIntervalMs);

        try {
            // Check if game over is visible in the game logs or UI
            const gameOverVisible = await page.evaluate(() => {
                // Check for "Game Over" text anywhere on the page
                const bodyText = document.body.innerText;
                if (bodyText.includes('Game Over')) return true;

                // Check for game_over phase in any visible element
                const logEntries = document.querySelectorAll('[class*="log"], [class*="Log"]');
                for (const entry of logEntries) {
                    if (entry.textContent?.includes('Game Over') ||
                        entry.textContent?.includes('wins the game')) {
                        return true;
                    }
                }

                return false;
            });

            if (gameOverVisible) {
                log('🏆 Game Over detected!');
                return;
            }

            // Also check if we somehow ended up back at the setup screen
            const onSetup = await page.getByText('Start Match', { exact: true }).isVisible()
                .catch(() => false);
            if (onSetup) {
                log('Detected setup screen — previous game may have ended.');
                return;
            }
        } catch (err) {
            // Page might be navigating, just continue polling
        }
    }
}

async function runMatchLoop(page: Page): Promise<void> {
    let matchNumber = 0;

    while (true) {
        matchNumber++;
        log(`═══════════════════════════════════════════`);
        log(`  Starting Match #${matchNumber}`);
        log(`═══════════════════════════════════════════`);

        try {
            await setupAndStartMatch(page);
            await waitForGameOver(page);

            log(`Match #${matchNumber} complete. Waiting ${CONFIG.restartDelayMs / 1000}s before restarting...`);
            await page.waitForTimeout(CONFIG.restartDelayMs);

            // Reload the page to reset all React state cleanly
            log('Reloading page for fresh match...');
            await page.reload({ waitUntil: 'networkidle' });
            await page.waitForTimeout(3000);

        } catch (err: any) {
            logError(`Error in match #${matchNumber}: ${err.message}`);
            log('Attempting recovery via page reload...');

            try {
                await page.reload({ waitUntil: 'networkidle' });
                await page.waitForTimeout(5000);
            } catch {
                logError('Page reload failed. Retrying in 10s...');
                await new Promise(r => setTimeout(r, 10000));
            }
        }
    }
}

// ─── Main Entry Point ────────────────────────────────────────

async function main() {
    log('╔═══════════════════════════════════════════╗');
    log('║   Spades LLM Arena — Stream Orchestrator  ║');
    log('╚═══════════════════════════════════════════╝');
    log(`  Mode:     ${CONFIG.headless ? 'Headless' : 'Headful (visual)'}`);
    log(`  Variant:  ${CONFIG.variant}`);
    log(`  Score:    ${CONFIG.targetScore}`);
    log(`  URL:      ${CONFIG.gameUrl}`);
    log(`  YouTube:  ${CONFIG.youtubeStreamKey ? 'ENABLED' : 'DISABLED'}`);
    log('');

    let browser: Browser | null = null;

    try {
        // Step 1: Start Xvfb if on Linux
        if (CONFIG.headless && process.platform === 'linux') {
            await startXvfb();
        }

        // Step 2: Start Vite dev server
        await startViteServer();

        // Step 3: Launch Playwright browser
        log('Launching Chromium...');
        browser = await chromium.launch({
            headless: CONFIG.headless,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                `--window-size=${CONFIG.viewportWidth},${CONFIG.viewportHeight}`,
            ],
        });

        const context = await browser.newContext({
            viewport: {
                width: CONFIG.viewportWidth,
                height: CONFIG.viewportHeight,
            },
        });
        const page = await context.newPage();
        log('✓ Chromium ready');

        // Step 4: Start FFmpeg streaming if YouTube key is provided
        if (CONFIG.youtubeStreamKey) {
            log('Starting FFmpeg RTMP stream to YouTube...');
            startFFmpegStream({
                display: CONFIG.display,
                width: CONFIG.viewportWidth,
                height: CONFIG.viewportHeight,
                youtubeStreamKey: CONFIG.youtubeStreamKey,
            });
            log('✓ FFmpeg streaming');
        }

        // Step 5: Run the infinite match loop
        await runMatchLoop(page);

    } catch (err: any) {
        logError(`Fatal error: ${err.message}`);
    } finally {
        log('Shutting down...');
        if (browser) await browser.close();
        stopFFmpegStream();
        stopViteServer();
        stopXvfb();
        log('Goodbye.');
    }
}

// ─── Graceful Shutdown ───────────────────────────────────────
process.on('SIGINT', () => {
    log('Received SIGINT — shutting down gracefully...');
    stopFFmpegStream();
    stopViteServer();
    stopXvfb();
    process.exit(0);
});

process.on('SIGTERM', () => {
    log('Received SIGTERM — shutting down gracefully...');
    stopFFmpegStream();
    stopViteServer();
    stopXvfb();
    process.exit(0);
});

// Go!
main();
