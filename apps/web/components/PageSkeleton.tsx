export function PageSkeleton({
  title,
  rows = 8,
  cards = 6,
}: {
  title: string;
  rows?: number;
  cards?: number;
}) {
  return (
    <main id="content" className="skeleton-page" aria-busy="true" aria-live="polite">
      <p className="sr-only">Loading {title}</p>
      <section className="skeleton-hero">
        <div className="skeleton skeleton-chip" />
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-copy" />
      </section>
      <section className="skeleton-cards" aria-hidden="true">
        {Array.from({ length: cards }, (_, index) => (
          <div className="skeleton skeleton-card" key={`card-${index}`} />
        ))}
      </section>
      <section className="card table-card" aria-hidden="true">
        <div className="skeleton-rows">
          {Array.from({ length: rows }, (_, index) => (
            <div className="skeleton skeleton-row" key={`row-${index}`} />
          ))}
        </div>
      </section>
    </main>
  );
}
