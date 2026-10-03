import { Link } from "react-router-dom";

// Shared safe forbidden page (ui-spec s.2): rendered on cross-role route
// access. Never renders the other role's data — it renders no data at all.
export default function Forbidden() {
  return (
    <div>
      <h2 className="h4 mb-3">Forbidden</h2>
      <div className="alert alert-warning" role="alert">
        You do not have permission to view this page.
      </div>
      <Link className="btn btn-outline-success btn-sm" to="/">
        Back to home
      </Link>
    </div>
  );
}
