const { processDepartures } = require('../departureProcessor'); // Adjusted path

// Helper to create a mock departure object with a specific time
const createMockDeparture = (journeyId, destination, line, minutesFromNow) => {
    const expectedTime = new Date(Date.now() + minutesFromNow * 60000);
    return {
        journey: { id: journeyId },
        destination: destination,
        expected: expectedTime.toISOString(),
        line: { designation: line }
    };
};

// Helper to create a mock departure with scheduled time only
const createMockDepartureScheduled = (journeyId, destination, line, minutesFromNow) => {
    const scheduledTime = new Date(Date.now() + minutesFromNow * 60000);
    return {
        journey: { id: journeyId },
        destination: destination,
        scheduled: scheduledTime.toISOString(),
        line: { designation: line }
    };
};

describe('Departure Processor', () => {
    const TARGET_DESTINATION = 'Test Destination';
    const DEPARTURES_TO_SHOW = 3;

    // ... (rest of the test cases remain the same)
    it('should return an empty array for empty or invalid input', () => {
        expect(processDepartures(null, TARGET_DESTINATION, DEPARTURES_TO_SHOW)).toEqual([]);
        expect(processDepartures([], TARGET_DESTINATION, DEPARTURES_TO_SHOW)).toEqual([]);
        expect(processDepartures({}, TARGET_DESTINATION, DEPARTURES_TO_SHOW)).toEqual([]);
    });

    it('should filter departures by destination', () => {
        const rawData = [
            createMockDeparture(1, TARGET_DESTINATION, '100', 5),
            createMockDeparture(2, 'Wrong Destination', '101', 10)
        ];
        const result = processDepartures(rawData, TARGET_DESTINATION, DEPARTURES_TO_SHOW);
        expect(result).toHaveLength(1);
        expect(result[0]).toContain(TARGET_DESTINATION);
    });

    it('should format departures correctly (including Nu for <= 0 min)', () => {
        const rawData = [
            createMockDeparture(1, TARGET_DESTINATION, '100', 5),
            createMockDeparture(2, TARGET_DESTINATION, '101', 0.4)
        ];
        const result = processDepartures(rawData, TARGET_DESTINATION, DEPARTURES_TO_SHOW);
        expect(result).toHaveLength(1);
        expect(result[0]).toBe('100 Test Destination 5 min');

         const nowData = [createMockDeparture(3, TARGET_DESTINATION, '102', 0)];
         const nowResult = processDepartures(nowData, TARGET_DESTINATION, DEPARTURES_TO_SHOW);
         expect(nowResult).toEqual([]);

        const slightlyFutureData = [createMockDeparture(4, TARGET_DESTINATION, '103', 0.6)];
        const futureResult = processDepartures(slightlyFutureData, TARGET_DESTINATION, DEPARTURES_TO_SHOW);
        expect(futureResult).toHaveLength(1);
        expect(futureResult[0]).toBe('103 Test Destination 1 min');
    });

    it('should sort departures by time remaining', () => {
        const rawData = [
            createMockDeparture(1, TARGET_DESTINATION, '100', 15),
            createMockDeparture(2, TARGET_DESTINATION, '101', 5),
            createMockDeparture(3, TARGET_DESTINATION, '102', 25)
        ];
        const result = processDepartures(rawData, TARGET_DESTINATION, DEPARTURES_TO_SHOW);
        expect(result).toEqual([
            '101 Test Destination 5 min',
            '100 Test Destination 15 min',
            '102 Test Destination 25 min'
        ]);
    });

    it('should deduplicate departures by journey ID, keeping the earliest', () => {
        const rawData = [
            createMockDeparture(1, TARGET_DESTINATION, '100', 15),
            createMockDeparture(1, TARGET_DESTINATION, '100', 16),
            createMockDeparture(2, TARGET_DESTINATION, '101', 5),
            createMockDeparture(3, TARGET_DESTINATION, '102', 25),
            createMockDeparture(2, TARGET_DESTINATION, '101', 4),

        ];
        const result = processDepartures(rawData, TARGET_DESTINATION, DEPARTURES_TO_SHOW);
        expect(result).toEqual([
            '101 Test Destination 4 min',
            '100 Test Destination 15 min',
            '102 Test Destination 25 min'
        ]);
    });

    it('should limit the number of results to departuresToShow', () => {
        const rawData = [
            createMockDeparture(1, TARGET_DESTINATION, '100', 5),
            createMockDeparture(2, TARGET_DESTINATION, '101', 10),
            createMockDeparture(3, TARGET_DESTINATION, '102', 15),
            createMockDeparture(4, TARGET_DESTINATION, '103', 20)
        ];
        const result = processDepartures(rawData, TARGET_DESTINATION, 2);
        expect(result).toHaveLength(2);
        expect(result).toEqual([
            '100 Test Destination 5 min',
            '101 Test Destination 10 min'
        ]);
    });

    it('should handle missing expected time by using scheduled time', () => {
        const rawData = [
            createMockDepartureScheduled(1, TARGET_DESTINATION, '100', 8)
        ];
        const result = processDepartures(rawData, TARGET_DESTINATION, DEPARTURES_TO_SHOW);
        expect(result).toHaveLength(1);
        expect(result[0]).toBe('100 Test Destination 8 min');
    });

    it('should handle departures with missing journey ID', () => {
        const rawData = [
            { ...createMockDeparture(undefined, TARGET_DESTINATION, '100', 5), journey: undefined },
            createMockDeparture(2, TARGET_DESTINATION, '101', 10)
        ];
        const result = processDepartures(rawData, TARGET_DESTINATION, DEPARTURES_TO_SHOW);
        expect(result).toHaveLength(1);
        expect(result[0]).toBe('101 Test Destination 10 min');
    });

     it('should handle departures with missing line designation gracefully', () => {
        const rawData = [
            { ...createMockDeparture(1, TARGET_DESTINATION, undefined, 5), line: undefined }
        ];
        const result = processDepartures(rawData, TARGET_DESTINATION, DEPARTURES_TO_SHOW);
        expect(result).toHaveLength(1);
        expect(result[0]).toBe('N/A Test Destination 5 min');
    });

    it('should filter out departures with times in the past or too close (< 30s)', () => {
        const rawData = [
            createMockDeparture(1, TARGET_DESTINATION, '100', -5),
            createMockDeparture(2, TARGET_DESTINATION, '101', 0.2),
            createMockDeparture(3, TARGET_DESTINATION, '102', 1)
        ];
        const result = processDepartures(rawData, TARGET_DESTINATION, DEPARTURES_TO_SHOW);
        expect(result).toHaveLength(1);
        expect(result[0]).toBe('102 Test Destination 1 min');
    });

    it('should handle departures with no time string (expected or scheduled)', () => {
        const rawData = [
            {
                journey: { id: 1 },
                destination: TARGET_DESTINATION,
                // No expected or scheduled time
                line: { designation: '100' }
            },
            createMockDeparture(2, TARGET_DESTINATION, '101', 5) // Include a valid one
        ];
        const result = processDepartures(rawData, TARGET_DESTINATION, DEPARTURES_TO_SHOW);
        // The departure with no time should be filtered out by calculateTimeDiffInMinutes returning null
        expect(result).toHaveLength(1);
        expect(result[0]).toBe('101 Test Destination 5 min');
    });

    it('should handle departures where journey exists but journey.id is missing', () => {
        const rawData = [
             { // Valid departure structure but missing journey.id
                journey: {}, // Journey object exists, but no id
                destination: TARGET_DESTINATION,
                expected: new Date(Date.now() + 5 * 60000).toISOString(),
                line: { designation: '100' }
            },
            createMockDeparture(2, TARGET_DESTINATION, '101', 10)
        ];
         const result = processDepartures(rawData, TARGET_DESTINATION, DEPARTURES_TO_SHOW);
         // Should be filtered out by the filter(dep => dep !== null && dep.journeyId !== undefined)
         expect(result).toHaveLength(1);
         expect(result[0]).toBe('101 Test Destination 10 min');
    });

    it('should handle departures where journey property itself is null or undefined', () => {
        const rawData = [
            { // Valid structure but journey is null
               journey: null,
               destination: TARGET_DESTINATION,
               expected: new Date(Date.now() + 7 * 60000).toISOString(),
               line: { designation: '102' }
           },
            { // Valid structure but journey is undefined
                // journey: undefined, (implicitly undefined)
                destination: TARGET_DESTINATION,
                expected: new Date(Date.now() + 8 * 60000).toISOString(),
                line: { designation: '103' }
            },
           createMockDeparture(3, TARGET_DESTINATION, '101', 12) // A valid departure
       ];
        const result = processDepartures(rawData, TARGET_DESTINATION, DEPARTURES_TO_SHOW);
        // Departures with null/undefined journey should be filtered out by `dep.journeyId !== undefined`
        expect(result).toHaveLength(1);
        expect(result[0]).toBe('101 Test Destination 12 min');
   });
}); 