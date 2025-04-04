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

// --- Matrix Controller Factory (Modified) ---
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
let currentDisplayIndex = 0;

// Fetch/Switch State
let dataFetchIntervalId = null;
let switchDisplayIntervalId = null;
const SWITCH_INTERVAL_MS = 15000;

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

function processFetchedDepartures(rawDepartures, previousDepartures) {
    if (rawDepartures && rawDepartures.length > 0) {
        const newDepartures = rawDepartures.slice(0, 2);
        console.log(`Processed ${newDepartures.length} departures.`);
        const dataChanged = JSON.stringify(previousDepartures) !== JSON.stringify(newDepartures);
        return { departures: newDepartures, changed: dataChanged };
    } else {
        console.log('No departures fetched or returned.');
        return { departures: [], changed: previousDepartures.length > 0 };
    }
}

function handleDataDisappeared() {
    console.log('Data disappeared, clearing display and stopping switch timer.');
    stopDisplaySwitchTimer();
    latestDepartures = [];
    currentDisplayIndex = 0;
    sendToPythonDriver("");
}

function handleNewOrChangedData(departures) {
    console.log('New data available, updating display.');
    latestDepartures = departures;
    currentDisplayIndex = 0;
    updateDisplay();
    if (latestDepartures.length > 1) {
        startDisplaySwitchTimer();
    } else {
        stopDisplaySwitchTimer();
    }
}

function handleNoData() {
     console.log('No data, ensuring display is clear.');
     latestDepartures = [];
     currentDisplayIndex = 0;
     stopDisplaySwitchTimer();
     sendToPythonDriver("");
}

function updateStateAndDisplay(newState) {
    const { departures, changed } = newState;

    if (!changed) {
         console.log('Data has not changed.');
         return;
    }

    console.log('Data change detected.');
    const hadDataBefore = latestDepartures.length > 0;
    const hasDataNow = departures.length > 0;

    if (hasDataNow) {
        handleNewOrChangedData(departures);
    } else if (hadDataBefore) {
        handleDataDisappeared();
    } else {
       handleNoData();
    }
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
    if (!matrixController) {
        console.log('fetchData called before controller initialization.');
        return;
    }
    if (!isActiveHour()) {
        console.log('Outside active hours. Skipping data fetch.');
        if (latestDepartures.length > 0) {
            updateStateAndDisplay({ departures: [], changed: true }); 
        }
        return;
    }

    console.log('Fetching departures...');
    try {
        const rawDepartures = await fetchDepartures(config.apiUrl);
        const previousDepartures = [...latestDepartures];

        const processingResult = processFetchedDepartures(rawDepartures, previousDepartures);
        updateStateAndDisplay(processingResult);

    } catch (error) {
        console.error('Error in fetchData:', error);
    }
}

function startDataFetching() {
    stopDataFetching();
    console.log(`Starting data fetching interval every ${config.pollingIntervalMs}ms.`);
    if (isActiveHour()) {
        fetchData();
    } else {
        handleNoData();
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

function startDisplaySwitchTimer() {
    stopDisplaySwitchTimer();
    if (latestDepartures.length > 1) {
        console.log(`Starting display switch timer (${SWITCH_INTERVAL_MS}ms).`);
        switchDisplayIntervalId = setInterval(switchDisplay, SWITCH_INTERVAL_MS);
    }
}

function stopDisplaySwitchTimer() {
    if (switchDisplayIntervalId) {
        clearInterval(switchDisplayIntervalId);
        switchDisplayIntervalId = null;
        console.log('Stopped display switch timer.');
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
    matrixController = createMatrixController(config); 
    startDataFetching();

    if (!process.env.JEST_WORKER_ID) {
        const signals = ['SIGINT', 'SIGTERM'];
        signals.forEach(signal => {
            process.removeAllListeners(signal);
            process.on(signal, () => {
                console.log(`\nCaught ${signal}. Shutting down...`);
                stopDataFetching();
                stopDisplaySwitchTimer();
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
                if (matrixController) {
                    matrixController.shutdown?.(); 
                    matrixController.clear();
                    if (config.displayTarget === 'console') {
                       renderMatrixToConsole(matrixController.getMatrixState());
                    }
                }
                console.log('Exiting gracefully.');
                setTimeout(() => process.exit(0), 500); 
            });
        });
    }
}

if (require.main === module) {
    startApp();
} 

const displayApi = {
    startApp, 
    stopDataFetching,
    stopDisplaySwitchTimer 
};
module.exports = displayApi; 