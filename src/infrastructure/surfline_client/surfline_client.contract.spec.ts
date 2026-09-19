import 'dotenv/config';
import { SurflineHttpClient } from './http_client';
import { SurflineFakeClient } from './fake_client';
import { SurflineClient } from './surfline_client';

const email = process.env.SURFLINE_EMAIL as string;
const password = process.env.SURFLINE_PASSWORD as string;
const spotId = '584204214e65fad6a7709cef';

const clients: { name: string; client: SurflineClient }[] = [
  ...(process.env.SURFLINE_LIVE_TESTS === '1'
    ? [{ name: 'SurflineHttpClient', client: new SurflineHttpClient() }]
    : []),
  { name: 'SurflineFakeClient', client: new SurflineFakeClient() },
];

describe.each(clients)('$name Contract Tests', ({ name, client }) => {
  beforeAll(async () => {
    await client.login(
      name === 'SurflineFakeClient' ? 'test@example.com' : email,
      name === 'SurflineFakeClient' ? 'test-password' : password,
    );
  }, 30000);

  it('should be logged in successfully', () => {
    expect(client).toBeDefined();
  });

  it('should fetch ratings for a spot after logging in', async () => {
    const ratings = await client.getRatings(spotId, 1, 1);

    expect(ratings).toBeDefined();
    expect(ratings.associated).toBeDefined();
    expect(ratings.data.rating).toBeDefined();
    expect(ratings.data.rating.length).toBeGreaterThan(0);
  }, 30000);

  it('should fetch tides for a spot after logging in', async () => {
    const tides = await client.getTides(spotId, 1);

    expect(tides).toBeDefined();
    expect(tides.associated).toBeDefined();
    expect(tides.data.tides).toBeDefined();
    expect(tides.data.tides.length).toBeGreaterThan(0);
  }, 30000);

  it('should fetch weather for a spot after logging in', async () => {
    const weather = await client.getWeather(spotId, 1, 1);

    expect(weather).toBeDefined();
    expect(weather.associated).toBeDefined();
    expect(weather.data.weather).toBeDefined();
    expect(weather.data.weather.length).toBeGreaterThan(0);
  }, 30000);

  it('should fetch wind for a spot after logging in', async () => {
    const wind = await client.getWind(spotId, 1, 1);

    expect(wind).toBeDefined();
    expect(wind.associated).toBeDefined();
    expect(wind.data.wind).toBeDefined();
    expect(wind.data.wind.length).toBeGreaterThan(0);

    // Test wind data structure
    const firstWindData = wind.data.wind[0];
    expect(firstWindData.timestamp).toBeDefined();
    expect(typeof firstWindData.timestamp).toBe('number');
    expect(firstWindData.speed).toBeDefined();
    expect(typeof firstWindData.speed).toBe('number');
    expect(firstWindData.direction).toBeDefined();
    expect(typeof firstWindData.direction).toBe('number');
    expect(firstWindData.direction).toBeGreaterThanOrEqual(0);
    expect(firstWindData.direction).toBeLessThan(360);
    expect(firstWindData.directionType).toBeDefined();
    expect(typeof firstWindData.directionType).toBe('string');
    // Check that directionType is one of the expected values (case-insensitive)
    const validDirectionTypes = [
      'ONSHORE',
      'OFFSHORE',
      'CROSS_SHORE',
      'Cross-shore',
      'Onshore',
      'Offshore',
    ];
    expect(validDirectionTypes).toContain(firstWindData.directionType);
  }, 30000);

  it('should fetch spot info for a spot after logging in', async () => {
    const spotInfo = await client.getSpotInfo(spotId);

    expect(spotInfo).toBeDefined();
    expect(spotInfo._id).toBeDefined();
    expect(spotInfo._id).toBe(spotId);
    expect(spotInfo.name).toBeDefined();
    expect(typeof spotInfo.name).toBe('string');
    expect(spotInfo.name.length).toBeGreaterThan(0);
    expect(spotInfo.location).toBeDefined();
    expect(spotInfo.location.coordinates).toBeDefined();
    expect(Array.isArray(spotInfo.location.coordinates)).toBe(true);
    expect(spotInfo.location.coordinates.length).toBe(2);
    expect(typeof spotInfo.location.coordinates[0]).toBe('number'); // longitude
    expect(typeof spotInfo.location.coordinates[1]).toBe('number'); // latitude
  }, 30000);

  describe('Spot Search Functionality', () => {
    it('should search for spots by name and return valid results', async () => {
      const searchResults = await client.searchSpots('Great Western');

      expect(searchResults).toBeDefined();
      expect(searchResults.spots).toBeDefined();
      expect(Array.isArray(searchResults.spots)).toBe(true);

      // Ensure we actually found results - both clients should return Great Western
      expect(searchResults.spots.length).toBeGreaterThan(0);

      const firstSpot = searchResults.spots[0];
      expect(firstSpot._id).toBeDefined();
      expect(typeof firstSpot._id).toBe('string');
      expect(firstSpot._id.length).toBeGreaterThan(0);
      expect(firstSpot.name).toBeDefined();
      expect(typeof firstSpot.name).toBe('string');
      expect(firstSpot.name.length).toBeGreaterThan(0);
      expect(firstSpot.location).toBeDefined();
      expect(firstSpot.location.coordinates).toBeDefined();
      expect(Array.isArray(firstSpot.location.coordinates)).toBe(true);
      expect(firstSpot.location.coordinates.length).toBe(2);
      expect(typeof firstSpot.location.coordinates[0]).toBe('number'); // longitude
      expect(typeof firstSpot.location.coordinates[1]).toBe('number'); // latitude

      // Validate that we got the expected spot
      expect(firstSpot.name).toContain('Great Western');
      expect(firstSpot._id).toBe('584204214e65fad6a7709cef');

      // Region and country should be present for both clients
      expect(firstSpot.region).toBeDefined();
      expect(typeof firstSpot.region).toBe('string');
      expect(firstSpot.region!.length).toBeGreaterThan(0);
      expect(firstSpot.country).toBeDefined();
      expect(typeof firstSpot.country).toBe('string');
      expect(firstSpot.country!.length).toBeGreaterThan(0);
    }, 30000);

    it('should search for spots by region and validate structure', async () => {
      // Use a search term that works reliably for both clients
      const searchResults = await client.searchSpots('USA');

      expect(searchResults).toBeDefined();
      expect(searchResults.spots).toBeDefined();
      expect(Array.isArray(searchResults.spots)).toBe(true);

      // Both clients should return results for USA
      expect(searchResults.spots.length).toBeGreaterThan(0);

      // Validate structure of all returned spots
      searchResults.spots.forEach((spot) => {
        expect(spot._id).toBeDefined();
        expect(typeof spot._id).toBe('string');
        expect(spot._id.length).toBeGreaterThan(0);
        expect(spot.name).toBeDefined();
        expect(typeof spot.name).toBe('string');
        expect(spot.name.length).toBeGreaterThan(0);
        expect(spot.location).toBeDefined();
        expect(spot.location.coordinates).toBeDefined();
        expect(Array.isArray(spot.location.coordinates)).toBe(true);
        expect(spot.location.coordinates.length).toBe(2);
        expect(typeof spot.location.coordinates[0]).toBe('number');
        expect(typeof spot.location.coordinates[1]).toBe('number');

        // Region and country should be present
        expect(spot.region).toBeDefined();
        expect(typeof spot.region).toBe('string');
        expect(spot.region!.length).toBeGreaterThan(0);
        expect(spot.country).toBeDefined();
        expect(typeof spot.country).toBe('string');
        expect(spot.country!.length).toBeGreaterThan(0);
      });
    }, 30000);

    it('should return empty results for non-existent spots', async () => {
      const searchResults = await client.searchSpots('NonExistentSpotXYZ123');

      expect(searchResults).toBeDefined();
      expect(searchResults.spots).toBeDefined();
      expect(Array.isArray(searchResults.spots)).toBe(true);
      expect(searchResults.spots.length).toBe(0);
    }, 30000);

    it('should handle case-insensitive searches', async () => {
      const searchResults1 = await client.searchSpots('pipeline');
      const searchResults2 = await client.searchSpots('PIPELINE');
      const searchResults3 = await client.searchSpots('Pipeline');

      expect(searchResults1).toBeDefined();
      expect(searchResults2).toBeDefined();
      expect(searchResults3).toBeDefined();

      // All searches should return results
      expect(searchResults1.spots.length).toBeGreaterThan(0);
      expect(searchResults2.spots.length).toBeGreaterThan(0);
      expect(searchResults3.spots.length).toBeGreaterThan(0);

      // For fake client, all should return the same Pipeline spot
      if (name === 'SurflineFakeClient') {
        expect(searchResults1.spots.length).toBe(1);
        expect(searchResults2.spots.length).toBe(1);
        expect(searchResults3.spots.length).toBe(1);

        expect(searchResults1.spots[0]._id).toBe(searchResults2.spots[0]._id);
        expect(searchResults2.spots[0]._id).toBe(searchResults3.spots[0]._id);
        expect(searchResults1.spots[0].name).toBe('Pipeline');
      }

      // Validate that all results contain Pipeline in the name (case-insensitive)
      [searchResults1, searchResults2, searchResults3].forEach((result) => {
        result.spots.forEach((spot) => {
          expect(spot.name.toLowerCase()).toContain('pipeline');
        });
      });
    }, 30000);

    it('should throw error for empty search query', async () => {
      await expect(client.searchSpots('')).rejects.toThrow(
        'Search query cannot be empty',
      );
      await expect(client.searchSpots('   ')).rejects.toThrow(
        'Search query cannot be empty',
      );
    }, 30000);

    it('should search by country and return relevant results', async () => {
      const searchResults = await client.searchSpots('USA');

      expect(searchResults).toBeDefined();
      expect(searchResults.spots).toBeDefined();
      expect(Array.isArray(searchResults.spots)).toBe(true);

      // Both clients should return results for USA
      expect(searchResults.spots.length).toBeGreaterThan(0);

      // For fake client, we expect USA spots (Malibu, Pipeline)
      if (name === 'SurflineFakeClient') {
        expect(searchResults.spots.length).toBeGreaterThanOrEqual(2);

        // Verify all results are in USA
        searchResults.spots.forEach((spot) => {
          expect(spot.country?.toLowerCase()).toContain('usa');
        });
      }

      // Validate structure of all returned spots
      searchResults.spots.forEach((spot) => {
        expect(spot._id).toBeDefined();
        expect(typeof spot._id).toBe('string');
        expect(spot._id.length).toBeGreaterThan(0);
        expect(spot.name).toBeDefined();
        expect(typeof spot.name).toBe('string');
        expect(spot.name.length).toBeGreaterThan(0);
        expect(spot.location).toBeDefined();
        expect(spot.location.coordinates).toBeDefined();
        expect(Array.isArray(spot.location.coordinates)).toBe(true);
        expect(spot.location.coordinates.length).toBe(2);
        expect(typeof spot.location.coordinates[0]).toBe('number');
        expect(typeof spot.location.coordinates[1]).toBe('number');

        // Region and country should be present
        expect(spot.region).toBeDefined();
        expect(typeof spot.region).toBe('string');
        expect(spot.region!.length).toBeGreaterThan(0);
        expect(spot.country).toBeDefined();
        expect(typeof spot.country).toBe('string');
        expect(spot.country!.length).toBeGreaterThan(0);
      });
    }, 30000);

    it('should validate specific known spot search results', async () => {
      // Test for Great Western specifically - both clients should return this spot
      const searchResults = await client.searchSpots('Great Western');

      expect(searchResults.spots.length).toBeGreaterThan(0);
      const greatWestern = searchResults.spots[0];

      // Both clients should return Great Western with consistent data
      expect(greatWestern._id).toBe('584204214e65fad6a7709cef');
      expect(greatWestern.name).toBe('Great Western');
      expect(greatWestern.region).toBe('Cornwall');
      expect(greatWestern.country).toBe('United Kingdom');

      // Validate coordinates structure
      expect(greatWestern.location.coordinates).toBeDefined();
      expect(Array.isArray(greatWestern.location.coordinates)).toBe(true);
      expect(greatWestern.location.coordinates.length).toBe(2);
      expect(typeof greatWestern.location.coordinates[0]).toBe('number');
      expect(typeof greatWestern.location.coordinates[1]).toBe('number');
    }, 30000);
  });
});
