import { CompareBoard } from "../../components/CompareBoard";
import { DemoRibbon } from "../../components/DemoRibbon";
import { getCompare } from "../../lib/api";

function firstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const ids = firstParam(query.ids) || "bitcoin,ethereum";
  const snapshot = await getCompare(ids);

  return (
    <main id="content">
      <DemoRibbon source={snapshot.source} lastLiveAt={snapshot.last_live_at} />
      <section className="page-hero">
        <div className="eyebrow hero-tag">COMPARE</div>
        <h1>Two or three assets, same snapshot.</h1>
        <p>
          Lightweight side-by-side from the CoinGecko-tracked universe. Missing coins stay blank —
          CoinVigil does not invent pairs or prices. Informational research only, not financial advice.
        </p>
      </section>
      <CompareBoard initial={snapshot} />
    </main>
  );
}
