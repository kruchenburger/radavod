/** WCAG 2.1 contrast ratio. */
export function contrast(a: string, b: string): number {
  const [dark = 0, light = 0] = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (light + 0.05) / (dark + 0.05);
}

export const visions = {
  normal: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  // Machado, Oliveira and Fernandes 2009, full severity, in linear light.
  protan: [
    0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998,
  ],
  deutan: [
    0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881,
  ],
  tritan: [
    1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039,
  ],
} as const;

/** Distance in OKLab, times 100, as a person with this vision sees the two colours. */
export function distance(a: string, b: string, vision: keyof typeof visions): number {
  const [x, y] = [a, b].map((color) => oklab(color, visions[vision]));
  return 100 * Math.hypot(...[0, 1, 2].map((i) => (x?.[i] ?? 0) - (y?.[i] ?? 0)));
}

function oklab(color: string, matrix: readonly number[]): number[] {
  const seen = times(matrix, linear(color)).map((value) => Math.max(0, value));
  const lms = times(
    [
      0.4122214708, 0.5363325363, 0.0514459929, 0.2119034982, 0.6806995451, 0.1073969566,
      0.0883024619, 0.2817188376, 0.6299787005,
    ],
    seen,
  );
  return times(
    [
      0.2104542553, 0.793617785, -0.0040720468, 1.9779984951, -2.428592205, 0.4505937099,
      0.0259040371, 0.7827717662, -0.808675766,
    ],
    lms.map(Math.cbrt),
  );
}

function times(matrix: readonly number[], vector: number[]): number[] {
  return [0, 3, 6].map((row) =>
    vector.reduce((sum, value, i) => sum + (matrix[row + i] ?? 0) * value, 0),
  );
}

function luminance(color: string): number {
  const [r = 0, g = 0, b = 0] = linear(color);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function linear(color: string): number[] {
  return [1, 3, 5].map((i) => {
    const value = parseInt(color.slice(i, i + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
}
