import { createClient } from "@supabase/supabase-js";
import { ChatOpenAI } from "@langchain/openai";
import dotenv from "dotenv";

import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// export const llm = new ChatAnthropic({
//     model: "claude-opus-4-20250514",
//     // model: "claude-sonnet-4-5-20250929",
//     temperature: 0,
//     anthropicApiKey: process.env.ANTHROPIC_API_KEY,
// });

// export const llm = new ChatOpenAI({
//     model: "anthropic/claude-3-haiku",
//     temperature: 0,
//     openAIApiKey: process.env.OPENROUTER_API_KEY,
//     configuration: {
//         baseURL: "https://openrouter.ai/api/v1",
//     }
// });

export const llm = new ChatOpenAI({
    model: process.env.LLM_MODEL || "gpt-4o-mini",
    temperature: 0,
    openAIApiKey: process.env.OPENAI_API_KEY,
});