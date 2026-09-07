import { cookies } from "next/headers";
import { COOKIE_NAME, verifySession } from "@/lib/auth";
import { dataStamp, loadGaps } from "@/lib/data";
import CustomsGap from "@/components/CustomsGap";
import TopBar from "@/components/TopBar";
import Footer from "@/components/Footer";

// Every number on the page comes through lib/data.js. Today that is a JSON
// file bundled at build time; when it becomes a live query the page renders
// on demand, which is why this route is already dynamic.
export const dynamic = "force-dynamic";

export default async function Page() {
  const [session, gaps] = await Promise.all([
    verifySession((await cookies()).get(COOKIE_NAME)?.value),
    loadGaps(),
  ]);

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar user={session?.u} generated={gaps.meta?.generated} />
      <main className="flex-1">
        <CustomsGap gaps={gaps} stamp={dataStamp()} />
      </main>
      <Footer meta={gaps.meta} />
    </div>
  );
}
