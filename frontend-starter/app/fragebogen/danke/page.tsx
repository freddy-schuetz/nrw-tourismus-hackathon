export const metadata = {
  title: "Danke für die Rückmeldung",
  robots: { index: false, follow: false },
};

export default function DankeSeite() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 p-8">
      <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-green-900">
        <h1 className="text-2xl font-bold">Vielen Dank!</h1>
        <p className="mt-2">Ihre Rückmeldung ist angekommen.</p>
      </div>

      <div className="text-sm text-gray-600">
        <p>Was jetzt passiert:</p>
        <ol className="mt-2 list-inside list-decimal space-y-1">
          <li>Wir gleichen Ihre Angaben mit den anderen Rückmeldungen ab.</li>
          <li>Passt alles zusammen, korrigieren wir die Öffnungszeiten in der Datenbank.</li>
          <li>Sie bekommen eine kurze E-Mail mit den geänderten Zeiten — als Bestätigung.</li>
        </ol>
        <p className="mt-4">
          Sie können dieses Fenster jetzt schließen. Der Link aus der E-Mail ist damit verbraucht.
        </p>
      </div>
    </main>
  );
}
