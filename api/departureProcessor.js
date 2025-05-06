/**
 * Calculates the time difference in minutes between now and the expected time.
 * Returns null if the time is invalid or in the past (within 30 seconds).
 *
 * @param {string} expectedTimeStr - ISO timestamp string.
 * @returns {number|null} Time difference in minutes or null.
 */
// function calculateTimeDiffInMinutes(expectedTimeStr) {
//     if (!expectedTimeStr) return null;
//     const now = new Date();
//     const expectedTime = new Date(expectedTimeStr);
//     const diffMs = expectedTime - now;
//     // Ignore departures less than 30 seconds away or passed
//     if (diffMs < 30000) return null;
//     // Calculate minutes using floor (round down)
//     return Math.floor(diffMs / 60000);
// }

/**
 * Processes raw departure data: filters, formats, and limits the number of results.
 *
 * @param {Array<object>} rawDepartures - The raw departures array from the API.
 * @param {string} destinationName - The target destination name to filter by.
 * @param {number} departuresToShow - The maximum number of departures to return.
 * @returns {Array<string>} An array of formatted departure strings.
 */
function processDepartures(rawDepartures, destinationName, departuresToShow) {
    if (!rawDepartures || !Array.isArray(rawDepartures) || rawDepartures.length === 0) {
        return [];
    }

    // Filter, Format
    const processedDepartures = rawDepartures
        .filter(dep => dep.destination?.includes(destinationName) && dep.stop_point?.designation !== 'B')
        .map(dep => {
            // Use display field directly from API response
            const displayTime = dep.display;
            const lineDesignation = dep.line?.designation; // Optional chaining handles if line is null/undefined

            // If essential display information is missing, mark for filtering by returning null
            // dep.destination is assumed to be valid due to the preceding .filter()
            if (!displayTime || !lineDesignation) {
                return null;
            }

            return {
                displayString: `${lineDesignation} ${dep.destination} ${displayTime}`
            };
        })
        .filter(depObjOrNull => depObjOrNull !== null) // Filter out items that were marked as null

    // Return the first 'departuresToShow' items after mapping
    return processedDepartures.slice(0, departuresToShow).map(dep => dep.displayString);
}

module.exports = {
    processDepartures
}; 