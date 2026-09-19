#!/usr/bin/env node
import { config as loadEnv } from 'dotenv';
import { join } from 'node:path';

// Claude Desktop and the Claude CLI launch this server from an arbitrary
// working directory, so resolve .env relative to the installed script.
// Real environment variables still win: dotenv never overrides them.
loadEnv({
  path: process.env.DOTENV_CONFIG_PATH ?? join(__dirname, '../../../.env'),
  quiet: true,
});
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { getSurfableHours } from '../../domain/get_surfable_hours.js';
import { SurflineClient } from '../../infrastructure/surfline_client/surfline_client.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { SurflineHttpClient } from '../../infrastructure/surfline_client/http_client.js';
import {
  SurfableHour,
  SurfCriteria,
  DEFAULT_SURF_CRITERIA,
} from '../../domain/types.js';

export class SurflineMCPServer {
  private server: Server;
  private surflineClient: SurflineClient | null = null;
  private initialization: Promise<void> | null = null;
  private spotNameCache = new Map<string, Promise<string>>();

  constructor(
    private readonly createClient: () => SurflineClient = () =>
      new SurflineHttpClient(),
    private readonly credentials: () => {
      email?: string;
      password?: string;
    } = () => ({
      email: process.env.SURFLINE_EMAIL,
      password: process.env.SURFLINE_PASSWORD,
    }),
  ) {
    this.server = new Server(
      {
        name: 'surfline-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      },
    );

    this.setupToolHandlers();
    this.setupResourceHandlers();
    this.server.onerror = (error) => console.error('[MCP Error]', error);
  }

  private async initializeSurflineClient(): Promise<void> {
    // ponytail: the access token lives ~30 days and is never refreshed, so a
    // process kept alive past expiry fails every call until restart. Add a
    // 401 -> re-login retry if that ever actually bites.
    if (this.surflineClient) {
      return;
    }

    if (!this.initialization) {
      this.initialization = this.authenticate().finally(() => {
        this.initialization = null;
      });
    }
    await this.initialization;
  }

  private async authenticate(): Promise<void> {
    const { email, password } = this.credentials();
    if (!email || !password) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'SURFLINE_EMAIL and SURFLINE_PASSWORD environment variables are required',
      );
    }
    const client = this.createClient();
    await client.login(email, password);
    this.surflineClient = client;
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'get_spot_forecast',
            description:
              'Get unfiltered Surfline wave, rating, wind, tide, weather and daylight forecasts. Includes Unix timestamps in seconds and original metadata; use these to compare with other data sources.',
            inputSchema: {
              type: 'object',
              properties: {
                spotId: { type: 'string', minLength: 1 },
                days: { type: 'integer', minimum: 1, maximum: 7, default: 7 },
                intervalHours: {
                  type: 'integer',
                  minimum: 1,
                  maximum: 24,
                  default: 1,
                },
              },
              required: ['spotId'],
              additionalProperties: false,
            },
          },
          {
            name: 'get_spot_info',
            description:
              'Get a Surfline spot name, ID and coordinates (longitude, latitude).',
            inputSchema: {
              type: 'object',
              properties: { spotId: { type: 'string', minLength: 1 } },
              required: ['spotId'],
              additionalProperties: false,
            },
          },
          {
            name: 'get_surfable_hours_today',
            description:
              'Get remaining surfable hours for today (UTC) at a specific surf spot',
            inputSchema: {
              type: 'object',
              properties: {
                spotId: {
                  type: 'string',
                  description: 'The Surfline spot ID to check conditions for',
                },
                waveMin: {
                  type: 'number',
                  description: 'Minimum wave height in feet (default: 2)',
                  minimum: 0,
                },
                ratingMin: {
                  type: 'string',
                  description: 'Minimum surf rating (default: POOR_TO_FAIR)',
                  enum: [
                    'VERY_POOR',
                    'POOR',
                    'POOR_TO_FAIR',
                    'FAIR',
                    'GOOD',
                    'VERY_GOOD',
                  ],
                },
              },
              required: ['spotId'],
            },
          },
          {
            name: 'get_surfable_hours_tomorrow',
            description:
              'Get surfable hours for tomorrow (UTC) at a specific surf spot',
            inputSchema: {
              type: 'object',
              properties: {
                spotId: {
                  type: 'string',
                  description: 'The Surfline spot ID to check conditions for',
                },
                waveMin: {
                  type: 'number',
                  description: 'Minimum wave height in feet (default: 2)',
                  minimum: 0,
                },
                ratingMin: {
                  type: 'string',
                  description: 'Minimum surf rating (default: POOR_TO_FAIR)',
                  enum: [
                    'VERY_POOR',
                    'POOR',
                    'POOR_TO_FAIR',
                    'FAIR',
                    'GOOD',
                    'VERY_GOOD',
                  ],
                },
              },
              required: ['spotId'],
            },
          },
          {
            name: 'get_surfable_hours_week',
            description:
              'Get surfable hours for the next 7 days at a specific surf spot',
            inputSchema: {
              type: 'object',
              properties: {
                spotId: {
                  type: 'string',
                  description: 'The Surfline spot ID to check conditions for',
                },
                waveMin: {
                  type: 'number',
                  description: 'Minimum wave height in feet (default: 2)',
                  minimum: 0,
                },
                ratingMin: {
                  type: 'string',
                  description: 'Minimum surf rating (default: POOR_TO_FAIR)',
                  enum: [
                    'VERY_POOR',
                    'POOR',
                    'POOR_TO_FAIR',
                    'FAIR',
                    'GOOD',
                    'VERY_GOOD',
                  ],
                },
              },
              required: ['spotId'],
            },
          },
          {
            name: 'get_surfable_hours_date',
            description:
              'Get surfable hours for a specific date at a specific surf spot',
            inputSchema: {
              type: 'object',
              properties: {
                spotId: {
                  type: 'string',
                  description: 'The Surfline spot ID to check conditions for',
                },
                date: {
                  type: 'string',
                  description: 'UTC date in DD/MM/YYYY format',
                  pattern: '^\\d{2}/\\d{2}/\\d{4}$',
                },
                waveMin: {
                  type: 'number',
                  description: 'Minimum wave height in feet (default: 2)',
                  minimum: 0,
                },
                ratingMin: {
                  type: 'string',
                  description: 'Minimum surf rating (default: POOR_TO_FAIR)',
                  enum: [
                    'VERY_POOR',
                    'POOR',
                    'POOR_TO_FAIR',
                    'FAIR',
                    'GOOD',
                    'VERY_GOOD',
                  ],
                },
              },
              required: ['spotId', 'date'],
            },
          },
          {
            name: 'search_spots',
            description:
              'Search for surf spots by name, region, or location to get their spot IDs',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description:
                    'Search query for surf spot name, region, or location (e.g., "Great Western", "Cornwall", "Malibu")',
                  minLength: 1,
                },
              },
              required: ['query'],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      this.validateArguments(name, args ?? {});
      try {
        await this.initializeSurflineClient();

        switch (name) {
          case 'get_spot_info':
            return this.jsonResponse(
              await this.surflineClient!.getSpotInfo(args!.spotId as string),
            );
          case 'get_spot_forecast': {
            const spotId = args!.spotId as string;
            const days = (args?.days as number | undefined) ?? 7;
            const interval = (args?.intervalHours as number | undefined) ?? 1;
            const client = this.surflineClient!;
            const [surf, ratings, wind, tides, weather, sunlight] =
              await Promise.all([
                client.getSurf(spotId, days, interval),
                client.getRatings(spotId, days, interval),
                client.getWind(spotId, days, interval),
                client.getTides(spotId, days),
                client.getWeather(spotId, days, interval),
                client.getSunlight(spotId, days),
              ]);
            return this.jsonResponse({
              spotId,
              days,
              intervalHours: interval,
              timestampUnit: 'unix_seconds',
              units: {
                surfHeight: 'ft',
                windSpeed: 'kts',
                tideHeight: 'm',
                temperature: 'C',
              },
              surf,
              ratings,
              wind,
              tides,
              weather,
              sunlight,
            });
          }
          case 'get_surfable_hours_today':
            return await this.getSurfableHoursToday(
              args?.spotId as string,
              args?.waveMin as number,
              args?.ratingMin as SurfCriteria['minRating'],
            );

          case 'get_surfable_hours_tomorrow':
            return await this.getSurfableHoursTomorrow(
              args?.spotId as string,
              args?.waveMin as number,
              args?.ratingMin as SurfCriteria['minRating'],
            );

          case 'get_surfable_hours_week':
            return await this.getSurfableHoursWeek(
              args?.spotId as string,
              args?.waveMin as number,
              args?.ratingMin as SurfCriteria['minRating'],
            );

          case 'get_surfable_hours_date':
            return await this.getSurfableHoursDate(
              args?.spotId as string,
              args?.date as string,
              args?.waveMin as number,
              args?.ratingMin as SurfCriteria['minRating'],
            );

          case 'search_spots':
            return await this.searchSpots(args?.query as string);

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`,
            );
        }
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `Surfline request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
        };
      }
    });
  }

  private setupResourceHandlers(): void {
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          {
            uri: 'surfline-mcp://spots/popular',
            mimeType: 'application/json',
            name: 'Popular Surf Spots',
            description: 'A list of popular surf spots with their Surfline IDs',
          },
          {
            uri: 'surfline-mcp://about',
            mimeType: 'text/plain',
            name: 'About surfline-mcp',
            description:
              'Information about the surfline-mcp and its capabilities',
          },
        ],
      };
    });

    this.server.setRequestHandler(
      ReadResourceRequestSchema,
      async (request) => {
        const { uri } = request.params;

        switch (uri) {
          case 'surfline-mcp://spots/popular':
            return {
              contents: [
                {
                  uri,
                  mimeType: 'application/json',
                  text: JSON.stringify(
                    {
                      spots: [
                        {
                          name: 'Malibu',
                          spotId: '5842041f4e65fad6a7708876',
                          location: 'California, USA',
                          description:
                            'Famous right-hand point break in Malibu',
                        },
                        {
                          name: 'Pipeline',
                          spotId: '5842041f4e65fad6a7708815',
                          location: 'Hawaii, USA',
                          description:
                            'World-famous barrel on the North Shore of Oahu',
                        },
                        {
                          name: 'Bells Beach',
                          spotId: '5842041f4e65fad6a770883d',
                          location: 'Victoria, Australia',
                          description:
                            'Iconic Australian surf break near Torquay',
                        },
                        {
                          name: 'Jeffreys Bay',
                          spotId: '5842041f4e65fad6a7708962',
                          location: 'South Africa',
                          description: 'World-class right-hand point break',
                        },
                      ],
                    },
                    null,
                    2,
                  ),
                },
              ],
            };

          case 'surfline-mcp://about':
            return {
              contents: [
                {
                  uri,
                  mimeType: 'text/plain',
                  text: `surfline-mcp

This MCP server authenticates with your Surfline account to expose the premium forecast data available to your subscription. It allows AI agents to:

1. Get surfable hours for today, tomorrow, or a specific date
2. Get surfable hours for the next 7 days
3. Access information about popular surf spots
4. Get detailed wind data including speed, direction, and onshore/offshore classification

Available Tools:
- get_spot_forecast: Unfiltered waves, ratings, wind, tides, weather and daylight forecasts
- get_spot_info: Spot name and coordinates
- get_surfable_hours_today: Get today's surfable conditions
- get_surfable_hours_tomorrow: Get tomorrow's surfable conditions  
- get_surfable_hours_week: Get next 7 days of surfable conditions
- get_surfable_hours_date: Get conditions for a specific date
- search_spots: Search for surf spots by name, region, or location to get spot IDs

Surfable-hours tools require a spotId parameter (Surfline spot ID) and optionally accept:
- waveMin: Minimum wave height in feet (default: 2)
- ratingMin: Minimum surf rating (default: POOR_TO_FAIR)

Wind Data Included:
- Wind speed in knots (kts)
- Wind direction in degrees and compass abbreviation
- Wind type classification (offshore, onshore, cross-shore)
- Formatted wind info for easy interpretation

The server filters conditions based on:
- Configurable minimum wave height (default: 2 feet)
- Configurable minimum rating (default: "Poor to Fair" or better)
- Daylight hours only

Agents combine these forecasts with their own calendar connectors. This server does not access calendars or schedule events.

Forecast access depends on your Surfline subscription and permissions. Forecast requests cover up to seven days.

Environment variables required:
- SURFLINE_EMAIL: Your Surfline account email
- SURFLINE_PASSWORD: Your Surfline account password`,
                },
              ],
            };

          default:
            throw new McpError(
              ErrorCode.InvalidRequest,
              `Unknown resource: ${uri}`,
            );
        }
      },
    );
  }

  private async getSurfableHoursToday(
    spotId: string,
    waveMin?: number,
    ratingMin?: SurfCriteria['minRating'],
  ) {
    if (!spotId) {
      throw new McpError(ErrorCode.InvalidParams, 'spotId is required');
    }

    const criteria: SurfCriteria = {
      minWaveHeight: waveMin ?? DEFAULT_SURF_CRITERIA.minWaveHeight,
      minRating: ratingMin ?? DEFAULT_SURF_CRITERIA.minRating,
    };

    const now = Date.now() / 1000;
    const surfableHours = await getSurfableHours(
      [spotId],
      this.surflineClient!,
      1,
      now,
      criteria,
    );

    return {
      content: [
        {
          type: 'text',
          text: await this.formatSurfableHoursResponse(
            surfableHours.filter(
              (hour) => hour.startTime < (Math.floor(now / 86400) + 1) * 86400,
            ),
            'today',
          ),
        },
      ],
    };
  }

  private async getSurfableHoursTomorrow(
    spotId: string,
    waveMin?: number,
    ratingMin?: SurfCriteria['minRating'],
  ) {
    if (!spotId) {
      throw new McpError(ErrorCode.InvalidParams, 'spotId is required');
    }

    const criteria: SurfCriteria = {
      minWaveHeight: waveMin ?? DEFAULT_SURF_CRITERIA.minWaveHeight,
      minRating: ratingMin ?? DEFAULT_SURF_CRITERIA.minRating,
    };

    const now = Date.now() / 1000;
    const tomorrowNow = (Math.floor(now / 86400) + 1) * 86400;
    const surfableHours = await getSurfableHours(
      [spotId],
      this.surflineClient!,
      7,
      tomorrowNow,
      criteria,
    );

    return {
      content: [
        {
          type: 'text',
          text: await this.formatSurfableHoursResponse(
            surfableHours.filter(
              (hour) => hour.startTime < tomorrowNow + 86400,
            ),
            'tomorrow',
          ),
        },
      ],
    };
  }

  private async getSurfableHoursWeek(
    spotId: string,
    waveMin?: number,
    ratingMin?: SurfCriteria['minRating'],
  ) {
    if (!spotId) {
      throw new McpError(ErrorCode.InvalidParams, 'spotId is required');
    }

    const criteria: SurfCriteria = {
      minWaveHeight: waveMin ?? DEFAULT_SURF_CRITERIA.minWaveHeight,
      minRating: ratingMin ?? DEFAULT_SURF_CRITERIA.minRating,
    };

    const now = Date.now() / 1000;
    const surfableHours = await getSurfableHours(
      [spotId],
      this.surflineClient!,
      7,
      now,
      criteria,
    );

    return {
      content: [
        {
          type: 'text',
          text: await this.formatSurfableHoursResponse(
            surfableHours,
            'the next 7 days',
          ),
        },
      ],
    };
  }

  private async getSurfableHoursDate(
    spotId: string,
    date: string,
    waveMin?: number,
    ratingMin?: SurfCriteria['minRating'],
  ) {
    if (!spotId) {
      throw new McpError(ErrorCode.InvalidParams, 'spotId is required');
    }
    if (!date) {
      throw new McpError(ErrorCode.InvalidParams, 'date is required');
    }

    if (!this.isValidDate(date)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Invalid date format. Use DD/MM/YYYY',
      );
    }

    const criteria: SurfCriteria = {
      minWaveHeight: waveMin ?? DEFAULT_SURF_CRITERIA.minWaveHeight,
      minRating: ratingMin ?? DEFAULT_SURF_CRITERIA.minRating,
    };

    const [day, month, year] = date.split('/');
    const targetDate = new Date(
      Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)),
    );
    const targetNow = targetDate.getTime() / 1000;

    const surfableHours = await getSurfableHours(
      [spotId],
      this.surflineClient!,
      7,
      targetNow,
      criteria,
    );

    return {
      content: [
        {
          type: 'text',
          text: await this.formatSurfableHoursResponse(
            surfableHours.filter((hour) => hour.startTime < targetNow + 86400),
            date,
          ),
        },
      ],
    };
  }

  private async searchSpots(query: string) {
    if (!query) {
      throw new McpError(ErrorCode.InvalidParams, 'query is required');
    }

    try {
      const searchResults = await this.surflineClient!.searchSpots(query);

      const formattedResults = searchResults.spots.map((spot) => ({
        spotId: spot._id,
        name: spot.name,
        region: spot.region,
        country: spot.country,
        coordinates: spot.location.coordinates,
      }));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                query,
                results: formattedResults,
                count: searchResults.spots.length,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      if (error instanceof McpError) {
        throw error;
      }
      throw new McpError(
        ErrorCode.InternalError,
        `Error searching spots: ${error}`,
      );
    }
  }

  private async formatSurfableHoursResponse(
    surfableHours: SurfableHour[],
    timeframe: string,
  ): Promise<string> {
    const formattedHours = await Promise.all(
      surfableHours.map(async (hour) => {
        const startTime = new Date(hour.startTime * 1000);
        const endTime = new Date(hour.endTime * 1000);

        const spotName = await this.getSpotName(hour.spotId);
        const spotDisplay = this.formatSpotDisplay(spotName, hour.spotId);

        const windInfo = this.formatWindInfo(
          hour.windSpeed,
          hour.windDirection,
          hour.windDirectionType,
        );

        return {
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          condition: hour.condition,
          waveHeight: hour.waveHeight,
          windSpeed: hour.windSpeed,
          windDirection: hour.windDirection,
          windDirectionType: hour.windDirectionType,
          windInfo: windInfo,
          spot: spotDisplay,
          spotId: hour.spotId,
        };
      }),
    );

    return JSON.stringify(
      {
        timeframe,
        surfableHours: formattedHours,
        count: surfableHours.length,
      },
      null,
      2,
    );
  }

  private isValidDate(value: string): boolean {
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return false;
    const [day, month, year] = value.split('/').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }

  private jsonResponse(value: unknown) {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(value) }],
    };
  }

  private validateArguments(name: string, args: Record<string, unknown>): void {
    const hourTools = [
      'get_surfable_hours_today',
      'get_surfable_hours_tomorrow',
      'get_surfable_hours_week',
      'get_surfable_hours_date',
    ];
    if (
      ![
        ...hourTools,
        'search_spots',
        'get_spot_info',
        'get_spot_forecast',
      ].includes(name)
    ) {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
    const field = name === 'search_spots' ? 'query' : 'spotId';
    if (typeof args[field] !== 'string' || !args[field].trim()) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `${field} must be a non-empty string`,
      );
    }
    if (name === 'get_spot_forecast') {
      for (const [field, max] of [
        ['days', 7],
        ['intervalHours', 24],
      ] as const) {
        const value = args[field];
        if (
          value !== undefined &&
          (typeof value !== 'number' ||
            !Number.isInteger(value) ||
            value < 1 ||
            value > max)
        ) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `${field} must be an integer from 1 to ${max}`,
          );
        }
      }
    }
    if (hourTools.includes(name)) {
      if (
        args.waveMin !== undefined &&
        (typeof args.waveMin !== 'number' ||
          !Number.isFinite(args.waveMin) ||
          args.waveMin < 0)
      ) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'waveMin must be a non-negative number',
        );
      }
      if (
        args.ratingMin !== undefined &&
        ![
          'VERY_POOR',
          'POOR',
          'POOR_TO_FAIR',
          'FAIR',
          'GOOD',
          'VERY_GOOD',
        ].includes(String(args.ratingMin))
      ) {
        throw new McpError(ErrorCode.InvalidParams, 'Invalid ratingMin');
      }
    }
    if (
      name === 'get_surfable_hours_date' &&
      (typeof args.date !== 'string' || !this.isValidDate(args.date))
    ) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'date must be a valid date in DD/MM/YYYY format',
      );
    }
  }

  private getSpotName(spotId: string): Promise<string> {
    // Cache the in-flight promise: a week of surfable hours resolves the same
    // spot dozens of times concurrently, and caching only the settled value
    // would let every one of them fire its own request.
    let pending = this.spotNameCache.get(spotId);
    if (!pending) {
      pending = this.surflineClient!.getSpotInfo(spotId)
        .then((spotInfo) => spotInfo.name)
        .catch(() => {
          console.error(
            `Warning: Could not fetch name for spot ${spotId}, using ID instead`,
          );
          this.spotNameCache.delete(spotId);
          return spotId;
        });
      this.spotNameCache.set(spotId, pending);
    }
    return pending;
  }

  private formatSpotDisplay(spotName: string, spotId: string): string {
    return spotName === spotId ? spotId : `${spotName} (${spotId})`;
  }

  private formatWindInfo(
    windSpeed: number,
    windDirection: number,
    windDirectionType: string,
  ): string {
    const getWindDirectionAbbreviation = (degrees: number): string => {
      const directions = [
        'N',
        'NNE',
        'NE',
        'ENE',
        'E',
        'ESE',
        'SE',
        'SSE',
        'S',
        'SSW',
        'SW',
        'WSW',
        'W',
        'WNW',
        'NW',
        'NNW',
      ];
      const index = Math.round(degrees / 22.5) % 16;
      return directions[index];
    };

    const formatWindDirectionType = (type: string): string => {
      switch (type.toUpperCase()) {
        case 'OFFSHORE':
        case 'OFFSHORE_WIND':
          return 'offshore';
        case 'ONSHORE':
        case 'ONSHORE_WIND':
          return 'onshore';
        case 'CROSS_SHORE':
        case 'CROSS-SHORE':
        case 'CROSS SHORE':
          return 'cross-shore';
        default:
          return type.toLowerCase();
      }
    };

    const directionAbbr = getWindDirectionAbbreviation(windDirection);
    const formattedType = formatWindDirectionType(windDirectionType);

    return `${Math.round(windSpeed)} kts ${directionAbbr} (${formattedType})`;
  }

  async connect(transport: Transport): Promise<void> {
    await this.server.connect(transport);
  }

  async close(): Promise<void> {
    await this.server.close();
  }

  async run(): Promise<void> {
    await this.connect(new StdioServerTransport());
    console.error('surfline-mcp running on stdio');
  }
}

async function main() {
  const server = new SurflineMCPServer();
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void server.close().finally(() => process.exit(0));
    });
  }
  await server.run();
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}
