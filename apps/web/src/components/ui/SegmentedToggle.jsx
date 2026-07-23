import "./ui.css";

/**
 * Accessible segmented control for mutually-exclusive options (e.g. day/week,
 * task status). Expresses the selected-state coloring that the plain Button
 * cannot. Options: [{ value, label, icon? }].
 */
function SegmentedToggle({ value, onChange, options = [], ariaLabel = "" }) {
  return (
    <div className="ui-segmented" role="tablist" aria-label={ariaLabel || undefined}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            className={`ui-segmented__item${active ? " is-active" : ""}`}
            onClick={() => onChange(opt.value)}
          >
            {opt.icon ? <span className="ui-segmented__icon">{opt.icon}</span> : null}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export default SegmentedToggle;
