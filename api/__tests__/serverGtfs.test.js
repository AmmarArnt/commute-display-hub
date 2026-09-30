const request = require('supertest');

const mockService = {
    getDepartures: jest.fn(),
    health: jest.fn(),
    slice: { line: '134', trips: { a: {} } }
};
jest.doMock('../gtfs/service', () => ({ GtfsService: { create: jest.fn(() => mockService) } }));
jest.doMock('../slApiService', () => ({ fetchDepartures: jest.fn() }));

const mockConfig = {
    dataSource: 'gtfs',
    port: 3001,
    filter: { lineNumber: '134', destinationName: 'Östbergahöjden', departuresToShow: 3 },
    gtfs: { realtimeKey: 'k', schedulePath: '/x' }
};
jest.doMock('../config', () => ({ loadAndValidateConfig: jest.fn().mockReturnValue(mockConfig) }));

const app = require('../server');
const slApiService = require('../slApiService');
const { GtfsService } = require('../gtfs/service');

beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

test('creates the GTFS service from config and never calls the SL API', async () => {
    expect(GtfsService.create).toHaveBeenCalledWith(mockConfig.gtfs, mockConfig.filter);
    mockService.getDepartures.mockReturnValue({ departures: ['134 Östbergahöjden 3 min'], source: 'gtfs-realtime' });
    await request(app).get('/departures');
    expect(slApiService.fetchDepartures).not.toHaveBeenCalled();
});

test('/departures returns the same array-of-strings contract, with the data source in a header', async () => {
    const departures = ['134 Östbergahöjden 3 min', '134 Östbergahöjden 13 min'];
    mockService.getDepartures.mockReturnValue({ departures, source: 'gtfs-realtime' });
    const res = await request(app).get('/departures');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(departures);
    expect(res.headers['x-data-source']).toBe('gtfs-realtime');
});

test('/departures returns [] (not an error) when nothing is departing', async () => {
    mockService.getDepartures.mockReturnValue({ departures: [], source: 'gtfs-schedule' });
    const res = await request(app).get('/departures');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([]);
});

test('/departures returns 500 if the service throws', async () => {
    mockService.getDepartures.mockImplementation(() => { throw new Error('boom'); });
    const res = await request(app).get('/departures');
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error processing departures' });
});

test('/health returns the service health', async () => {
    mockService.health.mockReturnValue({ dataSource: 'gtfs', realtime: { usable: true } });
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.dataSource).toBe('gtfs');
});
