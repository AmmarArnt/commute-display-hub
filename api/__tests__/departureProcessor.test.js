const { processDepartures } = require('../departureProcessor'); // Adjusted path

// Helper to create a mock departure object
const createMockDeparture = (journeyId, destination, line, display, stopPointDesignation = 'Platform A') => {
    return {
        journey: { id: journeyId }, // Still useful for identifying unique API entries if needed, though not for deduping in processor
        destination: destination,
        display: display, // Direct display string from API
        line: { designation: line },
        stop_point: { designation: stopPointDesignation }
    };
};

describe('Departure Processor', () => {
    const TARGET_DESTINATION = 'Test Destination';
    const DEPARTURES_TO_SHOW = 3;

    it('should return an empty array for empty or invalid input', () => {
        expect(processDepartures(null, TARGET_DESTINATION, DEPARTURES_TO_SHOW)).toEqual([]);
        expect(processDepartures([], TARGET_DESTINATION, DEPARTURES_TO_SHOW)).toEqual([]);
        expect(processDepartures({}, TARGET_DESTINATION, DEPARTURES_TO_SHOW)).toEqual([]); // Technically {} is an object, not an array. API expects array.
    });

    it('should filter departures by destination', () => {
        const rawData = [
            createMockDeparture(1, TARGET_DESTINATION, '100', '5 min'),
            createMockDeparture(2, 'Wrong Destination', '101', '10 min')
        ];
        const result = processDepartures(rawData, TARGET_DESTINATION, DEPARTURES_TO_SHOW);
        expect(result).toHaveLength(1);
        expect(result[0]).toBe(`100 ${TARGET_DESTINATION} 5 min`);
    });

    it('should use the display field directly for time', () => {
        const rawData = [
            createMockDeparture(1, TARGET_DESTINATION, '100', '5 min'),
            createMockDeparture(2, TARGET_DESTINATION, '101', 'Nu')
        ];
        const result = processDepartures(rawData, TARGET_DESTINATION, DEPARTURES_TO_SHOW);
        expect(result).toHaveLength(2);
        expect(result[0]).toBe(`100 ${TARGET_DESTINATION} 5 min`);
        expect(result[1]).toBe(`101 ${TARGET_DESTINATION} Nu`);
    });

    it('should filter out departures from Platform B', () => {
        const rawData = [
            createMockDeparture(1, TARGET_DESTINATION, '100', '5 min', 'Platform A'),
            createMockDeparture(2, TARGET_DESTINATION, '101', '10 min', 'B'), // Changed to 'B' to match processor
            createMockDeparture(3, TARGET_DESTINATION, '102', '15 min', 'Platform C'),
            createMockDeparture(4, TARGET_DESTINATION, '103', '20 min') // Defaults to Platform A in helper
        ];
        const result = processDepartures(rawData, TARGET_DESTINATION, DEPARTURES_TO_SHOW);
        expect(result).toHaveLength(3); // 100, 102, 103
        expect(result).not.toContain(`101 ${TARGET_DESTINATION} 10 min`);
        expect(result).toEqual([
            `100 ${TARGET_DESTINATION} 5 min`,
            `102 ${TARGET_DESTINATION} 15 min`,
            `103 ${TARGET_DESTINATION} 20 min`
        ]);
    });

    it('should include all items if no other filters apply, without deduplicating', () => {
        const rawData = [
            createMockDeparture(1, TARGET_DESTINATION, '100', '15 min'), 
            createMockDeparture(1, TARGET_DESTINATION, '100', '16 min'), 
            createMockDeparture(2, TARGET_DESTINATION, '101', '5 min'),
        ];
        const result = processDepartures(rawData, TARGET_DESTINATION, DEPARTURES_TO_SHOW);
        expect(result).toEqual([
            `100 ${TARGET_DESTINATION} 15 min`,
            `100 ${TARGET_DESTINATION} 16 min`,
            `101 ${TARGET_DESTINATION} 5 min`
        ]);
    });

    it('should limit the number of results to departuresToShow after filtering', () => {
        const rawData = [
            createMockDeparture(1, TARGET_DESTINATION, '100', '5 min'),
            createMockDeparture(2, TARGET_DESTINATION, '101', '10 min', 'B'), // Will be filtered out
            createMockDeparture(3, TARGET_DESTINATION, '102', '15 min'),
            createMockDeparture(4, TARGET_DESTINATION, '103', '20 min')
        ];
        const result = processDepartures(rawData, TARGET_DESTINATION, 2); // Expect 2 results
        expect(result).toHaveLength(2);
        expect(result).toEqual([
            `100 ${TARGET_DESTINATION} 5 min`,
            `102 ${TARGET_DESTINATION} 15 min` 
        ]);
    });

    it('should handle departures with missing line designation gracefully', () => {
        const rawData = [
            { 
                destination: TARGET_DESTINATION, 
                display: '5 min',
                line: undefined, // Missing line
                stop_point: { designation: 'Platform A'}
            }
        ];
        const result = processDepartures(rawData, TARGET_DESTINATION, DEPARTURES_TO_SHOW);
        // This departure should now be filtered out
        expect(result).toEqual([]);
    });

    it('should handle departures with no display string gracefully', () => {
        const rawData = [
            {
                destination: TARGET_DESTINATION,
                display: undefined, // No display string
                line: { designation: '100' },
                stop_point: { designation: 'Platform A'}
            },
            createMockDeparture(2, TARGET_DESTINATION, '101', '5 min') // Include a valid one
        ];
        const result = processDepartures(rawData, TARGET_DESTINATION, DEPARTURES_TO_SHOW);
        // The first departure should be filtered out
        expect(result).toHaveLength(1);
        expect(result[0]).toBe(`101 ${TARGET_DESTINATION} 5 min`);
    });

    it('should handle missing stop_point gracefully (will not be filtered as B)', () => {
        const rawData = [
            createMockDeparture(1, TARGET_DESTINATION, '100', '5 min', 'Platform A'),
            {
                destination: TARGET_DESTINATION,
                line: { designation: '101' },
                display: '10 min',
                stop_point: undefined // Missing stop_point
            },
            createMockDeparture(3, TARGET_DESTINATION, '102', '15 min', 'B')
        ];
        const result = processDepartures(rawData, TARGET_DESTINATION, DEPARTURES_TO_SHOW);
        expect(result).toHaveLength(2); // 100, 101 (102 filtered)
        expect(result).toEqual([
            `100 ${TARGET_DESTINATION} 5 min`,
            `101 ${TARGET_DESTINATION} 10 min`
        ]);
    });

     it('should handle stop_point.designation being null or undefined gracefully (will not be filtered as B)', () => {
        const rawData = [
            createMockDeparture(1, TARGET_DESTINATION, '100', '5 min', 'Platform A'),
            {
                destination: TARGET_DESTINATION,
                line: { designation: '101' },
                display: '10 min',
                stop_point: { designation: null } // designation is null
            },
            {
                destination: TARGET_DESTINATION,
                line: { designation: '102' },
                display: '12 min',
                stop_point: { designation: undefined } // designation is undefined
            },
            createMockDeparture(4, TARGET_DESTINATION, '103', '15 min', 'B') // This one should be filtered
        ];
        const result = processDepartures(rawData, TARGET_DESTINATION, 4);
        expect(result).toHaveLength(3); 
        expect(result).toEqual([
            `100 ${TARGET_DESTINATION} 5 min`,
            `101 ${TARGET_DESTINATION} 10 min`,
            `102 ${TARGET_DESTINATION} 12 min`
        ]);
        expect(result).not.toContain(`103 ${TARGET_DESTINATION} 15 min`);
    });

}); 