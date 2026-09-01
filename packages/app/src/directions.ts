import { Linking } from 'react-native';

/**
 * Hand off navigation to the platform maps app.
 *
 * We deliberately do NOT route in-app: drive times here are straight-line
 * placeholders (see drive.ts), so the honest answer to "how do I get there?"
 * is a real routing app. The universal Google Maps URL opens the Google Maps
 * app when installed and the browser otherwise, on both platforms — no API
 * key, no native module.
 *
 * Callers must only offer this when coordinates exist, and every pilot
 * coordinate is hand-approximated (`coordsApproximate`) — the destination pin
 * is hand-placed, not surveyed, and the UI says so next to the button.
 */
export function directionsUrl(dest: { lat: number; lng: number }): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lng}&travelmode=driving`;
}

export function openDirections(dest: { lat: number; lng: number }): void {
  // A failed open (no browser, no maps app) is not worth crashing over.
  Linking.openURL(directionsUrl(dest)).catch(() => {});
}
