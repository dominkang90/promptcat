import { describe, it, expect } from "vitest";
import { extractJson } from "../extract-json.js";

describe("extractJson", () => {
  it("순수 JSON은 그대로 돌려준다", () => {
    const s = '{"a":1}';
    expect(extractJson(s)).toBe('{"a":1}');
  });

  it("코드블럭(```json)을 벗겨낸다", () => {
    const s = '```json\n{"a":1}\n```';
    expect(JSON.parse(extractJson(s))).toEqual({ a: 1 });
  });

  it("앞뒤 군더더기 말이 있어도 JSON 덩어리만 뽑아낸다", () => {
    const s = '여기 결과야:\n{"a":1, "b":"x"}\n도움이 됐길!';
    expect(JSON.parse(extractJson(s))).toEqual({ a: 1, b: "x" });
  });
});
