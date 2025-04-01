// Mock dotenv to prevent it from loading actual .env files during tests
jest.mock('dotenv');

describe('API Configuration Loading', () => {
    const ORIGINAL_ENV = process.env;
    let consoleErrorSpy;

    const setupTest = (envVars = {}) => {
        jest.resetModules(); // Reset modules to reload config.js with new env
        process.env = { ...ORIGINAL_ENV, ...envVars };
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        // Re-require dotenv AFTER resetting modules if needed, though mocking might be enough
        // require('dotenv');
    };

    afterEach(() => {
        process.env = ORIGINAL_ENV;
        consoleErrorSpy.mockRestore();
    });

    const mockRequiredEnv = {
        API_BASE_URL: 'http://test.com',
        STATION_SITE_ID: '1234',
        FILTER_LINE_NUMBER: '999',
        FILTER_DESTINATION_NAME: '"Test Dest"',
        FILTER_MAX_DEPARTURES_TO_FETCH: '15',
        FILTER_DEPARTURES_TO_SHOW: '5'
    };

    it('should load config correctly when all required env vars are set', () => {
        setupTest(mockRequiredEnv);
        const { loadAndValidateConfig } = require('../config'); // Adjusted path
        const config = loadAndValidateConfig();
        expect(config.filter.destinationName).toBe('Test Dest');
        expect(config.filter.maxDeparturesToFetch).toBe(15);
        expect(config.filter.departuresToShow).toBe(5);
    });

    it('should use PORT from env var if set', () => {
        setupTest({ ...mockRequiredEnv, PORT: '8080' });
        const { loadAndValidateConfig } = require('../config'); // Adjusted path
        const config = loadAndValidateConfig();
        expect(config.port).toBe('8080');
    });

    it('should throw error and log if required env vars are missing', () => {
        const incompleteEnv = { ...mockRequiredEnv };
        delete incompleteEnv.STATION_SITE_ID;
        delete incompleteEnv.FILTER_LINE_NUMBER;
        setupTest(incompleteEnv);
        const { loadAndValidateConfig } = require('../config'); // Adjusted path

        try {
            loadAndValidateConfig();
            throw new Error('loadAndValidateConfig should have thrown an error');
        } catch (error) {
            expect(error.message).toBe('Missing required environment variables');
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Missing required environment variables'));
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('- STATION_SITE_ID'));
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('- FILTER_LINE_NUMBER'));
        }
    });

    it('should throw error for invalid numeric FILTER_MAX_DEPARTURES_TO_FETCH', () => {
        setupTest({ ...mockRequiredEnv, FILTER_MAX_DEPARTURES_TO_FETCH: 'abc' });
        const { loadAndValidateConfig } = require('../config'); // Adjusted path
        try {
            loadAndValidateConfig();
            throw new Error('loadAndValidateConfig should have thrown an error');
        } catch (error) {
             expect(error.message).toContain('Invalid value for FILTER_MAX_DEPARTURES_TO_FETCH');
        }
    });

    it('should throw error for invalid numeric FILTER_DEPARTURES_TO_SHOW', () => {
        setupTest({ ...mockRequiredEnv, FILTER_DEPARTURES_TO_SHOW: 'xyz' });
        const { loadAndValidateConfig } = require('../config'); // Adjusted path
         try {
            loadAndValidateConfig();
            throw new Error('loadAndValidateConfig should have thrown an error');
        } catch (error) {
             expect(error.message).toContain('Invalid value for FILTER_DEPARTURES_TO_SHOW');
        }
    });

    it('should throw error for empty FILTER_DESTINATION_NAME', () => {
        setupTest({ ...mockRequiredEnv, FILTER_DESTINATION_NAME: '""' });
        const { loadAndValidateConfig } = require('../config'); // Adjusted path
         try {
            loadAndValidateConfig();
            throw new Error('loadAndValidateConfig should have thrown an error');
        } catch (error) {
             expect(error.message).toContain('FILTER_DESTINATION_NAME cannot be empty');
        }
    });
}); 