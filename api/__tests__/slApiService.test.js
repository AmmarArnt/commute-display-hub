const axios = require('axios');
const { fetchDepartures } = require('../slApiService'); // Adjusted path

// Mock the axios module
jest.mock('axios');

// Restore console log after tests if needed
// const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
// afterAll(() => consoleSpy.mockRestore());

describe('SL API Service', () => {
    const BASE_URL = 'http://fake.sl.se/v1/sites';
    const SITE_ID = '1234';
    const LINE_NUMBER = '100';
    const LIMIT = 5;

    beforeEach(() => {
        // Clear all mock calls before each test
        axios.get.mockClear();
    });

    it('should call axios.get with the correct URL and parameters', async () => {
        const mockResponse = { data: { departures: [{ id: 1 }] } };
        axios.get.mockResolvedValue(mockResponse);

        await fetchDepartures(BASE_URL, SITE_ID, LINE_NUMBER, LIMIT);

        const expectedUrl = `${BASE_URL}/${SITE_ID}/departures`;
        const expectedParams = {
            transportModes: 'BUS',
            lineNumbers: LINE_NUMBER,
            limit: LIMIT
        };

        expect(axios.get).toHaveBeenCalledTimes(1);
        expect(axios.get).toHaveBeenCalledWith(expectedUrl, { params: expectedParams });
    });

    it('should return the data part of the successful response', async () => {
        const mockDepartures = [{ id: 1, destination: 'Test' }];
        const mockResponse = { data: { departures: mockDepartures } };
        axios.get.mockResolvedValue(mockResponse);

        const result = await fetchDepartures(BASE_URL, SITE_ID, LINE_NUMBER, LIMIT);

        expect(result).toEqual({ departures: mockDepartures });
    });

    it('should throw an error if the axios request fails (e.g., network error)', async () => {
        const networkError = new Error('Network Error');
        networkError.code = 'ENOTFOUND';
        axios.get.mockRejectedValue(networkError);

        await expect(fetchDepartures(BASE_URL, SITE_ID, LINE_NUMBER, LIMIT))
            .rejects.toThrow('Network Error');
    });

    it('should throw an error and attach API data if axios rejects with an API error response', async () => {
        const apiErrorData = { message: 'Invalid Site ID' };
        const apiError = new Error('Request failed with status code 400');
        apiError.response = {
            status: 400,
            data: apiErrorData
        };
        axios.get.mockRejectedValue(apiError);

        try {
            await fetchDepartures(BASE_URL, SITE_ID, LINE_NUMBER, LIMIT);
            // fail is not defined in standard Jest, use explicit check or expect().toThrow()
            expect(true).toBe(false); // Should not reach here
        } catch (error) {
            expect(error.message).toContain('SL API Error (400)');
            expect(error.sl_api_data).toEqual(apiErrorData);
        }
    });
}); 