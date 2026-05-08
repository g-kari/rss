import { test, expect } from "@playwright/test";
import { isBetaAllowed } from "../src/lib/beta-allowed";

const ORIGINAL = process.env.BETA_ALLOWED_SUBS;

test.afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.BETA_ALLOWED_SUBS;
  else process.env.BETA_ALLOWED_SUBS = ORIGINAL;
});

test("BETA_ALLOWED_SUBS 未設定なら全 sub を許可する", () => {
  delete process.env.BETA_ALLOWED_SUBS;
  expect(isBetaAllowed("any-sub-value")).toBe(true);
});

test("BETA_ALLOWED_SUBS が空文字なら全 sub を許可する", () => {
  process.env.BETA_ALLOWED_SUBS = "   ";
  expect(isBetaAllowed("any-sub-value")).toBe(true);
});

test("BETA_ALLOWED_SUBS に含まれる sub を許可する", () => {
  process.env.BETA_ALLOWED_SUBS = "sub-a,sub-b,sub-c";
  expect(isBetaAllowed("sub-b")).toBe(true);
});

test("BETA_ALLOWED_SUBS のカンマ区切り要素は trim される", () => {
  process.env.BETA_ALLOWED_SUBS = " sub-a , sub-b , sub-c ";
  expect(isBetaAllowed("sub-b")).toBe(true);
});

test("BETA_ALLOWED_SUBS に含まれない sub を拒否する", () => {
  process.env.BETA_ALLOWED_SUBS = "sub-a,sub-b";
  expect(isBetaAllowed("sub-c")).toBe(false);
});

test("拒否時に sub の prefix と length を console.warn でログ出力する", () => {
  process.env.BETA_ALLOWED_SUBS = "allowed-sub";
  const calls: { msg: string; data: { subPrefix: string; subLength: number } }[] = [];
  const originalWarn = console.warn;
  console.warn = (msg: string, data: { subPrefix: string; subLength: number }) =>
    calls.push({ msg, data });
  try {
    expect(isBetaAllowed("denied-sub-with-some-content")).toBe(false);
  } finally {
    console.warn = originalWarn;
  }
  expect(calls).toHaveLength(1);
  expect(calls[0].msg).toBe("[auth/beta] sub denied by BETA_ALLOWED_SUBS");
  expect(calls[0].data.subPrefix).toBe("denied-sub-with-");
  expect(calls[0].data.subLength).toBe("denied-sub-with-some-content".length);
});

test("許可時にはログを出さない", () => {
  process.env.BETA_ALLOWED_SUBS = "allowed-sub";
  let warnCalls = 0;
  const originalWarn = console.warn;
  console.warn = () => warnCalls++;
  try {
    expect(isBetaAllowed("allowed-sub")).toBe(true);
  } finally {
    console.warn = originalWarn;
  }
  expect(warnCalls).toBe(0);
});
