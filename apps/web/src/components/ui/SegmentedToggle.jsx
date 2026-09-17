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
            tabIndex={active ? 0 : -1}
            className={`ui-segmented__item${active ? " is-active" : ""}`}
            onClick={() => onChange(opt.value)}
            onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const index = options.findIndex(option => option.value === opt.value);
              const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1
                : (index + (event.key === "ArrowRight" ? 1 : -1) + options.length) % options.length;
              onChange(options[next].value);
              event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next]?.focus();
            }}
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
