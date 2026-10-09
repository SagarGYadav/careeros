import { describe, expect, it } from "vitest";
import {
  firstName,
  formatDate,
  formatLpa,
  formatMoney,
  formatNumber,
  formatPercent,
  formatRelative,
  formatSalaryRange,
  initials,
} from "@/lib/format";

describe("names", () => {
  it("builds initials from first and last name", () => {
    expect(initials("Asha Rao")).toBe("AR");
    expect(initials("asha")).toBe("A");
    expect(initials("  Asha  K  Rao ")).toBe("AR");
    expect(initials("")).toBe("?");
  });

  it("takes the first name", () => {
    expect(firstName("Asha Rao")).toBe("Asha");
    expect(firstName(" Asha ")).toBe("Asha");
  });
});

describe("numbers and money", () => {
  it("uses Indian digit grouping", () => {
    expect(formatNumber(1200000)).toBe("12,00,000");
    expect(formatMoney(1200000)).toBe("₹12,00,000");
  });

  it("formats other currencies with western grouping", () => {
    expect(formatMoney(90000, "USD")).toBe("$90,000");
  });

  it("formats LPA without trailing .0", () => {
    expect(formatLpa(1200000)).toBe("12 LPA");
    expect(formatLpa(1250000)).toBe("12.5 LPA");
    expect(formatLpa(1234567)).toBe("12.3 LPA");
  });

  it("formats salary ranges", () => {
    expect(formatSalaryRange(800000, 1200000)).toBe("8–12 LPA");
    expect(formatSalaryRange(1000000, 1000000)).toBe("10 LPA");
    expect(formatSalaryRange(800000, null)).toBe("8 LPA+");
    expect(formatSalaryRange(null, 1200000)).toBe("Up to 12 LPA");
    expect(formatSalaryRange(null, null)).toBe("Not disclosed");
    expect(formatSalaryRange(90000, 120000, "USD")).toBe("$90K–$120K");
  });

  it("formats rates as percentages", () => {
    expect(formatPercent(0.2642)).toBe("26.4%");
    expect(formatPercent(0.5, 0)).toBe("50%");
  });
});

describe("dates", () => {
  it("formats a date as day month year", () => {
    expect(formatDate("2026-10-09T12:00:00Z")).toBe("9 Oct 2026");
  });

  it("formats relative times against a fixed now", () => {
    const now = new Date("2026-10-09T12:00:00Z");
    expect(formatRelative("2026-10-06T12:00:00Z", now)).toBe("3 days ago");
    expect(formatRelative("2026-10-08T12:00:00Z", now)).toBe("yesterday");
    expect(formatRelative("2026-10-09T14:00:00Z", now)).toBe("in 2 hours");
    expect(formatRelative("2026-10-09T11:59:30Z", now)).toBe("just now");
  });
});
