# 🏄 surfline-mcp

Bring your authenticated Surfline forecasts to your agent. **surfline-mcp** signs in with your Surfline account and exposes the premium forecast data available to your subscription through MCP.

Agents can retrieve waves, wind, tides, weather and daylight forecasts, discover spots, and ask for **surfable hours**: daylight hours that meet a minimum wave height and surf rating. The agent can then combine those hours with its own calendar connector to plan a session.

You supply your Surfline credentials; the server handles authentication and forecast retrieval. Premium forecast access depends on your account's subscription and permissions. This server requests up to seven days of forecasts.

## 💬 Ask your agent

- “**Is it worth surfing at Fistral tomorrow?**”
- “Find Great Western in Newquay and show me its **wind, waves and tides** for the next three days.”
- “**Compare tomorrow's surf** at these two spots.”
- “Use Surfline forecasts and my calendar connector to find a **free morning with good surf**.”

## ⚙️ Setup

You need a Surfline account with access to the premium forecasts you want to retrieve. Use that account’s email and password below.

Use **Node.js 26**. `.tool-versions` selects your system-installed Node rather than an older asdf runtime. Then install and build:

```sh
npm ci
npm run build
```

Create `.env` using `.env.example` as a template, or fill in your existing `.env`:

```dotenv
SURFLINE_EMAIL="your-email@example.com"
SURFLINE_PASSWORD="your-password"
```

The server resolves `.env` **relative to the installed script**, so it works no matter which working directory your MCP client launches it from. Set `DOTENV_CONFIG_PATH` to point somewhere else. Existing environment variables take precedence. `.env` is gitignored. No Google credentials are required.

### 🛡️ Why the requests impersonate a browser

Surfline sits behind Cloudflare bot management, which fingerprints the **TLS ClientHello (JA3/JA4)**. Node's own TLS stack is blocklisted: every request to `services.surfline.com` returns `403` with a Cloudflare block page, with or without credentials, and no combination of headers, HTTP version or cipher ordering changes that. The client therefore uses [`impit`](https://www.npmjs.com/package/impit) to perform a Chrome-shaped handshake. **Swapping it back to `axios`, `fetch` or `node:https` will break every request.**

## 🔌 Connect an MCP client

Launch the built server directly. **Use absolute paths** for both Node and the
script: clients start processes from a different working directory and without
your shell's `PATH`, so an `asdf`/`nvm` shim will not resolve.

**Claude Code (CLI)** — registers it for every project:

```sh
claude mcp add --scope user surfline -- /opt/homebrew/bin/node /absolute/path/to/surfline-mcp/dist/presentation/mcp/server.js
claude mcp list   # surfline: ... - ✔ Connected
```

**Claude Desktop** — merge into `~/Library/Application Support/Claude/claude_desktop_config.json`, then **restart the app**:

```json
{
  "mcpServers": {
    "surfline": {
      "command": "/opt/homebrew/bin/node",
      "args": ["/absolute/path/to/surfline-mcp/dist/presentation/mcp/server.js"]
    }
  }
}
```

No `env` block is needed: the server finds its own `.env`, which keeps your
password in a mode-600 file instead of a world-readable config. To supply
credentials through the client instead, set `SURFLINE_EMAIL` and
`SURFLINE_PASSWORD` in an `env` block. `src/presentation/mcp/mcp-config.json`
contains a configuration template.

For local use, `npm start` launches the built server; `npm run start:mcp` is an alias. Both wait for MCP messages on stdin. For an MCP client's command, launch Node directly as shown above so npm's status messages cannot interfere with the protocol. Runtime diagnostics go to stderr.

The server authenticates on its first tool call and uses the resulting access token for Surfline requests. Tool and resource discovery work **without** credentials. The package executable is `surfline-mcp`.

## 🧰 Tools

| Tool                          | Inputs                                                                        | Result                                                                 |
| ----------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `search_spots`                | `query`                                                                       | Spot IDs, names, regions, countries and coordinates                    |
| `get_spot_info`               | `spotId`                                                                      | Spot name, ID and coordinates                                          |
| `get_spot_forecast`           | `spotId`, optional `days` (1–7, default 7), `intervalHours` (1–24, default 1) | Unfiltered waves, ratings, wind, tides, weather and daylight forecasts |
| `get_surfable_hours_today`    | `spotId`, optional criteria                                                   | Remaining qualifying hours today, using the UTC date                   |
| `get_surfable_hours_tomorrow` | `spotId`, optional criteria                                                   | Qualifying hours tomorrow, using the UTC date                          |
| `get_surfable_hours_week`     | `spotId`, optional criteria                                                   | Qualifying hours over the next seven days                              |
| `get_surfable_hours_date`     | `spotId`, `date` (`DD/MM/YYYY`, UTC), optional criteria                       | Qualifying hours on the requested date, within the available forecast  |

The surfable-hours tools accept **`waveMin`** (feet, **default 1**) and **`ratingMin`** (default `POOR_TO_FAIR`). Ratings are `VERY_POOR`, `POOR`, `POOR_TO_FAIR`, `FAIR`, `GOOD`, and `VERY_GOOD`. These tools retain the project's daylight and conditions filtering. Use `get_spot_forecast` when the agent should decide which conditions are suitable or interpret dates in a spot's local timezone.

Successful tool responses contain JSON in MCP text content, including empty results. Raw forecasts retain Surfline response metadata, Unix timestamps in seconds, and available UTC offsets. Requested units are **feet** for surf height, **knots** for wind speed, **metres** for tides, and **Celsius** for temperature. Coordinates are longitude, latitude. Surfable-hour start/end times are ISO 8601 UTC strings, so agents can compare them directly with calendar events.

Forecast availability depends on Surfline and your account. This server fetches current forecasts, **not historical data**. An empty filtered result means no hours matched in the returned data; it does not prove that a date is within the forecast horizon.

Resources:

- `surfline-mcp://about`: server capabilities and configuration.
- `surfline-mcp://spots/popular`: built-in example spots. Use `search_spots` to discover current spot IDs.

## 🛠️ Development

```sh
npm run build        # Clean and compile production code
npm test -- --runInBand # Offline domain, fake-client and MCP protocol tests
npm run test:mcp     # MCP protocol tests
npm run lint
```

Live Surfline contract tests are **opt-in** and require working credentials and network access:

```sh
npm run test:live
```

Production builds exclude test files and fake clients. Runtime dependencies are the MCP SDK, [`impit`](https://www.npmjs.com/package/impit) and dotenv.

## ⚖️ Intended use and Terms of Service

This is for **paying Surfline subscribers** who would otherwise open the website
to answer one question: _should I go surfing?_ It asks your agent instead, using
the same forecasts your subscription already entitles you to. **Personal use,
your own account, your own machine.**

Be aware that this is **likely against Surfline's
[Terms of Use](https://www.surfline.com/terms-of-use)**, which prohibit using
"any robot, spider, scraper or other automated means to access the Services".
There is no sanctioned developer API for subscribers: the Surfline Compatible
Program is a hardware partnership, not a self-serve API. Surfline also fronts
the API with Cloudflare bot management, which this server works around (see
**Why the requests impersonate a browser** above).

So: **use it personally at your own risk**, keep your request volume in the
range a person checking the forecast would generate, and **do not build a
product on it** without talking to Surfline first.

## 📄 License

[0BSD](LICENSE) — do whatever you like with this, no attribution required.
