// Load environment variables from .env file in the api directory
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

function loadAndValidateConfig() {
    // DATA_SOURCE selects where departures come from:
    //   sl   - SL Transport API (default, unchanged behaviour)
    //   gtfs - Trafiklab GTFS Regional realtime feed + a locally built timetable
    const dataSource = (process.env.DATA_SOURCE || 'sl').trim().toLowerCase();
    if (dataSource !== 'sl' && dataSource !== 'gtfs') {
        throw new Error(`Configuration Error: DATA_SOURCE must be "sl" or "gtfs", got "${process.env.DATA_SOURCE}".`);
    }

    // --- Validate Required Environment Variables ---
    const requiredEnvVars = dataSource === 'gtfs'
        ? ['FILTER_LINE_NUMBER', 'FILTER_DESTINATION_NAME', 'FILTER_DEPARTURES_TO_SHOW', 'GTFS_RT_API_KEY']
        : [
            'API_BASE_URL',
            'STATION_SITE_ID',
            'FILTER_LINE_NUMBER',
            'FILTER_DESTINATION_NAME',
            'FILTER_MAX_DEPARTURES_TO_FETCH',
            'FILTER_DEPARTURES_TO_SHOW'
        ];

    const missingVars = requiredEnvVars.filter(varName => !(varName in process.env));

    if (missingVars.length > 0) {
        console.error('\x1b[31mError: Missing required environment variables:\x1b[0m');
        missingVars.forEach(varName => console.error(`  - ${varName}`));
        console.error('\nPlease define them in the api/.env file.');
        console.error('Refer to api/.env.example for guidance.');
        throw new Error('Missing required environment variables'); // Throw instead of exiting
    }

    // --- Build Configuration from Validated Environment Variables ---
    const config = {
        dataSource,
        port: process.env.PORT || 3000,
        api: {
            baseUrl: process.env.API_BASE_URL
        },
        station: {
            siteId: process.env.STATION_SITE_ID
        },
        filter: {
            lineNumber: process.env.FILTER_LINE_NUMBER,
            destinationName: process.env.FILTER_DESTINATION_NAME.replace(/^"|"$/g, ''),
            maxDeparturesToFetch: parseInt(process.env.FILTER_MAX_DEPARTURES_TO_FETCH, 10),
            departuresToShow: parseInt(process.env.FILTER_DEPARTURES_TO_SHOW, 10)
        }
    };

    if (dataSource === 'gtfs') {
        config.gtfs = {
            realtimeKey: process.env.GTFS_RT_API_KEY,
            realtimeUrl: process.env.GTFS_RT_URL || undefined,
            schedulePath: process.env.GTFS_SCHEDULE_PATH || path.resolve(__dirname, 'data', 'schedule.json'),
            pollIntervalMs: parseInt(process.env.GTFS_POLL_INTERVAL_MS || '60000', 10),
            maxStaleMs: parseInt(process.env.GTFS_MAX_STALE_MS || '600000', 10),
            idleMs: parseInt(process.env.GTFS_IDLE_MS || '300000', 10)
        };
        for (const [k, env] of [['pollIntervalMs', 'GTFS_POLL_INTERVAL_MS'], ['maxStaleMs', 'GTFS_MAX_STALE_MS'], ['idleMs', 'GTFS_IDLE_MS']]) {
            if (isNaN(config.gtfs[k]) || config.gtfs[k] <= 0) {
                throw new Error(`Configuration Error: Invalid value for ${env}. Must be a positive whole number.`);
            }
        }
        // The feed refreshes about every 15-25 s; polling faster only wastes quota.
        if (config.gtfs.pollIntervalMs < 15000) {
            throw new Error('Configuration Error: GTFS_POLL_INTERVAL_MS must be at least 15000.');
        }
    }

    // --- Validate Parsed Numeric Configuration ---
    if (dataSource === 'sl' && isNaN(config.filter.maxDeparturesToFetch)) {
        throw new Error('Configuration Error: Invalid value for FILTER_MAX_DEPARTURES_TO_FETCH. Must be a whole number.');
    }
    if (isNaN(config.filter.departuresToShow)) {
        throw new Error('Configuration Error: Invalid value for FILTER_DEPARTURES_TO_SHOW. Must be a whole number.');
    }
    if (!config.filter.destinationName) {
        throw new Error('Configuration Error: FILTER_DESTINATION_NAME cannot be empty.');
    }

    console.log("Configuration loaded successfully."); // Add success log
    return config;
}

// Export the function
module.exports = { loadAndValidateConfig }; 