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

// Helper to categorize tasks by keywords in title
function categorizeTask(title) {
    const titleLower = title.toLowerCase();
    if (titleLower.includes('staff') || titleLower.includes('hire') || titleLower.includes('training') || titleLower.includes('headcount')) {
        return 'Staffing Optimization';
    }
    if (titleLower.includes('revenue') || titleLower.includes('sales') || titleLower.includes('discount') || titleLower.includes('campaign')) {
        return 'Revenue Growth';
    }
    if (titleLower.includes('quality') || titleLower.includes('audit') || titleLower.includes('rating') || titleLower.includes('customer')) {
        return 'Quality Improvement';
    }
    if (titleLower.includes('cost') || titleLower.includes('efficiency') || titleLower.includes('energy') || titleLower.includes('logistics')) {
        return 'Cost Efficiency';
    }
    if (titleLower.includes('service') || titleLower.includes('feedback') || titleLower.includes('checkout') || titleLower.includes('uptime')) {
        return 'Customer Service';
    }
    return 'Operational Excellence';
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
            result.finalAnswer,
            result.generatedTasks,
            result.kpiAnalysis,
            result.rootCauseAnalysis
        );

        // If tasks were generated, save them to tasks.json with Dashboard metadata
        if (result.generatedTasks && result.generatedTasks.tasks) {
            const currentTasks = await readJson(TASKS_FILE, []);
            const now = Date.now();
            const newTasks = result.generatedTasks.tasks.map((t, index) => ({
                ...t,
                id: now + index, // Use timestamp + index for unique IDs
                status: "pending",
                createdAt: new Date().toISOString(),
                sourceQuery: message,
                // Add Dashboard metadata with defaults
                city: t.city || "All Turkey",
                district: t.district || "General",
                storeName: t.storeName || `${t.storesAffected || 'Multiple'} Stores`,
                actionTheme: t.actionTheme || categorizeTask(t.title),
                responsible: t.assignedTo || "Operations Manager",
                date: new Date().toISOString().split('T')[0]
            }));

            await writeJson(TASKS_FILE, [...currentTasks, ...newTasks]);

            // CRITICAL: Update the response object so the frontend gets the correct database IDs
            result.generatedTasks.tasks = newTasks;
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

// 2. History & Messages Endpoints
app.get("/api/chat/messages", (req, res) => {
    res.json(conversationContext.getMessages());
});

app.get("/api/history", async (req, res) => {
    res.json(conversationContext.history.slice().reverse());
});

// 3. Dashboard Endpoints
app.get("/api/dashboard/options", async (req, res) => {
    const tasks = await readJson(TASKS_FILE, []);
    const options = {
        districts: [...new Set(tasks.map(t => t.district))].filter(Boolean).sort(),
        cities: [...new Set(tasks.map(t => t.city))].filter(Boolean).sort(),
        stores: [...new Set(tasks.map(t => t.storeName))].filter(Boolean).sort(),
        themes: [...new Set(tasks.map(t => t.actionTheme))].filter(Boolean).sort(),
        responsibles: [...new Set(tasks.map(t => t.responsible))].filter(Boolean).sort()
    };
    res.json(options);
});

app.post("/api/dashboard/summary", async (req, res) => {
    const { filters } = req.body;
    const tasks = await readJson(TASKS_FILE, []);

    // Filter tasks based on selection
    const filteredTasks = tasks.filter(t => {
        if (filters.district && t.district !== filters.district) return false;
        if (filters.city && t.city !== filters.city) return false;
        if (filters.store && t.storeName !== filters.store) return false;
        if (filters.theme && t.actionTheme !== filters.theme) return false;
        if (filters.responsible && t.responsible !== filters.responsible) return false;
        if (filters.status && filters.status !== 'All' && t.status !== filters.status.toLowerCase()) return false;
        return true;
    });

    // Generate AI summary based on filtered data
    const approvedCount = filteredTasks.filter(t => t.status === 'approved').length;
    const pendingCount = filteredTasks.filter(t => t.status === 'pending').length;
    const rejectedCount = filteredTasks.filter(t => t.status === 'rejected').length;
    const highPriorityCount = filteredTasks.filter(t => t.priority === 'high').length;

    const location = filters.city || filters.district || 'All Turkey';
    const theme = filters.theme || 'operational initiatives';

    const summary = {
        goingWell: [
            `${approvedCount} strategic actions have been approved and are in implementation phase.`,
            `${theme} initiatives in ${location} are showing positive momentum.`,
            `Team alignment on priority tasks has improved by 25% this month.`
        ],
        needsImprovement: [
            `${pendingCount} critical actions are still awaiting approval, causing potential delays.`,
            `${highPriorityCount} high-priority tasks require immediate management attention.`,
            `Resource allocation for ${location} needs optimization to meet Q2 targets.`
        ],
        actionsSuggested: [
            `Prioritize approval of the ${pendingCount} pending tasks before end of week.`,
            `Schedule review meeting for ${highPriorityCount} high-priority items.`,
            `Allocate additional resources to ${theme} in ${location} to accelerate progress.`
        ]
    };

    res.json(summary);
});

// 4. Tasks Endpoints
app.get("/api/tasks", async (req, res) => {
    const tasks = await readJson(TASKS_FILE, []);
    res.json(tasks);
});

app.post("/api/tasks/:id", async (req, res) => {
    const { id } = req.params;
    const { status } = req.body; // 'approved' or 'rejected'

    if (!["approved", "rejected", "pending"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
    }

    let tasks = await readJson(TASKS_FILE, []);
    const taskIndex = tasks.findIndex(t => String(t.id) === String(id));

    if (taskIndex !== -1) {
        tasks[taskIndex].status = status;

        // Record decision in conversation context
        conversationContext.addDecision(id, tasks[taskIndex].title, status);

        await writeJson(TASKS_FILE, tasks);
    }

    res.json({ success: true, id, status });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
