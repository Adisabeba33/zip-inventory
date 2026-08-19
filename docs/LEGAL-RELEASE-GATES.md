# Legal release gates

Public launch is blocked until every item below is true. The flags
`PUBLIC_LAUNCH_ENABLED` and `PUBLIC_INDEXING_ENABLED` default to `false` precisely so that
the private/staging posture is what you get by accident and the public one takes a decision.

## The honest position on risk

Legal risk here cannot be driven to zero, and this document does not claim otherwise.

New York's cannabis regulations define a third-party platform, marketplace or aggregator
broadly enough to reach a service that "otherwise lists cannabis products". An informational
service with no prices and no checkout may still fall inside that definition. Separately, OCM
guidance treats retailer menus as advertising, which is why the design is deliberately plain
and free of anything promotional.

The architecture is built to keep the service as far from trade, advertising and marketplace
behaviour as it can get while remaining useful. That reduces exposure. It does not replace
advice from counsel.

## Before public launch

**Legal**

1. Reviewed by a New York attorney who understands both the Cannabis Law and internet/data
   law.
2. Written clarification obtained, where possible, on this specific service model.
3. The applicability of the third-party platform / aggregator rules to this service is
   resolved, in writing.
4. Terms of Use reviewed and published.
5. Privacy policy reviewed and published.
6. Crawler policy published.
7. Any regulatory disclosures counsel identifies are configured in the `legal_notices` slots
   (they are configuration, not code, so no redesign is required).

**Directory**

8. The OCM directory import works and runs on a schedule.
9. Only licensed New York adult-use dispensaries appear.

**Sources**

10. The source registry is implemented, with a policy review recorded for every enabled
    source.
11. No source can be crawled without an approving review on file — verified by test.
12. No CAPTCHA, challenge or access-control bypass exists anywhere in the codebase.
13. No third-party marketplace or menu platform is crawled without that platform's permission.

**Product surface**

14. No prices anywhere.
15. No product photographs.
16. No retailer or producer logos.
17. No purchase links.
18. No checkout, cart or ordering functionality.
19. "Sold out" and equivalent availability claims appear nowhere — enforced by the copy test.

**Observation correctness**

20. A failed crawl does not change inventory — verified by test.
21. The two-miss confirmation works — verified by test.
22. Anomaly protection works — verified by test.
23. The last successful check time is shown on every retailer page.

**Process**

24. The site-wide independent-service disclaimer is in place.
25. The data correction flow exists and routes to human review.
26. The crawler opt-out process exists and can pause a source without a deployment.

## Status of the automated gates

`npm test` covers items 11, 12 (by construction and by the challenge-detection tests), 19,
20, 21 and 22. The rest are human sign-offs and should be recorded, dated, alongside this
file before either flag is flipped.

## Safest operating mode

Until counsel says otherwise, run inventory automation **only** for:

- retailers who have opted in,
- permitted APIs, and
- sources with explicit automation permission.

Every other licensed retailer still appears in the directory, from the official OCM list,
with "Inventory tracking not available yet" in place of inventory. Directory coverage can be
complete while automated inventory coverage is narrow. That is much safer than attempting to
read every retailer regardless of their rules, and the architecture already works this way.

## Not in phase 1

Cross-retailer strain search ("which retailers near 10605 list GG4 in 1 oz") and inventory
change alerts both push the service further towards the aggregator role. Neither is built.
Each needs its own legal review before it is.

## Monetisation

The service takes no percentage of sales, referral fee, affiliate commission, cost per order,
cost per click or payment for placement, and no retailer can influence ordering. If
monetisation is ever considered, it goes to legal review first, and the cleanest option is
one that does not depend on any particular cannabis sale — an independent user subscription,
for instance. Advertising is a separate project with its own review, and must not be mixed
into this one.
