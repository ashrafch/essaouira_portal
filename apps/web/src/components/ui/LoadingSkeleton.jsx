import "./ui.css";

function LoadingSkeleton({ rows = 3, height = 14 }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={`sk-${index}`} className="ui-skeleton" style={{ height }} />
      ))}
    </div>
  );
}

export default LoadingSkeleton;
