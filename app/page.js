import { cookies } from "next/headers";
import gaps from "@/data/mirror_gaps.json";
import monitor from "@/data/mirror_monitor.json";
import { COOKIE_NAME, verifySession } from "@/lib/auth";
import CustomsGap from "@/components/CustomsGap";
import TopBar from "@/components/TopBar";
import Footer from "@/components/Footer";

// The mirror datasets are bundled at build time, so the page renders without a
// data fetch. Swap the JSON in /data (or point these imports at a live source)
// to run Jamarik on real reporter feeds.
export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await verifySession((await cookies()).get(COOKIE_NAME)?.value);

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar user={session?.u} generated={gaps.meta?.generated} />
      <main className="flex-1">
        <CustomsGap gaps={gaps} monitor={monitor} />
      </main>
      <Footer meta={gaps.meta} />
    </div>
  );
}
