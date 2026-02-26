import { Logo } from "./assets/logo";

export default {
  name: "Raycast",
  id: "raycast-mcp",
  category: "ai-automation",
  active: true,
  logo: Logo,
  short_description:
    "Access Connor & Co financial data directly from Raycast via MCP.",
  description: `Connect Raycast to your Connor & Co account using the Model Context Protocol (MCP).

**What you can do:**
- Quick answers about your finances with a keyboard shortcut
- Check invoice status and customer details
- Query transactions and expenses on the fly
- Access reports without opening your browser

**How it works:**
1. Click Install to open the setup page
2. Add Connor & Co as an MCP server in Raycast
3. @-mention Connor & Co in Raycast AI`,
  images: [],
  installUrl: "https://connorandco.vercel.app/mcp/raycast",
};
