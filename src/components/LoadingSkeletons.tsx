export function ResultSkeletons({ count = 5 }: { count?: number }) {
  return (
    <div className="results-list" aria-label="Loading results…">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="result-card" aria-hidden>
          <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
            <div className="skeleton" style={{ width: 14, height: 14, borderRadius: "50%" }} />
            <div className="skeleton" style={{ width: 90, height: 14 }} />
            <div className="skeleton" style={{ width: 60, height: 14, borderRadius: 99 }} />
          </div>
          <div className="skeleton" style={{ width: "75%", height: 20, marginBottom: 6 }} />
          <div className="skeleton" style={{ width: "50%", height: 12, marginBottom: 8 }} />
          <div className="skeleton" style={{ width: "100%", height: 14, marginBottom: 4 }} />
          <div className="skeleton" style={{ width: "90%", height: 14, marginBottom: 4 }} />
          <div className="skeleton" style={{ width: "60%", height: 14 }} />
        </div>
      ))}
    </div>
  );
}
