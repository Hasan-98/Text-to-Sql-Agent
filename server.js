import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { app as agent } from "./src/agents/workflow.js";
import { conversationContext } from "./src/context/ConversationContext.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(bodyParser.json());

const TASKS_FILE = path.join(__dirname, "tasks.json");

// Helper to read/write JSON files
async function readJson(filePath, defaultValue = []) {
    try {
        const data = await fs.readFile(filePath, "utf-8");
        return JSON.parse(data);
    } catch (err) {
        return defaultValue;
    }
}

async function writeJson(filePath, data) {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

// API Endpoints

// 1. Chat Endpoint
app.post("/api/chat", async (req, res) => {
    const { message } = req.body;

    if (!message) {
        return res.status(400).json({ error: "Message is required" });
    }

    try {
        const inputs = {
            userQuery: message,
            correctionAttempts: 0,
            previousSQLAttempts: []
        };

        const result = await agent.invoke(inputs);

        // Update conversation context
        conversationContext.addInteraction(
            message,
            result.analyzedQuery,
            result.sqlQuery,
            result.queryResult,
            result.finalAnswer
        );

        // If tasks were generated, save them to tasks.json as pending
        if (result.generatedTasks && result.generatedTasks.tasks) {
            const currentTasks = await readJson(TASKS_FILE, []);
            const newTasks = result.generatedTasks.tasks.map(t => ({
                ...t,
                status: "pending",
                createdAt: new Date().toISOString(),
                sourceQuery: message
            }));
            await writeJson(TASKS_FILE, [...currentTasks, ...newTasks]);
        }

        res.json(result);
    } catch (err) {
        console.error("Agent Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// 1b. Clear Context Endpoint
app.post("/api/chat/clear", async (req, res) => {
    conversationContext.clear();
    res.json({ success: true, message: "Context cleared" });
});

// 2. History Endpoint
app.get("/api/history", async (req, res) => {
    res.json(conversationContext.history.slice().reverse());
});

// 3. Tasks Endpoints
app.get("/api/tasks", async (req, res) => {
    const tasks = await readJson(TASKS_FILE, []);
    res.json(tasks);
});

app.post("/api/tasks/:id", async (req, res) => {
    const { id } = req.params;
    const { status } = req.body; // 'approved' or 'rejected'

    if (!["approved", "rejected"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
    }

    let tasks = await readJson(TASKS_FILE, []);
    tasks = tasks.map(t => String(t.id) === String(id) ? { ...t, status } : t);
    await writeJson(TASKS_FILE, tasks);

    res.json({ success: true, id, status });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
