const { processDepartures } = require('../departureProcessor'); // Adjusted path

// Helper to create a mock departure object
const createMockDeparture = (
    journeyId,
    destination,
    line,
    { // Using an options object for time and other optional fields
        minutesFromNow, // for 'expected'
        scheduledMinutesFromNow, // for 'scheduled'
        expectedTimeStr, // direct ISO string for 'expected'
        scheduledTimeStr, // direct ISO string for 'scheduled'
        apiDisplayString, // the 'display' field from the API, not used by processor for time
        stopPointDesignation = 'Platform A', // Default to a non-B platform
        noExpected = false,
        noScheduled = false,
        lineDesignation = line // Allow overriding line designation for testing missing line
    } = {}
) => {
    let expected, scheduled;

    if (noExpected) {
        expected = undefined;
    } else if (expectedTimeStr) {
        expected = expectedTimeStr;
    } else if (typeof minutesFromNow === 'number') {
        expected = new Date(Date.now() + minutesFromNow * 60000).toISOString();
    }

    if (noScheduled) {
        scheduled = undefined;
    } else if (scheduledTimeStr) {
        scheduled = scheduledTimeStr;
    } else if (typeof scheduledMinutesFromNow === 'number') {
        scheduled = new Date(Date.now() + scheduledMinutesFromNow * 60000).toISOString();
    }

    return {
        journey: { id: journeyId }, // Not used by processor for logic, but good for mock completeness
        destination: destination,
        expected: expected,
        scheduled: scheduled,
        display: apiDisplayString, // Raw display from API
        line: lineDesignation ? { designation: lineDesignation } : undefined,
        stop_point: { designation: stopPointDesignation }
    };
};

// Create mock ResRobot departure data
const createMockResrobotDeparture = (
    line,
    direction,
    { // options
        date = '2024-05-09', // Example date
        time = '10:30:00', // Example time
        rtDate = null,
        rtTime = null,
        track = 'A', // Default platform
        productName = `Bus ${line}`
    } = {}
) => {
    return {
        direction: direction,
        date: date,
        time: time,
        rtDate: rtDate,
        rtTime: rtTime,
        track: track,
        Product: {
            name: productName,
            line: String(line),
            num: String(line)
        }
        // Add other fields ResRobot might return if needed for testing other logic
    };
};

// Helper to generate ISO string for assertion comparison
const createExpectedTime = (options) => {
     const date = options.rtDate || options.date;
     const time = options.rtTime || options.time;
     return `${date}T${time}`;
}

describe('Departure Processor', () => {
    const TARGET_DESTINATION = 'Test Destination';
    const DEPARTURES_TO_SHOW = 3;

    it('should return an empty array for empty or invalid input', () => {
        expect(processDepartures(null, TARGET_DESTINATION, DEPARTURES_TO_SHOW)).toEqual([]);
        expect(processDepartures([], TARGET_DESTINATION, DEPARTURES_TO_SHOW)).toEqual([]);
        expect(processDepartures({}, TARGET_DESTINATION, DEPARTURES_TO_SHOW)).toEqual([]);
    });

    it('should filter departures by destination', () => {
        const dep1Time = new Date(Date.now() + 5 * 60000).toISOString();
        const rawData = [
            createMockDeparture(1, TARGET_DESTINATION, '100', { expectedTimeStr: dep1Time }),
            createMockDeparture(2, 'Wrong Destination', '101', { minutesFromNow: 10 })
        ];
        const result = processDepartures(rawData, TARGET_DESTINATION, DEPARTURES_TO_SHOW);
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({ lineDesignation: '100', destination: TARGET_DESTINATION, departureTime: dep1Time });
    });

    it('should prioritize "expected" time over "scheduled" time', () => {
        const expectedTime = new Date(Date.now() + 5 * 60000).toISOString();
        const scheduledTime = new Date(Date.now() + 10 * 60000).toISOString();
        const rawData = [
            createMockDeparture(1, TARGET_DESTINATION, '100', { expectedTimeStr: expectedTime, scheduledTimeStr: scheduledTime })
        ];
        const result = processDepartures(rawData, TARGET_DESTINATION, DEPARTURES_TO_SHOW);
        expect(result[0].departureTime).toBe(expectedTime);
    });

    it('should use "scheduled" time if "expected" time is missing', () => {
        const scheduledTime = new Date(Date.now() + 8 * 60000).toISOString();
        const rawData = [
            createMockDeparture(1, TARGET_DESTINATION, '100', { noExpected: true, scheduledTimeStr: scheduledTime })
        ];
        const result = processDepartures(rawData, TARGET_DESTINATION, DEPARTURES_TO_SHOW);
         expect(result[0].departureTime).toBe(scheduledTime);
    });

    it('should filter out departures with no "expected" and no "scheduled" time', () => {
        const validTime = new Date(Date.now() + 5 * 60000).toISOString();
        const rawData = [
            createMockDeparture(1, TARGET_DESTINATION, '100', { noExpected: true, noScheduled: true }),
            createMockDeparture(2, TARGET_DESTINATION, '101', { expectedTimeStr: validTime })
        ];
        const result = processDepartures(rawData, TARGET_DESTINATION, DEPARTURES_TO_SHOW);
        expect(result).toHaveLength(1);
        expect(result[0].lineDesignation).toBe('101');
    });

    it('should filter out departures with invalid time strings', () => {
        const validTime = new Date(Date.now() + 5 * 60000).toISOString();
        const rawData = [
            createMockDeparture(1, TARGET_DESTINATION, '100', { expectedTimeStr: 'invalid-date' }), // Processor should filter this
            createMockDeparture(2, TARGET_DESTINATION, '101', { expectedTimeStr: validTime })
        ];
        const result = processDepartures(rawData, TARGET_DESTINATION, DEPARTURES_TO_SHOW);
        expect(result).toHaveLength(1);
        expect(result[0].lineDesignation).toBe('101');
    });

    it('should filter out departures from Platform B', () => {
        const time1 = new Date(Date.now() + 5 * 60000).toISOString();
        const time2 = new Date(Date.now() + 10 * 60000).toISOString();
        const time3 = new Date(Date.now() + 15 * 60000).toISOString();
        const rawData = [
            createMockDeparture(1, TARGET_DESTINATION, '100', { expectedTimeStr: time1, stopPointDesignation: 'Platform A' }),
            createMockDeparture(2, TARGET_DESTINATION, '101', { expectedTimeStr: time2, stopPointDesignation: 'B' }), 
            createMockDeparture(3, TARGET_DESTINATION, '102', { expectedTimeStr: time3, stopPointDesignation: 'Platform C' })
        ];
        const result = processDepartures(rawData, TARGET_DESTINATION, DEPARTURES_TO_SHOW);
        expect(result).toHaveLength(2);
        expect(result.find(dep => dep.lineDesignation === '101')).toBeUndefined();
        expect(result[0].lineDesignation).toBe('100');
        expect(result[1].lineDesignation).toBe('102');
    });

    it('should sort departures by absolute time and not deduplicate', () => {
        const time1 = new Date(Date.now() + 15 * 60000).toISOString();
        const time2 = new Date(Date.now() + 5 * 60000).toISOString();
        const time3 = new Date(Date.now() + 16 * 60000).toISOString();
        const time4 = new Date(Date.now() + 1 * 60000).toISOString();
        const rawData = [
            createMockDeparture(1, TARGET_DESTINATION, '100', { expectedTimeStr: time1 }), // 15 min
            createMockDeparture(2, TARGET_DESTINATION, '101', { expectedTimeStr: time2 }), // 5 min
            createMockDeparture(3, TARGET_DESTINATION, '100', { expectedTimeStr: time3 }), // 16 min
            createMockDeparture(4, TARGET_DESTINATION, '102', { expectedTimeStr: time4 }), // 1 min
        ];
        const result = processDepartures(rawData, TARGET_DESTINATION, DEPARTURES_TO_SHOW + 1);
        expect(result).toEqual([
            { lineDesignation: '102', destination: TARGET_DESTINATION, departureTime: time4 },
            { lineDesignation: '101', destination: TARGET_DESTINATION, departureTime: time2 },
            { lineDesignation: '100', destination: TARGET_DESTINATION, departureTime: time1 },
            { lineDesignation: '100', destination: TARGET_DESTINATION, departureTime: time3 },
        ]);
    });

    it('should limit the number of results to departuresToShow after filtering and sorting', () => {
        const time1 = new Date(Date.now() + 5 * 60000).toISOString();
        const time2 = new Date(Date.now() + 10 * 60000).toISOString();
        const time3 = new Date(Date.now() + 15 * 60000).toISOString();
        const time4 = new Date(Date.now() + 1 * 60000).toISOString();
        const time5 = new Date(Date.now() + 20 * 60000).toISOString();
        const rawData = [
            createMockDeparture(1, TARGET_DESTINATION, '100', { expectedTimeStr: time1 }),
            createMockDeparture(2, TARGET_DESTINATION, '101', { expectedTimeStr: time2, stopPointDesignation: 'B' }), // Filtered 
            createMockDeparture(3, TARGET_DESTINATION, '102', { expectedTimeStr: time3 }),
            createMockDeparture(4, TARGET_DESTINATION, '103', { expectedTimeStr: time4 }), 
            createMockDeparture(5, TARGET_DESTINATION, '104', { expectedTimeStr: time5 })
        ];
        const result = processDepartures(rawData, TARGET_DESTINATION, 2); 
        expect(result).toHaveLength(2);
        expect(result).toEqual([ 
            { lineDesignation: '103', destination: TARGET_DESTINATION, departureTime: time4 },
            { lineDesignation: '100', destination: TARGET_DESTINATION, departureTime: time1 }
        ]);
    });

    it('should filter out departures with missing line designation', () => {
         const time1 = new Date(Date.now() + 5 * 60000).toISOString();
         const time2 = new Date(Date.now() + 10 * 60000).toISOString();
        const rawData = [
            createMockDeparture(1, TARGET_DESTINATION, null, { expectedTimeStr: time1, lineDesignation: null }),
            createMockDeparture(2, TARGET_DESTINATION, '101', { expectedTimeStr: time2 })
        ];
        const result = processDepartures(rawData, TARGET_DESTINATION, DEPARTURES_TO_SHOW);
        expect(result).toHaveLength(1);
        expect(result[0].lineDesignation).toBe('101');
    });
    
    // Test for handling missing stop_point or its designation (should not be filtered as 'B')
    it('should handle missing stop_point gracefully (not filtered as B)', () => {
        const time1 = new Date(Date.now() + 5 * 60000).toISOString();
        const time2 = new Date(Date.now() + 10 * 60000).toISOString();
        const time3 = new Date(Date.now() + 15 * 60000).toISOString();
        const rawData = [
            createMockDeparture(1, TARGET_DESTINATION, '100', { expectedTimeStr: time1, stopPointDesignation: 'Platform A' }),
            { // Custom mock for missing stop_point object
                journey: { id: 2 }, destination: TARGET_DESTINATION, line: { designation: '101' },
                expected: time2,
            },
            createMockDeparture(3, TARGET_DESTINATION, '102', { expectedTimeStr: time3, stopPointDesignation: 'B' }) // Filtered
        ];
        const result = processDepartures(rawData, TARGET_DESTINATION, DEPARTURES_TO_SHOW);
        expect(result).toHaveLength(2);
        expect(result[0].lineDesignation).toBe('100');
        expect(result[1].lineDesignation).toBe('101');
    });

    it('should handle stop_point.designation being null/undefined gracefully (not filtered as B)', () => {
        const time1 = new Date(Date.now() + 5 * 60000).toISOString();
        const time2 = new Date(Date.now() + 10 * 60000).toISOString();
        const time3 = new Date(Date.now() + 12 * 60000).toISOString();
        const time4 = new Date(Date.now() + 15 * 60000).toISOString();
        const rawData = [
            createMockDeparture(1, TARGET_DESTINATION, '100', { expectedTimeStr: time1, stopPointDesignation: 'Platform A' }),
            createMockDeparture(2, TARGET_DESTINATION, '101', { expectedTimeStr: time2, stopPointDesignation: null }),
            createMockDeparture(3, TARGET_DESTINATION, '102', { expectedTimeStr: time3, stopPointDesignation: undefined }),
            createMockDeparture(4, TARGET_DESTINATION, '103', { expectedTimeStr: time4, stopPointDesignation: 'B' }) // Filtered
        ];
        const result = processDepartures(rawData, TARGET_DESTINATION, 4);
        expect(result).toHaveLength(3);
        expect(result.map(d => d.lineDesignation)).toEqual(['100', '101', '102']);
        expect(result.find(dep => dep.lineDesignation === '103')).toBeUndefined();
    });

});

describe('Departure Processor for ResRobot Data', () => {
    const FILTER_DESTINATION = 'Test Destination';
    const FILTER_LINE = '100';
    const DEPARTURES_TO_SHOW = 2;

    it('should return an empty array for empty or invalid input', () => {
        expect(processDepartures(null, FILTER_DESTINATION, FILTER_LINE, DEPARTURES_TO_SHOW)).toEqual([]);
        expect(processDepartures([], FILTER_DESTINATION, FILTER_LINE, DEPARTURES_TO_SHOW)).toEqual([]);
        // {} is not an array, the function expects an array
    });

    it('should filter departures by destinationName and lineNumber', () => {
        const dep1Opts = { date: '2024-05-09', time: '11:00:00' };
        const dep2Opts = { date: '2024-05-09', time: '11:05:00' };
        const dep3Opts = { date: '2024-05-09', time: '11:10:00' };
        const rawData = [
            createMockResrobotDeparture(FILTER_LINE, FILTER_DESTINATION, dep1Opts), // Match
            createMockResrobotDeparture('101', FILTER_DESTINATION, dep2Opts), // Wrong line
            createMockResrobotDeparture(FILTER_LINE, 'Wrong Destination', dep3Opts) // Wrong dest
        ];
        const result = processDepartures(rawData, FILTER_DESTINATION, FILTER_LINE, DEPARTURES_TO_SHOW);
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({ 
            lineDesignation: FILTER_LINE,
            destination: FILTER_DESTINATION, 
            departureTime: createExpectedTime(dep1Opts) 
        });
    });

    it('should prioritize realtime (rtDate, rtTime) over scheduled (date, time)', () => {
         const opts = {
            date: '2024-05-09', time: '11:00:00', 
            rtDate: '2024-05-09', rtTime: '11:02:30' // Realtime is later
         };
        const rawData = [createMockResrobotDeparture(FILTER_LINE, FILTER_DESTINATION, opts)];
        const result = processDepartures(rawData, FILTER_DESTINATION, FILTER_LINE, DEPARTURES_TO_SHOW);
        expect(result[0].departureTime).toBe(createExpectedTime({rtDate: opts.rtDate, rtTime: opts.rtTime})); // Should use rt time
    });

    it('should filter out departures with missing date or time', () => {
         const rawData = [
            createMockResrobotDeparture(FILTER_LINE, FILTER_DESTINATION, { time: null }), // Missing time
            createMockResrobotDeparture(FILTER_LINE, FILTER_DESTINATION, { date: null }), // Missing date
            createMockResrobotDeparture(FILTER_LINE, FILTER_DESTINATION) // Valid one
        ];
        const result = processDepartures(rawData, FILTER_DESTINATION, FILTER_LINE, DEPARTURES_TO_SHOW);
        expect(result).toHaveLength(1);
        expect(result[0].lineDesignation).toBe(FILTER_LINE);
    });
    
    it('should filter out departures with missing line designation', () => {
         const mockDep = createMockResrobotDeparture('', FILTER_DESTINATION); // Create valid then remove line
         delete mockDep.Product;
         const rawData = [ mockDep, createMockResrobotDeparture(FILTER_LINE, FILTER_DESTINATION)];
         const result = processDepartures(rawData, FILTER_DESTINATION, FILTER_LINE, DEPARTURES_TO_SHOW);
         expect(result).toHaveLength(1);
         expect(result[0].lineDesignation).toBe(FILTER_LINE);
    });
    
    it('should filter out departures with missing direction (destination)', () => {
         const mockDep = createMockResrobotDeparture(FILTER_LINE, ''); // Create valid then remove dest
         mockDep.direction = null;
         const rawData = [ mockDep, createMockResrobotDeparture(FILTER_LINE, FILTER_DESTINATION)];
         const result = processDepartures(rawData, FILTER_DESTINATION, FILTER_LINE, DEPARTURES_TO_SHOW);
         expect(result).toHaveLength(1);
         expect(result[0].destination).toBe(FILTER_DESTINATION);
    });

    it('should filter out departures from Platform B (track B)', () => {
        const dep1Opts = { date: '2024-05-09', time: '11:00:00', track: 'A' };
        const dep2Opts = { date: '2024-05-09', time: '11:05:00', track: 'B' }; // Filtered
        const dep3Opts = { date: '2024-05-09', time: '11:10:00', track: 'C' };
        const rawData = [
            createMockResrobotDeparture(FILTER_LINE, FILTER_DESTINATION, dep1Opts),
            createMockResrobotDeparture(FILTER_LINE, FILTER_DESTINATION, dep2Opts), 
            createMockResrobotDeparture(FILTER_LINE, FILTER_DESTINATION, dep3Opts) 
        ];
        const result = processDepartures(rawData, FILTER_DESTINATION, FILTER_LINE, DEPARTURES_TO_SHOW + 1);
        expect(result).toHaveLength(2);
        expect(result.find(dep => dep.departureTime === createExpectedTime(dep2Opts))).toBeUndefined();
        expect(result[0].departureTime).toBe(createExpectedTime(dep1Opts));
        expect(result[1].departureTime).toBe(createExpectedTime(dep3Opts));
    });

    it('should sort departures by absolute time (using rtTime if available)', () => {
        const opts1 = { date: '2024-05-09', time: '11:15:00' }; // 15 min
        const opts2 = { date: '2024-05-09', time: '11:05:00' }; // 5 min
        const opts3 = { date: '2024-05-09', time: '11:17:00', rtDate: '2024-05-09', rtTime: '11:16:00' }; // 16 min (rt)
        const opts4 = { date: '2024-05-09', time: '11:01:00' }; // 1 min
        const rawData = [
            createMockResrobotDeparture(FILTER_LINE, FILTER_DESTINATION, opts1), 
            createMockResrobotDeparture(FILTER_LINE, FILTER_DESTINATION, opts2), 
            createMockResrobotDeparture(FILTER_LINE, FILTER_DESTINATION, opts3), 
            createMockResrobotDeparture(FILTER_LINE, FILTER_DESTINATION, opts4), 
        ];
        const result = processDepartures(rawData, FILTER_DESTINATION, FILTER_LINE, 4);
        expect(result.map(d => d.departureTime)).toEqual([
            createExpectedTime(opts4),
            createExpectedTime(opts2),
            createExpectedTime(opts1),
            createExpectedTime(opts3), // Note: using rtTime here
        ]);
    });

    it('should limit the number of results to departuresToShow after filtering and sorting', () => {
        const opts1 = { date: '2024-05-09', time: '11:05:00' };
        const opts2 = { date: '2024-05-09', time: '11:10:00', track: 'B' }; // Filtered
        const opts3 = { date: '2024-05-09', time: '11:15:00' };
        const opts4 = { date: '2024-05-09', time: '11:01:00' };
        const opts5 = { date: '2024-05-09', time: '11:20:00' };
        const rawData = [
            createMockResrobotDeparture(FILTER_LINE, FILTER_DESTINATION, opts1),
            createMockResrobotDeparture(FILTER_LINE, FILTER_DESTINATION, opts2),
            createMockResrobotDeparture(FILTER_LINE, FILTER_DESTINATION, opts3),
            createMockResrobotDeparture(FILTER_LINE, FILTER_DESTINATION, opts4),
            createMockResrobotDeparture(FILTER_LINE, FILTER_DESTINATION, opts5)
        ];
        const result = processDepartures(rawData, FILTER_DESTINATION, FILTER_LINE, 2); // Show 2
        expect(result).toHaveLength(2);
        expect(result.map(d => d.departureTime)).toEqual([ 
            createExpectedTime(opts4), // 11:01
            createExpectedTime(opts1)  // 11:05 (11:10 was filtered, 11:15 and 11:20 cut by limit)
        ]);
    });

    // Note: Tests for handling null/undefined track are implicitly covered by platform B filter test
    // If track is null/undefined, it won't equal 'B', so it won't be filtered.
}); 