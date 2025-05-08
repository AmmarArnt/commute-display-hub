const express = require('express');
const { loadAndValidateConfig } = require('./config');
const slApiService = require('./slApiService');
const departureProcessor = require('./departureProcessor');

// Load configuration. If it fails, an error will be thrown
// and the process will likely exit due to the error in config.js
// or the initial load failure here.
const config = loadAndValidateConfig();

const app = express();

// Main route handler
app.get('/departures', async (req, res) => {
    try {
        const apiData = await slApiService.fetchDepartures(
            config.api.baseUrl,
            config.station.siteId,
            config.filter.lineNumber,
            config.filter.destinationName
        );

        if (!apiData || !apiData.departures) {
            console.log("API response missing 'departures' array.");
            return res.json([]);
        }

        const formattedDepartures = departureProcessor.processDepartures(
            apiData.departures,
            config.filter.destinationName,
            config.filter.departuresToShow
        );

        console.log("Filtered & Deduplicated departures:", formattedDepartures);
        res.json(formattedDepartures);

    } catch (error) {
        console.error(`Error in /departures route for Site ID ${config.station.siteId}:`, error.message);

        if (error.sl_api_data) {
            console.error('SL API Error Data:', error.sl_api_data);
            res.status(error.response?.status || 500).json({ error: 'SL API error occurred' });
        } else if (error.request) {
            console.error('API Connection Error:', error.code);
            res.status(504).json({ error: 'Could not connect to SL API' });
        } else {
            console.error('Internal Server Error:', error);
            res.status(500).json({ error: 'Internal server error processing departures' });
        }
    }
});

// Export the app for potential testing AND for start.js
module.exports = app; 