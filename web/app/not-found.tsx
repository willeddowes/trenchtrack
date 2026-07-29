import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-lg space-y-4 p-8 text-center">
      <h1 className="text-2xl font-extrabold tracking-tight">Page not found</h1>
      <p className="text-ink-muted">That page doesn&apos;t exist.</p>
      <Link href="/" className="inline-block font-semibold text-accent underline">
        Back to all teams
      </Link>
    </main>
  );
}
