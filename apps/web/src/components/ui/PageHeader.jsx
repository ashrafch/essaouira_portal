import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import "./ui.css";

/**
 * Page-level header: title + subtitle + right-actions slot + optional
 * breadcrumb. Intended to replace ad-hoc SectionHeader usage in pages
 * going forward (SectionHeader keeps working for existing call sites).
 *
 * Props:
 * - title: node (required)
 * - subtitle: node
 * - actions: node — rendered in the top-right slot (buttons, filters...)
 * - breadcrumb: Array<{ label: string, href?: string }>
 */
function PageHeader({ title, subtitle = "", actions = null, breadcrumb = [] }) {
  return (
    <div className="ui-page-header">
      {breadcrumb.length > 0 ? (
        <nav className="ui-breadcrumb" aria-label="Breadcrumb">
          {breadcrumb.map((crumb, index) => (
            <span key={`${crumb.label}-${index}`} className="ui-breadcrumb-item">
              {crumb.href ? <Link to={crumb.href}>{crumb.label}</Link> : <span>{crumb.label}</span>}
              {index < breadcrumb.length - 1 ? <ChevronRight size={12} aria-hidden="true" /> : null}
            </span>
          ))}
        </nav>
      ) : null}
      <div className="ui-page-header-row">
        <div className="ui-page-header-text">
          <h1 className="ui-page-header-title">{title}</h1>
          {subtitle ? <p className="ui-page-header-subtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="ui-page-header-actions">{actions}</div> : null}
      </div>
    </div>
  );
}

export default PageHeader;
