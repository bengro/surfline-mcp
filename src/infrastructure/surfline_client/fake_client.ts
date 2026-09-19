import {
  Rating,
  RatingResponse,
  Sunlight,
  SunlightResponse,
  SurfData,
  SurfResponse,
  TideResponse,
  WeatherResponse,
  Wind,
  WindResponse,
  SpotResponse,
  SpotSearchResponse,
} from './types';
import { SurflineClient } from './surfline_client';

export class SurflineFakeClient implements SurflineClient {
  private static readonly RATING_RESPONSE: RatingResponse = {
    associated: {
      location: { lon: 0, lat: 0 },
      runInitializationTimestamp: 1672531200,
    },
    data: {
      rating: [
        {
          timestamp: 1672560000,
          utcOffset: 0,
          rating: { key: 'GOOD', value: 4 },
        }, // Timestamp is now after sunrise
        {
          timestamp: 1672563600,
          utcOffset: 0,
          rating: { key: 'FAIR', value: 3 },
        }, // Timestamp is now after sunrise
      ],
    },
  };

  private static readonly TIDE_RESPONSE: TideResponse = {
    associated: {
      utcOffset: 0,
      units: { tideHeight: 'M' },
      tideLocation: {
        name: 'Test Spot',
        min: 0,
        max: 2,
        lon: 0,
        lat: 0,
        mean: 1,
      },
    },
    data: {
      tides: [
        { timestamp: 1672531200, utcOffset: 0, type: 'HIGH', height: 1.8 },
        { timestamp: 1672552800, utcOffset: 0, type: 'LOW', height: 0.4 },
      ],
    },
  };

  private static readonly SUNLIGHT_RESPONSE: SunlightResponse = {
    associated: {
      location: { lon: 0, lat: 0 },
      runInitializationTimestamp: 1672531200,
    },
    data: {
      sunlight: [
        {
          midnight: 1672531200,
          midnightUTCOffset: 0,
          dawn: 1672552800,
          dawnUTCOffset: 0,
          sunrise: 1672556400,
          sunriseUTCOffset: 0,
          sunset: 1672596000,
          sunsetUTCOffset: 0,
          dusk: 1672599600,
          duskUTCOffset: 0,
        },
      ],
    },
  };

  private static readonly WEATHER_RESPONSE: WeatherResponse = {
    associated: {
      units: { temperature: 'C' },
      utcOffset: 0,
      weatherIconPath: '',
      runInitializationTimestamp: 1672531200,
    },
    data: {
      sunlightTimes: [],
      weather: [
        {
          timestamp: 1672531200,
          utcOffset: 0,
          temperature: 22,
          condition: 'CLEAR',
          pressure: 1012,
        },
        {
          timestamp: 1672534800,
          utcOffset: 0,
          temperature: 21,
          condition: 'CLEAR',
          pressure: 1013,
        },
      ],
    },
    permissions: {
      data: [],
      violations: [],
    },
  };

  private static readonly WIND_RESPONSE: WindResponse = {
    associated: {
      location: { lon: 0, lat: 0 },
      runInitializationTimestamp: 1672531200,
    },
    data: {
      wind: [
        {
          timestamp: 1672560000, // Matches first rating timestamp
          utcOffset: 0,
          speed: 12,
          direction: 180,
          directionType: 'ONSHORE',
          gust: 18,
          optimalScore: 2,
        },
        {
          timestamp: 1672563600, // Matches second rating timestamp
          utcOffset: 0,
          speed: 10,
          direction: 190,
          directionType: 'ONSHORE',
          gust: 15,
          optimalScore: 3,
        },
      ],
    },
  };

  private static readonly SURF_RESPONSE: SurfResponse = {
    associated: {
      location: { lon: 0, lat: 0 },
      runInitializationTimestamp: 1672531200,
    },
    data: {
      surf: [
        {
          timestamp: 1672560000,
          utcOffset: 0,
          surf: {
            min: 2,
            max: 3,
            plus: false,
            humanRelation: 'Waist to chest high',
            raw: { min: 2, max: 3 },
          },
        },
        {
          timestamp: 1672563600,
          utcOffset: 0,
          surf: {
            min: 2,
            max: 3,
            plus: false,
            humanRelation: 'Waist to chest high',
            raw: { min: 2, max: 3 },
          },
        },
      ],
    },
  };

  private ratingResponse: RatingResponse = SurflineFakeClient.RATING_RESPONSE;
  private sunlightResponse: SunlightResponse =
    SurflineFakeClient.SUNLIGHT_RESPONSE;
  private surfResponse: SurfResponse = SurflineFakeClient.SURF_RESPONSE;
  private windResponse: WindResponse = SurflineFakeClient.WIND_RESPONSE;

  private loggedIn = false;

  public setRatings(ratings: Rating[]): void {
    this.ratingResponse = {
      ...SurflineFakeClient.RATING_RESPONSE,
      data: {
        rating: ratings,
      },
    };
  }

  public setSunlight(sunlight: Sunlight[]): void {
    this.sunlightResponse = {
      ...SurflineFakeClient.SUNLIGHT_RESPONSE,
      data: {
        sunlight: sunlight,
      },
    };
  }
  public setSurf(surfData: SurfData[]): void {
    this.surfResponse = {
      ...SurflineFakeClient.SURF_RESPONSE,
      data: {
        surf: surfData,
      },
    };
  }

  public setWind(windData: Wind[]): void {
    this.windResponse = {
      ...SurflineFakeClient.WIND_RESPONSE,
      data: {
        wind: windData,
      },
    };
  }

  public async login(email: string, password: string): Promise<void> {
    if (email && password) {
      this.loggedIn = true;
    } else {
      throw new Error('FakeSurflineClient: Login failed.');
    }
  }

  private checkLogin(): void {
    if (!this.loggedIn) {
      throw new Error('You must be logged in.');
    }
  }

  public async getRatings(
    spotId: string,
    days: number,
    intervalHours: number,
  ): Promise<RatingResponse> {
    this.checkLogin();
    return this.ratingResponse;
  }

  public async getTides(spotId: string, days: number): Promise<TideResponse> {
    this.checkLogin();
    return SurflineFakeClient.TIDE_RESPONSE;
  }

  public async getSunlight(
    spotId: string,
    days: number,
  ): Promise<SunlightResponse> {
    this.checkLogin();
    return this.sunlightResponse;
  }

  public async getWeather(
    spotId: string,
    days: number,
    intervalHours: number,
  ): Promise<WeatherResponse> {
    this.checkLogin();
    return SurflineFakeClient.WEATHER_RESPONSE;
  }

  public async getWind(
    spotId: string,
    days: number,
    intervalHours: number,
  ): Promise<WindResponse> {
    this.checkLogin();
    return this.windResponse;
  }

  public async getSurf(
    spotId: string,
    days: number,
    intervalHours: number,
  ): Promise<SurfResponse> {
    this.checkLogin();
    return this.surfResponse;
  }

  public async getSpotInfo(spotId: string): Promise<SpotResponse> {
    this.checkLogin();

    // Return fake spot info based on popular spot IDs for testing
    const spotNames: { [key: string]: string } = {
      '5842041f4e65fad6a7708876': 'Malibu',
      '5842041f4e65fad6a7708815': 'Pipeline',
      '5842041f4e65fad6a770883d': 'Bells Beach',
      '5842041f4e65fad6a7708962': 'Jeffreys Bay',
    };

    const spotName = spotNames[spotId] || `Test Spot ${spotId.slice(-4)}`;

    return {
      _id: spotId,
      name: spotName,
      location: {
        coordinates: [-118.6919, 34.0259], // Malibu coordinates as default
      },
    };
  }

  public async searchSpots(query: string): Promise<SpotSearchResponse> {
    this.checkLogin();

    if (!query || query.trim().length === 0) {
      throw new Error('Search query cannot be empty.');
    }

    // Fake spot database for testing
    const fakeSpots = [
      {
        _id: '5842041f4e65fad6a7708876',
        name: 'Malibu',
        location: { coordinates: [-118.6919, 34.0259] as [number, number] },
        region: 'Los Angeles',
        country: 'USA',
      },
      {
        _id: '5842041f4e65fad6a7708815',
        name: 'Pipeline',
        location: { coordinates: [-158.0567, 21.6611] as [number, number] },
        region: 'North Shore',
        country: 'USA',
      },
      {
        _id: '5842041f4e65fad6a770883d',
        name: 'Bells Beach',
        location: { coordinates: [144.2844, -38.3667] as [number, number] },
        region: 'Victoria',
        country: 'Australia',
      },
      {
        _id: '5842041f4e65fad6a7708962',
        name: 'Jeffreys Bay',
        location: { coordinates: [24.9167, -34.0333] as [number, number] },
        region: 'Eastern Cape',
        country: 'South Africa',
      },
      {
        _id: '584204214e65fad6a7709cef',
        name: 'Great Western',
        location: { coordinates: [-5.079, 50.418] as [number, number] },
        region: 'Cornwall',
        country: 'United Kingdom',
      },
      {
        _id: '5842041f4e65fad6a7708901',
        name: 'Fistral Beach',
        location: { coordinates: [-5.0838, 50.4167] as [number, number] },
        region: 'Cornwall',
        country: 'United Kingdom',
      },
    ];

    // Simple search logic - match by name, region, or country (case insensitive)
    const searchTerm = query.trim().toLowerCase();
    const matchingSpots = fakeSpots.filter(
      (spot) =>
        spot.name.toLowerCase().includes(searchTerm) ||
        spot.region?.toLowerCase().includes(searchTerm) ||
        spot.country?.toLowerCase().includes(searchTerm),
    );

    return { spots: matchingSpots };
  }
}
