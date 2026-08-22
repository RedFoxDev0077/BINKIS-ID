/**
 * Placeholder.
 *
 * Build step 1 is the batch generator and factory export, which is a CLI and
 * does not need a page. The public passport page at /p/[token] arrives in
 * build step 3.
 */
export default function Home() {
  return (
    <main style={{ padding: '4rem 1.5rem', maxWidth: '40rem', margin: '0 auto' }}>
      <h1 style={{ letterSpacing: '-0.02em' }}>BINKIS ID</h1>
      <p style={{ color: 'var(--muted)', lineHeight: 1.6 }}>
        Digital identity registry for physical BINKIS collectible figures.
      </p>
      <p style={{ color: 'var(--muted)', lineHeight: 1.6 }}>
        Build step 1 (batch generator and factory export) is in place. The public
        passport page lands in build step 3.
      </p>
    </main>
  );
}
