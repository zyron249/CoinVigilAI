import { PageSkeleton } from "../components/PageSkeleton";

export default function MarketsLoading() {
  return <PageSkeleton title="markets" rows={10} cards={6} />;
}
