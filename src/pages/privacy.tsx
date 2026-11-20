/**
 * Privacy policy — a STATIC page (top level of src/pages/), prerendered to
 * privacy.html at build (listed in src/prerender-entry.tsx) so it is readable
 * without JavaScript and without signing in.
 *
 * Keep it true to the code: if the app starts storing something new, setting
 * another cookie, or sending data to another service, update this page and
 * PRIVACY_UPDATED in src/legal.ts.
 */

import { Seo } from '../components/Seo'
import { B, Email, LegalPage, Section } from '../components/LegalPage'
import { seo } from '../seo'
import { PRIVACY_UPDATED } from '../legal'

export default function Privacy() {
  return (
    <>
      <Seo
        title="Privacy Policy | Co-Create"
        description="What Co-Create collects, why, who processes it, the one cookie it uses, and how to delete your data."
        origin={seo.origin}
        path="/privacy"
        noindex={seo.noindex}
      />
      <LegalPage testId="privacy-page" title="Privacy Policy" updated={PRIVACY_UPDATED}>

        <p className="mt-8">
          Co-Create (“we”, “us”) is a collaborative whiteboard with group calls that turns boards into Markdown
          specs. This policy explains what we collect when you use Co-Create, why, who else handles it, and the
          choices you have. Questions or requests: <Email />.
        </p>

        <Section id="summary" title="The short version">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>We collect only what the app needs to work: your sign-in profile and what you put on boards.</li>
            <li>We don’t sell your data, show ads, or use tracking or analytics tools.</li>
            <li>Calls are live only. We don’t record or store call audio or video.</li>
            <li>We use one cookie, to keep you signed in.</li>
            <li>“Try it without an account” boards never leave your browser.</li>
          </ul>
        </Section>

        <Section id="collect" title="What we collect">
          <p>
            <B>Your account.</B> When you sign in with a provider such as
            Google or GitHub, we receive your name, email address and profile picture link. We also record when your
            account was created and when you were last active.
          </p>
          <p>
            <B>What you create.</B> Boards and projects, everything on them
            (notes, boxes, text, arrows, sections), version history, published specs, comments and @mentions, votes,
            board timers, and the share links you make.
          </p>
          <p>
            <B>GitHub repositories.</B> If you connect a public GitHub
            repository to a board or project, we look it up on GitHub once and store its name, description, default
            branch and link with the board or project, so the spec export can say where the code lives. Only public
            repositories can be connected; we never ask for access to your GitHub account or private code. To limit
            abuse we also briefly record when you look one up.
          </p>
          <p>
            <B>Sharing and friends.</B> Who you’ve shared each board with and
            their access level, your friends list, and short-lived friend codes. To stop guessing, we also briefly
            record failed attempts to use a friend code or share link.
          </p>
          <p>
            <B>While you’re on a board.</B> Your name, cursor position and
            what you’re viewing are shown live to other people on the same board. This isn’t saved after you leave.
          </p>
          <p>
            <B>Calls.</B> If you join a call, your microphone and camera
            stream live to other people in the call only after your browser asks for and gets your permission. Calls
            are <B>not recorded</B>, and no audio or video is stored.
          </p>
          <p>
            <B>Technical data.</B> Like any website, our hosting providers
            process your IP address, browser type and request logs to deliver pages, keep the service secure and fix
            errors.
          </p>
        </Section>

        <Section id="use" title="How we use it">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>To sign you in and show your boards to you and the people you share them with.</li>
            <li>To sync boards in real time, run calls, and keep version history.</li>
            <li>To notify you inside the app when someone @mentions you.</li>
            <li>To prevent abuse (for example, limiting how fast codes can be guessed) and fix problems.</li>
          </ul>
          <p>
            Spec export is rule-based and runs in your browser. We don’t send your boards to an AI model, and we
            don’t use your content to train AI. If you choose <em>Publish for agents</em>, the spec can be read by AI
            agents run by people who already have access to that board.
          </p>
        </Section>

        <Section id="sharing" title="Who can see your data">
          <p>
            <B>People you share with.</B> Boards are private to their owner
            until shared. People you share a board with, or who open your share link, can see its content, history,
            comments and votes, and your name next to what you created.
          </p>
          <p>
            <B>Service providers</B> that run Co-Create for us and process
            data only to provide their service:
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <B>DeepSpace</B> — app platform: hosting, sign-in and database.
            </li>
            <li>
              <B>Cloudflare</B> — the network and servers DeepSpace runs on.
            </li>
            <li>
              <B>LiveKit</B> — carries live call audio and video.
            </li>
            <li>
              <B>GitHub</B> — when you connect a repository, its name is sent (through DeepSpace) to GitHub to fetch
              that public repository’s details. Nothing else about you or your boards is sent.
            </li>
            <li>
              <B>Your sign-in provider</B> (such as Google or GitHub) — confirms
              who you are. Your profile picture is loaded from their servers.
            </li>
          </ul>
          <p>
            We don’t sell or rent your personal information, and we don’t share it for advertising. We would disclose
            it only if required by law.
          </p>
        </Section>

        <Section id="cookies" title="Cookies and browser storage">
          <p>
            Co-Create uses <B>one cookie</B>, and it’s strictly necessary:
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border text-foreground">
                  <th className="py-2 pr-4 font-semibold">Name</th>
                  <th className="py-2 pr-4 font-semibold">Purpose</th>
                  <th className="py-2 font-semibold">Lasts</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border align-top">
                  <td className="py-2 pr-4 font-mono text-xs break-all">__Secure-better-auth.session_token</td>
                  <td className="py-2 pr-4">Keeps you signed in. Secure and HttpOnly (scripts can’t read it).</td>
                  <td className="py-2">30 days, or until you sign out</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            Your browser’s local storage also keeps a few things on your device. They are never sent to us: your
            guest board and its history if you use <em>Try it without an account</em>, whether the timer chime is on,
            and that you’ve dismissed the cookie notice. Session storage briefly holds a template you’re applying and
            a marker used to reload the page after an update.
          </p>
          <p>
            We don’t use advertising, analytics or tracking cookies. Because the one cookie is required to sign in,
            there’s nothing to opt out of. You can block or clear it in your browser, but you’ll be signed out.
          </p>
        </Section>

        <Section id="retention" title="How long we keep it">
          <p>
            We keep your account and content while your account exists. Deleting a board permanently removes it with
            its history, specs, comments, votes and share links. Live presence data disappears when you leave a board.
            Hosting providers keep technical logs for a short period under their own policies.
          </p>
          <p id="delete-account">
            <B>Deleting your account</B> (Settings → Delete account) permanently removes, right away: every board you
            own with everything on it, your projects, friends and share links, the comments, votes, saved versions
            and specs you added to other people’s boards, and your profile (name, email and picture). Shapes you drew
            on someone else’s board stay on their board. Your sign-in itself is run by DeepSpace and is shared across
            DeepSpace apps, so it isn’t deleted; if you sign in again, you start a new, empty Co-Create account.
          </p>
        </Section>

        <Section id="choices" title="Your choices and rights">
          <p>You can:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Edit or delete your boards, comments and votes in the app.</li>
            <li>Download any board as Markdown with <em>Export .md</em>.</li>
            <li>Remove friends and revoke share links or people’s access at any time.</li>
            <li>
              Delete your account and everything in it yourself, any time, in <B>Settings → Delete account</B>.
            </li>
            <li>
              Ask us for a copy of your data or to correct it by emailing <Email />. We’ll respond within 30 days.
            </li>
          </ul>
          <p>
            Depending on where you live (for example California or the EU/UK), you may have further rights, such as
            objecting to processing or complaining to your local data protection authority. Email us and we’ll help.
          </p>
        </Section>

        <Section id="security" title="Security">
          <p>
            All traffic uses HTTPS. Boards are only reachable by people with access, checked on our server. Share
            links are long random tokens stored only in hashed form. No system is perfectly secure, so please tell us
            right away at <Email /> if you find a problem.
          </p>
        </Section>

        <Section id="children" title="Children">
          <p>
            Co-Create isn’t meant for children under 13, and we don’t knowingly collect their information. If you
            believe a child has given us personal information, email us and we’ll delete it.
          </p>
        </Section>

        <Section id="international" title="Where data is processed">
          <p>
            Our providers run on servers around the world, including in the United States, so your information may be
            processed outside your country.
          </p>
        </Section>

        <Section id="changes" title="Changes to this policy">
          <p>
            If we change this policy, we’ll update the date at the top. If a change materially affects how we use your
            information, we’ll let you know in the app before it takes effect.
          </p>
        </Section>

        <Section id="contact" title="Contact">
          <p>
            Privacy questions, requests or concerns: <Email />.
          </p>
        </Section>

      </LegalPage>
    </>
  )
}
