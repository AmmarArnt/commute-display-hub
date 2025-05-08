const axios = require('axios');
const { generateDetailedDepartureList } = require('./departureProcessor');

// Module-scoped state variables
let currentServiceUserAgent = null;
let forceFreshAgentForNextRequest = false;

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
    } else if (forceFreshAgentForNextRequest) {
        currentServiceUserAgent = 'agent/' + now;
        forceFreshAgentForNextRequest = false;
    }

    const headers = {
        'User-Agent': currentServiceUserAgent,
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Expires': '0'
    };

    console.log(`(SL Service) Fetching departures from: ${apiUrl} with params:`, params, "and headers:", headers);

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
    let shouldForceFreshAgentForSubsequentCall = false;
    if (!rawApiResponseData || !rawApiResponseData.departures || rawApiResponseData.departures.length === 0) {
        shouldForceFreshAgentForSubsequentCall = true;
    } else {
        // Use a large number for departuresToShow for internal analysis to get all relevant departures
        // Call the new function generateDetailedDepartureList for internal analysis
        const relevantDepartures = generateDetailedDepartureList(
            rawApiResponseData.departures,
            destinationName
        );

        if (!relevantDepartures || relevantDepartures.length === 0) {
            shouldForceFreshAgentForSubsequentCall = true;
        } else if (relevantDepartures.length < 3) {
            shouldForceFreshAgentForSubsequentCall = true;
        } else {
            const closestDeparture = relevantDepartures[0];
            if (closestDeparture.expectedOrScheduledTimeISO) {
                 const closestDepartureExpectedTime = new Date(closestDeparture.expectedOrScheduledTimeISO);
                 if (now >= closestDepartureExpectedTime.getTime()) {
                     shouldForceFreshAgentForSubsequentCall = true;
                 }
            } else {
                 console.warn('(SL Service) Closest departure missing expectedOrScheduledTimeISO. Flagging for fresh agent.');
                 shouldForceFreshAgentForSubsequentCall = true;
            }
        }
    }
    forceFreshAgentForNextRequest = shouldForceFreshAgentForSubsequentCall;

    // Return the raw API response to the caller
    return rawApiResponseData;
}

module.exports = {
    fetchDepartures
}; 