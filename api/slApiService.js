const axios = require('axios');
const { generateDetailedDepartureList } = require('./departureProcessor');

// Module-scoped state variables
let currentServiceUserAgent = null;
let forceFreshAgentForNextRequest = false;
let lowDepartureCountSinceTimestamp = null; // Added for 2-minute delay logic

/**
 * Fetches departure data from the SL Transport API.
 *
 * @param {string} baseUrl - The base URL of the API.
 * @param {string} siteId - The Site ID for the station.
 * @param {string} lineNumber - The line number to filter by.
 * @param {string} destinationName - The destination name to filter departures for internal analysis.
 * @returns {Promise<object>} A promise that resolves with the API response data (containing the departures array).
 * @throws {Error} Throws an error if the API request fails or returns an error status.
 */
async function fetchDepartures(baseUrl, siteId, lineNumber, destinationName) {
    const now = Date.now();
    const apiUrl = `${baseUrl}/${siteId}/departures`;
    const params = {
        transport: 'BUS',
        line: lineNumber,
        forecast: 60,
        direction: 2
    };

    // Determine User-Agent for the current API call
    if (currentServiceUserAgent === null) {
        currentServiceUserAgent = 'agent/' + now;
        forceFreshAgentForNextRequest = false;
        lowDepartureCountSinceTimestamp = null; // Reset timer state
    } else if (forceFreshAgentForNextRequest) { // This flag is true if a refresh was decided in the *previous* call
        currentServiceUserAgent = 'agent/' + now;
        forceFreshAgentForNextRequest = false; // Reset the flag after using it
        lowDepartureCountSinceTimestamp = null; // Reset timer state after refresh
    }

    const headers = {
        'User-Agent': currentServiceUserAgent,
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Expires': '0'
    };


    let rawApiResponseData;
    try {
        const response = await axios.get(apiUrl, { params, headers });
        rawApiResponseData = response.data;
    } catch (error) {
        console.error(`(SL Service) Error fetching departures for Site ID ${siteId}:`, error.message);
        if (error.response) {
            console.error(`(SL Service) Full error response:`, error.response);
            error.message = `SL API Error (${error.response.status}): ${error.message}`;
            error.sl_api_data = error.response.data;
        } else {
            console.error(`(SL Service) Error without response object:`, error);
        }
        throw error;
    }

    // Analyze response to decide if the *next* request needs a fresh agent
    let decideToForceRefreshForNextCall = false;

    if (!rawApiResponseData || !rawApiResponseData.departures || rawApiResponseData.departures.length === 0) {
        decideToForceRefreshForNextCall = true;
        lowDepartureCountSinceTimestamp = null; // Reset timer state, immediate refresh preferred
    } else {
        const relevantDepartures = generateDetailedDepartureList(
            rawApiResponseData.departures,
            destinationName
        );

        if (!relevantDepartures || relevantDepartures.length === 0) {
            decideToForceRefreshForNextCall = true;
            lowDepartureCountSinceTimestamp = null; // Reset timer state, immediate refresh preferred
        } else if (relevantDepartures.length < 3) {
            if (lowDepartureCountSinceTimestamp === null) {
                lowDepartureCountSinceTimestamp = Date.now();
                // Don't set decideToForceRefreshForNextCall = true yet, wait for timer
            } else {
                const threeMinutesInMs = 3 * 60 * 1000; // Changed from 2 minutes
                const timeElapsed = Date.now() - lowDepartureCountSinceTimestamp;
                if (timeElapsed >= threeMinutesInMs) {
                    decideToForceRefreshForNextCall = true;
                    // lowDepartureCountSinceTimestamp will be reset on the next call when the agent is actually refreshed
                } else {
                    // decideToForceRefreshForNextCall remains false, respecting timer (No log needed here for quiet operation)
                }
            }
        } else { // 3 or more relevant departures
            lowDepartureCountSinceTimestamp = null; // Reset timer as count is now sufficient

            // Still check if the closest departure is gone, which should trigger an immediate refresh
            const closestDeparture = relevantDepartures[0];
            if (closestDeparture.expectedOrScheduledTimeISO) {
                 const closestDepartureExpectedTime = new Date(closestDeparture.expectedOrScheduledTimeISO);
                 if (now >= closestDepartureExpectedTime.getTime()) {
                     decideToForceRefreshForNextCall = true;
                 }
            } else {
                 console.warn('(SL Service) Closest departure missing expectedOrScheduledTimeISO. Flagging for fresh agent.');
                 decideToForceRefreshForNextCall = true;
            }
        }
    }
    forceFreshAgentForNextRequest = decideToForceRefreshForNextCall; // This sets the flag for the *next* call

    // Return the raw API response to the caller
    return rawApiResponseData;
}

module.exports = {
    fetchDepartures
}; 