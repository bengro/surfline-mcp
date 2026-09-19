import { Impit } from 'impit';
import {
  RatingResponse,
  TideResponse,
  SunlightResponse,
  WeatherResponse,
  SurfResponse,
  WindResponse,
  SpotResponse,
  SpotSearchResponse,
} from './types';
import { SurflineClient } from './surfline_client';

const BASE_URL = 'https://services.surfline.com';
const CLIENT_ID = '5c59e7c3f0b6cb1ad02baf66';

type QueryParams = Record<string, string | number | boolean>;

export class SurflineHttpClient implements SurflineClient {
  // Surfline sits behind Cloudflare bot management, which fingerprints the TLS
  // ClientHello (JA3/JA4). Node's own TLS stack is blocklisted and gets a 403 on
  // every path, with or without credentials; no combination of headers, HTTP
  // version or cipher ordering changes that. impit performs a Chrome-shaped
  // handshake, which is the only reason any of these requests get through.
  private readonly impit = new Impit({ browser: 'chrome' });

  private accessToken: string | null = null;

  public async login(email: string, password: string): Promise<void> {
    // Matches the public Surfline web client's form-encoded login contract.
    const body = new URLSearchParams({
      grant_type: 'password',
      username: email,
      password,
      forced: 'true',
      device_id: '',
      device_type: '',
      client_id: CLIENT_ID,
    }).toString();

    let accessToken: unknown;
    try {
      const response = await this.impit.fetch(
        `${BASE_URL}/trusted/token?isShortLived=false`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
        },
      );
      if (!response.ok) {
        throw new Error(
          `${response.status} ${(await response.text()).slice(0, 200)}`,
        );
      }
      accessToken = ((await response.json()) as { access_token?: unknown })
        .access_token;
    } catch (error) {
      console.error('Error logging in:', describe(error));
      throw new Error('Failed to login to Surfline.');
    }

    if (typeof accessToken !== 'string' || accessToken.length === 0) {
      throw new Error('Login failed: No access token received.');
    }
    this.accessToken = accessToken;
  }

  private async get<T>(
    path: string,
    params: QueryParams,
    subject: string,
  ): Promise<T> {
    if (!this.accessToken) {
      throw new Error(`You must be logged in to get ${subject}.`);
    }

    const url = new URL(path, BASE_URL);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }

    try {
      const response = await this.impit.fetch(url.toString(), {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });
      if (!response.ok) {
        throw new Error(
          `${response.status} ${(await response.text()).slice(0, 200)}`,
        );
      }
      return (await response.json()) as T;
    } catch (error) {
      console.error(`Error fetching ${subject}:`, describe(error));
      throw new Error(`Failed to fetch ${subject}.`);
    }
  }

  public getRatings(
    spotId: string,
    days: number,
    intervalHours: number,
  ): Promise<RatingResponse> {
    return this.get(
      '/kbyg/spots/forecasts/rating',
      { spotId, days, intervalHours },
      'ratings',
    );
  }

  public getTides(spotId: string, days: number): Promise<TideResponse> {
    return this.get(
      '/kbyg/spots/forecasts/tides',
      { spotId, days, cacheEnabled: true, 'units[tideHeight]': 'M' },
      'tides',
    );
  }

  public getSunlight(spotId: string, days: number): Promise<SunlightResponse> {
    return this.get(
      '/kbyg/spots/forecasts/sunlight',
      { spotId, days, intervalHours: 1 },
      'sunlight data',
    );
  }

  public getWeather(
    spotId: string,
    days: number,
    intervalHours: number,
  ): Promise<WeatherResponse> {
    return this.get(
      '/kbyg/spots/forecasts/weather',
      {
        spotId,
        days,
        intervalHours,
        cacheEnabled: true,
        'units[temperature]': 'C',
      },
      'weather data',
    );
  }

  public getSurf(
    spotId: string,
    days: number,
    intervalHours: number,
  ): Promise<SurfResponse> {
    return this.get(
      '/kbyg/spots/forecasts/surf',
      {
        spotId,
        days,
        intervalHours,
        corrected: true,
        'units[surfHeight]': 'FT',
      },
      'surf data',
    );
  }

  public getWind(
    spotId: string,
    days: number,
    intervalHours: number,
  ): Promise<WindResponse> {
    return this.get(
      '/kbyg/spots/forecasts/wind',
      {
        spotId,
        days,
        intervalHours,
        corrected: true,
        'units[windSpeed]': 'KTS',
      },
      'wind data',
    );
  }

  public async getSpotInfo(spotId: string): Promise<SpotResponse> {
    // /kbyg/spots/details now returns only { spot: { name } }, which would make
    // every coordinate [0, 0]; /kbyg/spots/reports still carries lat/lon.
    const body = await this.get<{
      spot?: { _id?: string; name?: string; lat?: number; lon?: number };
    }>('/kbyg/spots/reports', { spotId }, 'spot information');

    if (!body.spot) {
      throw new Error('Failed to fetch spot information.');
    }
    return {
      _id: body.spot._id || spotId,
      name: body.spot.name || `Unknown Spot ${spotId.slice(-4)}`,
      location: { coordinates: [body.spot.lon ?? 0, body.spot.lat ?? 0] },
    } as SpotResponse;
  }

  public async searchSpots(query: string): Promise<SpotSearchResponse> {
    if (!query || query.trim().length === 0) {
      throw new Error('Search query cannot be empty.');
    }

    const results = await this.get<SearchResult[]>(
      '/kbyg/search/site',
      { q: query.trim(), querySize: 10, suggestionSize: 10 },
      'spots',
    );

    // The first result set holds the spot hits; the rest are news/taxonomy.
    const hits = Array.isArray(results) ? results[0]?.hits?.hits : undefined;
    if (!hits) {
      return { spots: [] };
    }

    return {
      spots: hits.map((hit) => {
        const source = hit._source ?? {};
        const breadCrumbs = source.breadCrumbs || [];
        return {
          _id: hit._id,
          name: source.name || 'Unknown Spot',
          location: {
            coordinates: [
              source.location?.lon || 0,
              source.location?.lat || 0,
            ] as [number, number],
          },
          region: breadCrumbs[2] ?? breadCrumbs[1],
          country: breadCrumbs[0],
        };
      }),
    };
  }
}

interface SearchResult {
  hits?: {
    hits?: {
      _id: string;
      _source?: {
        name?: string;
        breadCrumbs?: string[];
        location?: { lon?: number; lat?: number };
      };
    }[];
  };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
