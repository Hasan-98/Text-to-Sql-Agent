import { createClient } from "@supabase/supabase-js";
import { ChatAnthropic } from "@langchain/anthropic";
import dotenv from "dotenv";

import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const llm = new ChatAnthropic({
    model: "claude-opus-4-20250514",
    // model: "claude-sonnet-4-5-20250929",
    temperature: 0,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
});
