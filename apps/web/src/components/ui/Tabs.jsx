import { useId, useRef, useState } from "react";
import { cn } from "./utils";
import "./ui.css";

/**
 * Accessible tabs (role=tablist/tab/tabpanel) with arrow-key navigation
 * (Left/Right, Up/Down, Home/End) and roving tabindex.
 *
 * Props:
 * - items: Array<{ value: string, label: node, content: node, icon?: Component, disabled?: bool }>
 * - defaultValue: initial selected value (uncontrolled)
 * - value / onValueChange: controlled mode
 */
function Tabs({ items = [], defaultValue = null, value: controlledValue, onValueChange, className = "" }) {
  const baseId = useId();
  const [internalValue, setInternalValue] = useState(defaultValue ?? items[0]?.value ?? null);
  const isControlled = controlledValue !== undefined;
  const value = isControlled ? controlledValue : internalValue;
  const tabRefs = useRef([]);

  function selectTab(nextValue) {
    if (onValueChange) onValueChange(nextValue);
    if (!isControlled) setInternalValue(nextValue);
  }

  function handleKeyDown(event, index) {
    const lastIndex = items.length - 1;
    let nextIndex = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = index === lastIndex ? 0 : index + 1;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = index === 0 ? lastIndex : index - 1;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = lastIndex;
    }
    if (nextIndex === null) return;
    event.preventDefault();
    const nextItem = items[nextIndex];
    selectTab(nextItem.value);
    tabRefs.current[nextIndex]?.focus();
  }

  return (
    <div className={cn("ui-tabs", className)}>
      <div className="ui-tablist" role="tablist">
        {items.map((item, index) => {
          const selected = item.value === value;
          const Icon = item.icon;
          return (
            <button
              key={item.value}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${item.value}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${item.value}`}
              tabIndex={selected ? 0 : -1}
              className={cn("ui-tab", selected && "is-active")}
              onClick={() => selectTab(item.value)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              disabled={item.disabled}
            >
              {Icon ? <Icon size={14} aria-hidden="true" /> : null}
              {item.label}
            </button>
          );
        })}
      </div>
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <div
            key={item.value}
            role="tabpanel"
            id={`${baseId}-panel-${item.value}`}
            aria-labelledby={`${baseId}-tab-${item.value}`}
            hidden={!selected}
            className="ui-tabpanel"
          >
            {selected ? item.content : null}
          </div>
        );
      })}
    </div>
  );
}

export default Tabs;
