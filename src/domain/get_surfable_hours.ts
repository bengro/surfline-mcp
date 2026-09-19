import {
  Rating,
  Sunlight,
  RatingInfo,
  Wave,
  SurfData,
  SunlightResponse,
  Wind,
  WindResponse,
} from '../infrastructure/surfline_client/types';
import { SurflineClient } from '../infrastructure/surfline_client/surfline_client';
import { SurfableHour, SurfCriteria, DEFAULT_SURF_CRITERIA } from './types';

const RATING_ORDER: RatingInfo['key'][] = [
  'VERY_POOR',
  'POOR',
  'POOR_TO_FAIR',
  'FAIR',
  'GOOD',
  'VERY_GOOD',
];

export const getSurfableHours = async (
  spotIds: string[],
  client: SurflineClient,
  forDays: number = 7,
  now: number = Date.now() / 1000,
  criteria: SurfCriteria = DEFAULT_SURF_CRITERIA,
): Promise<SurfableHour[]> => {
  const surfableHours: SurfableHour[] = [];

  for (const spotId of spotIds) {
    const [ratingsResponse, sunlightResponse, surfResponse, windResponse] =
      await getAllSurfData(client, spotId, forDays);

    for (const hourlyRating of ratingsResponse.data.rating) {
      const timestamp = hourlyRating.timestamp;
      const sunlightForDay = findSunlightForTimestamp(
        timestamp,
        sunlightResponse,
      );

      if (hourlyRating.timestamp < now) {
        continue;
      }

      // Calculate the end time based on the number of days requested, not just the current day
      const endTime = now + forDays * 24 * 60 * 60; // forDays * seconds per day
      if (hourlyRating.timestamp >= endTime) {
        continue;
      }

      const surfData = surfResponse.data.surf.find(
        (w: SurfData) => w.timestamp === timestamp,
      );
      const wave = surfData?.surf;
      const utcOffset = surfData?.utcOffset;

      const windData = windResponse.data.wind.find(
        (w: Wind) => w.timestamp === timestamp,
      );

      if (
        wave &&
        windData &&
        isMinimumWaveHeight(wave, criteria.minWaveHeight) &&
        isMinimumRating(hourlyRating, criteria.minRating) &&
        sunlightForDay &&
        isSunlight(timestamp, sunlightForDay, utcOffset)
      ) {
        surfableHours.push({
          startTime: hourlyRating.timestamp,
          endTime: hourlyRating.timestamp + 3600,
          spotId,
          condition: hourlyRating.rating.key,
          waveHeight: wave.max,
          windSpeed: windData.speed,
          windDirection: windData.direction,
          windDirectionType: windData.directionType,
        });
      }
    }
  }

  return surfableHours;
};

const isMinimumRating = (
  rating: Rating,
  minRating: SurfCriteria['minRating'],
): boolean => {
  const ratingIndex = RATING_ORDER.indexOf(rating.rating.key);
  const minRatingIndex = RATING_ORDER.indexOf(minRating);
  return ratingIndex >= minRatingIndex;
};

const isSunlight = (
  timestamp: number,
  sunlightForDay: Sunlight,
  utcOffset?: number,
): boolean => {
  const startTime = timestamp;
  const endTime = timestamp + 3600;

  const sunrise =
    sunlightForDay.sunrise + sunlightForDay.sunsetUTCOffset * 3600;
  const sunset = sunlightForDay.sunset + sunlightForDay.sunsetUTCOffset * 3600;
  const withinApiSunlight = startTime >= sunrise && endTime <= sunset;

  return withinApiSunlight;
};

const isMinimumWaveHeight = (wave: Wave, minHeight: number): boolean => {
  return wave.max >= minHeight;
};

const findSunlightForTimestamp = (
  timestamp: number,
  sunlightResponse: SunlightResponse,
): Sunlight | undefined => {
  return sunlightResponse.data.sunlight.find((sunlight) => {
    return (
      timestamp >= sunlight.midnight && timestamp < sunlight.midnight + 86400
    );
  });
};

const getEndOfDay = (timestamp: number): number => {
  const date = new Date(timestamp * 1000);
  date.setHours(23, 59, 59, 999); // Set to end of day
  return Math.floor(date.getTime() / 1000);
};

const getAllSurfData = async (
  client: SurflineClient,
  spotId: string,
  days: number = 7,
): Promise<[any, any, any, WindResponse]> => {
  return await Promise.all([
    client.getRatings(spotId, days, 1),
    client.getSunlight(spotId, days),
    client.getSurf(spotId, days, 1),
    client.getWind(spotId, days, 1),
  ]);
};
