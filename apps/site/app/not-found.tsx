import "./styles/boundary.css";

export default function SiteNotFound() {
  return (
    <main className="boundary-page">
      <section aria-labelledby="site-not-found-title" className="boundary-panel">
        <p className="boundary-eyebrow">Tab · 404</p>
        <h1 className="boundary-title" id="site-not-found-title">
          Page not found
        </h1>
        <p className="boundary-detail">The page you requested does not exist or has moved.</p>
        <div className="boundary-actions">
          <a className="boundary-link" href="/">
            Back to home
          </a>
        </div>
      </section>
    </main>
  );
}
