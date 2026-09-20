import { PageSkeleton } from "../../components/PageSkeleton";

export default function StatusLoading() {
  return <PageSkeleton title="status" rows={4} cards={6} />;
}
