/**
 * Calculates the time difference in minutes between now and the expected time.
 * Returns null if the time is invalid or in the past (within 30 seconds).
 *
 * @param {string} expectedTimeStr - ISO timestamp string.
 * @returns {number|null} Time difference in minutes or null.
 */
function calculateTimeDiffInMinutes(expectedTimeStr) {
    if (!expectedTimeStr) return null;
    const now = new Date();
    const expectedTime = new Date(expectedTimeStr);
    const diffMs = expectedTime - now;
    // Ignore departures less than 30 seconds away or passed
    if (diffMs < 30000) return null;
    // Calculate minutes using floor (round down)
    return Math.floor(diffMs / 60000);
}

/**
 * Processes raw departure data: filters, formats, sorts, and deduplicates.
 *
 * @param {Array<object>} rawDepartures - The raw departures array from the API.
 * @param {string} destinationName - The target destination name to filter by.
 * @param {number} departuresToShow - The maximum number of unique departures to return.
 * @returns {Array<string>} An array of formatted departure strings.
 */
function processDepartures(rawDepartures, destinationName, departuresToShow) {
    if (!rawDepartures || !Array.isArray(rawDepartures) || rawDepartures.length === 0) {
        return [];
    }

    // Filter, Format, and Sort
    const processedDepartures = rawDepartures
        .filter(dep => dep.destination?.includes(destinationName))
        .map(dep => {
            const expectedTime = dep.expected || dep.scheduled;
            const timeLeftMinutes = calculateTimeDiffInMinutes(expectedTime);
            if (timeLeftMinutes === null) return null;

            // Always format as relative time (or Nu)
            const displayTime = timeLeftMinutes === 0 ? 'Nu' : `${timeLeftMinutes} min`;

            return {
                journeyId: dep.journey?.id,
                timeLeft: timeLeftMinutes,
                displayString: `${dep.line?.designation || 'N/A'} ${dep.destination} ${displayTime}`
            };
        })
        .filter(dep => dep !== null && dep.journeyId !== undefined)
        .sort((a, b) => a.timeLeft - b.timeLeft);

    // Deduplicate based on journeyId
    const uniqueDepartures = [];
    const seenJourneyIds = new Set();

    for (const dep of processedDepartures) {
        if (!seenJourneyIds.has(dep.journeyId)) {
            seenJourneyIds.add(dep.journeyId);
            uniqueDepartures.push(dep.displayString);
            if (uniqueDepartures.length >= departuresToShow) {
                break;
            }
        }
    }

    return uniqueDepartures;
}

module.exports = {
    processDepartures
}; 