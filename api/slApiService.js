const axios = require('axios');

/**
 * Fetches departure data from the SL Transport API.
 *
 * @param {string} baseUrl - The base URL of the API.
 * @param {string} siteId - The Site ID for the station.
 * @param {string} lineNumber - The line number to filter by.
 * @param {number} limit - The maximum number of departures to fetch.
 * @returns {Promise<object>} A promise that resolves with the API response data (containing the departures array).
 * @throws {Error} Throws an error if the API request fails or returns an error status.
 */
async function fetchDepartures(baseUrl, siteId, lineNumber, limit) {
    const apiUrl = `${baseUrl}/${siteId}/departures`;
    const params = {
        transportModes: 'BUS',
        lineNumbers: lineNumber,
        limit: limit
    };

    console.log(`(SL Service) Fetching departures from: ${apiUrl} with params:`, params);

    try {
        const response = await axios.get(apiUrl, { params });
        // Directly return the data part of the response
        // Error handling for non-2xx status codes is handled by axios default behavior (throws error)
        return response.data;
    } catch (error) {
        console.error(`(SL Service) Error fetching departures for Site ID ${siteId}:`, error.message);
        // Re-throw the error to be handled by the caller (server.js route handler)
        // Add more context if possible
        if (error.response) {
            error.message = `SL API Error (${error.response.status}): ${error.message}`;
            error.sl_api_data = error.response.data; // Attach SL data if available
        }
        throw error;
    }
}

module.exports = {
    fetchDepartures
}; 