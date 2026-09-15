import Link from "next/link";
import { TokenStudio } from "../../components/TokenStudio";

export default function TokenStudioPage() {
  return (
    <main>
      <nav>
        <Link className="brand" href="/"><span className="brand-mark">V</span> CoinVigil <b>AI</b></Link>
        <div className="nav-links">
          <Link href="/">Markets</Link>
          <span>Token Studio</span>
        </div>
        <Link className="nav-cta" href="/">Open Markets</Link>
      </nav>

      <section className="studio-hero">
        <div className="eyebrow hero-tag">NON-CUSTODIAL TOKEN LAUNCHPAD</div>
        <h1>Create on-chain.<br /><span>Keep control.</span></h1>
        <p>
          Configure a standard token, connect your own wallet, review the permissions and sign the deployment yourself.
          CoinVigil never receives a seed phrase or private key.
        </p>
      </section>

      <TokenStudio />

      <section className="studio-roadmap card">
        <div>
          <div className="eyebrow">SUPPORTED ARCHITECTURE</div>
          <h2>One studio, multiple chains</h2>
        </div>
        <div className="chain-chips">
          <span>Ethereum</span><span>Base</span><span>BNB Chain</span><span>Polygon</span><span>Arbitrum</span>
          <span className="muted-chip">Solana adapter next</span>
        </div>
      </section>

      <footer>
        <div>CoinVigil Token Studio · Smart contracts should be independently audited before production use.</div>
        <div>v0.3.0</div>
      </footer>
    </main>
  );
}
