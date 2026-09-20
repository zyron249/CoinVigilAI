import Link from "next/link";

export default function NotFound() {
  return (
    <main id="content">
      <section className="studio-hero">
        <div className="eyebrow hero-tag">ASSET NOT FOUND</div>
        <h1>This market is not in the current snapshot.</h1>
        <p>
          CoinVigil only lists coins returned by CoinGecko or the labeled demo universe.
          Missing pages are not filled with invented prices.
        </p>
        <Link className="nav-cta" href="/">Back to markets</Link>
      </section>
    </main>
  );
}
