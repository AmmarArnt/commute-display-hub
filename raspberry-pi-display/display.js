const { loadAndValidateConfig } = require('./config');
const { fetchDepartures } = require('./apiClient');
const { MatrixController: ConsoleMatrixController, calculateTextWidth } = require('./matrixController');
const { renderMatrixToConsole } = require('./consoleRenderer');
const { spawn } = require('child_process');
const path = require('path');
const font = require('./font');

// --- Configuration & State ---
let config;
try {
    config = loadAndValidateConfig();
} catch (error) {
    console.error('Failed to load configuration:', error.message);
    process.exit(1);
}

// --- Child Process State ---
let pythonProcess = null;
let pythonRestartTimeout = null;
const PYTHON_SCRIPT_PATH = path.join(__dirname, 'python_matrix_driver.py');
let isPythonScrolling = false;

// --- Matrix Controller Factory (Modified for clarity) ---
function createMatrixController(targetConfig) {
    if (targetConfig.displayTarget === 'pi') {
        console.log('Using Python driver for Pi Hardware.');
        startPythonDriver();
        return null;
    } else {
        console.log('Using Console Matrix Controller.');
        return new ConsoleMatrixController(targetConfig.matrixWidth, targetConfig.matrixHeight);
    }
}

let matrixController = null;
let latestDepartures = [];
let latestFetchedData = [];
let newDataWaiting = false;
let currentDisplayIndex = 0;

let dataFetchIntervalId = null;

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

function processFetchedDepartures(rawDepartures) {
    if (rawDepartures && rawDepartures.length > 0) {
        const newDepartures = rawDepartures.slice(0, 2);
        console.log(`Processed ${newDepartures.length} departures from fetch.`);
        return newDepartures;
    } else {
        console.log('No departures fetched or returned.');
        return [];
    }
}

function handlePythonDone() {
    console.log('[Node] Python reported DONE.');
    isPythonScrolling = false;

    if (newDataWaiting) {
        console.log('[Node] New data was waiting. Updating display sequence.');
        latestDepartures = latestFetchedData;
        newDataWaiting = false;
        currentDisplayIndex = 0;
        triggerDisplay();
    } else if (latestDepartures.length > 0) {
        currentDisplayIndex = (currentDisplayIndex + 1) % latestDepartures.length;
        console.log(`[Node] Advancing to index ${currentDisplayIndex}`);
        triggerDisplay();
    } else {
        console.log('[Node] No current data and no new data waiting. Remaining idle.');
    }
}

function triggerDisplay() {
    if (config.displayTarget !== 'pi') return;

    if (isPythonScrolling) {
        console.log('[Node] Python is busy, skipping triggerDisplay request.');
        return;
    }

    let textToSend = "";
    if (latestDepartures.length > 0) {
        textToSend = latestDepartures[currentDisplayIndex] || "";
    } else {
        console.log('[Node] No departures to display. Sending empty string to clear.');
    }

    console.log(`[Node] Triggering display for index ${currentDisplayIndex}: '${textToSend}'`);
    isPythonScrolling = true;
    sendToPythonDriver(textToSend);
}

function handleFetchedDataUpdate(fetchedDepartures) {
    const previousDataString = JSON.stringify(latestDepartures);
    const newDataString = JSON.stringify(fetchedDepartures);
    const isIdentical = newDataString === previousDataString;

    if (isIdentical && !newDataWaiting) { 
        console.log(`Fetched data is identical to current data ('${newDataString}'). No update needed.`);
        return;
    }

    console.log(`Fetched data differs ('${newDataString}' vs '${previousDataString}') or update was pending. Buffering data.`);
    latestFetchedData = fetchedDepartures;
    newDataWaiting = true;

    if (!isPythonScrolling) {
        console.log('[Node] Python is idle. Processing new data immediately.');
        handlePythonDone();
    } else {
         console.log('[Node] Python is scrolling. New data will be processed after current scroll finishes.');
    }
}

function parseTimeFromDepartureString(str) {
    if (!str || typeof str !== 'string') return null;
    
    const parts = str.trim().split(/\s+/);
    if (parts.length < 2) return null;

    let time = null;
    
    if (parts.length >= 3 && parts[parts.length-1].toLowerCase() === 'min' && !isNaN(parseInt(parts[parts.length - 2]))) {
        time = parts.slice(parts.length - 2).join(' ');
    } 
    else if (parts.length >= 2 && parts[parts.length - 1].toLowerCase() === 'nu') {
        time = 'Nu';
    }
    
    return time;
}

function updateDisplay() {
    if (config.displayTarget === 'console') {
        if (!matrixController) matrixController = new ConsoleMatrixController(config.matrixWidth, config.matrixHeight);
        matrixController.clear();
        let textToDisplay = latestDepartures[currentDisplayIndex] || "";
        const textWidth = calculateTextWidth(textToDisplay);
        const xPos = Math.max(0, Math.floor((config.matrixWidth - textWidth) / 2));
        matrixController.drawText?.(textToDisplay, xPos, 1);
        console.clear();
        console.log(`Display Target: ${config.displayTarget}`);
        console.log(`Displaying Departure ${currentDisplayIndex + 1}/${latestDepartures.length}: ${textToDisplay || '--'}`);
        renderMatrixToConsole(matrixController.getMatrixState());
    } else if (config.displayTarget === 'pi') {
        let textToSend = latestDepartures[currentDisplayIndex] || "";
        console.log(`[Pi] Sending Departure ${currentDisplayIndex + 1}/${latestDepartures.length}: ${textToSend || '--'} to Python Driver`);
        sendToPythonDriver(textToSend); 
    } else {
         console.log(`Display Target: ${config.displayTarget} - No display action.`);
    }
}

function switchDisplay() {
    if (latestDepartures.length <= 1) {
        console.log('Less than 2 departures, not switching.');
        return;
    }
    currentDisplayIndex = (currentDisplayIndex + 1) % latestDepartures.length;
    console.log(`Switching display to index ${currentDisplayIndex}`);
    updateDisplay();
}

async function fetchData() {
    if (!isActiveHour()) {
        console.log('Outside active hours. Ensuring display is clear.');
        handleFetchedDataUpdate([]); // Treat as empty data outside hours
        return;
    }

    console.log('Fetching departures...');
    try {
        const rawDepartures = await fetchDepartures(config.apiUrl);
        const processedDepartures = processFetchedDepartures(rawDepartures);
        handleFetchedDataUpdate(processedDepartures); // Handle the update directly
    } catch (error) {
        console.error('Error in fetchData:', error);
        // Decide how to handle fetch errors - maybe clear display?
        handleFetchedDataUpdate([]);
    }
}

function startDataFetching() {
    stopDataFetching();
    console.log(`Starting data fetching interval every ${config.pollingIntervalMs}ms.`);
    // Perform initial fetch immediately, then start interval
    fetchData(); // Initial fetch kicks things off
    dataFetchIntervalId = setInterval(fetchData, config.pollingIntervalMs);
}

function stopDataFetching() {
    if (dataFetchIntervalId) {
        clearInterval(dataFetchIntervalId);
        dataFetchIntervalId = null;
        console.log('Stopped data fetching.');
    }
}

function startPythonDriver() {
    if (pythonProcess) {
        console.log('Python driver already running.');
        return;
    }
    if (pythonRestartTimeout) {
        clearTimeout(pythonRestartTimeout);
        pythonRestartTimeout = null;
    }

    console.log(`Spawning Python driver: sudo python3 ${PYTHON_SCRIPT_PATH}`);
    pythonProcess = spawn('sudo', ['python3', '-u', PYTHON_SCRIPT_PATH], {
        stdio: ['pipe', 'pipe', 'pipe']
    });

    pythonProcess.stdout.on('data', (data) => {
        process.stdout.write(`[PythonDriver] ${data}`);
    });

    pythonProcess.stderr.on('data', (data) => {
        process.stderr.write(`[PythonDriver ERR] ${data}`);
    });

    pythonProcess.on('close', (code) => {
        console.error(`[PythonDriver] Exited with code ${code}`);
        pythonProcess = null;
        if (!pythonRestartTimeout) { 
            console.log('Scheduling Python driver restart in 5s...');
            pythonRestartTimeout = setTimeout(startPythonDriver, 5000);
        }
    });

    pythonProcess.on('error', (err) => {
        console.error('[PythonDriver] Failed to start process:', err);
        pythonProcess = null;
        if (!pythonRestartTimeout) {
             console.log('Scheduling Python driver restart in 5s after error...');
            pythonRestartTimeout = setTimeout(startPythonDriver, 5000);
        }
    });
}

function sendToPythonDriver(message) {
    if (config.displayTarget !== 'pi') return;

    if (pythonProcess && pythonProcess.stdin && !pythonProcess.stdin.destroyed) {
        console.log(`[Node->Py] Sending: ${message}`);
        pythonProcess.stdin.write(message + '\n', (err) => {
            if (err) {
                console.error('[Node->Py] Error writing to python stdin:', err);
                console.log('Attempting to restart Python driver due to write error...');
                if(pythonProcess) pythonProcess.kill();
                pythonProcess = null;
                 if (!pythonRestartTimeout) {
                    pythonRestartTimeout = setTimeout(startPythonDriver, 1000);
                 }
            }
        });
    } else {
        console.warn('[Node->Py] Python process not ready or stdin closed, cannot send message.');
        if (!pythonProcess && !pythonRestartTimeout) {
             console.log('Python driver missing, scheduling restart...');
            pythonRestartTimeout = setTimeout(startPythonDriver, 1000);
        }
    }
}

function startApp() {
    console.log('Starting Scrolling Display Module...');
    matrixController = createMatrixController(config); // Starts Python if needed
    startDataFetching(); // Starts fetching loop

    // Graceful shutdown handling
    if (!process.env.JEST_WORKER_ID) {
        const signals = ['SIGINT', 'SIGTERM'];
        signals.forEach(signal => {
            process.removeAllListeners(signal); // Prevent multiple handlers
            process.on(signal, () => {
                console.log(`\nCaught ${signal}. Shutting down...`);
                stopDataFetching();
                if (pythonRestartTimeout) clearTimeout(pythonRestartTimeout);
                if (pythonProcess) {
                    console.log('Stopping Python driver...');
                    pythonProcess.kill('SIGTERM');
                    setTimeout(() => {
                        if (pythonProcess && !pythonProcess.killed) {
                           console.log('Force killing Python driver...');
                           pythonProcess.kill('SIGKILL');
                        }
                    }, 2000);
                }
                if (matrixController && config.displayTarget === 'console') {
                    matrixController.shutdown?.();
                    matrixController.clear();
                    renderMatrixToConsole(matrixController.getMatrixState());
                }
                console.log('Exiting gracefully.');
                setTimeout(() => process.exit(0), 2500);
            });
        });
    }
}

if (require.main === module) {
    startApp();
} 

const displayApi = {
    startApp, 
    stopDataFetching
};
module.exports = displayApi; 