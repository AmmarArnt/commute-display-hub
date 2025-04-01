require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

// --- Configuration ---
const API_BASE_URL = 'https://transport.integration.sl.se/v1/sites';
// REMOVED: const STOP_LOOKUP_API_URL

const ARSTABERG_SITE_ID = '9531'; // Using the ID provided by user
// REMOVED: const TARGET_STATION_NAME
const LINE_NUMBER = '134';
const DESTINATION_NAME = 'Östbergahöjden';
const MAX_DEPARTURES_TO_FETCH = 10;
const DEPARTURES_TO_SHOW = 3;
// --- End Configuration ---

// REMOVED: convertStopLookupId function
// REMOVED: findSiteId function

// Function to calculate time difference in minutes
function calculateTimeDiffInMinutes(expectedTimeStr) {
    if (!expectedTimeStr) return null;
    const now = new Date();
    const expectedTime = new Date(expectedTimeStr);
    const diffMs = expectedTime - now;
    if (diffMs < 30000) return null;
    return Math.round(diffMs / 60000);
}

// Main route handler (Simplified back to direct fetch)
app.get('/departures', async (req, res) => {
    // Construct URL with the hardcoded Site ID
    const apiUrl = `${API_BASE_URL}/${ARSTABERG_SITE_ID}/departures`;

    try {
        // Fetch Departures using the hardcoded Site ID
        const params = {
            transportModes: 'BUS',
            lineNumbers: LINE_NUMBER,
            limit: MAX_DEPARTURES_TO_FETCH
        };

        console.log(`Fetching departures from: ${apiUrl} with params:`, params);
        const response = await axios.get(apiUrl, { params });

        const departuresData = response.data;
        if (!departuresData || !departuresData.departures || departuresData.departures.length === 0) {
            console.log("No departures array found or it's empty in the API response.");
            return res.json([]); // Return empty array
        }

        // Log raw data for debugging if needed (can be commented out later)
        // console.log('Raw API Departures:', JSON.stringify(departuresData.departures, null, 2));

        // Filter and Format Departures with Deduplication
        const processedDepartures = departuresData.departures
            .filter(dep => dep.destination?.includes(DESTINATION_NAME))
            .map(dep => {
                const expectedTime = dep.expected || dep.scheduled;
                const timeLeftMinutes = calculateTimeDiffInMinutes(expectedTime);
                if (timeLeftMinutes === null) return null; // Skip if time is invalid

                const displayTime = timeLeftMinutes === 0 ? 'Nu' : `${timeLeftMinutes} min`;
                return {
                    journeyId: dep.journey?.id, // Include journey ID for deduplication
                    timeLeft: timeLeftMinutes,
                    displayString: `${dep.line.designation} ${dep.destination} ${displayTime}`
                };
            })
            .filter(dep => dep !== null && dep.journeyId !== undefined) // Ensure we have valid objects with journeyId
            .sort((a, b) => a.timeLeft - b.timeLeft); // Sort by time remaining

        // Deduplicate based on journeyId, taking the earliest time for each journey
        const uniqueDepartures = [];
        const seenJourneyIds = new Set();

        for (const dep of processedDepartures) {
            if (!seenJourneyIds.has(dep.journeyId)) {
                seenJourneyIds.add(dep.journeyId);
                uniqueDepartures.push(dep.displayString);
                if (uniqueDepartures.length >= DEPARTURES_TO_SHOW) {
                    break; // Stop once we have enough unique departures
                }
            }
        }

        console.log("Filtered & Deduplicated departures:", uniqueDepartures);
        res.json(uniqueDepartures);

    } catch (error) {
        // Handle errors during departure fetch
        console.error(`Error fetching departures for Site ID ${ARSTABERG_SITE_ID}:`, error.message);
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

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
    console.log(`Access the endpoint at http://localhost:${port}/departures`);
}); 