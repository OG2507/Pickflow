export default function Footer() {
  return (
    <footer className="pf-footer">
      <div className="pf-footer-inner">
        <span className="pf-footer-version">v1.15</span>
        <span className="pf-footer-copy">
          &copy; {new Date().getFullYear()} Oceanus Group Ltd. All rights reserved.
        </span>
      </div>
    </footer>
  )
}
