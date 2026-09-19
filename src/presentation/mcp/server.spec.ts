import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { SurflineMCPServer } from './server';
import { SurflineFakeClient } from '../../infrastructure/surfline_client/fake_client';
import * as surfableHours from '../../domain/get_surfable_hours';

const spotId = '584204214e65fad6a7709cef';

describe('Surfline MCP protocol', () => {
  let client: Client;
  let server: SurflineMCPServer;
  let surfline: SurflineFakeClient;
  let credentials: { email?: string; password?: string };

  beforeEach(async () => {
    surfline = new SurflineFakeClient();
    credentials = { email: 'test@example.com', password: 'test-password' };
    server = new SurflineMCPServer(
      () => surfline,
      () => credentials,
    );
    client = new Client({ name: 'test-client', version: '1.0.0' });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
    jest.restoreAllMocks();
  });

  async function call(name: string, args: Record<string, unknown>) {
    const result = await client.callTool({ name, arguments: args });
    const content = result.content;
    if (!Array.isArray(content) || content[0]?.type !== 'text') {
      throw new Error('Expected a text response');
    }
    return { result, text: String(content[0].text) };
  }

  it('discovers Surfline tools and resources without credentials or network access', async () => {
    credentials = {};
    const login = jest.spyOn(surfline, 'login');
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual([
      'get_spot_forecast',
      'get_spot_info',
      'get_surfable_hours_today',
      'get_surfable_hours_tomorrow',
      'get_surfable_hours_week',
      'get_surfable_hours_date',
      'search_spots',
    ]);
    const { resources } = await client.listResources();
    for (const resource of resources) {
      expect(
        (await client.readResource({ uri: resource.uri })).contents.length,
      ).toBeGreaterThan(0);
    }
    expect(login).not.toHaveBeenCalled();
  });

  it('returns unfiltered forecasts with timestamps, units and upstream metadata', async () => {
    const getSurf = jest.spyOn(surfline, 'getSurf');
    const getTides = jest.spyOn(surfline, 'getTides');
    const { text } = await call('get_spot_forecast', {
      spotId,
      days: 3,
      intervalHours: 2,
    });
    const data = JSON.parse(text);
    expect(data).toMatchObject({
      spotId,
      days: 3,
      intervalHours: 2,
      timestampUnit: 'unix_seconds',
      units: {
        surfHeight: 'ft',
        windSpeed: 'kts',
        tideHeight: 'm',
        temperature: 'C',
      },
    });
    expect(data.surf).toEqual(await surfline.getSurf(spotId, 3, 2));
    for (const key of [
      'surf',
      'ratings',
      'wind',
      'tides',
      'weather',
      'sunlight',
    ]) {
      expect(data[key].data).toBeDefined();
      expect(data[key].associated).toBeDefined();
    }
    expect(getSurf).toHaveBeenCalledWith(spotId, 3, 2);
    expect(getTides).toHaveBeenCalledWith(spotId, 3);
  });

  it('returns structured spot search results, including empty searches', async () => {
    const found = JSON.parse(
      (await call('search_spots', { query: 'Great Western' })).text,
    );
    expect(found.results[0]).toMatchObject({ spotId, name: 'Great Western' });
    const empty = JSON.parse(
      (await call('search_spots', { query: 'NonExistentSpotXYZ123' })).text,
    );
    expect(empty).toEqual({
      query: 'NonExistentSpotXYZ123',
      results: [],
      count: 0,
    });
    const info = JSON.parse((await call('get_spot_info', { spotId })).text);
    expect(info._id).toBe(spotId);
  });

  it.each([
    ['search_spots', { query: '  ' }],
    ['get_spot_info', { spotId: 123 }],
    ['get_spot_forecast', { spotId, days: 0 }],
    ['get_spot_forecast', { spotId, days: 8 }],
    ['get_spot_forecast', { spotId, intervalHours: 1.5 }],
    ['get_surfable_hours_today', { spotId, waveMin: -1 }],
    ['get_surfable_hours_week', { spotId, ratingMin: 'INVALID' }],
    ['get_surfable_hours_date', { spotId, date: '31/02/2026' }],
    ['unknown_tool', {}],
  ])(
    'rejects invalid %s requests before authentication',
    async (name, args) => {
      const login = jest.spyOn(surfline, 'login');
      await expect(
        client.callTool({ name, arguments: args }),
      ).rejects.toThrow();
      expect(login).not.toHaveBeenCalled();
    },
  );

  it('reports missing credentials and can retry once supplied', async () => {
    credentials = {};
    await expect(
      client.callTool({
        name: 'search_spots',
        arguments: { query: 'Cornwall' },
      }),
    ).rejects.toThrow('SURFLINE_EMAIL');
    credentials = { email: 'test@example.com', password: 'test-password' };
    expect(
      (await call('search_spots', { query: 'Cornwall' })).result.isError,
    ).not.toBe(true);
  });

  it('retries failed logins and shares a successful login across concurrent calls', async () => {
    const login = jest
      .spyOn(surfline, 'login')
      .mockRejectedValueOnce(new Error('Login unavailable'));
    expect(
      (await call('search_spots', { query: 'Cornwall' })).result.isError,
    ).toBe(true);
    const results = await Promise.all([
      call('search_spots', { query: 'Cornwall' }),
      call('get_spot_info', { spotId }),
    ]);
    expect(results.every(({ result }) => !result.isError)).toBe(true);
    expect(login).toHaveBeenCalledTimes(2);
  });

  it('reports upstream errors as failed tool results', async () => {
    jest
      .spyOn(surfline, 'getSurf')
      .mockRejectedValue(new Error('Forecast unavailable'));
    const { result, text } = await call('get_spot_forecast', { spotId });
    expect(result.isError).toBe(true);
    expect(text).toContain('Forecast unavailable');
  });

  it('returns ISO timestamps and scopes tomorrow/date results to one UTC day', async () => {
    const tomorrow = Date.UTC(2026, 8, 20) / 1000;
    jest.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 8, 19, 12));
    const hour = {
      startTime: tomorrow + 36000,
      endTime: tomorrow + 39600,
      spotId,
      condition: 'GOOD',
      waveHeight: 3,
      windSpeed: 5,
      windDirection: 90,
      windDirectionType: 'OFFSHORE',
    };
    jest
      .spyOn(surfableHours, 'getSurfableHours')
      .mockResolvedValue([
        hour,
        { ...hour, startTime: tomorrow + 86400, endTime: tomorrow + 90000 },
      ]);
    for (const name of [
      'get_surfable_hours_tomorrow',
      'get_surfable_hours_date',
    ]) {
      const data = JSON.parse(
        (await call(name, { spotId, date: '20/09/2026' })).text,
      );
      expect(data.count).toBe(1);
      expect(data.surfableHours[0].startTime).toBe('2026-09-20T10:00:00.000Z');
      expect(data.surfableHours[0]).not.toHaveProperty('calendarConflict');
    }
  });

  it('returns JSON when there are no surfable hours', async () => {
    jest.spyOn(surfableHours, 'getSurfableHours').mockResolvedValue([]);
    const data = JSON.parse(
      (await call('get_surfable_hours_week', { spotId })).text,
    );
    expect(data).toMatchObject({ count: 0, surfableHours: [] });
  });
});
