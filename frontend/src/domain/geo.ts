import type { LatLng } from './types';

const EARTH_RADIUS_M = 6_371_000;

export function distanceM(a: LatLng, b: LatLng): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** A Google Maps directions link with the day's stops as waypoints. */
export function googleMapsDirectionsUrl(origin: LatLng, waypoints: LatLng[], destination: LatLng): string {
  const point = (p: LatLng) => `${p.lat},${p.lng}`;
  const params = new URLSearchParams({
    api: '1',
    origin: point(origin),
    destination: point(destination),
    travelmode: 'transit',
  });
  if (waypoints.length > 0) params.set('waypoints', waypoints.map(point).join('|'));
  return `https://www.google.com/maps/dir/?${params}`;
}
