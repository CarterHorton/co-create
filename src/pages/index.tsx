/**
 * Landing page — a STATIC page.
 *
 * It lives at the top level of src/pages/ (not under (app)/), so it renders
 * with no DeepSpace providers: no auth session fetch, no records WebSocket.
 * That makes it cheap to serve and safe for logged-out / crawler traffic.
 *
 * Need live data or auth here? Move this file to src/pages/(app)/index.tsx
 * and it becomes a dynamic page. Conversely, any page you want to keep static
 * (marketing, docs, legal) belongs at this top level.
 *
 * Top-level pages are also prerendered to static HTML at build
 * (prerender.ts, via vite.config.ts) so crawlers read real content.
 * Keep them renderable without a browser: no window/document during render,
 * prose in HTML text, reveal animations in CSS keyframes rather than JS-driven
 * initial states. `<Seo>` comes first and reads src/seo.ts.
 */

import { Link } from 'react-router-dom'
import { Seo } from '../components/Seo'
import { seo } from '../seo'

export default function Landing() {
  return (
    <>
      <Seo {...seo} path="/" />
      <div
        data-testid="static-landing"
        className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-6 text-center text-foreground selection:bg-royal/30 selection:text-foreground"
      >
        {/* Bottom royal-blue glow — the only colour on the page (DESIGN.md). */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-10 left-1/2 h-[400px] w-[600px] -translate-x-1/2 blur-md"
          style={{
            background:
              'radial-gradient(ellipse at center, rgba(65, 105, 225, 0.3) 0%, rgba(65, 105, 225, 0.05) 40%, transparent 70%)',
          }}
        />

        <h1 className="mb-6 font-display text-[clamp(3rem,5vw,6rem)] font-black leading-none tracking-[-0.02em]">
          Co-Create
        </h1>

        <p className="mb-10 max-w-2xl text-[clamp(1.2rem,2vw,1.8rem)] leading-normal text-[#333333]">
          Design in a way you understand, for a way your AI will understand
        </p>

        <Link
          to="/home"
          className="inline-flex items-center justify-center border border-foreground bg-transparent px-8 py-4 text-sm font-bold uppercase tracking-[0.05em] text-foreground transition-colors duration-200 hover:border-royal/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Start Creating
        </Link>

        <Link
          to="/try"
          className="mt-5 text-sm text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
        >
          or try it without an account
        </Link>
      </div>
    </>
  )
}
