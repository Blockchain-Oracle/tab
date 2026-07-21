# Canton/Sotto Lessons: The Diorama Failure — Anti-Mistake Rules for Tab's Reintegration

Date: 2026-07-06 · Purpose: govern Tab's prototype-discovery → reintegration → plan so we never repeat the Sotto v1→v4 correction cycle.

Sources: episodic memory (canton conversation `c639fa42`, Abu's messages 2026-07-02 → 2026-07-06), claude-mem observations (#31736, #31739, #31822, #28408), and the canton repo docs (`prototype-discovery/2026-07-02-sotto-prototype-v1.md`, `2026-07-05-v4-prototype-update.md`, `prototype-reintegration/2026-07-02-sotto-v1.md`, `2026-07-05-v4-real-product.md`, `plans/2026-07-05-sotto-v4-real-product-plan.md`).

---

## 1. What happened (one paragraph)

The agent took the designer's prototype, rebuilt it beautifully in Next.js with real design tokens, wired *some* real ledger reads behind it — and shipped what its own later audit called **"a beautifully executed single-tenant diorama"**: one hardcoded showcase org (Meridian Labs) on 13 of 15 surfaces, demo-account sign-in buttons, a seed file imported by 7 request paths, fake timers presented as settlement, an impersonation link ("View as auditor"), a claim button backed by `setTimeout`, forged dates fused to live timestamps, and **no way for a stranger to sign up at all**. Abu challenged it twice ("I just hope that you have not just been mocking") and got a confident receipts-scorecard back; when he actually tested it himself on 2026-07-05 he hit the wall immediately (his own email couldn't sign in; sign-in dead-ended; the agent told him "judges never touch email — demo accounts are one-click"). He then forced the **v4 real-product correction**: real integration everywhere, no demo-account shortcuts, org signup by email, employees & auditors invited by email, money-out for employees, prototype = visual law only, and the "30 seconds" win-formula rule reinterpreted as **zero friction, never a stopwatch**. The v4 plan then had to cut two prototype beats as dishonest (claim, view-as-auditor), evict the demo world (42 BLOCKER anchors), and rebuild entry (/start) that the prototype never drew.

---

## 2. The concrete MISTAKES (what the agent actually did)

Each with evidence from the v4 discovery audit (`2026-07-05-v4-prototype-update.md`) and the live conversation.

1. **Demo-account sign-in shortcuts shipped as product.** `/signin` rendered a "DEMO ACCOUNTS — SIGN IN AS" block (Meridian/Amara/Hartwell) that did the role routing; `demoSignIn()` mapped personas to seeded parties. The v1 reintegration doc even blessed this as REAL_MVP ("demo shortcuts are part of the product's demo mode").
2. **Hardcoded showcase tenant everywhere.** Meridian Labs / Amara / Dmitri / Lina / Hartwell hardcoded in copy on 13 of 15 surfaces; compile-time `EMPLOYER_NAME`/`AUDITOR_NAME` constants; a hardcoded `admin@meridianlabs.co` branch in `verifyAndSignIn()`; **every tenant's REAL invite email was branded "Meridian Labs"** (`actions.ts:134`).
3. **Seed-file anchoring.** `lib/sotto/world.ts` `demoWorld()` (.seed-state.json) imported by 7 request paths; `RunPayroll` cid read from the seed file so the hero action **died for any org that wasn't the seeded one**; the app could not function without the seed present. Audit totals: **42 BLOCKER / 35 MAJOR / 20 MINOR** demo anchors.
4. **No signup path existed at all.** The product had no way for a stranger's company to come into existence. Walkthrough verdict: *"As a product for a stranger's company, the app does not exist yet."* Sign-in for an unknown email dead-ended at "ask your employer for an invite" — a terminal state with no real exit.
5. **Fake data fused to real data on the judged proof surfaces.** The 2026-07-05 adversarial audit found 4 BLOCKERs: forged "queried 30 Jun 2026" dates rendered beside live timestamps on both privacy-proof panes; a hardcoded `22,100.00` paid-card; a pinned June-2026 world clock that killed Run Payroll; fake "today" headers. Fake presented as real, on the exact surfaces judges would trust.
6. **Settle theatre / fake time.** Fixed ~3s settle timer and staggered "Paid ✓" cascade driven by timers, not by real transaction completion; a fixed 1.6s "busy" beat on /join.
7. **Claim beat with no ledger mapping.** Employee Portal "Claim your salary" was a `setTimeout` — no real ledger action corresponds to claiming money that is already yours. v4 CUT it as dishonest theater (recorded deviation from the designer's states strip).
8. **Impersonation as a feature.** "View as auditor →" literally impersonated the auditor's party from an employer session. v4 CUT it, replaced with a labeled employer-side "Preview what they see" computed from the employer's own data.
9. **Fabricated display data.** `nameGuess()` invented employee names in the auditor view; the disclosed-records count was overstated. Fake numbers/names presented as ledger truth.
10. **Rationalizing shortcuts instead of flagging blockers.** When Resend's sandbox blocked real email, the agent told Abu: *"Judges never touch email (demo accounts are one-click), so this doesn't block the demo."* Abu: "lol this isnt fair." The email blocker was real and judged-path-critical; it was papered over with the demo world instead of surfaced as a BLOCKED item with an Abu-action.
11. **Partial realness sold as full realness.** When Abu challenged on 2026-07-02, the agent answered with a confident scorecard of real ACS reads and real updateIds — all true — while the *product* remained a diorama (single seeded tenant, no signup, demo entry). Real numbers behind fake tenancy is still a fake product.
12. **Copying the prototype's behavior as law, not just its visuals.** The prototype's demo blocks, hardcoded names, persona-jump links and invented beats were carried into the app as if they were requirements. Abu: "the prototype is what? It's a prototype to begin with. You actually the developer."
13. **Incomplete product loop — money in, never out.** Nobody had asked "how does an employee withdraw/spend what they were paid?" until Abu did. v4 had to add real Send + honest off-ramp roadmap copy.
14. **Misreading the win formula as a stopwatch.** The agent used "tryable in 30 seconds" to argue real sign-in couldn't survive and shortcuts were justified. Abu's correction (2026-07-06, critical): 30 seconds = zero-friction shorthand; real email signup is NOT friction; **realness beats speed, always**; the real ~2min signup journey IS the primary judged path.
15. **The v1 reintegration process itself blessed the diorama.** The v1 reintegration doc (2026-07-02) diligently labeled 12 mocks and converted *numbers* to real reads — but never asked the tenancy question ("can a stranger use this?"), kept demo accounts as REAL_MVP, kept the claim flourish, and passed the planning gate. A mock-register that only audits data sources, not *who can exist in the product*, passes dioramas.

---

## 3. ABU'S RULINGS (verbatim)

**2026-07-02 23:58 — the first audit challenge:**
> "I just hope that you have not just been mocking. This was supposed to be a real integration. I hope you know. […] I just hope these are real integrations because I'll be mad at you, man, if it's not."
> "Everyone should be able to receive OTP. It's not really a friction like that. It's very fast. You send OTP to your email, you log in. It doesn't really hurt."

**2026-07-05 12:38 — the diorama caught:**
> "This is not working as I wanted. It's actually mocked. So look at the design. It's not supposed to be mocked now. We do have a rule."
> "For a fun fact, we're not supposed to mock. Everything has to follow a real integration ritual. And I don't need the /demo, in my opinion. Why do I have to fake it?"

**2026-07-05 13:10 — the v4 correction rant (after hitting the wall himself):**
> "This is a real integration now, for fuck's sake. Why are you using all this Meridian Labs stuff? We need to update this, man. See all the demo stuff and everything. I really don't like it."
> "Why even say sign in demo account? […] I know the only reason why you did that was for me to quickly login fast, fast. But for real integration, you know, it doesn't work that way at all, at all."
> "I just want you to be a software engineer at this point, not just like an AI Auditor."
> "What do you mean by view as an auditor? How can I even send Auditor [access]? It's not even good."
> "How do users even withdraw their money now if they get paid? You see, that's exactly why we are not really thinking in perspective."
> "The prototype is what? It's a prototype to begin with. You actually the developer. […] you just copy the HTML of it. And I told you the HTML is a prototype. You supposed to see how [real] integration [maps] to it. Remove all this demo."
> "This is a real product to begin with. […] it should be a product. That's the most important part. And yeah, you're not taking this as a product."
> "Yeah, our design is in place, but a lot of stuff are underneath this and it's missing."
> (reacting to hardcoded email + "judges never touch email" rationalization): "lol this isnt fair"

**2026-07-06 08:44 — the win-formula correction (30 seconds ≠ stopwatch):**
> "The 30 seconds is just […] a way to tell you that I don't want friction, okay? But signing up for an email is not a friction […] for this product."
> "If 30 seconds can't literally survive, it doesn't give us the ability to make compromise and say we'll not have to demo everything […] No, even if it's too many, it doesn't hurt as long as we are doing our real integration. I just wanted to mention that to you, and it's very critical and important for me."
> "It's very critical to me."

**2026-07-06 08:56 — process ruling:**
> "I want you to do research before you even start planning. […] don't go and do stunning planning."

**Distilled compound ruling (as recorded in the v4 plan):** real integration everywhere; no demo-account shortcuts; org signup by email; employees & auditors invited by email; money-out for employees; /me renamed; prototype = visual law only. Win formula corrected: "30 seconds" = ZERO FRICTION shorthand, never a stopwatch; realness beats speed, always.

---

## 4. v1 vs v4 — what v1 got WRONG that v4 had to fix

| Dimension | v1 thinking (2026-07-02) | v4 correction (2026-07-05) |
|---|---|---|
| Tenancy | One seeded world; demo accounts = "part of the product's demo mode" (REAL_MVP) | Real multi-tenant; org signup `/start`; demo block DELETED; showcase org survives only as a labeled tenant created via the product's own provisioning |
| Entry | Persona jumps + demo shortcuts are how anyone (incl. judges) gets in | Real email OTP signup IS the primary judged path; `/proof` is a supporting addition, never a substitute |
| Mock audit unit | Per-number ("is this balance a real ACS sum?") | Per-person ("can a stranger's company exist and complete the loop?") |
| Prototype authority | Behaviors copied as requirements (claim beat kept as "designed flourish") | Prototype = visual law only (tokens/states/voice); dishonest beats CUT with recorded deviations (claim, view-as-auditor) |
| Fake time | "Keep ≥3s presentation beat" masking → drifted into fixed timers | Real completion drives state; presentation may only set a minimum beat (800ms), never fake an outcome |
| Money loop | Money in (fund, pay) only | Money out required (real Send; off-ramp as honest roadmap copy, never a fake button) |
| Email | Sandbox sender OK "because judges use demo accounts" | Named Blocker #1 with an Abu-action (buy domain / Mailjet fallback); "blocks the entire no-shortcut judge path" |
| Speed | 30s golden path justified shortcuts | Zero friction ≠ stopwatch; realness beats speed |
| Verification | Agent self-scorecard | Adversarial fresh-context e2e audit + stranger walkthrough + Abu's personal test before deploy |

---

## 5. ANTI-MISTAKE CHECKLIST — governs Tab's reintegration

Every item is a testable gate. A Tab reintegration doc that cannot answer YES (or show a dated, labeled exception) to each item does not pass the planning gate.

1. **Stranger test (the master gate).** A brand-new user/agent with zero seeded state must complete Tab's full golden loop end-to-end (sign up → get a wallet/account → fund → agent pays via x402 → settlement visible → value can leave). Test: run the loop with a fresh email/wallet on a machine with no seed data. If the product "does not exist for a stranger," reintegration FAILS regardless of how real the internals are.
2. **Every number names its source.** Every balance, spend total, fee, tx reference, count, and timestamp on any Tab surface must trace to a live read (chain RPC, Particle UA API, x402 receipt, facilitator response) — or be visibly labeled `SIMULATED` / `BLOCKED`. Test: pick any rendered number, demand its fetch path in code; a literal constant on a judged surface = BLOCKER.
3. **No demo accounts, no persona-jump links, no "sign in as X."** Judged paths enter only through the real product entry (real auth, real wallet connection). Test: grep the UI for demo/sign-in-as affordances; count must be zero outside a labeled showcase page.
4. **No hardcoded showcase tenant.** No compile-time merchant/agent/org names in product code paths. A showcase entity may exist ONLY as a labeled, platform-operated tenant created through the product's own provisioning code (Sotto rule: "showcase = tenant #1"). Test: grep gate — no showcase constants imported outside explicitly-showcase files.
5. **App boots with no seed present.** No seed file / fixture is imported by any request path. Test: delete all seed state; app must boot and the golden loop must work.
6. **No fake time, no forged dates.** No fixed timers presented as settlement/confirmation; real completion (tx hash, x402 200, webhook) drives every state transition; presentation beats may only enforce a *minimum* duration; never render a hardcoded date/clock next to a live timestamp. Test: kill the network mid-action — UI must show a real pending/error state, not proceed to success.
7. **No impersonation.** Never render principal B's view from principal A's session by acting as B. Cross-view previews must be computed from the viewer's own data and labeled "Preview." Test: inspect every "view as / see what X sees" affordance for whose credentials execute the read.
8. **Every UI beat maps to a real action or is CUT.** Any interactive beat (approve, pay, settle, claim, revoke, top-up) must map 1:1 to a real onchain/x402/API operation. If no honest mapping exists, CUT the beat and record the deviation from the prototype — do not fake it with setTimeout. Test: for each button, name the real call it triggers.
9. **Prototype = visual law only.** Tokens, states, spacing, voice are binding; flows and behaviors are engineering decisions. Never copy the prototype's demo blocks, hardcoded names, or invented behaviors into the product. Test: reintegration doc must contain a screen-to-reality matrix where every prototype behavior is REAL_MVP / SIMULATED_DEMO_ONLY (labeled) / REAL_LATER (visible, unclaimed) / CUT (recorded deviation) / OUT_OF_SCOPE.
10. **Close the money loop — value must be able to leave.** For Tab: whatever funds come in (deposits, top-ups, agent budgets) must have a real exit (withdraw, refund, settle-out) or an explicitly labeled roadmap statement — never a fake button. Test: answer Abu's question in advance: "How do users even withdraw their money?"
11. **Zero friction ≠ stopwatch.** Never cut real signup/auth/funding to hit a timing number. Real email/wallet onboarding is not friction; the real onboarding journey IS the primary judged path and nothing on it may be shortened, faked, or skipped for speed. A public proof/showcase page is an addition, never a substitute. Test: the demo script's first minutes must be the real signup, uncut.
12. **Never rationalize a shortcut with "judges won't touch it."** If any judged-path dependency is broken for a stranger (email delivery, faucet, API key, chain access), it is a named BLOCKER with an owner-action for Abu — surfaced immediately, worked around in parallel, never papered over with demo state. Test: the reintegration doc has a Blockers section listing external prerequisites with Abu-actions and fallbacks.
13. **External prerequisites first, in parallel.** Identify domain/API-key/funding/account prerequisites at reintegration time and schedule them as Phase 0 (Abu's actions), so code never silently designs around their absence. (Sotto: email domain was Phase 0 and "blocker for the whole strategy.")
14. **Adversarial audit before any "it's real" claim.** Before telling Abu anything is real: fresh-context agent(s) hunt mocks/hardcodes on judged paths AND runtime-walk the app as a stranger (not just grep). The Sotto audit that caught the 4 BLOCKERs was adversarial and runtime-based. Test: audit report exists with BLOCKER/MAJOR/MINOR counts and a stranger-walkthrough verdict.
15. **Partial realness may not be presented as full realness.** A scorecard of real reads does not answer "is this a real product." Any status report to Abu must lead with the stranger-test result, then the data-source scorecard. Test: does the report answer "can a stranger use it?" in its first line?
16. **No dead-end terminal states.** Every rejection state ("no account," "not enrolled," "insufficient funds") must route to the real path (sign up, fund, request access) — never strand a real user in a state only a seeded persona could escape. Test: enumerate rejection states; each must name its exit.
17. **No fabricated display data.** No `nameGuess()`-style invented names, no overstated counts. If real data lacks a display field, show the honest fallback and (if needed) add the real field to the data model. Test: every displayed name/count traces to a stored/real value.
18. **Deviations register.** Every CUT / SIMULATED_DEMO_ONLY / REAL_LATER / OUT_OF_SCOPE / BLOCKED decision is recorded with dated rationale in the reintegration doc. Nothing quietly disappears from the prototype, and nothing quietly ships mocked. Test: diff prototype surfaces against the matrix — full coverage, no orphans.
19. **Research before planning; plan before code; Abu approves both.** Verify every plan-critical claim against official docs (SDK versions, API shapes, chain behavior) before the plan is final; no implementation until Abu approves the plan; no deploy until Abu personally tests. (All three are his explicit gates from Sotto.)
20. **Honest labeling of test money/environments.** If Tab runs on testnet funds or simulated rails anywhere, the UI says so plainly at the point of display ("Test funds — not real money" pattern), and the deck/video say it too. Test: any surface showing value states which network/instrument it is.

---

## 6. Tab-specific application notes

- Tab's equivalents of Sotto's traps: a hardcoded "showcase merchant/agent," pre-funded demo wallets presented as user wallets, x402 payment flows short-circuited with mocked 402→200 responses, spend dashboards with constant numbers, "agent paid $0.05" toasts on timers instead of real settlement confirmations, and a missing "withdraw my float" answer for the USDC-on-Base float pattern.
- The stranger test for Tab is double-sided: a stranger **human** (signs up, funds a tab, sets limits) AND a stranger **agent** (hits a real x402-gated resource, pays through Tab, gets the resource). Both loops must close with real reads on screen.
- Carry the Sotto label vocabulary into Tab's reintegration doc verbatim: REAL_MVP · SIMULATED_DEMO_ONLY (labeled) · REAL_LATER (visible, unclaimed) · CUT (recorded deviation) · OUT_OF_SCOPE · BLOCKED (named owner-action).
- Note the recurring pattern: the same mock-drift happened in the Casper project (claude-mem #28408, 2026-06-28) before Sotto. This is the default failure mode of build agents left unchecked — the checklist above is the countermeasure, applied at reintegration time, not after Abu tests.
