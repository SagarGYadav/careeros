"use client";

// Last-resort boundary for errors in the root layout itself. It replaces the whole document, so it renders its own
// <html> and <body> and avoids depending on app components or styles that may be what failed.
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh" }}>
        <main style={{ textAlign: "center", maxWidth: 420, padding: 24 }}>
          <h1 style={{ fontSize: 18, fontWeight: 600 }}>CareerOS couldn&apos;t load.</h1>
          <p style={{ color: "#666", fontSize: 14 }}>Your data is safe. Please try again.</p>
          {error.digest && (
            <p style={{ color: "#888", fontSize: 12, fontFamily: "monospace" }}>Reference: {error.digest}</p>
          )}
          <button onClick={() => retry()} style={{ marginTop: 12, padding: "6px 14px", cursor: "pointer" }}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
