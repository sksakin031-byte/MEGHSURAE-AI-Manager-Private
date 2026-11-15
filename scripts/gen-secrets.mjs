import { randomBytes } from "node:crypto";

const gen = () => randomBytes(32).toString("base64url");
console.log("Paste these into your .env (do not share or commit them):\n");
console.log(`TOKEN_ENCRYPTION_KEY="${gen()}"`);
console.log(`MCP_AUTH_TOKEN="${gen()}"`);
