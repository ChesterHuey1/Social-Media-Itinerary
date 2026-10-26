# Decisions that change the spec

The spec ("Pinpoint: Travel Planner Spec", Oct 24, 2026) is still the source of truth. This file lists every place where the build differs from it, and why. When the two disagree, this file wins.

## Data model

These change the tables in the spec's "Data model and architecture" and "Flights and hotels" sections. Part 2 creates the tables from this list.

### Stops store order, not times

A stop stores what the user controls. Arrival times are computed from the order, the travel legs and each stop's time spent, so a reorder can never leave a stale time behind.

| Table | Columns |
|---|---|
| stops | id, day_id, place_id, position, title (null shows the place name), color, objectives, stay_minutes, stay_source (`estimate` or `user`), locked_at (null when not locked) |
| legs | from_node, to_node, depart_hour, mode (`walk` or `transit`), minutes, distance_m, line, fare_usd, source (`routes` or `estimate`), fetched_at |

The spec's `stops.minutes`, `minutes_source` and `locked` become `stay_minutes`, `stay_source` and `locked_at`. A route node is a place id or a stay id. A pair with no leg in the table gets a straight-line estimate, shown with a `~`.

### Trips have no single city

`trips.city` is removed. Each day's city comes from the stay that covers that night, so a Tokyo and Kyoto trip needs no special case.

### Saved places have a status

The saved list is per user, and a place saved after a trip is built must still reach that trip.

| Table | Columns |
|---|---|
| saved_places | id, user_id, place_id, source (`reel` or `search`), status (`new`, `in_trip`, `dismissed`), created_at |
| saved_post_places | saved_post_id, place_id |

`saved_post_places` links each post to the places found in it, so one restaurant saved from two Reels is one place with two posts.

- `new` means saved since the last build. These show under New saves in the day view, each with "Add to Day N" or "Backlog".
- Build itinerary marks checked places `in_trip` and unchecked ones `dismissed`, because you saw them and left them out.
- "Add to Day N" suggests a day in the place's city where it fits at the end, nearest to that day's stops. It uses the same check as Move to Day. When no day works, only Backlog shows, with the reason.
- Undo after a build puts the days and backlog back but not these statuses.

### Day timing and Optimize route

The browser's timeline (`frontend/src/domain/timeline.ts`) and the optimizer (`backend/src/pinpoint/plan/optimize.py`) use the same arithmetic, so a plan the optimizer accepts never shows a warning:

- Arrival = when you left the last place + the leg + 10 minutes of slack, in **exact minutes**. Times are no longer rounded up to 5 minutes; rounding made the two disagree by a few minutes per leg.
- Arriving up to 20 minutes before opening, you wait. Before the first stop there is no cap: you leave the hotel later.
- A locked stop arrives exactly at its locked time.
- Optimize route minimizes travel time, then prefers the plan that uses the morning and ends earliest.
- A stop that can't fit goes to the backlog with a reason, and the toast offers Undo for 10 seconds.
- Meal-time preferences (breakfast, lunch, dinner windows) are not modeled yet; the spec marks them as soft.

The straight-line leg estimate exists in both languages with the same constants, and both test suites check the same two example legs.

### Trip setup and day hours

Days are worked out from flights, hotels and the hours you chose, by `backend/src/pinpoint/setup/days.py`. Only the server does this. The Trip setup page sends one change at a time to `POST /api/trips/{id}/setup` and shows the trip that comes back.

- `days.preferred_start_min` and `preferred_end_min` hold the hours you chose. `start_min`, `end_min`, the fixed rows, the hotel and the note are derived, and only `sync_days` writes them.
- The trip runs from the arrival flight to the departure flight. Without a flight, it runs from the first check-in or to the last check-out.
- Arrival day starts at landing + buffer + time to the hotel. Departure day ends at take-off - time at the airport - time to the airport.
- `flights.transfer_min` is the time between the airport and the hotel, set per flight and 60 minutes when blank. The straight-line estimate can't be used: it treats Kansai to Kyoto (75 km) as city transit and gives over 4 hours. Airport transfers will fill this from Google Routes.
- When new dates add days, they are titled "Day in <city>". When new dates remove days, their stops go to the backlog with "Its day is no longer on the trip."
- The server refuses overlapping hotels, check-out before check-in, two arrival or two departure flights on one date, and trips over 60 days. Each refusal leaves the trip unchanged.
- Adding a hotel waits for place search, which needs the Google key. Editing a hotel's dates, times and cost works now.
- `backend/tests/test_setup.py` checks that the sample trip's days are exactly what its flights and hotels give.

## Airport transfers

| Table | Columns |
|---|---|
| airport_buffers | iata_code, international_min, domestic_min, source |
| transfers | id, trip_id, flight_id, stay_id, direction (`arrive` or `depart`), mode (`train`, `bus`, `rideshare`), depart_at, arrive_at, minutes, fare_usd, fare_source, summary, picked, fetched_at |

`flights` gains `buffer_min` (null uses the airport's value) and `big_luggage`. The arrival day starts when the picked transfer arrives at the hotel.

### Place facts and the scraper

`places` keeps the value the app uses (hours, cost, tip), each with its source. `place_facts` keeps every value any source found, with the page and the line it came from, and `scraped_pages` keeps each fetched page's text, title and same-site links that looked like hours or price pages.

The scraper (`uv run python -m pinpoint.enrich`) fetches a place's homepage and up to 2 same-site pages whose link text suggests hours, prices or booking. Until DeepSeek reads those pages, a pattern matcher stands in:

- It fills **only gaps**, and only hours and last entry, which pass strict checks.
- Booking and price lines are recorded with their evidence but not applied. On a page listing many bars or shops, a pattern can't tell whose rule a line describes.
- When a site disagrees with a value we already have, the report flags it and nothing changes.

### Third-party sources (changes the spec)

The spec said v1 does no crawling of blogs or itinerary sites. That changed on 2026-10-26: the scraper also reads what others say about each place, always through official APIs and never by getting around robots.txt or blocks.

| Source | How | Needs |
|---|---|---|
| Wikivoyage | Wikimedia API; reads the structured listing (hours, price, description) for the place | Nothing |
| Wikipedia | Wikimedia API; the article summary | Nothing |
| Reddit | Reddit's official Data API; searches the city's travel subreddits and reads top comments. Reddit's robots.txt disallows all crawling, so this is the only allowed route | A free "script" app: `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USERNAME` |
| Travel blogs | Brave Search API finds posts; the polite scraper reads them. Tripadvisor, Yelp, booking sites and social networks are never read | `BRAVE_SEARCH_API_KEY` |

Rules:

- What third-party sources say is **recorded in `place_facts` under the source's name and never applied** to a place. The report shows it beside the official value.
- A listing or article counts only if it names the same place: the same distinctive words (ignoring accents and words like temple, market, street), with only the place's own area or city as extras. Wikivoyage guides must be about the place's city.
- Tips are sentences that name the place and give advice (lines, booking, when to go, cash). DeepSeek will summarize them once connected.
- Documents are reused for 30 days. `--force sources` refreshes only third-party sources.

### Budget

- Categories are Flights, Stay, Food, Tickets and Transit. The spec listed four but filed flight costs under Flights.
- Flight and stay costs live on their own rows and count toward the budget. They are not copied into `expenses`, so each amount has one writer.
- `expenses` gains `fx_rate` and `fx_date`, the exchange rate used and its date.
- The server converts. The form shows the dollar amount from `GET /api/fx` before saving, but `POST /api/trips/{id}/expenses` looks the rate up again and is the only writer of `amount_usd`.
- Frankfurter has no rate for weekends or for future dates. A weekend uses the business day before, and `fx_date` records that day. A date on or after today uses the latest rate.
- Past rates never change, so `fx_rates` keeps each one after the first lookup.
- The currency list is the 30 currencies Frankfurter publishes. `backend/tests/test_budget.py` fails if the frontend's list differs.
- Expenses are added and removed through their own endpoints, not the plan edits, because only the server knows the rate.

## Airport transfers

After landing, the app lists real ways to reach the hotel and lets you pick one.

1. Ready time = landing time + the airport's buffer. The default is 1 h 30 m international and 1 h domestic, and you can change it per flight.
2. Google Routes at the ready time returns train options (transit, trains only), bus options (transit, buses only) and drive time with traffic for a taxi or Uber.
3. The taxi or Uber price is an estimate from distance and time, labeled "estimated". An "Open in Uber" link fills in the hotel so the real price shows in Uber.
4. **Default pick:** the cheapest option within 15 minutes of the fastest. With `big_luggage` set, options with transfers rank lower. If no train or bus runs at that hour, only taxi or Uber shows, with the reason.
5. **Flight delays:** changing the landing time recomputes the options and shows a warning on Day 1. It does not re-plan the day on its own, which matches the rule that nothing moves until you act.
6. Departure day works in reverse: hotel to airport, arriving 3 h before an international flight or 2 h before a domestic one.
7. **Out of v1:** live flight status, which needs a paid flight-data service.

Until API keys exist, all searches return mock options.

## Login

The spec says one account, a password hash in `.env`, a session cookie and HTTPS only.

- The hash is scrypt from Python's standard library, set with `uv run python -m pinpoint.auth set-password`.
- The cookie holds an expiry and its HMAC with `SESSION_SECRET`, so the server stores no sessions. It lasts 30 days and is HttpOnly and SameSite=Lax.
- `COOKIE_SECURE=true` marks the cookie HTTPS only. It stays false while the app runs on localhost over plain HTTP, and must be turned on before the Instagram tunnel opens.
- Five wrong passwords from one address within 10 minutes block sign-in from that address until the window passes.
- Every `/api` route except sign-in and health needs the cookie. `tests/test_auth.py` fails when a route is left open.

## Usability

| Problem | Decision |
|---|---|
| Places saved after the trip is built have nowhere to go | The sidebar shows a count of `new` saved places. Each one offers "Add to Day N" or "Backlog". |
| Optimize route throws away a manual order | An Undo toast shows for 10 seconds after optimizing. Locked stops never move. |
| Moving a stop to another day takes two steps | Each stop gets "Move to Day…", which checks the hours on the target day. |
| Rebuilding the itinerary is undefined | Rebuild places only new and backlog places, never moves locked stops, and shows a preview first. |
| Dragging is hard on a phone | The up and down arrows stay visible on every card. |
| "Name it" for an unmatched post leads nowhere | A panel shows the post's image and caption with a place search. |

How Rebuild works:

- A trip with stops on any day is rebuilt, not built. Every stop stays on its day. Only places not on a day yet are added: checked saved places, and backlog places that have no checkbox. Each goes to the nearest day in its city that it can be visited on and that has room.
- Unchecked places still leave the trip, except locked stops, which never move.
- Only days that changed are optimized again.
- `POST /api/trips/{id}/build/preview` runs the build and rolls it back. The setup page lists each place that would change day, join, or leave. "Apply changes" sends that plan back to `/build`, which saves it exactly. Running the build again could differ, because the solver stops at a time limit.
- The Undo toast after a rebuild works as it does after a first build.

## Look and feel

This replaces the spec's "UI specification" colors, type and component shapes. The layout, the three columns and their breakpoints, the spacing scale, and the screen flow stay as the spec has them.

- **Cards with clear edges.** White cards with a soft shadow and one corner radius on a pale green-gray page. No outlines.
- **Palette: white and green.** Forest green `#2F6B4F` marks the one next step: the primary button, the active day, transit lines. Terracotta appears only on warnings. Every text and background pair passes 4.5:1.
- **Fonts:** Fraunces for titles and Figtree for everything else.
- **Little subtext.** No helper text under fields, no dot-joined meta lines, no uppercase labels. Facts use short labels: Hours, Cost.
- **Day totals:** one line under the day title, and an itemized breakdown after the last stop.
- **Spacing:** only the nine values in the spec (4, 8, 12, 16, 20, 24, 32, 48, 64 px). `npm run lint` fails on any other value.

The mockups are on the design canvas: https://claude.ai/artifact/5UGG4mWZAck7nU58SxcTnD
