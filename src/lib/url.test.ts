import { describe, it, expect } from "vitest";
import { isAbsoluteHttpUrl } from "./url";

describe("isAbsoluteHttpUrl", () => {
  it("http URL は true", () => expect(isAbsoluteHttpUrl("http://example.com")).toBe(true));
  it("https URL は true", () => expect(isAbsoluteHttpUrl("https://example.com/foo")).toBe(true));
  it("相対 URL は false", () => expect(isAbsoluteHttpUrl("/path/to/image.jpg")).toBe(false));
  it("ftp は false", () => expect(isAbsoluteHttpUrl("ftp://example.com")).toBe(false));
  it("HTTP 大文字は true", () => expect(isAbsoluteHttpUrl("HTTP://EXAMPLE.COM")).toBe(true));
});
