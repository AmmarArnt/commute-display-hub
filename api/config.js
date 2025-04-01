// Load environment variables from .env file in the api directory
require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });

function loadAndValidateConfig() {
    // --- Validate Required Environment Variables ---
    const requiredEnvVars = [
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

    // --- Validate Parsed Numeric Configuration ---
    if (isNaN(config.filter.maxDeparturesToFetch)) {
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