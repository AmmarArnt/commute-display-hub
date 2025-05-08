const axios = require('axios');

/**
 * Fetches departure data from the SL Transport API.
 *
 * @param {string} baseUrl - The base URL of the API.
 * @param {string} siteId - The Site ID for the station.
 * @param {string} lineNumber - The line number to filter by.
 * @returns {Promise<object>} A promise that resolves with the API response data (containing the departures array).
 * @throws {Error} Throws an error if the API request fails or returns an error status.
 */
async function fetchDepartures(baseUrl, siteId, lineNumber) {
    const apiUrl = `${baseUrl}/${siteId}/departures`;
    const params = {
        transport: 'BUS',
        line: lineNumber,
        forecast: 60,
        direction: 2,
        _cb: Date.now()
    };

    // Add these headers to try and prevent caching and mimic curl's User-Agent
    const headers = {
        'User-Agent': 'agent/' + Date.now(),  // Randomize to force cache miss,
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Expires': '0'
        // If the API key needs to be sent as a header, uncomment and use:
        // 'Authorization': `Bearer ${process.env.TRAFIKLAB_API_KEY}`
    };

    console.log(`(SL Service) Fetching departures from: ${apiUrl} with params:`, params, "and headers:", headers);

    try {
        // Pass the headers object to the axios.get request
        const response = await axios.get(apiUrl, { params, headers });
        
        // Log the raw response data
        console.log(`(SL Service) Raw response data:`, response.data);

        // Directly return the data part of the response
        return response.data;
    } catch (error) {
        console.error(`(SL Service) Error fetching departures for Site ID ${siteId}:`, error.message);
        // Re-throw the error to be handled by the caller (server.js route handler)
        // Add more context if possible
        if (error.response) {
            // Log the full error response if available
            console.error(`(SL Service) Full error response:`, error.response);
            error.message = `SL API Error (${error.response.status}): ${error.message}`;
            error.sl_api_data = error.response.data; // Attach SL data if available
        } else {
            // Log the error if there's no response object (e.g., network error before response)
            console.error(`(SL Service) Error without response object:`, error);
        }
        throw error;
    }
}

module.exports = {
    fetchDepartures
}; 