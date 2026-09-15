import { ActionSheetIOS, Linking, Platform } from 'react-native';

/**
 * Hand off navigation to the platform maps app.
 *
 * We deliberately do NOT route in-app: drive times here are straight-line
 * placeholders (see drive.ts), so the honest answer to "how do I get there?"
 * is a real routing app. No API key, no native module.
 *
 * Callers must only offer this when coordinates exist, and every pilot
 * coordinate is hand-approximated (`coordsApproximate`) — the destination pin
 * is hand-placed, not surveyed, and the UI says so next to the button.
 */
type Dest = { lat: number; lng: number };

interface MapsApp {
  readonly label: string;
  /** Scheme probed with `canOpenURL`; must be listed in `LSApplicationQueriesSchemes` (app.json). */
  readonly probe?: string;
  readonly url: (d: Dest) => string;
}

/**
 * iOS: Apple Maps is always installed, so it always leads. Google Maps and
 * Waze join the list only when their apps are actually on the phone. The
 * universal Google URL used to be the only option, and without the Google Maps
 * app it opened a web page in Safari, which is not a navigation app.
 */
const IOS_APPS: readonly MapsApp[] = [
  { label: 'Apple Maps', url: (d) => `https://maps.apple.com/?daddr=${d.lat},${d.lng}&dirflg=d` },
  {
    label: 'Google Maps',
    probe: 'comgooglemaps://',
    url: (d) => `comgooglemaps://?daddr=${d.lat},${d.lng}&directionsmode=driving`,
  },
  { label: 'Waze', probe: 'waze://', url: (d) => `waze://?ll=${d.lat},${d.lng}&navigate=yes` },
];

/** Android and web: opens the Google Maps app when installed, the browser otherwise. */
export function directionsUrl(dest: Dest): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lng}&travelmode=driving`;
}

// A failed open (no browser, no maps app) is not worth crashing over.
function open(url: string): void {
  Linking.openURL(url).catch(() => {});
}

export function openDirections(dest: Dest): void {
  if (Platform.OS !== 'ios') {
    open(directionsUrl(dest));
    return;
  }
  void Promise.all(
    IOS_APPS.map((app) =>
      app.probe ? Linking.canOpenURL(app.probe).catch(() => false) : Promise.resolve(true),
    ),
  ).then((installed) => {
    const apps = IOS_APPS.filter((_, i) => installed[i]);
    // One choice is not a choice — skip the sheet.
    const [only] = apps;
    if (apps.length === 1 && only) {
      open(only.url(dest));
      return;
    }
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: 'Get directions with',
        options: [...apps.map((a) => a.label), 'Cancel'],
        cancelButtonIndex: apps.length,
      },
      (i) => {
        const app = apps[i]; // undefined for Cancel
        if (app) open(app.url(dest));
      },
    );
  });
}
