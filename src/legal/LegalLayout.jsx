export default function LegalLayout({ eyebrow, title, children, onBack }) {
  return (
    <main className="legal-page">
      <button className="back-button" onClick={onBack}>← BACK TO MYSTUDENTBULLETIN</button>
      <article>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="legal-updated">Last updated: July 1, 2026</p>
        {children}
        <p className="legal-contact">Questions or requests: <a href="mailto:support@mystudentbulletin.ca">support@mystudentbulletin.ca</a></p>
      </article>
    </main>
  )
}
