const path = require('path');
const { loadAndValidateConfig } = require('../config');

// Store original env variables and mock process.env
let originalEnv;

beforeAll(() => {
    originalEnv = { ...process.env }; // Deep copy might be needed if values are objects
});

afterAll(() => {
    process.env = originalEnv; // Restore original env
});

beforeEach(() => {
    // Reset process.env before each test to isolate them
    jest.resetModules(); // Reset module cache to re-import config with new env
    process.env = { ...originalEnv }; // Start with original
    // Clear potential test variables
    delete process.env.API_URL;
    delete process.env.POLLING_INTERVAL_MS;
    delete process.env.ACTIVE_HOUR_START;
    delete process.env.ACTIVE_HOUR_END;
    delete process.env.MATRIX_WIDTH;
    delete process.env.MATRIX_HEIGHT;
    delete process.env.DISPLAY_TARGET;
});

const validEnv = {
    API_URL: 'http://example.com',
    POLLING_INTERVAL_MS: '60000',
    ACTIVE_HOUR_START: '6',
    ACTIVE_HOUR_END: '22',
    MATRIX_WIDTH: '32',
    MATRIX_HEIGHT: '8',
    DISPLAY_TARGET: 'console',
};

describe('Config Loading', () => {
    it('should load valid configuration from environment variables', () => {
        process.env = { ...process.env, ...validEnv };
        const config = loadAndValidateConfig(); // Reload module with mocked env

        expect(config.apiUrl).toBe('http://example.com');
        expect(config.pollingIntervalMs).toBe(60000);
        expect(config.activeHourStart).toBe(6);
        expect(config.activeHourEnd).toBe(22);
        expect(config.matrixWidth).toBe(32);
        expect(config.matrixHeight).toBe(8);
        expect(config.displayTarget).toBe('console');
    });

    it('should throw an error if required environment variables are missing', () => {
        // Missing API_URL
        process.env = { 
            ...process.env, 
            POLLING_INTERVAL_MS: '5000',
            ACTIVE_HOUR_START: '7',
            ACTIVE_HOUR_END: '22',
            MATRIX_WIDTH: '32',
            MATRIX_HEIGHT: '8',
            DISPLAY_TARGET: 'console',
        };
        expect(() => loadAndValidateConfig()).toThrow('Missing required environment variables: API_URL');
    });

    it('should throw an error for invalid numeric values', () => {
        process.env = { ...process.env, ...validEnv, POLLING_INTERVAL_MS: 'invalid' };
        expect(() => loadAndValidateConfig()).toThrow('Invalid numeric value for POLLING_INTERVAL_MS in .env file.');
    });

    it('should throw an error for negative numeric values', () => {
        process.env = { ...process.env, ...validEnv, MATRIX_WIDTH: '-10' };
        expect(() => loadAndValidateConfig()).toThrow('Invalid numeric value for MATRIX_WIDTH in .env file.');
    });

     it('should throw an error for invalid hour values (outside 0-23)', () => {
        process.env = { ...process.env, ...validEnv, ACTIVE_HOUR_START: '25' };
        expect(() => loadAndValidateConfig()).toThrow('ACTIVE_HOUR_START and ACTIVE_HOUR_END must be between 0 and 23');
    });

    it('should issue a warning if start hour is >= end hour', () => {
        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
        process.env = { ...process.env, ...validEnv, ACTIVE_HOUR_START: '22', ACTIVE_HOUR_END: '6' };
        loadAndValidateConfig(); // Should not throw, but warn
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Warning: ACTIVE_HOUR_START is greater than or equal to ACTIVE_HOUR_END'));
        consoleSpy.mockRestore();
    });

    it('should throw an error for invalid DISPLAY_TARGET', () => {
        process.env = { ...process.env, ...validEnv, DISPLAY_TARGET: 'invalid_target' };
        expect(() => loadAndValidateConfig()).toThrow("Invalid DISPLAY_TARGET: invalid_target. Must be 'console' or 'pi'.");
    });

});
