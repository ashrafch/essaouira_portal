import { Link } from "react-router-dom";

function NotFound() {
  return (
    <div>
      <h1>404</h1>
      <p>Pagina non trovata.</p>
      <Link to="/">Torna alla dashboard</Link>
    </div>
  );
}

export default NotFound;

