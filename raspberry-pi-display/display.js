const { loadAndValidateConfig } = require('./config');
const { fetchDepartures } = require('./apiClient');
const { MatrixController: ConsoleMatrixController, calculateTextWidth } = require('./matrixController');
const { PiMatrixController } = require('./piMatrixController');
const { renderMatrixToConsole } = require('./consoleRenderer');
const font = require('./font');

// --- Configuration & State ---
let config;
try {
    config = loadAndValidateConfig();
} catch (error) {
    console.error('Failed to load configuration:', error.message);
    process.exit(1);
}

// --- Matrix Controller Factory ---
function createMatrixController(targetConfig) {
    if (targetConfig.displayTarget === 'pi') {
        console.log('Using Pi Hardware Matrix Controller.');
        return new PiMatrixController(targetConfig.matrixWidth, targetConfig.matrixHeight);
    } else {
        console.log('Using Console Matrix Controller.');
        return new ConsoleMatrixController(targetConfig.matrixWidth, targetConfig.matrixHeight);
    }
}

let matrixController = null;
let latestDepartures = []; // Stores full departure strings
let currentDisplayIndex = 0;   // 0 or 1

// Horizontal Scroll State
let scrollIntervalId = null;
let currentScrollX = 0;
let currentTextToScroll = '';
let currentTextWidth = 0;
let scrollState = 'idle'; // 'scrolling', 'paused', 'idle', 'switching'
const SCROLL_SPEED_MS = 150; // Milliseconds per pixel scrolled
const END_PAUSE_DURATION_MS = 10000; // 10 seconds pause at the end

// Fetch/Switch State
let dataFetchIntervalId = null;
let endPauseTimeoutId = null; // Timeout ID for the 10-second pause

// --- Helper Functions ---
function isActiveHour() {
    const now = new Date();
    const currentHour = now.getHours();
    if (config.activeHourStart <= config.activeHourEnd) {
        return currentHour >= config.activeHourStart && currentHour < config.activeHourEnd;
    } else {
        return currentHour >= config.activeHourStart || currentHour < config.activeHourEnd;
    }
}

// Keep width calculation in case needed later, but not used currently for layout
function calculateTextWidthInternal(text, font) {
    let width = 0;
    if (!text) return 0;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const charData = font[char] || font[' '];
        if (charData) {
            width += charData.length + CHAR_SPACING;
        }
    }
    return width > 0 ? width - CHAR_SPACING : 0;
}

// Simplified parser to get only the time string
function parseTimeFromDepartureString(str) {
    if (!str || typeof str !== 'string') return null;
    
    const parts = str.trim().split(/\s+/);
    if (parts.length < 2) return null;

    let time = null; // Default to null for invalid formats
    
    // Handle "X min" format (e.g., "5 min")
    if (parts.length >= 3 && parts[parts.length-1].toLowerCase() === 'min' && !isNaN(parseInt(parts[parts.length - 2]))) {
        time = parts.slice(parts.length - 2).join(' ');
    } 
    // Handle "Nu" format
    else if (parts.length >= 2 && parts[parts.length - 1].toLowerCase() === 'nu') {
        time = 'Nu';
    }
    // All other formats are considered invalid and return null
    
    return time;
}

// Updates display with the time string at currentDisplayIndex
function updateDisplay() {
    if (!matrixController) {
        console.log('updateDisplay called before controller initialization.');
        return;
    }

    matrixController.clear();

    let timeToDisplay = '';
    if (latestDepartures.length > currentDisplayIndex) {
        timeToDisplay = latestDepartures[currentDisplayIndex];
    }

    if (timeToDisplay) {
        matrixController.drawText(timeToDisplay, 1, 0, font);
    }
    
    // Only render to console if using the console target
    if (config.displayTarget === 'console') {
        console.clear(); 
        console.log(`Display Target: ${config.displayTarget}`);
        console.log(`Displaying Departure ${currentDisplayIndex + 1}/${latestDepartures.length}: ${timeToDisplay || '--'}`);
        renderMatrixToConsole(matrixController.getMatrixState());
    } else {
        // For Pi hardware, maybe log less, or the Pi controller handles its own output/sync
        console.log(`[Pi] Displaying Departure ${currentDisplayIndex + 1}/${latestDepartures.length}: ${timeToDisplay || '--'}`);
        // If PiMatrixController needs an explicit update call:
        // matrixController.sync?.(); 
    }
}

// Switches to the next departure index and updates display
function switchDisplay() {
    if (!matrixController) {
        console.log('switchDisplay called before controller initialization.');
        return;
    }
    if (latestDepartures.length > 1) {
        currentDisplayIndex = (currentDisplayIndex + 1) % latestDepartures.length;
        console.log(`Switching display to index ${currentDisplayIndex}`);
        updateDisplay();
    } else {
        // If we have 1 or fewer departures, stop the switch timer
        stopDisplaySwitchTimer();
        // And ensure we're showing the first (or empty) display
        if (currentDisplayIndex !== 0) {
            currentDisplayIndex = 0;
            updateDisplay();
        }
    }
}

async function fetchData() {
    if (!matrixController) {
        console.log('fetchData called before controller initialization.');
        return;
    }
    if (!isActiveHour()) {
        console.log('Outside active hours. Skipping data fetch.');
        if (latestDepartures.length > 0) {
            // Clear display and stop scrolling if active hours end
            stopScrolling();
            latestDepartures = [];
            currentDisplayIndex = 0;
            currentTextToScroll = '';
            matrixController.clear();
            if (config.displayTarget === 'console') renderMatrixToConsole(matrixController.getMatrixState());
            else matrixController.sync?.();
        }
        return;
    }

    console.log('Fetching departures...');
    try {
        const rawDepartures = await fetchDepartures(config.apiUrl);
        const previousDepartures = [...latestDepartures]; // Store previous full strings

        if (rawDepartures && rawDepartures.length > 0) {
            // Keep only the first two full departure strings
            const newDepartures = rawDepartures.slice(0, 2);
            
            console.log(`Processed ${newDepartures.length} departures.`);
            const dataChanged = JSON.stringify(previousDepartures) !== JSON.stringify(newDepartures);
            
            if (dataChanged) {
                console.log('New data received or data changed.');
                latestDepartures = newDepartures;
                // Reset to the first departure and start its scroll cycle
                currentDisplayIndex = 0; 
                startOrUpdateScrollCycle(); 
            }
             // If data is the same, do nothing, let the current scroll cycle continue

        } else {
            console.log('No departures fetched or returned.');
            if (latestDepartures.length > 0) {
                 // Data disappeared, clear display and stop
                stopScrolling();
                latestDepartures = [];
                currentDisplayIndex = 0;
                currentTextToScroll = '';
                matrixController.clear();
                if (config.displayTarget === 'console') renderMatrixToConsole(matrixController.getMatrixState());
                 else matrixController.sync?.();
            }
        }
    } catch (error) {
        console.error('Error in fetchData:', error);
    }
}

// --- Scrolling Logic ---

function stopScrolling() {
    console.log('Stopping scroll cycle.');
    if (scrollIntervalId) {
        clearInterval(scrollIntervalId);
        scrollIntervalId = null;
    }
    if (endPauseTimeoutId) {
        clearTimeout(endPauseTimeoutId);
        endPauseTimeoutId = null;
    }
    scrollState = 'idle';
}

// Starts or restarts the scrolling cycle for the currentDisplayIndex
function startOrUpdateScrollCycle() {
    stopScrolling(); // Stop any previous cycle
    if (!matrixController) return;
    if (latestDepartures.length === 0) {
        console.log('No departures to display.');
        matrixController.clear();
        if (config.displayTarget === 'console') renderMatrixToConsole(matrixController.getMatrixState());
        else matrixController.sync?.();
        return;
    }
    
    currentTextToScroll = latestDepartures[currentDisplayIndex];
    // Calculate the total width of the text using the helper
    currentTextWidth = calculateTextWidth(currentTextToScroll); 
    currentScrollX = 0;
    
    console.log(`Starting scroll for: "${currentTextToScroll}" (Width: ${currentTextWidth})`);

    // Determine if scrolling is needed
    if (currentTextWidth > config.matrixWidth) {
        scrollState = 'scrolling';
        // Draw initial frame (text starting at the right edge)
        matrixController.clear();
        matrixController.drawScrollingText?.(currentTextToScroll, currentScrollX, 1);
        if (config.displayTarget === 'console') renderMatrixToConsole(matrixController.getMatrixState());
        else matrixController.sync?.();
        // Start the scroll interval
        scrollIntervalId = setInterval(scrollStep, SCROLL_SPEED_MS);
    } else {
        // Text fits - Display statically (left-aligned for now) and go straight to pause
        scrollState = 'paused';
        console.log('Text fits, displaying statically and pausing.');
        matrixController.clear();
        // Use drawText for non-scrolling text at a fixed position (e.g., x=1)
        matrixController.drawText?.(currentTextToScroll, 1, 1); // Using drawText, fixed position
        if (config.displayTarget === 'console') renderMatrixToConsole(matrixController.getMatrixState());
        else matrixController.sync?.();
        // Start the end pause directly
        endPauseTimeoutId = setTimeout(switchToNextDeparture, END_PAUSE_DURATION_MS);
    }
}

// Called by the interval to advance the scroll
function scrollStep() {
    if (!matrixController || scrollState !== 'scrolling') return;

    currentScrollX++;

    // Calculate the stopping point: when the end of the text aligns with the right edge
    const scrollStopOffset = Math.max(0, currentTextWidth - config.matrixWidth);

    // Draw the current frame
    matrixController.clear();
    matrixController.drawScrollingText?.(currentTextToScroll, currentScrollX, 1); 
    if (config.displayTarget === 'console') renderMatrixToConsole(matrixController.getMatrixState());
    else matrixController.sync?.();

    // Check if we have reached the final position
    if (currentScrollX >= scrollStopOffset) {
        console.log(`Scroll reached end position (Offset: ${currentScrollX}). Pausing...`);
        stopScrolling(); // Stops the interval
        
        // --- Pause Logic --- 
        // The last draw happened just before this check, so the frame is correct.
        scrollState = 'paused';
        console.log(`Pausing on last frame for ${END_PAUSE_DURATION_MS}ms...`);
        endPauseTimeoutId = setTimeout(switchToNextDeparture, END_PAUSE_DURATION_MS);
    }
}

// Called after the 10-second pause
function switchToNextDeparture() {
    if (!matrixController) return;
    endPauseTimeoutId = null; // Clear timeout id
    
    // Only switch if there are multiple departures
    if (latestDepartures.length > 1) {
        currentDisplayIndex = (currentDisplayIndex + 1) % latestDepartures.length;
        console.log(`Switching to departure index ${currentDisplayIndex}`);
        scrollState = 'switching'; 
        startOrUpdateScrollCycle(); // Start scrolling the next item
    } else {
        // If only one departure, just restart its scroll cycle
        console.log('Only one departure, restarting scroll cycle.');
        startOrUpdateScrollCycle();
    }
}

// --- Interval Management ---
function startDataFetching() {
    stopDataFetching();
    console.log(`Starting data fetching interval every ${config.pollingIntervalMs}ms.`);
    if (isActiveHour()) {
        fetchData(); // Initial fetch if active
    }
    dataFetchIntervalId = setInterval(fetchData, config.pollingIntervalMs);
}

function stopDataFetching() {
    if (dataFetchIntervalId) {
        clearInterval(dataFetchIntervalId);
        dataFetchIntervalId = null;
        console.log('Stopped data fetching.');
    }
}

// Wrapper for stopScrolling for cleanup
function stopDisplaySwitchTimer() {
    stopScrolling();
}

// --- Main Execution Logic --- 
function startApp() {
    console.log('Starting Scrolling Raspberry Pi Display Module...');
    matrixController = createMatrixController(config);
    startDataFetching(); // Starts fetching and implicitly the first scroll cycle via fetchData

    // Graceful shutdown handlers 
    if (!process.env.JEST_WORKER_ID) {
        const signals = ['SIGINT', 'SIGTERM'];
        signals.forEach(signal => {
            process.removeAllListeners(signal);
            process.on(signal, () => {
                console.log(`\nCaught ${signal}. Shutting down...`);
                stopDataFetching();
                stopScrolling(); // Use the correct stop function
                if (matrixController) {
                    matrixController.shutdown?.(); // Call hardware shutdown if available
                    matrixController.clear();
                    if (config.displayTarget === 'console') {
                       renderMatrixToConsole(matrixController.getMatrixState());
                    }
                }
                console.log('Exiting gracefully.');
                process.exit(0);
            });
        });
    }
}

// --- Export or Run ---
if (require.main === module) {
    startApp();
} 

const displayApi = {
    startApp, 
    stopDataFetching,
    stopDisplaySwitchTimer // Keep alias for test compatibility
};
module.exports = displayApi; 