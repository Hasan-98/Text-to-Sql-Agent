import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";

dotenv.config();

async function testClaudeAPI() {
    try {
        console.log("🧪 Testing Claude API connection...\n");

        // Initialize the Anthropic client
        const anthropic = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY,
        });

        // Send a simple test message
        const message = await anthropic.messages.create({
            model: "claude-sonnet-4-5-20250929",
            max_tokens: 1024,
            messages: [
                {
                    role: "user",
                    content: "Hello! Please respond with 'API connection successful' if you can read this."
                }
            ],
        });

        console.log("✅ SUCCESS! Claude API is working!\n");
        console.log("📝 Response from Claude:");
        console.log(message.content[0].text);
        console.log("\n📊 API Details:");
        console.log(`   Model: ${message.model}`);
        console.log(`   Tokens used: ${message.usage.input_tokens} input, ${message.usage.output_tokens} output`);
        console.log(`   Stop reason: ${message.stop_reason}`);

    } catch (error) {
        console.error("❌ ERROR: API test failed!\n");

        if (error.status === 401) {
            console.error("🔑 Authentication Error: Invalid API key");
            console.error("   Check that your ANTHROPIC_API_KEY in .env is correct");
        } else if (error.status === 429) {
            console.error("⏱️  Rate Limit Error: Too many requests");
            console.error("   Wait a moment and try again");
        } else if (error.status === 500) {
            console.error("🔧 Server Error: Anthropic API is having issues");
            console.error("   Try again later");
        } else {
            console.error("Error details:", error.message);
        }

        process.exit(1);
    }
}

// Run the test
testClaudeAPI();