/**
 * Calculates the time difference in minutes between now and the expected time.
 * Returns null if the time is invalid or in the past.
 * Returns 0 if the time is less than 30 seconds away (for "Nu" display).
 *
 * @param {string} timeStr - ISO timestamp string.
 * @returns {number|null} Time difference in minutes, 0 for "Nu", or null.
 */
function calculateTimeDiffInMinutes(timeStr) {
    if (!timeStr) return null;
    const now = new Date();
    const expectedTime = new Date(timeStr);

    // Check for invalid date
    if (isNaN(expectedTime.getTime())) return null;

    const diffMs = expectedTime - now;

    // If in the past (excluding the buffer for "Nu"), return null
    if (diffMs < 0) return null; 
    
    // If less than 30 seconds away, return 0 to signify "Nu"
    if (diffMs < 30000) return 0;

    // Calculate minutes using floor (round down for display like "2 min" not "3 min" until full 3rd min passed)
    return Math.floor(diffMs / 60000);
}

/**
 * Generates a detailed list of processed departure objects.
 * This is intended for internal use or for consumers needing full departure details.
 *
 * @param {Array<object>} rawDepartures - The raw departures array from the API.
 * @param {string} destinationName - The target destination name to filter by.
 * @returns {Array<object>} An array of detailed, sorted departure objects.
 */
function generateDetailedDepartureList(rawDepartures, destinationName) {
    if (!rawDepartures || !Array.isArray(rawDepartures) || rawDepartures.length === 0) {
        return [];
    }

    return rawDepartures
        .filter(dep => dep.destination?.includes(destinationName) && dep.stop_point?.designation === 'B')
        .map(dep => {
            const timeToUse = dep.expected || dep.scheduled;
            const timeLeftMinutes = calculateTimeDiffInMinutes(timeToUse);

            if (timeLeftMinutes === null) {
                return null;
            }

            const lineDesignation = dep.line?.designation;
            if (!lineDesignation) {
                return null;
            }
            
            const displayTime = timeLeftMinutes === 0 ? 'Nu' : `${timeLeftMinutes} min`;

            return {
                lineDesignation,
                destination: dep.destination,
                displayTime,
                timeLeftMinutes,
                expectedOrScheduledTimeISO: timeToUse,
                displayString: `${lineDesignation} ${dep.destination} ${displayTime}`
            };
        })
        .filter(depObjOrNull => depObjOrNull !== null)
        .sort((a, b) => a.timeLeftMinutes - b.timeLeftMinutes);
}

/**
 * Processes raw departure data: filters, formats, sorts, and limits the number of results.
 * Returns an array of formatted departure strings for display.
 *
 * @param {Array<object>} rawDepartures - The raw departures array from the API.
 * @param {string} destinationName - The target destination name to filter by.
 * @param {number} departuresToShow - The maximum number of departures to return.
 * @returns {Array<string>} An array of formatted departure strings.
 */
function processDepartures(rawDepartures, destinationName, departuresToShow) {
    const allProcessedDepartures = generateDetailedDepartureList(rawDepartures, destinationName);

    // Return the first 'departuresToShow' items after mapping to displayString
    return allProcessedDepartures
        .slice(0, departuresToShow)
        .map(dep => dep.displayString);
}

module.exports = {
    processDepartures,
    generateDetailedDepartureList // Export for slApiService
}; 