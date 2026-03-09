import "./ui.css";

function SectionHeader({ title, subtitle = "", right = null }) {
  return (
    <div className="ui-section-header">
      <div>
        <h2 className="ui-title">{title}</h2>
        {subtitle ? <p className="ui-subtitle">{subtitle}</p> : null}
      </div>
      {right}
    </div>
  );
}

export default SectionHeader;
