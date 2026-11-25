import { expect, test } from "./page.ts";

// How smoothly the map of 300 people moves. It tells and does not judge: a machine of CI is shared
// and has no graphics card.

const start = "p67";
const places = [
  ["far", `/sample/branches?person=${start}`],
  ["closer", `/sample/branches?level=closer&person=${start}`],
  ["near", `/sample/branches?level=near&person=${start}`],
] as const;

type Frames = { frames: number; median: number; p95: number; worst: number; over20: number };

for (const [level, path] of places) {
  test(`frames of panning the map, ${level}`, async ({ page }, info) => {
    await page.goto(path);
    const map = page.locator(`[data-level=${level}]`);
    await expect(map).toBeVisible();
    await page.waitForTimeout(500);
    const box = await map.boundingBox();
    if (box === null) throw new Error("no map");
    const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];

    await page.evaluate(`
      window.frames13 = [];
      let last = performance.now();
      const tick = (now) => {
        window.frames13.push(now - last);
        last = now;
        window.framesId = requestAnimationFrame(tick);
      };
      window.framesId = requestAnimationFrame(tick);
    `);
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 0; i < 120; i += 1) {
      await page.mouse.move(x - 130 * Math.sin(i / 9), y - 90 * Math.sin(i / 5));
    }
    await page.mouse.up();
    const times = await page.evaluate<number[]>(
      "cancelAnimationFrame(window.framesId), window.frames13.slice(2)",
    );

    const sorted = times.toSorted((a, b) => a - b);
    const at = (share: number): number =>
      Math.round((sorted[Math.floor((sorted.length - 1) * share)] ?? 0) * 10) / 10;
    const result: Frames = {
      frames: sorted.length,
      median: at(0.5),
      p95: at(0.95),
      worst: at(1),
      over20: sorted.filter((time) => time > 20).length,
    };
    const text = `frames of panning, ${info.project.name}, ${level}: ${JSON.stringify(result)}`;
    console.log(text);
    info.annotations.push({ type: "frames", description: text });
    expect(result.frames, "frames seen").toBeGreaterThan(10);
  });
}
