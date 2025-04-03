const axios = require('axios');

async function fetchDepartures(apiUrl) {
    try {
        const response = await axios.get(apiUrl);
        // Assuming the API returns an array of strings like ["Line Dest Time", ...]
        if (Array.isArray(response.data)) {
            return response.data;
        } else {
            console.error('Unexpected API response format:', response.data);
            return []; // Return empty array on unexpected format
        }
    } catch (error) {
        if (error.response) {
            // The request was made and the server responded with a status code
            // that falls out of the range of 2xx
            console.error(`Error fetching departures: API responded with status ${error.response.status}`, error.response.data);
        } else if (error.request) {
            // The request was made but no response was received
            console.error('Error fetching departures: No response received from API at', apiUrl);
        } else {
            // Something happened in setting up the request that triggered an Error
            console.error('Error fetching departures:', error.message);
        }
        return []; // Return empty array on error
    }
}

module.exports = { fetchDepartures };

