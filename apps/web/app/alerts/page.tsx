import { AlertsBoard } from "../../components/AlertsBoard";
import Link from "next/link";

export default function AlertsPage() {
  return (
    <main id="content">
      <section className="page-hero">
        <div className="eyebrow hero-tag">ALERTS</div>
        <h1>Watch a level.<br /><span>Local only for now.</span></h1>
        <p>
          Price-above, price-below, and 24h-change rules live in this browser. Push notifications are a later slice —
          this page evaluates the current snapshot only. Informational research, not financial advice.
        </p>
      </section>
      <AlertsBoard />
      <p className="coverage-note muted">
        Holdings ledger / portfolio is coming in a later PR. Today: <Link href="/#watchlist">local watchlist</Link>,
        alerts, and <Link href="/compare">Compare</Link>. CoinVigil has no accounts and does not custody funds.
      </p>
    </main>
  );
}
