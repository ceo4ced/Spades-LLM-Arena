/**
 * Layout Verification Script
 * 
 * Run this in the browser console during a game to capture element positions
 * and verify centering constraints hold after scaling changes.
 * 
 * Usage: Import and call verifyLayout() — returns pass/fail for each check.
 */

interface LayoutCheck {
    name: string;
    pass: boolean;
    detail: string;
}

interface LayoutSnapshot {
    viewport: { width: number; height: number };
    gameBoard: DOMRect | null;
    trickArea: DOMRect | null;
    playerBoxes: { seat: string; rect: DOMRect }[];
    chatPanel: DOMRect | null;
    scoreboard: DOMRect | null;
    checks: LayoutCheck[];
}

export function captureLayout(): LayoutSnapshot {
    const viewport = { width: window.innerWidth, height: window.innerHeight };

    // Game board (80% width container)
    const gameBoardEl = document.querySelector('[class*="w-\\[80%\\]"]');
    const gameBoard = gameBoardEl?.getBoundingClientRect() ?? null;

    // Trick area (center pile)
    const trickAreaEl = document.querySelector('[class*="w-72"]') ??
        document.querySelector('[class*="w-80"]') ??
        document.querySelector('[class*="w-96"]');
    const trickArea = trickAreaEl?.getBoundingClientRect() ?? null;

    // Player info boxes
    const playerBoxes: { seat: string; rect: DOMRect }[] = [];
    const allPlayerEls = document.querySelectorAll('[class*="bg-black\\/50"]');
    allPlayerEls.forEach((el, i) => {
        playerBoxes.push({ seat: `player-${i}`, rect: el.getBoundingClientRect() });
    });

    // Chat panel (20% width)
    const chatPanelEl = document.querySelector('[class*="w-\\[20%\\]"]');
    const chatPanel = chatPanelEl?.getBoundingClientRect() ?? null;

    // Scoreboard row
    const scoreboardEl = document.querySelector('[class*="py-3"][class*="flex"][class*="justify-between"]');
    const scoreboard = scoreboardEl?.getBoundingClientRect() ?? null;

    // Run checks
    const checks: LayoutCheck[] = [];

    // Check 1: Game board takes ~80% of viewport width
    if (gameBoard) {
        const pct = (gameBoard.width / viewport.width) * 100;
        checks.push({
            name: 'GameBoard is ~80% viewport width',
            pass: pct >= 75 && pct <= 85,
            detail: `${pct.toFixed(1)}% (expected 75-85%)`,
        });
    }

    // Check 2: Chat panel takes ~20% of viewport width
    if (chatPanel) {
        const pct = (chatPanel.width / viewport.width) * 100;
        checks.push({
            name: 'ChatPanel is ~20% viewport width',
            pass: pct >= 15 && pct <= 25,
            detail: `${pct.toFixed(1)}% (expected 15-25%)`,
        });
    }

    // Check 3: Trick area is horizontally centered within game board
    if (trickArea && gameBoard) {
        const trickCenterX = trickArea.left + trickArea.width / 2;
        const boardCenterX = gameBoard.left + gameBoard.width / 2;
        const drift = Math.abs(trickCenterX - boardCenterX);
        checks.push({
            name: 'Trick area centered horizontally in game board',
            pass: drift < 80,
            detail: `${drift.toFixed(1)}px drift (max 80px)`,
        });
    }

    // Check 4: Trick area is roughly vertically centered in game board
    if (trickArea && gameBoard) {
        const trickCenterY = trickArea.top + trickArea.height / 2;
        const boardCenterY = gameBoard.top + gameBoard.height / 2;
        const drift = Math.abs(trickCenterY - boardCenterY);
        checks.push({
            name: 'Trick area centered vertically in game board',
            pass: drift < 120,
            detail: `${drift.toFixed(1)}px drift (max 120px)`,
        });
    }

    // Check 5: Left player (seat 1) is on the left side of game board
    if (playerBoxes.length >= 2 && gameBoard) {
        const leftPlayer = playerBoxes.find(p => {
            const centerX = p.rect.left + p.rect.width / 2;
            return centerX < gameBoard.left + gameBoard.width * 0.3;
        });
        checks.push({
            name: 'Left player is in left 30% of board',
            pass: !!leftPlayer,
            detail: leftPlayer ? `Found at x=${leftPlayer.rect.left.toFixed(0)}` : 'Not found',
        });
    }

    // Check 6: Right player (seat 3) is on the right side of game board
    if (playerBoxes.length >= 2 && gameBoard) {
        const rightPlayer = playerBoxes.find(p => {
            const centerX = p.rect.left + p.rect.width / 2;
            return centerX > gameBoard.left + gameBoard.width * 0.7;
        });
        checks.push({
            name: 'Right player is in right 30% of board',
            pass: !!rightPlayer,
            detail: rightPlayer ? `Found at x=${rightPlayer.rect.left.toFixed(0)}` : 'Not found',
        });
    }

    // Check 7: No elements overflow the viewport horizontally
    const allOverflow = document.querySelectorAll('*');
    let overflowCount = 0;
    allOverflow.forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.right > viewport.width + 5 && r.width > 0 && r.height > 0) {
            overflowCount++;
        }
    });
    checks.push({
        name: 'No elements overflow viewport horizontally',
        pass: overflowCount === 0,
        detail: `${overflowCount} elements overflow`,
    });

    return { viewport, gameBoard, trickArea, playerBoxes, chatPanel, scoreboard, checks };
}

export function verifyLayout(): { allPassed: boolean; results: string } {
    const snapshot = captureLayout();
    const lines: string[] = ['=== Layout Verification ==='];
    let allPassed = true;

    for (const check of snapshot.checks) {
        const icon = check.pass ? '✅' : '❌';
        lines.push(`${icon} ${check.name}: ${check.detail}`);
        if (!check.pass) allPassed = false;
    }

    lines.push('');
    lines.push(allPassed ? '🎉 All checks passed!' : '⚠️ Some checks FAILED');

    const results = lines.join('\n');
    console.log(results);
    return { allPassed, results };
}
