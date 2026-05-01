import { test, expect } from "@playwright/test";
import { getJwtExp } from "../src/lib/auth";

test("getJwtExp: 不正なトークンは null を返す", () => {
  expect(getJwtExp("x.y.z")).toBeNull();
});

test("getJwtExp: パーツ不足のトークンは null を返す", () => {
  expect(getJwtExp("onlyonepart")).toBeNull();
});

test("getJwtExp: 有効な JWT から exp を取得できる", () => {
  const payload = { sub: "user1", exp: 1234567890 };
  const encoded = btoa(JSON.stringify(payload)).replace(/=/g, "");
  const token = `header.${encoded}.signature`;
  expect(getJwtExp(token)).toBe(1234567890);
});

test("getJwtExp: exp が数値でない場合は null を返す", () => {
  const payload = { sub: "user1", exp: "not-a-number" };
  const encoded = btoa(JSON.stringify(payload)).replace(/=/g, "");
  const token = `header.${encoded}.signature`;
  expect(getJwtExp(token)).toBeNull();
});
