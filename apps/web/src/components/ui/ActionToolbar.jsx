import "./ui.css";

function ActionToolbar({ children, style = {} }) {
  return (
    <div className="ui-toolbar" style={style}>
      {children}
    </div>
  );
}

export default ActionToolbar;
