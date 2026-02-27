import { Logo } from "./assets/logo";

export default {
  name: "Microsoft Copilot",
  id: "copilot-mcp",
  category: "ai-automation",
  active: true,
  logo: Logo,
  short_description:
    "Connect Connor & Co to Microsoft Copilot Studio. Query your business data from Microsoft 365.",
  description: `Connect Connor & Co to Microsoft Copilot Studio using the Model Context Protocol (MCP).

**What you can do:**
- Ask about invoices and transactions from Word, Excel, or Outlook
- Generate financial reports through Copilot
- Query your business data using natural language
- Build custom agents that access your Connor & Co data

**How it works:**
1. Open Copilot Studio and create or edit an agent
2. Add Connor & Co as an MCP server with your API key
3. Use Connor & Co tools in your Copilot workflows`,
  images: [],
  installUrl: "https://app.connorco.dev/mcp/copilot",
};
