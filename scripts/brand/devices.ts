/**
 * Portrait CSS sizes of iPhones used for apple-touch-startup-image.
 * NOTE: compiled from general knowledge of Apple's device specifications and NOT re-checked
 * against Apple's current page during implementation (see docs/KNOWN_LIMITATIONS.md).
 * A device without a matching image falls back to the plain background colour.
 */
export interface Device {
  name: string;
  cssWidth: number;
  cssHeight: number;
  dpr: number;
}

export const DEVICES: readonly Device[] = [
  { name: 'iphone-16-pro-max', cssWidth: 440, cssHeight: 956, dpr: 3 },
  { name: 'iphone-16-pro', cssWidth: 402, cssHeight: 874, dpr: 3 },
  { name: 'iphone-14-pro-max', cssWidth: 430, cssHeight: 932, dpr: 3 },
  { name: 'iphone-15', cssWidth: 393, cssHeight: 852, dpr: 3 },
  { name: 'iphone-13', cssWidth: 390, cssHeight: 844, dpr: 3 },
  { name: 'iphone-11-pro-max', cssWidth: 414, cssHeight: 896, dpr: 3 },
  { name: 'iphone-11', cssWidth: 414, cssHeight: 896, dpr: 2 },
  { name: 'iphone-13-mini', cssWidth: 375, cssHeight: 812, dpr: 3 },
  { name: 'iphone-se', cssWidth: 375, cssHeight: 667, dpr: 2 },
  { name: 'iphone-8-plus', cssWidth: 414, cssHeight: 736, dpr: 3 },
];
