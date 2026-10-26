# Pinpoint

A trip planner that turns places you DM to an Instagram bot, or search for on the site, into a day-by-day itinerary.

## Run

Start the backend first (see [backend/README.md](backend/README.md)), then:

```sh
cd frontend
npm install
npm run dev          # http://localhost:5173, forwards /api to the backend on port 8000
npm test             # domain tests
npm run lint         # oxlint (including the useEffect ban) and the spacing scale
npm run test:layout  # renders the app in Edge and checks spacing at three widths
```

See [docs/decisions.md](docs/decisions.md) for where the build differs from the original spec.
