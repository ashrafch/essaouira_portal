import { ActionToolbar } from "../ui";

function FilterBar({ children }) {
  return (
    <ActionToolbar style={{ marginBottom: 12 }}>
      {children}
    </ActionToolbar>
  );
}

export default FilterBar;
