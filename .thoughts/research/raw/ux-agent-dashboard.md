# UX Research: Agent Spend / Budget / Activity / Kill-Switch Dashboards
## Research date: 2026-07-02
## Purpose: Reality catalog for "Leash" — watch an autonomous agent spend, with caps + revoke + phone notifications.

---

## PRODUCTS SURVEYED

1. Ramp — virtual card spend controls
2. Brex — spend limits + budget management
3. Vercel — spend management + project pausing
4. Stripe Issuing — virtual cards for agents
5. Coinbase Agentic Wallets — MPC wallets for autonomous agents
6. Skyfire — AI agent payment wallet
7. Payman AI — agentic banking dashboard
8. Nevermined — AI agent payment delegation
9. Cloudflare AI Gateway — spend limits for LLM calls
10. ServiceNow AI Control Tower — enterprise kill switch
11. Smashing Magazine (Feb 2026) — "Designing for Agentic AI" UX patterns
12. Mantlr (2026) — AI agent UX patterns
13. Mastercard Agent Pay — consumer agent token controls

---

## 1. RAMP — Virtual Card Spend Controls
Source: https://support.ramp.com/hc/en-us/articles/360051065813-Setting-up-controls-on-Ramp-cards-and-funds

### Navigation
- Primary screen: "Funds & Cards" tab
- Access controls: click fund → "Options" button → "Edit"

### Limit Configuration Fields
- Owner (cardholder name printed on physical card)
- "What is it for?" (internal description)
- Amount (dollar limit)
- Frequency: Daily / Weekly / Monthly / Quarterly / Yearly limit / Annual limit / "Does not repeat"
  - All reset at "12am UTC"
  - "Does not repeat" auto-locks when limit reached
- "Add a one-time increase" toggle
- Start date field
- "Lock on a certain date" field
- "Max expense amount" field

### Spending Restrictions
- "Allowed categories" (whitelist)
- "Blocked categories" (blacklist)
- "Allowed merchants"
- "Blocked merchants"
- "None" option for each

### Termination Controls
- "Terminate" button (deletes funds)
- "Add to program" button (Spend Program override)

### Temporary Limit Increase Flow (operator side)
Source: https://support.ramp.com/hc/en-us/articles/5939293080083
- Form fields: Amount, Frequency, Toggle "Reset at the end of the current period"
- Actions: "Save changes" → "Send request"
- Manager/admin screen: "Funds and Cards" → "Requests" button → toggle temporary vs permanent
- Admin buttons: "Reject" or "Approve & update"
- Slack notification buttons: "Approve & Issue" / "Approve w/ Temporary Limit" / "Reject"
- User gets email notification on approval/rejection
- Automatic reset "at the start of the next spend cycle"

### Policy Flags & Alerts
Source: https://support.ramp.com/hc/en-us/articles/4417662362259
- Three flag categories: "Out-of-policy flags", "Accidental charge", "Fraudulent transactions"
- Flag location: "Flag" button in bottom left of transaction detail view
- Three-dot kebab on bottom right → dispute options
- States: "Out of Policy" section, "Flagged" state
- Notification: "Email will be sent to the cardholder and to their manager or admin"
- Manager can: "clear the flag or have a conversation with the employee"
- Transaction states: Out of Policy, Flagged, Disputed
- Auto-flagging timing: 15–30 seconds after transaction processes

---

## 2. BREX — Spend Limits and Budget Management
Source: https://www.brex.com/support/spend-limits-overview + https://www.brex.com/support/manage-budgets-and-spend-limits

### Navigation
- Sections: "Cards and Limits" page, "Budgets" page, "Wallet"
- Three-dot menu pattern for secondary actions

### Primary Button Labels
- "Create budget"
- "Create sub-budget"
- "Create spend limit"
- "Edit" / "Continue" / "Update"
- "Allow limit increase requests" (toggle)
- "Approve" / "Deny" (request review)
- "Archive spend limit" / "Reopen"
- "Change parent budget" (three-dot menu)
- "Request spend" / "Request limit increase" (employee-facing)

### Limit Configuration
- Limit type: "One shared limit" vs "Individual limits per user"
- Visibility toggle: "Allow users to see limit amount" (On/Off)
- Reset frequency: "Does not repeat" / "Weekly" / "Monthly" / "Quarterly" / "Annually"
- Flexibility: "Allow limit increase requests", "How much can users exceed this limit?"
- Virtual card: "Allow virtual card spending only", "Auto-create virtual cards"
- Restrictions: "Restrict Merchants and categories", "Set a maximum amount per transaction"

### Approval Workflow
- Spenders: submit via "Request limit increase"
- Approvers: access "Tasks > Spend request"
- Six-second undo window after approval/denial (inline undo)
- Email notifications for: request submission, approval, decline

### States
- Active limits: accept transactions
- "Archived" status in dashboard (no new transactions)
- Temporary increases visible retroactively

### Notifications
- Channels: "email, push notification, SMS, WhatsApp, Slack, or via your task inbox"
- Spend-related notification labels (from Brex docs):
  - "Notifications when a new spend limit or budget has been assigned"
  - "Alerts if an existing spend limit or budget amount has been updated or closed"
  - "Notifications when you're approaching or have exceeded the limit amount"
- Transaction notifications: push + SMS for cleared transactions, declined transactions, fraud detection

---

## 3. VERCEL — Spend Management + Project Pausing
Source: https://vercel.com/docs/spend-management

### Navigation
- Settings → Billing → "Spend Management" toggle → set amount → choose action

### Threshold System (verified)
- Automatic thresholds: 50%, 75%, 100% of spend amount (web + email)
- SMS: only at 100%
- Threshold toggle UI: bell icon → select which percentages trigger web/email

### Webhook Payload (exact JSON schema)
```json
{
  "budgetAmount": 500,
  "currentSpend": 500,
  "teamId": "team_jkT8yZ3oE1u6xLo8h6dxfNc3",
  "thresholdPercent": 100
}
```
- `thresholdPercent` values: 50, 75, 100

### Project Pause Mechanism
- "Pause production deployment" switch (separate from spend amount toggle)
- Confirmation: must enter team name to confirm
- Paused visitors see: 503 DEPLOYMENT_PAUSED error page
- Resume: manual per-project via dashboard or REST API
- Projects do NOT auto-resume if spend amount is increased
- Delay caveat: "Vercel checks your spend amount every few minutes" — several minute lag possible

### Activity Log
- All spend management events appear in "Activity" section in team dashboard sidebar
- Events logged: spend amount creation, updates, project pausing, project unpausing

### Billing Cycle Webhook
```json
{"teamId": "...", "type": "endOfBillingCycle"}
```
Use case: trigger auto-resume of paused projects at cycle end

### Permissions required
- Owner role or Billing role required to configure Spend Management

---

## 4. STRIPE ISSUING — Virtual Cards for Agents
Source: https://docs.stripe.com/issuing/controls/spending-controls + https://docs.stripe.com/issuing/agents

### Dashboard UI
- Location: Issuing overview → Card or Cardholder details page
- Edit flow: click "Edit" button → modal → "Save changes"
- Embedded components: "Issuing Card" (individual view) + "Issuing Cards List" (all cards, filterable)
- Filter options: cardholder, creation date, card type

### Control Field Names
- `allowed_categories` — whitelist merchant category codes
- `blocked_categories` — blacklist
- `spending_limits` — array of {amount, interval, categories}
- `allowed_merchant_countries` / `blocked_merchant_countries`
- `allowed_card_presences` / `blocked_card_presences` — values: "present" / "not_present"

### Spending Limit Structure
- `amount`: integer in smallest currency unit
- `interval`: "per_authorization" / "weekly" / "monthly"
- `categories`: optional array (omit = all categories)
- Default: 500 USD/day if no limits set
- Hard cap: 10,000 USD per authorization (unconfigurable)

### Card Status / Revocation (exact API call)
```
PATCH https://api.stripe.com/v1/issuing/cards/ic_123
status=inactive
```
- Status values: active, inactive (frozen), cancelled
- Embedded component actions: activate, deactivate (freeze), cancel

### Single-Use Cards (auto-revoke)
```
lifecycle_controls[cancel_after][payment_count]=1
```
Auto-cancelled after one payment — no manual revocation needed

### Webhook Events
- `issuing_authorization.request` — real-time; 2-second response timeout
- `issuing_authorization.created` — track approvals + budget usage
- `issuing_transaction.created` — settlement (1-2 days post-auth)
- `issuing_dispute.updated` — dispute resolution with status "won"

### Metadata for Agent Traceability
- `metadata[agent_id]`: "agent_fulfillment_01"
- `metadata[customer_order_id]`: "order_8821"
- `metadata[supplier]`: "supplier_logistics_co"

### Risk Scoring
- `network_risk_score`: 0–100 per authorization
- `verification_data`: address_line1_check, postal_code_check, cvc_check

---

## 5. COINBASE AGENTIC WALLETS
Source: https://www.coinbase.com/developer-platform/discover/launches/agentic-wallets + CDP docs

### Architecture (operator-facing)
- MPC-secured wallet + session keys (ERC-4337 account abstraction)
- Programmable session caps + per-transaction limits
- Gasless settlement on Base
- Native x402 payment support

### Operator Dashboard (CDP Portal)
- Provides: authentication, usage telemetry, security monitoring
- Audit trail per transaction: timestamp, signer, counterparty
- Operators can read full audit trail

### Session Key Control
- Session key = short-lived credential scoped to: max spend + allowed counterparties + expiry
- Example: "this agent can spend $50/day, anything above requires human signature"
- Agent holds session key, not master key

### Revocation Mechanism
- EIP-7702: sign a new delegation pointing to the zero address
- Policies enforced at TEE level — agent cannot bypass programmatically

---

## 6. SKYFIRE — AI Agent Payment Wallet
Sources: https://skyfire.xyz/product/ + TechCrunch + PYMNTS

### Dashboard Features
- View "exactly how much, and where, their agent is spending"
- Set "spending limits per agent"
- "Transaction monitoring and analytics"

### Spend Controls
- Per-transaction limit
- Time-based limits (daily/periodic)
- If agent tries to overspend: "pings a human to review it" (notification)

### Just-In-Time Decisioning (Agent Checkout)
- High-value transactions: routed to human for real-time approval
- Enterprise example: "coding agent that needs approval for server costs over a certain amount"

### Credential Model
- KYAPay: JWT combining agent identity verification + spend authorization claims
- Agent presents JWT, merchant verifies signature + scope claims locally
- Machine-to-machine; throughput rules out per-transaction human signatures

---

## 7. PAYMAN AI — Agentic Banking Dashboard
Sources: https://paymanai.com/ + docs.paymanai.com

### Dashboard Sections
- Real-time intent data + customer signals display
- "Execution Trace" — timeline view of workflow execution with timestamps

### Policy Engine Configuration
- Max amount per transaction
- Daily spending limits
- Recipient whitelist
- Approval requirements above threshold
- Geographic restrictions

### Concrete Microcopy (verified from homepage)
- System confirmation: "Done. $142.50 to ConEd. Confirmation sent."
- System confirmation: "Done. I've moved $500 from savings to checking. Your rent payment is covered."
- Spend summary: "$847 across 12 transactions this month. Up 15% from last month."
- Safety gate: "Message passed all safety checks"
- Breakdown: "Broke down request into 3 tasks", "Used 3 tools to complete task"
- Tagline: "Your rules. Enforced automatically."

### Execution Trace Format (what each entry contains)
1. Customer request in their exact words
2. AI reasoning
3. Policy checks applied
4. Authorization flow
5. Execution timestamp
6. Status: "Completed" (with timestamp)

### Audit Trail
- 100% of payment instructions logged
- Reference ID + real-time status per transaction

---

## 8. NEVERMINED — AI Agent Payment Delegation
Sources: https://nevermined.ai/blog/nevermined-pay-give-your-ai-agent-a-credit-card-with-guardrails + three-ways post

### Dashboard Location
- URL: nevermined.app
- Section: "Payment Methods"
- View: every enrolled card + every active delegation

### Delegation Creation Flow
1. Click "+ Enroll card" — select provider (Stripe, Braintree, Visa)
2. Card tokenized in PCI-compliant iframe (raw numbers never stored)
3. Click "+ Create delegation"
4. Configure parameters (see below)
5. Agent receives API key to pay via x402 (never the card number)

### Delegation Parameters
- Spending cap: minimum $0.50
- Expiry: "one hour, a day, a week, a month, or a custom window"
- Transaction count cap (optional, frequency independent of budget)
- API key scope (optional, restricts leaked credentials to delegation's budget)
- Merchant category restrictions
- Per-purchase cap

### Limit Enforcement
- Server-side check: cap + clock + transaction count
- "Cross any line and the delegation is spent"
- Agent access: permission-scoped, not card numbers

### Revocation
- "Revoke it by hand and it stops on the next request, no waiting period"
- Revocation control on same screen as creation
- One enrolled card can back multiple delegations with different limits

---

## 9. CLOUDFLARE AI GATEWAY — Spend Limits for LLM Calls
Source: https://developers.cloudflare.com/ai-gateway/features/spend-limits/

### Configuration
- Location: "gateway settings" in dashboard or via API
- Maximum: 20 rules per gateway

### Scope Dimensions
- Model
- Provider
- Custom attributes: user, team, application (admin-defined)
- Can split by value or filter by specific value

### Time Windows
- Fixed: monthly (resets 1st of month), weekly (resets Monday), daily (resets midnight)
- Rolling periods also available

### When Limit Exceeded
- Default: returns 429 Too Many Requests
- Alternative: route to cheaper fallback model via Dynamic Routes
- Blocks all further requests until window resets

### Analytics Dashboard
- Filter by: model, provider, or custom attributes
- Tracks cumulative spend in real time per request

### Notifications
- NONE YET (as of research date) — "working to add capability"

### Cost Tracking Caveat
- "Best-effort estimation based on token counts and model pricing"

---

## 10. SERVICENOW AI CONTROL TOWER — Enterprise Kill Switch
Sources: servicenow.com/products/ai-control-tower.html + TheRegister + Fortune

### Primary Kill Switch Feature
- Single action: "pause, redirect, or stop any agent, anywhere in the enterprise"
- Described as: "the ability to have a kill switch"
- Severs: all active sessions, revokes temporary tokens, pushes block rule
- Re-invocation blocked until admin explicitly reinstates

### Dashboard Areas (five pillars as of Australia release)
1. Discovery — find all AI agents in enterprise
2. Observation — runtime monitoring + live alerts
3. Governance — compliance mapping, hallucination/bias detection
4. Security — policy enforcement
5. Measurement — performance vs business outcomes

### Monitoring Detail
- "Real-time cockpit" of AI performance, compliance health, alert thresholds
- Live alerts replacing periodic manual audits
- Can see: "how agents reason, where they make decisions"
- Integration: Virtual Agent or Flow Designer → trigger corrective workflows

### Soft Controls Available
- Pause/disable agents exceeding defined scope
- Redirect to different workflow
- Step-level intervention without affecting completed steps

---

## 11. SMASHING MAGAZINE — Designing for Agentic AI UX Patterns
Source: https://www.smashingmagazine.com/2026/02/designing-agentic-ai-practical-ux-patterns/ (Feb 2026)

### Pattern 1: Intent Preview (pre-action)
Header: "Proposed Plan for [Context]"
Numbered steps with bold action labels + brief description
Three CTA buttons: "Proceed with this Plan" | "Edit Plan" | "Handle it Myself"

Example copy:
> "I've detected that your 10:05 AM flight has been canceled. Here's what I plan to do:
> 1. **Cancel Flight UA456** — Process refund and confirm details.
> 2. **Rebook on Flight DL789** — Book confirmed seat on 2:30 PM non-stop.
> 3. **Update Hotel Reservation** — Notify Marriott of late arrival.
> 4. **Email Updated Itinerary** — Send new details to you and Jane Doe."

### Pattern 2: Autonomy Dial
Four levels (configurable per task type):
- "Observe & Suggest" — notifications only, no plans
- "Plan & Propose" — full plan requires user review
- "Act with Confirmation" — agent prepares, user gives final go/no-go
- "Act Autonomously" — independent action with post-action notification

### Pattern 3: Explainable Rationale Notification
Format:
- Status: "I've [action]."
- Rationale: "Why I took this action:" (bullet points)
- Link: "[ View New Itinerary ]"
- Safety: "[ Undo this Action ]"

Example:
> "I've rebooked your canceled flight. New Flight: Delta 789, 2:30 PM. Why: your original flight was canceled, and you pre-approved autonomous rebooking for same-day non-stop flights."

### Pattern 4: Confidence Signal Display
- Percentage: "Confidence: 95%"
- Scope: "Scope: Travel bookings only"
- Color codes: green checkmark (high) | yellow question mark (uncertain)

### Pattern 5: Action Audit & Undo Interface
- Chronological timeline view
- Status indicators: successful | in-progress | undone
- Time-limited undo: "Undo available for 15 minutes"
- Prominent undo button per action entry

### Pattern 6: Escalation / Clarification
- Ambiguity: "You mentioned 'next Tuesday.' Do you mean September 30th or October 7th?"
- Unusual flag: "This transaction seems unusual. Flag for human review? [ Yes ] [ No ]"

### Pattern 7: Error Recovery
- Headline: "We made a mistake on your recent transfer."
- Apology: "I apologize. I transferred $250 to the wrong account."
- Corrections: "✔ Corrective Action: transfer reversed, $250 refunded"
- Next steps: "✔ Next Steps: incident flagged for internal review"
- "[ Contact Support ]" button

### Key Metrics Referenced
- Plans Accepted Without Edit: target >85%
- Override ("Handle it Myself") clicks: >10% triggers review
- Reversion Rate: >5% undone disables automation
- Escalation Frequency: 5–15% of tasks
- Recovery Success Rate post-escalation: >90%

---

## 12. MANTLR / GENERAL AI AGENT UX PATTERNS (2026)
Source: https://mantlr.com/blog/designing-for-ai-agents-ux-patterns-2026

### Autonomy Slider
- Three modes: "Suggest" / "Co-pilot" / "Autopilot"
- Described as "primary UI element" (not buried in settings)
- Adjustable in real-time

### Activity Feed Structure
- Collapsible sidebar or panel
- Chronological timestamped entries:
  - "10:03am — Searched 4 flight providers"
  - "10:04am — Found 7 options under $800"
  - "10:04am — Filtered to direct flights only"
  - "10:05am — Selected Delta $720 departing 9am"
- Grouping by session or task
- Filter by action type
- "Revert" / "undo" buttons next to each logged action

### Risk Tier Gating
- Low-risk: auto-execute + log (no interruption)
- Medium-risk: quick preview + one-click approval
- High-risk: full preview + explicit confirmation + undo window

### General Principle on Notification Tiering
- "Most agent activity is 'glance if you care'"
- "A little is 'you must look now'"
- Ambient badges for low-priority; interrupting notification for critical
- Over-escalation = "cry-wolf dashboard" → users ignore all notifications

---

## 13. MASTERCARD AGENT PAY — Consumer Agent Token Controls
Source: https://eco.com/support/en/articles/14845483 + mastercard.com press release

### Consumer Enrollment Flow
1. Enroll card through issuing bank's app
2. Grant agent a policy with: spend ceiling, merchant categories, expiration
3. Bank requests "Agentic Token" scoped to user's parameters

### Token Scope Parameters
- Maximum spend per session
- Allowed merchants or merchant categories
- Session lifetime

### Revocation
- "Authorization is revocable in real time through the consumer's issuer app"
- "Pulling an agent's authorization invalidates the Agentic Token at the network"
- "Next attempted transaction fails at authorization"
- No card reissuance required

### Intent Artifact (audit trail)
- Signed record of user's original instructions
- Each transaction carries a reference to the Intent Artifact
- Issuer can verify at transaction time whether cart is consistent with original intent
- Contains: purchase intent, cart contents, transaction limits, validity periods

---

## TRANSACTION NOTIFICATION COPY PATTERNS
Source: https://messageflow.com/blog/transactional-push-notifications-examples/

### Verified Examples (from live fintech apps)

**Declined Transaction:**
> "A payment of $349.00 at Online Electronics Store was declined on 03/02/2026 at 6:04 PM."

**Unusual/Fraud Alert:**
> "We detected an unusual payment attempt from abroad. View details in the app and confirm whether you recognize this transaction."

**New Card Alert:**
> "A new Visa card ending in 4821 was added to your account. If you didn't authorize this, block the card in the app."

**Auto-Renewal Warning:**
> "Your Premium subscription will auto-renew on 03/05/2026. Amount: $12.99/mo. Review or update your payment method in Settings."

**Failed Payment:**
> "We couldn't process your subscription payment. Update your card details to keep your access active."

### Push Notification Best Practices (verified)
- Title: 6–8 words ideal
- Body: ~10 words
- Never expose full card number in lock-screen-visible notification
- Mask to last 4 digits: "card ending in 4821"
- Fintech transaction push CTRs: 10–15%

---

## KILL-SWITCH UX PATTERNS (across products)

### Three-Level Escalation (KILLSWITCH.md standard)
1. Throttle: reduce rate — agent slows automatically
2. Pause: halt + notify — agent stops, notification sent to operator
3. Full stop: emergency termination + save state

### Confirmed Kill Switch UI Patterns (from research)

**Vercel**: Toggle switch "Pause production deployment" — requires entering team name to confirm; auto-applies when spend amount hit. Manual per-project resume.

**Stripe Issuing**: `status=inactive` API call (freeze) or `status=cancelled` (permanent). Dashboard: deactivate / cancel buttons in Issuing Card component.

**Nevermined**: "Revoke it by hand and it stops on the next request, no waiting period." Same screen as creation.

**ServiceNow AI Control Tower**: Single action pauses/stops any enterprise agent. Re-invocation blocked until admin reinstates.

**Skyfire**: Just-in-time decisioning — high-value transactions paused for human review. Pings human when agent tries to overspend.

**Mastercard Agent Pay**: Revoke in issuer bank app → Agentic Token invalidated network-wide → next transaction fails.

**Coinbase Agentic Wallets**: Session key expiry + EIP-7702 delegation to zero address = permanent revoke.

### UI Affordance Language Used Across Products
- "Pause" (temporary, resumable)
- "Deactivate" / "Inactive" (Stripe freeze)
- "Terminate" (Ramp — permanent deletion)
- "Archive" (Brex — soft delete, reopenable)
- "Revoke" (Nevermined, Mastercard)
- "Full stop" (KILLSWITCH.md standard)
- "Kill switch" (ServiceNow, Payman)
- "Block" (Cloudflare — automatic at limit)

---

## EMPTY / LOADING / ERROR STATES

### Empty States (inferred or observed)
- No agents provisioned: Brex shows "Create spend limit" as primary CTA
- No transactions yet: Activity feed shows empty state with getting-started prompt (inferred)
- Vercel: New customers get default $200 spend amount automatically enabled

### Loading States
- Ramp: Policy flag appears "15–30 seconds after the transaction is processed"
- Stripe: 30-second delay in spend aggregation (best-effort)
- Vercel: 2-minute lag before spend check triggers pause

### Error States
- Vercel paused project: 503 DEPLOYMENT_PAUSED error page for visitors
- Cloudflare over limit: 429 Too Many Requests to calling agent
- Stripe declined auth: `issuing_authorization.request` webhook returns decline decision
- Mastercard Agent Pay revoked: Transaction fails at authorization (network-level)

---

## PATTERNS TO NOTE FOR LEASH

1. **Spend bar**: Not explicitly shown as a progress bar in any product; described as "amount used / total amount" with approaching-limit notifications at 50%/75%/100% thresholds (Vercel)

2. **Activity feed entry format**: "[timestamp] — [action description] — [amount] at [merchant]" is the dominant pattern across Mantlr, Smashing Mag, and Payman

3. **Kill switch confirmation**: Vercel requires team name input to confirm pause. Brex has a 6-second undo window. ServiceNow uses single-click. Most serious revocations (Mastercard, Coinbase) are irreversible until re-provisioned.

4. **Push notification copy pattern** (inferred from fintech best practices):
   - "[Agent name] spent $[amount] at [merchant]. $[remaining] remaining of your $[cap] budget."
   - Declined: "[Agent name] was blocked from spending $[amount] at [merchant]. Budget limit reached."
   - Near-limit: "[Agent name] has used [X]% of its $[cap] budget."

5. **Three-tier notification strategy**: Payman / Smashing Mag pattern:
   - Tier 1 (silent/ambient): routine transactions logged only
   - Tier 2 (banner): approaching limit, unusual merchant
   - Tier 3 (interrupt + require action): over limit, suspicious activity, human approval required

6. **Revocation spectrum**:
   - Soft: pause (resumable; ServiceNow, Vercel)
   - Medium: freeze card (resumable; Stripe status=inactive)
   - Hard: cancel card (permanent; Stripe status=cancelled)
   - Nuclear: zero-address delegation (blockchain-level; Coinbase EIP-7702)

---

## SOURCES

- https://support.ramp.com/hc/en-us/articles/360051065813-Setting-up-controls-on-Ramp-cards-and-funds
- https://support.ramp.com/hc/en-us/articles/5939293080083-Temporary-changes-to-spending-limits-on-your-card-or-funds
- https://support.ramp.com/hc/en-us/articles/4417662362259-Spend-guidelines-Alerts-and-flags
- https://www.brex.com/support/spend-limits-overview
- https://www.brex.com/support/manage-budgets-and-spend-limits
- https://www.brex.com/support/brex-notifications
- https://vercel.com/docs/spend-management
- https://vercel.com/blog/introducing-spend-management-realtime-usage-alerts-sms-notifications
- https://docs.stripe.com/issuing/controls/spending-controls
- https://docs.stripe.com/issuing/agents
- https://www.coinbase.com/developer-platform/discover/launches/agentic-wallets
- https://skyfire.xyz/product/
- https://techcrunch.com/2024/08/21/skyfire-lets-ai-agents-spend-your-money/
- https://paymanai.com/
- https://nevermined.ai/blog/nevermined-pay-give-your-ai-agent-a-credit-card-with-guardrails
- https://nevermined.ai/blog/three-ways-to-give-an-ai-agent-a-spending-limit
- https://developers.cloudflare.com/ai-gateway/features/spend-limits/
- https://blog.cloudflare.com/ai-gateway-spend-limits/
- https://www.servicenow.com/products/ai-control-tower.html
- https://www.theregister.com/software/2026/05/05/servicenow-adds-agent-kill-switches-to-ai-control-tower/5228579
- https://fortune.com/2026/05/06/servicenow-kill-switch-ai-agents-bill-mcdermott/
- https://www.smashingmagazine.com/2026/02/designing-agentic-ai-practical-ux-patterns/
- https://mantlr.com/blog/designing-for-ai-agents-ux-patterns-2026
- https://eco.com/support/en/articles/14845483-mastercard-agent-pay-explained
- https://eco.com/support/en/articles/14839409-ai-agent-spend-controls
- https://messageflow.com/blog/transactional-push-notifications-examples/
- https://killswitch.md/
- https://catena.com/
