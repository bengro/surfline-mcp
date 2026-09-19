# surfline-mcp

See the [project README](../../../README.md) for setup, MCP client configuration, tool inputs, response formats and testing.

The entry point is `dist/presentation/mcp/server.js`. It authenticates with your Surfline account and serves the premium forecast data available to your subscription over stdio; agents handle calendar integration through their own connectors.
