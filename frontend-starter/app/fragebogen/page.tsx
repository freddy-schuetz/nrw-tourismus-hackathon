import { Suspense } from "react";
import FragebogenClient from "./fragebogen-client";

export const metadata = {
  title: "Öffnungszeiten bestätigen",
  // Der Link enthält einen persönlichen Zugangscode — nicht in Suchmaschinen.
  robots: { index: false, follow: false },
};

export default function FragebogenSeite() {
  // useSearchParams braucht eine Suspense-Grenze, sonst bricht der Build.
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-2xl p-8 text-gray-600">Fragebogen wird geladen …</main>
      }
    >
      <FragebogenClient />
    </Suspense>
  );
}
