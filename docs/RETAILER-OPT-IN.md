# Retailer opt-in

Everything in this project rests on one thing: the retailer agrees. With an opt-in, the
sourcing question, the terms-of-service question and most of the platform question all
resolve at once. Without one, every part of the system has to work around a problem that a
short email would have solved.

This is the email.

## What makes retailers say yes

They already pay for exactly this. Weedmaps charges a few hundred dollars a month for a
listing and four figures for advertising; Leafly's basic listing is free but its ads run from
several hundred a month upward. We are offering the useful half for nothing, with no
commission and no way to pay for position.

## What makes retailers say no

Not disinterest — compliance. New York regulates the licensee, and a dispensary can be
penalised for how its products are advertised even when a third party does the advertising.
So the person who says no is usually the compliance officer, not the owner.

The letter below is written to answer that person before they have to ask.

## The letter

> **Subject:** Free strain listing for {{DISPENSARY}} — no cost, no commission, no ordering
>
> Hi {{NAME}},
>
> We're building SŌMA, a cannabis sommelier that helps people find strains matching their
> taste preferences. When someone finds a strain they like, we'd like to be able to show them
> that you carry it.
>
> **What we would show**
>
> - Your name and address, as published in OCM's licensed retailer directory
> - The strain names you list, grouped by package size: 1/8, 1/4, 1/2 and 1 oz
> - The date we last checked
>
> **What we would not show**
>
> No prices. No THC or CBD figures. No product photos. No logos. No promotions, discounts or
> coupons. No reviews or ratings.
>
> **What we don't do**
>
> - We don't sell cannabis, take orders, or process payments. Anyone who wants to buy goes to
>   you directly.
> - We take no commission and no payment from retailers. There is no featured placement, no
>   sponsored position, and no way for anyone to pay to rank higher. Results are ordered by
>   distance and nothing else.
>
> **How the data would reach us** — whichever is easiest for you:
>
> 1. An export from your POS or menu system, on whatever schedule suits you
> 2. A feed or API from your menu provider
> 3. Your written permission for us to read your public menu once a day
>
> **On compliance**
>
> We list only retailers that appear in OCM's published directory of licensed adult-use
> dispensaries. We never state that an item is in stock or available — only that it was listed
> when we last checked, and we show that date next to it. If a check fails, we say so rather
> than showing old data as current.
>
> **Stopping**
>
> Reply to this email and we remove you the same day. No notice period, no conversation, no
> reason needed.
>
> Happy to send you a link to exactly what your listing would look like before you decide.
>
> {{YOUR NAME}}
> {{CONTACT EMAIL}}

## Notes on sending it

- **Send it to one retailer first.** Get one yes, build the listing, show it to them, and use
  that as the example for the next ten.
- **Attach nothing.** A PDF makes it look like a contract. This is an email.
- **Lead with the preview link if you have one.** Seeing the listing removes more objection
  than any paragraph of text.
- **Do not negotiate on the removal clause.** Same-day removal, no questions, is the single
  strongest thing in the letter, and the cheapest to honour.
- **Record the reply.** A yes goes in `source_policy_reviews` with the email as the permission
  reference. That record is the reason automated access is permitted, and it needs to survive
  longer than anyone's memory of the conversation.
