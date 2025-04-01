const request = require('supertest');

// Use jest.doMock for modules needed *before* app import
jest.doMock('../slApiService', () => ({
    fetchDepartures: jest.fn()
}));
jest.doMock('../departureProcessor', () => ({
    processDepartures: jest.fn()
}));

// Define the mock config structure
const mockConfig = {
    port: 3001,
    api: { baseUrl: 'http://mock-api.url' },
    station: { siteId: 'MOCK123' },
    filter: {
        lineNumber: 'MOCK99',
        destinationName: 'MOCK_DESTINATION',
        maxDeparturesToFetch: 5,
        departuresToShow: 3
    }
};

// Mock the config module to export the function, which returns our mock config
jest.doMock('../config', () => ({
    loadAndValidateConfig: jest.fn().mockReturnValue(mockConfig)
}));


// Now require the modules *after* setting up mocks
const app = require('../server');
const slApiService = require('../slApiService');
const departureProcessor = require('../departureProcessor');
const config = require('../config'); // This will get the mocked module

describe('API Server Endpoint /departures', () => {

    beforeEach(() => {
        // Reset mocks before each test
        slApiService.fetchDepartures.mockClear();
        departureProcessor.processDepartures.mockClear();
        // Reset default resolves/returns for mocks used in multiple tests
        slApiService.fetchDepartures.mockResolvedValue({ departures: [{ id: 1, dest: 'DefaultRaw' }] });
        departureProcessor.processDepartures.mockReturnValue(['Default Processed 1']);
    });

    // ... (rest of tests remain the same)
    it('should return 200 and formatted departures on success', async () => {
        const mockRawData = [{ id: 1, destination: 'Test Dest' }];
        const mockProcessedData = ['Line1 Test Dest 10 min'];
        slApiService.fetchDepartures.mockResolvedValue({ departures: mockRawData });
        departureProcessor.processDepartures.mockReturnValue(mockProcessedData);

        const response = await request(app).get('/departures');

        expect(response.statusCode).toBe(200);
        expect(response.body).toEqual(mockProcessedData);

        expect(slApiService.fetchDepartures).toHaveBeenCalledTimes(1);
        expect(slApiService.fetchDepartures).toHaveBeenCalledWith(
            mockConfig.api.baseUrl,
            mockConfig.station.siteId,
            mockConfig.filter.lineNumber,
            mockConfig.filter.maxDeparturesToFetch
        );

        expect(departureProcessor.processDepartures).toHaveBeenCalledTimes(1);
        expect(departureProcessor.processDepartures).toHaveBeenCalledWith(
            mockRawData,
            mockConfig.filter.destinationName,
            mockConfig.filter.departuresToShow
        );
    });

     it('should return 200 and empty array if departureProcessor returns empty array', async () => {
        const mockRawData = [{ id: 99 }];
        slApiService.fetchDepartures.mockResolvedValue({ departures: mockRawData });
        departureProcessor.processDepartures.mockReturnValue([]);

        const response = await request(app).get('/departures');

        expect(response.statusCode).toBe(200);
        expect(response.body).toEqual([]);
        expect(departureProcessor.processDepartures).toHaveBeenCalledWith(mockRawData, mockConfig.filter.destinationName, mockConfig.filter.departuresToShow);
    });

    it('should return 200 and empty array if API response is missing departures array', async () => {
        slApiService.fetchDepartures.mockResolvedValue({});

        const response = await request(app).get('/departures');

        expect(response.statusCode).toBe(200);
        expect(response.body).toEqual([]);
        expect(slApiService.fetchDepartures).toHaveBeenCalledTimes(1);
        expect(departureProcessor.processDepartures).not.toHaveBeenCalled();
    });

    it('should return 500 and error message if departureProcessor throws error', async () => {
        slApiService.fetchDepartures.mockResolvedValue({ departures: [{ id: 1 }] });
        const processingError = new Error('Processing failed');
        departureProcessor.processDepartures.mockImplementation(() => {
            throw processingError;
        });

        const response = await request(app).get('/departures');

        expect(response.statusCode).toBe(500);
        expect(response.body).toEqual({ error: 'Internal server error processing departures' });
        expect(slApiService.fetchDepartures).toHaveBeenCalledTimes(1);
        expect(departureProcessor.processDepartures).toHaveBeenCalledTimes(1);
    });

    it('should return 504 and error message if slApiService throws network error', async () => {
        const networkError = new Error('Could not connect');
        networkError.request = {};
        networkError.code = 'ECONNREFUSED';
        slApiService.fetchDepartures.mockRejectedValue(networkError);

        const response = await request(app).get('/departures');

        expect(response.statusCode).toBe(504);
        expect(response.body).toEqual({ error: 'Could not connect to SL API' });
        expect(slApiService.fetchDepartures).toHaveBeenCalledTimes(1);
        expect(departureProcessor.processDepartures).not.toHaveBeenCalled();
    });

    it('should return API status code and error message if slApiService throws SL API error', async () => {
        const slApiError = new Error('SL API Error (404): Not Found');
        slApiError.sl_api_data = { detail: 'Site not found' };
        slApiError.response = { status: 404 };
        slApiService.fetchDepartures.mockRejectedValue(slApiError);

        const response = await request(app).get('/departures');

        expect(response.statusCode).toBe(404);
        expect(response.body).toEqual({ error: 'SL API error occurred' });
        expect(slApiService.fetchDepartures).toHaveBeenCalledTimes(1);
        expect(departureProcessor.processDepartures).not.toHaveBeenCalled();
    });

    it('should return 500 if SL API error lacks response status', async () => {
        // Simulate an error from the service that has sl_api_data but no response/status
        const slApiErrorNoStatus = new Error('SL API Error - No Status');
        slApiErrorNoStatus.sl_api_data = { detail: 'Some internal SL issue' };
        // NO error.response or error.response.status attached
        slApiService.fetchDepartures.mockRejectedValue(slApiErrorNoStatus);

        const response = await request(app).get('/departures');

        // Should default to 500 because error.response.status is undefined
        expect(response.statusCode).toBe(500);
        expect(response.body).toEqual({ error: 'SL API error occurred' });
        expect(slApiService.fetchDepartures).toHaveBeenCalledTimes(1);
        expect(departureProcessor.processDepartures).not.toHaveBeenCalled();
    });
}); 