import { ImageResponse } from "next/og";

// Preview image shown when the CareerOS link is shared (portfolio, social posts).
export const alt = "CareerOS — personal career intelligence";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: 96,
        background: "#0b0b0d",
        color: "#fafafa",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <svg width="72" height="72" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="8" fill="#fafafa" />
          <path
            d="M8.5 22 14 16l4 3.3L23.5 11"
            fill="none"
            stroke="#0b0b0d"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="23.5" cy="11" r="2.1" fill="#6366f1" />
        </svg>
        <span style={{ fontSize: 56, fontWeight: 700, letterSpacing: -1 }}>CareerOS</span>
      </div>
      <div style={{ marginTop: 40, fontSize: 40, lineHeight: 1.25, maxWidth: 900, color: "#d4d4d8" }}>
        Upload your CV. Find the right jobs. Know your fit before you apply.
      </div>
      <div style={{ marginTop: 28, fontSize: 26, color: "#8b8ff8" }}>
        Job discovery · Fit reports · Application analytics
      </div>
    </div>,
    size,
  );
}
