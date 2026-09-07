import { cookies } from "next/headers";
import gaps from "@/data/mirror_gaps.json";
import { COOKIE_NAME, verifySession } from "@/lib/auth";
import CustomsGap from "@/components/CustomsGap";
import TopBar from "@/components/TopBar";
import Footer from "@/components/Footer";

// The mirror dataset is bundled at build time, so the page renders without a
// data fetch. Swap the JSON in /data (or point these imports at a live source)
// to refresh, or re-run pipeline/build_mirror.py over new Comtrade bulk files.
export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await verifySession((await cookies()).get(COOKIE_NAME)?.value);

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar user={session?.u} generated={gaps.meta?.generated} />
      <main className="flex-1">
        <CustomsGap gaps={gaps} />
      </main>
      <Footer meta={gaps.meta} />
    </div>
  );
}
