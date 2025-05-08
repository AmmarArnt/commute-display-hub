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
 * Processes raw departure data: filters, formats, sorts, and limits the number of results.
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

    const processedDepartures = rawDepartures
        .filter(dep => dep.destination?.includes(destinationName) && dep.stop_point?.designation === 'B')
        .map(dep => {
            const timeToUse = dep.expected || dep.scheduled;
            const timeLeftMinutes = calculateTimeDiffInMinutes(timeToUse);

            if (timeLeftMinutes === null) { // Handles past departures or invalid time
                return null;
            }

            const lineDesignation = dep.line?.designation;
            if (!lineDesignation) { // Filter out if line designation is missing
                return null;
            }
            
            // dep.destination is assumed valid from the initial filter
            // dep.display from API is no longer used for time display

            const displayTime = timeLeftMinutes === 0 ? 'Nu' : `${timeLeftMinutes} min`;

            return {
                lineDesignation, // Keep for sorting if needed, or just for display string
                destination: dep.destination,
                displayTime,
                timeLeftMinutes, // For sorting
                displayString: `${lineDesignation} ${dep.destination} ${displayTime}`
            };
        })
        .filter(depObjOrNull => depObjOrNull !== null) // Filter out items that were marked as null
        .sort((a, b) => a.timeLeftMinutes - b.timeLeftMinutes); // Sort by time remaining

    // Return the first 'departuresToShow' items after mapping and sorting
    return processedDepartures.slice(0, departuresToShow).map(dep => dep.displayString);
}

module.exports = {
    processDepartures
}; 