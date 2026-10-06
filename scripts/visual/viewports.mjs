// Visual harness viewport definitions. The `web` viewport is the contract
// for SII-124 (landing-page sign-in capture). SII-125 adds `ipad`,
// `iphone-13-pro`, and `galaxy-a52s` to this same file.
//
// Numbers here are part of the milestone contract — do not change them
// without re-running the visual diff and updating the baseline.

export const WEB = Object.freeze({
  name: 'web',
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
  isMobile: false,
  userAgent: null,
});

export const VIEWPORTS = Object.freeze([WEB]);

export function findViewport(name) {
  const match = VIEWPORTS.find((vp) => vp.name === name);
  if (!match) {
    throw new Error(`unknown viewport: ${name}`);
  }
  return match;
}
