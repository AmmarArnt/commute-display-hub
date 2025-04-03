const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env file in the current directory
dotenv.config({ path: path.resolve(__dirname, '.env') });

// Helper to convert camelCase to SCREAMING_SNAKE_CASE
function camelToSnakeCase(str) {
    return str.replace(/[A-Z]/g, letter => `_${letter}`).toUpperCase();
}

function loadAndValidateConfig() {
    const requiredEnvVars = [
        'API_URL',
        'POLLING_INTERVAL_MS',
        'ACTIVE_HOUR_START',
        'ACTIVE_HOUR_END',
        'MATRIX_WIDTH',
        'MATRIX_HEIGHT',
        'DISPLAY_TARGET',
    ];

    const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

    if (missingEnvVars.length > 0) {
        throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
    }

    const config = {
        apiUrl: process.env.API_URL,
        pollingIntervalMs: parseInt(process.env.POLLING_INTERVAL_MS, 10),
        activeHourStart: parseInt(process.env.ACTIVE_HOUR_START, 10),
        activeHourEnd: parseInt(process.env.ACTIVE_HOUR_END, 10),
        matrixWidth: parseInt(process.env.MATRIX_WIDTH, 10),
        matrixHeight: parseInt(process.env.MATRIX_HEIGHT, 10),
        displayTarget: process.env.DISPLAY_TARGET.toLowerCase(),
    };

    // Validate numeric types and hours
    const numericChecks = ['pollingIntervalMs', 'activeHourStart', 'activeHourEnd', 'matrixWidth', 'matrixHeight'];
    for (const key of numericChecks) {
        const envVarName = camelToSnakeCase(key); // Get original env var name
        if (isNaN(config[key]) || config[key] < 0) {
            throw new Error(`Invalid numeric value for ${envVarName} in .env file.`);
        }
    }
    if (config.activeHourStart < 0 || config.activeHourStart > 23 || config.activeHourEnd < 0 || config.activeHourEnd > 23) {
         throw new Error('ACTIVE_HOUR_START and ACTIVE_HOUR_END must be between 0 and 23');
    }
    if (config.activeHourStart >= config.activeHourEnd) {
        console.warn('Warning: ACTIVE_HOUR_START is greater than or equal to ACTIVE_HOUR_END. This implies an overnight schedule.');
    }
    
    // Validate display target
    if (config.displayTarget !== 'console' && config.displayTarget !== 'pi') {
        throw new Error(`Invalid DISPLAY_TARGET: ${process.env.DISPLAY_TARGET}. Must be 'console' or 'pi'.`);
    }

    console.log('Configuration loaded successfully:'); // Removed logging config details
    return config;
}

module.exports = { loadAndValidateConfig };

