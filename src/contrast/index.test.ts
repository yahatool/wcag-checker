import assert from "node:assert/strict";
import test from "node:test";
import { composite, contrastRatio, parseColor, rgbCss } from "./index.ts";
import { criteriaFor } from "../criteria/index.ts";

const white = { r: 255, g: 255, b: 255, a: 1 };
const black = { r: 0, g: 0, b: 0, a: 1 };

test("contrast endpoints and same color", () => {
  assert.equal(contrastRatio(black, white), 21);
  assert.equal(contrastRatio(white, white), 1);
});

test("alpha compositing against a solid background", () => {
  const halfBlack = parseColor("rgba(0, 0, 0, 0.5)");
  assert.ok(halfBlack);
  assert.deepEqual(composite(halfBlack, white), { r: 127.5, g: 127.5, b: 127.5, a: 1 });
  assert.ok(contrastRatio(composite(halfBlack, white), white) > 3.9);
  assert.equal(rgbCss(composite(halfBlack, white)), "rgb(127.5, 127.5, 127.5)");
  assert.equal(parseColor("not-a-color"), null);
});

test("minimum, enhanced, and A criteria", () => {
  assert.deepEqual(criteriaFor({ version: "2.2", level: "A" }), []);
  assert.deepEqual(criteriaFor({ version: "2.0", level: "AA" }).map((item) => item.id), ["1.4.3"]);
  assert.deepEqual(criteriaFor({ version: "2.1", level: "AAA" }).map((item) => item.id), ["1.4.3", "1.4.6"]);
  const ratio = 4.5;
  assert.equal(ratio < criteriaFor({ version: "2.2", level: "AA" })[0].normal, false);
  assert.equal(ratio < criteriaFor({ version: "2.2", level: "AAA" })[1].normal, true);
  const gray = (channel: number) => ({ r: channel, g: channel, b: channel, a: 1 });
  assert.ok(contrastRatio(gray(119), white) < 4.5);
  assert.ok(contrastRatio(gray(118), white) >= 4.5);
  assert.ok(contrastRatio(gray(153), white) < 3);
  assert.ok(contrastRatio(gray(102), white) >= 4.5 && contrastRatio(gray(102), white) < 7);
});
