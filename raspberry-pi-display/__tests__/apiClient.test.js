const axios = require('axios');
const { fetchDepartures } = require('../apiClient');

// Mock axios
jest.mock('axios');

describe('API Client', () => {
    const MOCK_API_URL = 'http://fake-api/departures';

    beforeEach(() => {
        // Clear mock calls and implementations before each test
        axios.get.mockClear();
        // Restore console spies if used
        jest.restoreAllMocks(); 
    });

    it('should call axios.get with the correct URL', async () => {
        const mockData = ['Line1 Dest 5 min'];
        axios.get.mockResolvedValue({ data: mockData });

        await fetchDepartures(MOCK_API_URL);

        expect(axios.get).toHaveBeenCalledTimes(1);
        expect(axios.get).toHaveBeenCalledWith(MOCK_API_URL);
    });

    it('should return the data array on successful fetch', async () => {
        const mockData = ['Line1 Dest 5 min', 'Line2 Dest 10 min'];
        axios.get.mockResolvedValue({ data: mockData });

        const result = await fetchDepartures(MOCK_API_URL);

        expect(result).toEqual(mockData);
    });

    it('should return an empty array if API response data is not an array', async () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
        axios.get.mockResolvedValue({ data: { message: 'Unexpected format' } });

        const result = await fetchDepartures(MOCK_API_URL);

        expect(result).toEqual([]);
        expect(consoleSpy).toHaveBeenCalledWith('Unexpected API response format:', { message: 'Unexpected format' });
    });

    it('should return an empty array and log error on API error response (e.g., 404)', async () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
        const apiError = new Error('Not Found');
        apiError.response = { status: 404, data: { message: 'Endpoint not found' } };
        axios.get.mockRejectedValue(apiError);

        const result = await fetchDepartures(MOCK_API_URL);

        expect(result).toEqual([]);
        expect(consoleSpy).toHaveBeenCalledWith(
            'Error fetching departures: API responded with status 404', 
            { message: 'Endpoint not found' }
        );
    });

    it('should return an empty array and log error on network error (no response)', async () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
        const networkError = new Error('Network Error');
        networkError.request = {}; // Indicates request was made but no response
        axios.get.mockRejectedValue(networkError);

        const result = await fetchDepartures(MOCK_API_URL);

        expect(result).toEqual([]);
        expect(consoleSpy).toHaveBeenCalledWith(
            'Error fetching departures: No response received from API at', 
            MOCK_API_URL
        );
    });

    it('should return an empty array and log error on other errors', async () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
        const otherError = new Error('Something else failed');
        axios.get.mockRejectedValue(otherError);

        const result = await fetchDepartures(MOCK_API_URL);

        expect(result).toEqual([]);
        expect(consoleSpy).toHaveBeenCalledWith('Error fetching departures:', 'Something else failed');
    });
});
