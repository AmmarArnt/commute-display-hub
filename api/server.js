require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const express = require('express');
const axios = require('axios');

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
    console.error('\x1b[31mError: Missing required environment variables:\x1b[0m'); // Red text
    missingVars.forEach(varName => console.error(`  - ${varName}`));
    console.error('\nPlease define them in the api/.env file.');
    console.error('Refer to api/.env.example for guidance.');
    process.exit(1); // Exit if configuration is incomplete
}

// --- Build Configuration from Validated Environment Variables ---
const config = {
    port: process.env.PORT || 3000, // Keep default for port as it's less critical
    api: {
        baseUrl: process.env.API_BASE_URL
    },
    station: {
        siteId: process.env.STATION_SITE_ID
    },
    filter: {
        lineNumber: process.env.FILTER_LINE_NUMBER,
        // Remove surrounding quotes from destination name
        destinationName: process.env.FILTER_DESTINATION_NAME.replace(/^"|"$/g, ''),
        maxDeparturesToFetch: parseInt(process.env.FILTER_MAX_DEPARTURES_TO_FETCH, 10),
        departuresToShow: parseInt(process.env.FILTER_DEPARTURES_TO_SHOW, 10)
    }
};

// --- Validate Parsed Numeric Configuration ---
if (isNaN(config.filter.maxDeparturesToFetch)) {
    console.error('\x1b[31mConfiguration Error: Invalid value for FILTER_MAX_DEPARTURES_TO_FETCH in api/.env. Must be a whole number.\x1b[0m');
    process.exit(1);
}
if (isNaN(config.filter.departuresToShow)) {
     console.error('\x1b[31mConfiguration Error: Invalid value for FILTER_DEPARTURES_TO_SHOW in api/.env. Must be a whole number.\x1b[0m');
    process.exit(1);
}
// Ensure destination name is not empty after quote removal
if (!config.filter.destinationName) {
     console.error('\x1b[31mConfiguration Error: FILTER_DESTINATION_NAME cannot be empty in api/.env.\x1b[0m');
     process.exit(1);
}

// --- End Configuration Validation ---

const app = express();

// Function to calculate time difference in minutes
function calculateTimeDiffInMinutes(expectedTimeStr) {
    if (!expectedTimeStr) return null;
    const now = new Date();
    const expectedTime = new Date(expectedTimeStr);
    const diffMs = expectedTime - now;
    if (diffMs < 30000) return null;
    return Math.round(diffMs / 60000);
}

// Main route handler (Uses validated config object)
app.get('/departures', async (req, res) => {
    const apiUrl = `${config.api.baseUrl}/${config.station.siteId}/departures`;
    try {
        const params = {
            transportModes: 'BUS',
            lineNumbers: config.filter.lineNumber,
            limit: config.filter.maxDeparturesToFetch
        };
        console.log(`Fetching departures from: ${apiUrl} with params:`, params);
        const response = await axios.get(apiUrl, { params });

        const departuresData = response.data;
        if (!departuresData || !departuresData.departures || departuresData.departures.length === 0) {
            console.log("No departures array found or it's empty in the API response.");
            return res.json([]);
        }

        // Log raw data for debugging if needed
        // console.log('Raw API Departures:', JSON.stringify(departuresData.departures, null, 2));

        // Filter and Format Departures with Deduplication (Uses config values)
        const processedDepartures = departuresData.departures
            .filter(dep => dep.destination?.includes(config.filter.destinationName))
            .map(dep => {
                const expectedTime = dep.expected || dep.scheduled;
                const timeLeftMinutes = calculateTimeDiffInMinutes(expectedTime);
                if (timeLeftMinutes === null) return null;

                const displayTime = timeLeftMinutes === 0 ? 'Nu' : `${timeLeftMinutes} min`;
                return {
                    journeyId: dep.journey?.id,
                    timeLeft: timeLeftMinutes,
                    displayString: `${dep.line.designation} ${dep.destination} ${displayTime}`
                };
            })
            .filter(dep => dep !== null && dep.journeyId !== undefined)
            .sort((a, b) => a.timeLeft - b.timeLeft);

        // Deduplicate based on journeyId
        const uniqueDepartures = [];
        const seenJourneyIds = new Set();

        for (const dep of processedDepartures) {
            if (!seenJourneyIds.has(dep.journeyId)) {
                seenJourneyIds.add(dep.journeyId);
                uniqueDepartures.push(dep.displayString);
                if (uniqueDepartures.length >= config.filter.departuresToShow) {
                    break;
                }
            }
        }

        console.log("Filtered & Deduplicated departures:", uniqueDepartures);
        res.json(uniqueDepartures);

    } catch (error) {
        // Handle errors (Uses config value in log)
        console.error(`Error fetching departures for Site ID ${config.station.siteId}:`, error.message);
        if (error.response) {
            console.error('API Error Status:', error.response.status);
            console.error('API Error Data:', error.response.data);
            res.status(error.response.status || 500).json({ error: 'API error occurred while fetching departures' });
        } else if (error.request) {
             console.error('API Error Request:', error.request);
             res.status(500).json({ error: 'No response received from Departures API' });
        } else {
             console.error('Non-API Error:', error);
            res.status(500).json({ error: 'Internal server error', details: error.message });
        }
    }
});

app.listen(config.port, () => {
    console.log(`Server listening on port ${config.port}`);
    console.log(`Access the endpoint at http://localhost:${config.port}/departures`);
}); 