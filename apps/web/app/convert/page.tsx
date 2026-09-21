import { ConverterBoard } from "../../components/ConverterBoard";
import { getConvert } from "../../lib/api";

function firstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function ConvertPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const fromId = firstParam(query.from) || "bitcoin";
  const toId = firstParam(query.to) || "usd";
  const amount = Number(firstParam(query.amount) || "1") || 1;
  const initial = await getConvert(amount, fromId, toId);

  return (
    <main id="content">
      <section className="page-hero">
        <div className="eyebrow hero-tag">CONVERTER</div>
        <h1>Same snapshot quotes.<br /><span>No invented FX.</span></h1>
        <p>
          Crypto to USD and crypto to crypto using the CoinGecko-tracked snapshot. Demo or stale legs stay labeled.
          Not an exchange, not financial advice.
        </p>
      </section>
      <ConverterBoard initial={initial} />
    </main>
  );
}
