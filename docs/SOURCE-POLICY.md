# Source policy

Every place we might read inventory from is a row in `inventory_sources`, and every row
carries the legal status of our access to it. This document is the procedure behind that row.

## Determine the owner first

The owner of the *endpoint* matters, not the owner of the page you were looking at.

A retailer's website that visually displays a menu may be loading that menu from a
third-party platform. In that case the request goes to that platform's infrastructure, the
platform is the source owner, and it needs its own review and its own permission. Set
`source_type = THIRD_PARTY_PLATFORM` and treat the retailer's own terms as irrelevant to it.

Do not read a menu platform or aggregator automatically simply because a browser can reach
it.

## Order of preference

1. **`RETAILER_API` / `DIRECT_FEED`** — an official API or feed the retailer has licensed or
   permitted. Always prefer this.
2. **Direct data with explicit permission** — the retailer sends or authorises us to read it.
3. **`RETAILER_WEBSITE`** — a public menu on a retailer-owned site, *and only* where a
   documented review concluded that automated access is permitted.

If none of these applies, the retailer appears in the directory with no inventory. That is a
normal, expected outcome, not a gap to work around.

## The review

Record all of this in `source_policy_reviews` through the admin dashboard, before the source
is enabled:

1. Who owns the endpoint.
2. Read the terms of service. Summarise what they say about automated access.
3. Check `robots.txt`. Summarise what it says.
4. Check any API documentation and its conditions.
5. Determine whether automation is allowed.
6. Record the date, the decision, and the rationale.
7. Record the permission type and a reference to the evidence (agreement, email, ticket).
8. Set the allowed frequency.
9. Only then enable automation.

`enableAutomation` refuses unless a current, permitting review is on file, so step 9 cannot
run ahead of steps 1–8.

## robots.txt is not the whole answer

`robots.txt` is one input. If it permits automated access but the terms of service prohibit
automated extraction, **automation stays off** unless permission or legal approval says
otherwise. The reverse also holds: a permissive terms document does not override a
`Disallow`.

## Re-review

Terms change. Every source has a `next_review_due_at`, 90 days out by default. Once that date
passes the gate refuses the source with `policy_review_expired` until someone reviews it
again. Sources approaching their review date are listed on the admin overview.

## Automation states

| State | Crawler may run |
| --- | --- |
| `PENDING_REVIEW` | no |
| `APPROVED` | **yes** |
| `EXPLICIT_PERMISSION` | **yes** |
| `API_LICENSED` | **yes** |
| `AUTOMATION_PROHIBITED` | no |
| `PAUSED` | no |
| `LEGAL_HOLD` | no |

## What the crawler will never do

Not as a fallback, not behind a flag, not "just to test":

- solve or bypass a CAPTCHA, bot challenge or web application firewall
- sign in, create an account, or use anyone's credentials or cookies
- rotate addresses or identities to get around a rate limit or a block
- present itself as a browser, as a search engine crawler, or as any other client
- call private endpoints found by reverse engineering an authenticated client
- continue after a source owner has asked it to stop

An access control means the answer is no. The run fails, the source is paused, and a human
looks at it.

## Rate and courtesy

One observation per source per 24 hours by default, in a deterministic slot derived from the
source id so the fleet spreads across the day. `429` and `Retry-After` are honoured. Failures
back off on a 30-minute / 2-hour / 6-hour ladder and then wait for the next daily slot.
`401`, `403` and `451` pause the source instead of retrying.

## Opt-out

A source owner can ask us to stop through the correction form, or by writing to the source
owner contact address. Once verified, set the source to `PAUSED` or `LEGAL_HOLD` on its admin
page. That takes effect immediately — it is a database change, not a deployment.

Do not argue technically with a source owner. If there is anything to discuss, it goes to
legal.
