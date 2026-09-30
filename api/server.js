const express = require('express');
const { loadAndValidateConfig } = require('./config');
const slApiService = require('./slApiService');
const departureProcessor = require('./departureProcessor');

// Load configuration. If it fails, an error will be thrown
// and the process will likely exit due to the error in config.js
// or the initial load failure here.
const config = loadAndValidateConfig();

const app = express();

// GTFS mode: departures come from the Trafiklab GTFS Regional realtime feed (polled in the
// background) merged with a locally built timetable. The response format is identical.
let gtfsService = null;
if (config.dataSource === 'gtfs') {
    const { GtfsService } = require('./gtfs/service');
    gtfsService = GtfsService.create(config.gtfs, config.filter);
    console.log(`Data source: GTFS Regional (line ${gtfsService.slice.line}, ${Object.keys(gtfsService.slice.trips).length} scheduled trips)`);
}

app.get('/health', (req, res) => {
    if (gtfsService) return res.json(gtfsService.health());
    res.json({ dataSource: 'sl' });
});

// Main route handler
app.get('/departures', async (req, res) => {
    if (gtfsService) {
        try {
            const { departures, source } = gtfsService.getDepartures();
            res.set('X-Data-Source', source);
            console.log(`Departures (${source}):`, departures);
            return res.json(departures);
        } catch (error) {
            console.error('Internal Server Error (GTFS):', error);
            return res.status(500).json({ error: 'Internal server error processing departures' });
        }
    }

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