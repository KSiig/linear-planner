// Visual harness viewport definitions. SII-124 ships `web`; SII-125 adds
// `ipad`, `iphone-13-pro`, and `galaxy-a52s`.
//
// Numbers here are part of the milestone contract — do not change them
// without re-running the visual diff and updating the baseline.

const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';

export const WEB = Object.freeze({
  name: 'web',
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
  isMobile: false,
  userAgent: null,
});

export const IPAD = Object.freeze({
  name: 'ipad',
  width: 820,
  height: 1180,
  deviceScaleFactor: 2,
  isMobile: true,
  userAgent: MOBILE_UA,
});

export const IPHONE_13_PRO = Object.freeze({
  name: 'iphone-13-pro',
  width: 390,
  height: 844,
  deviceScaleFactor: 3,
  isMobile: true,
  userAgent: MOBILE_UA,
});

export const GALAXY_A52S = Object.freeze({
  name: 'galaxy-a52s',
  width: 412,
  height: 915,
  deviceScaleFactor: 2.625,
  isMobile: true,
  userAgent: MOBILE_UA,
});

export const VIEWPORTS = Object.freeze([WEB, IPAD, IPHONE_13_PRO, GALAXY_A52S]);

export function findViewport(name) {
  const match = VIEWPORTS.find((vp) => vp.name === name);
  if (!match) {
    throw new Error(`unknown viewport: ${name}`);
  }
  return match;
}
