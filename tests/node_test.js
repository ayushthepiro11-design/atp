const { JSDOM } = require('jsdom');
const { readFileSync } = require('fs');
const { expect } = require('chai');
const { describe, it, beforeEach } = require('mocha');

// Read the game's HTML file
const html = readFileSync('index.html', 'utf8');

// Extract the main script content
const scriptContent = html.match(/<script>([\s\S]*?)<\/script>/)[1]
    // Remove the event listener that we don't want to run in Node
    .replace("window.addEventListener('load', initGame);", "");

// Extract the body content to build a realistic DOM
const bodyContent = html.match(/<body>([\s\S]*?)<\/body>/)[1];

// --- JSDOM Setup ---
const dom = new JSDOM(`<!DOCTYPE html><html><body>${bodyContent}</body></html>`, {
    runScripts: "outside-only", // We will execute the script manually
    url: "http://localhost",
    pretendToBeVisual: true, // Helps with some DOM APIs
});

// Expose JSDOM window and document to the global scope for the test runner
global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator; // Some libs might need this

// Add mocks for browser/environment specific APIs before running the script
global.window.CrazyGames = { SDK: { init: async () => {}, data: {} } };
// Mock WebGL and other visual functions that will fail in Node
global.window.initWebGL = () => {};
global.window.updateShaderColors = () => {};
global.window.toggleDynamicBG = () => {};
global.window.renderWebGL = () => {};
global.window.createBackgroundParticles = () => {};

// --- Execute the Game Script ---
// We append an exporter to the script content to expose the non-global consts
const scriptToExecute = scriptContent + `
    ; // prevent syntax errors from concatenation
    window.testExports = { resetGame, endGame, GAME_STATE, GAME_STATS, NEW_AUDIO_MANAGER };
`;
dom.window.eval(scriptToExecute);

// --- Expose Game Functions/State to Global Scope for Tests ---
// Now that the script has run, the functions are on the JSDOM window's testExports object
const { resetGame, endGame, GAME_STATE, GAME_STATS, NEW_AUDIO_MANAGER } = global.window.testExports;

// Mock audio functions to prevent them from causing side-effects or errors
NEW_AUDIO_MANAGER.playWin = async () => {};
NEW_AUDIO_MANAGER.playBGM = async () => {};
NEW_AUDIO_MANAGER.initContext = async () => {};
NEW_AUDIO_MANAGER.playTone = async () => {};


// --- Test Suite ---
describe('Game Logic (Node.js)', () => {
    beforeEach(() => {
        // Reset game state using the function from the script
        resetGame();
        // Manually reset stats for test isolation
        Object.keys(GAME_STATS).forEach(key => {
            if (typeof GAME_STATS[key] === 'number') {
                GAME_STATS[key] = (key === 'bestTime' || key === 'minMoves') ? Infinity : 0;
            } else if (Array.isArray(GAME_STATS[key])) {
                GAME_STATS[key] = [];
            }
        });
    });

    it('should increment perfectGames for a perfect game', async () => {
        GAME_STATE.mismatches = 0;
        GAME_STATE.totalPairs = 8;
        GAME_STATE.matchedPairs = 8;
        const initialPerfectGames = GAME_STATS.perfectGames;

        await endGame();

        expect(GAME_STATS.perfectGames).to.equal(initialPerfectGames + 1);
    });

    it('should not increment perfectGames for an imperfect game', async () => {
        GAME_STATE.mismatches = 2;
        GAME_STATE.totalPairs = 8;
        GAME_STATE.matchedPairs = 8;
        const initialPerfectGames = GAME_STATS.perfectGames;

        await endGame();

        expect(GAME_STATS.perfectGames).to.equal(initialPerfectGames);
    });
});
