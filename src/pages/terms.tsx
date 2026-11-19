/**
 * Terms of Service — a STATIC page (top level of src/pages/), prerendered to
 * terms.html at build (listed in src/prerender-entry.tsx).
 *
 * Keep it consistent with src/pages/privacy.tsx and the app's behaviour, and
 * bump TERMS_UPDATED in src/legal.ts when the substance changes.
 */

import { Link } from 'react-router-dom'
import { Seo } from '../components/Seo'
import { B, Email, LegalPage, Section } from '../components/LegalPage'
import { seo } from '../seo'
import { MINIMUM_AGE, TERMS_UPDATED } from '../legal'

const A = ({ to, children }: { to: string; children: string }) => (
  <Link to={to} className="text-foreground underline underline-offset-4">
    {children}
  </Link>
)

export default function Terms() {
  return (
    <>
      <Seo
        title="Terms of Service | Co-Create"
        description="The rules for using Co-Create: who can use it, who owns what you create, acceptable use, calls, and our limits of responsibility."
        origin={seo.origin}
        path="/terms"
        noindex={seo.noindex}
      />
      <LegalPage testId="terms-page" title="Terms of Service" updated={TERMS_UPDATED}>
        <p className="mt-8">
          These terms are an agreement between you and Co-Create (“we”, “us”) about your use of the Co-Create website
          and app (the “Service”). <B>By using the Service, you agree to these terms</B> and to our{' '}
          <A to="/privacy">Privacy Policy</A>. If you don’t agree, please don’t use the Service.
        </p>

        <Section id="eligibility" title="1. Who can use Co-Create">
          <p>
            You must be at least <B>{MINIMUM_AGE} years old</B> to use the Service. Because Co-Create includes live
            audio and video calls, it isn’t meant for children under {MINIMUM_AGE}. If you use it for a company, school
            or other organization, you confirm you’re allowed to agree to these terms for it.
          </p>
        </Section>

        <Section id="accounts" title="2. Your account">
          <p>
            You sign in using the methods offered by our platform provider, DeepSpace (such as Google or GitHub). You’re
            responsible for keeping that account secure and for everything done through it. Tell us at <Email /> if you
            think someone else is using it.
          </p>
        </Section>

        <Section id="content" title="3. Your content belongs to you">
          <p>
            You own what you create on Co-Create: boards, notes, drawings, comments, version history, and the specs and
            other files you export (“Your Content”). We don’t claim any ownership of it.
          </p>
          <p>
            You give us only the limited permission needed to <B>store, hold and display Your Content</B> to you and
            to the people you choose to share it with, and to make the copies technically needed to run the Service
            (for example backups and real-time syncing). This permission ends when you delete Your Content, except for
            copies that take a short time to clear from our systems.
          </p>
          <p>
            You’re responsible for Your Content and confirm you have the right to put it on Co-Create.
          </p>
        </Section>

        <Section id="sharing" title="4. Sharing and access">
          <p>
            Boards are private until their owner shares them. <B>The owner of a board is responsible for that board
            and for who they give access to</B>, through direct shares, friend codes or share links. Anyone with
            access can see the board’s content, and editors can change it. Remove access or revoke links you no
            longer want active.
          </p>
        </Section>

        <Section id="calls" title="5. Calls">
          <p>
            Co-Create lets people on a board talk over live audio and video. <B>We don’t monitor or record calls</B>,
            and no call audio or video is stored. You’re responsible for how you behave in calls. Don’t record other
            people without their consent where the law requires it.
          </p>
        </Section>

        <Section id="guest" title="6. Guest mode">
          <p>
            “Try it without an account” (<code className="font-mono text-xs">/try</code>) keeps your board only in
            your browser. <B>We make no promise that guest boards will be saved.</B> Clearing your browser data, using
            private browsing, or switching device or browser can delete them for good, and we can’t recover them.
          </p>
        </Section>

        <Section id="acceptable-use" title="7. Acceptable use">
          <p>When using Co-Create, don’t:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Break any law, or help someone else break one.</li>
            <li>Post content that is illegal, infringes someone else’s rights, or that you don’t have the right to share.</li>
            <li>Harass, threaten, bully or impersonate anyone, in boards, comments or calls.</li>
            <li>Share sexual content involving minors, or any content that exploits children.</li>
            <li>Upload or spread malware, or anything designed to harm devices or data.</li>
            <li>
              Try to access boards, accounts or data you weren’t given access to, or probe, scan or test the Service’s
              security without our written permission.
            </li>
            <li>
              Disrupt or overload the Service, get around rate limits or access controls, or guess friend codes or share
              links.
            </li>
            <li>Scrape or collect data from the Service with bots or automated tools, except through features we provide for that (like Publish for agents).</li>
            <li>Send spam or use the Service to advertise without permission.</li>
          </ul>
        </Section>

        <Section id="ai" title="8. AI tools and exported specs">
          <p>
            Co-Create turns boards into Markdown specs that you can hand to AI agents and other tools. <B>We aren’t
            responsible for what any AI tool produces from your exports or boards</B>, or for what happens when you use
            that output, including code, designs or decisions. Review AI output before you rely on it.
          </p>
        </Section>

        <Section id="third-parties" title="9. Third-party services">
          <p>
            Co-Create relies on other services, including DeepSpace (hosting and sign-in), Cloudflare, LiveKit (calls)
            and your sign-in provider. <B>Their own terms and policies also apply</B> to your use of them. We aren’t
            responsible for those services.
          </p>
        </Section>

        <Section id="suspension" title="10. Suspension and termination">
          <p>
            <B>We may suspend or close any account, or remove any content, at any time and for any reason or no
            reason.</B> We’ll try to tell you why, but we aren’t required to. You can stop using Co-Create at any time
            and delete your account yourself in Settings → Delete account. This permanently deletes the boards you
            own, including for the people you shared them with.
          </p>
          <p>
            Sections 3 (ownership), 8, 11, 12 and 13 continue to apply after your use ends.
          </p>
        </Section>

        <Section id="availability" title="11. No guarantees">
          <p>
            Co-Create is an early-stage project provided <B>“as is” and “as available”</B>. We don’t guarantee
            uptime, that the Service will be error-free or secure, or that Your Content will never be lost. Keep your
            own copies of anything important (Export .md helps). We may change, pause or discontinue any part of the
            Service at any time. To the fullest extent the law allows, we disclaim all warranties, including
            merchantability, fitness for a particular purpose and non-infringement.
          </p>
        </Section>

        <Section id="liability" title="12. Limitation of liability">
          <p>
            To the fullest extent the law allows, we aren’t liable for any indirect, incidental, special, consequential
            or punitive damages, or for lost data, profits or goodwill, arising from your use of the Service. Our total
            liability for any claim about the Service is limited to $50 USD. Some places don’t allow these limits, so
            they may not all apply to you.
          </p>
        </Section>

        <Section id="copyright" title="13. Copyright complaints">
          <p>
            If you believe content on Co-Create infringes your copyright, email <Email /> with the work you think was
            copied, where it appears on Co-Create, your contact details, and a statement that you believe in good faith
            the use isn’t authorized. We may remove the content and close the accounts of repeat infringers.
          </p>
        </Section>

        <Section id="changes" title="14. Changes to these terms">
          <p>
            We may update these terms. We’ll change the date at the top, and for significant changes we’ll let you know
            in the app. If you keep using Co-Create after a change, you accept the new terms.
          </p>
        </Section>

        <Section id="contact" title="15. Contact">
          <p>
            Questions about these terms: <Email />.
          </p>
        </Section>
      </LegalPage>
    </>
  )
}
