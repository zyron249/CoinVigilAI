import { AskPanel } from "../../components/AskPanel";

export default function AskPage() {
  return (
    <main id="content">
      <section className="page-hero">
        <div className="eyebrow hero-tag">ASK COINVIGIL</div>
        <h1>Ask the snapshot.<br /><span>Tools supply the numbers.</span></h1>
        <p>
          You are interacting with AI. CoinVigil calls read-only market and news tools for prices, cap, and volume.
          Missing data stays blank. No price predictions, no trade execution. Informational only — not financial advice.
        </p>
      </section>
      <AskPanel />
    </main>
  );
}
