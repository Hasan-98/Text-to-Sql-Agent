import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SESSION_FILE = path.resolve(__dirname, '../../session_memory.json');

export class ConversationContext {
    constructor() {
        this.history = [];
        this.entities = {
            recentStores: [],
            discussedMetrics: [],
            lastTimeFilter: null,
            lastStoreFilter: null,
            decisions: [] // Track task decisions
        };
        this.lastQuery = null;
        this.lastResults = null;
        this.lastSQL = null;

        // Load existing session if it exists
        this.load();
    }

    addInteraction(userQuery, analyzedQuery, sqlQuery, results, finalAnswer, generatedTasks = null, kpiAnalysis = null, rootCauseAnalysis = null, chartConfig = null) {
        this.history.push({
            timestamp: new Date().toISOString(),
            userQuery,
            analyzedQuery,
            sqlQuery,
            results: results?.slice(0, 50), // Store up to 50 rows for chart rendering
            finalAnswer,
            generatedTasks,
            kpiAnalysis,
            rootCauseAnalysis,
            chartConfig
        });

        this.updateEntities(analyzedQuery, results);
        this.lastQuery = userQuery;
        this.lastResults = results;
        this.lastSQL = sqlQuery;

        // Keep last 50 interactions for better persistence
        if (this.history.length > 50) {
            this.history.shift();
        }

        // Save after each interaction
        this.save();
    }

    updateEntities(analyzedQuery, results) {
        // Track stores mentioned
        if (results && results.length > 0 && results[0].store_name) {
            this.entities.recentStores = results.slice(0, 200).map(r => ({
                name: r.store_name,
                id: r.store_id
            }));
        }

        // Track metrics discussed
        if (analyzedQuery?.metric) {
            if (!this.entities.discussedMetrics.includes(analyzedQuery.metric)) {
                this.entities.discussedMetrics.push(analyzedQuery.metric);
            }
        }

        // Track time filters
        if (analyzedQuery?.timeFilter) {
            this.entities.lastTimeFilter = analyzedQuery.timeFilter;
        }
    }

    addDecision(taskId, title, status) {
        // Initialize decisions array if it doesn't exist
        if (!this.entities.decisions) {
            this.entities.decisions = [];
        }

        // Remove existing decision for this task
        this.entities.decisions = this.entities.decisions.filter(d => String(d.taskId) !== String(taskId));

        this.entities.decisions.push({
            taskId,
            title,
            status,
            timestamp: new Date().toISOString()
        });

        // Keep only last 10 decisions
        if (this.entities.decisions.length > 10) {
            this.entities.decisions.shift();
        }

        this.save();
    }

    getContextForPrompt() {
        if (this.history.length === 0) {
            return "New conversation, no previous context.";
        }

        // Build compact log of last 10 turns so LLM can recall older questions
        const recentTurns = this.history.slice(-10);
        const totalTurns = this.history.length;
        const startIndex = totalTurns - recentTurns.length + 1;

        const turnLog = recentTurns.map((turn, i) => {
            const turnNum = startIndex + i;
            const stores = turn.results?.slice(0, 5)
                .map(r => r.store_name).filter(Boolean).join(', ') || 'N/A';
            const filters = turn.analyzedQuery?.filters &&
                Object.keys(turn.analyzedQuery.filters).length > 0
                ? JSON.stringify(turn.analyzedQuery.filters)
                : 'none';
            return `[Turn ${turnNum}] Q: "${turn.userQuery}"
  Intent: ${turn.analyzedQuery?.intent || 'N/A'}
  Metric: ${turn.analyzedQuery?.metric || 'N/A'} | Filters: ${filters}
  Top stores: ${stores}`;
        }).join('\n\n');

        return `=== CONVERSATION HISTORY (${totalTurns} total turns, showing last ${recentTurns.length}) ===
${turnLog}

CURRENT CONTEXT:
Last query: "${this.lastQuery}"
Recent stores (from last result): ${this.entities.recentStores.slice(0, 10).map(s => s.name).join(', ') || 'none'}
All metrics discussed: ${this.entities.discussedMetrics.join(', ') || 'none'}

FOLLOW-UP RULES:
- Follow-up = user says "they/those/these/their stores" or "also show X" → useStoresFromLastQuery=true, isFollowUp=true
- NOT follow-up = user names new filters, stores, or a completely different topic
- If user references a past turn (e.g. "like before", "from question 1", "the stores we looked at earlier"), look at the turn log above and use those stores/filters`;
    }

    hasContext() {
        return this.history.length > 0;
    }

    getRecentStoreNames() {
        return this.entities.recentStores.map(s => s.name);
    }

    save() {
        try {
            const data = {
                history: this.history,
                entities: this.entities,
                lastQuery: this.lastQuery,
                lastResults: this.lastResults,
                lastSQL: this.lastSQL
            };
            fs.writeFileSync(SESSION_FILE, JSON.stringify(data, null, 2), 'utf8');
        } catch (err) {
            console.error('Error saving session:', err.message);
        }
    }

    load() {
        try {
            if (fs.existsSync(SESSION_FILE)) {
                const data = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
                this.history = data.history || [];
                this.entities = data.entities || {
                    recentStores: [],
                    discussedMetrics: [],
                    lastTimeFilter: null,
                    lastStoreFilter: null,
                    decisions: []
                };
                this.lastQuery = data.lastQuery || null;
                this.lastResults = data.lastResults || null;
                this.lastSQL = data.lastSQL || null;
            }
        } catch (err) {
            console.error('Error loading session:', err.message);
        }
    }

    clear() {
        this.history = [];
        this.entities = {
            recentStores: [],
            discussedMetrics: [],
            lastTimeFilter: null,
            lastStoreFilter: null,
            decisions: []
        };
        this.lastQuery = null;
        this.lastResults = null;
        this.lastSQL = null;

        // Remove file on clear
        if (fs.existsSync(SESSION_FILE)) {
            try {
                fs.unlinkSync(SESSION_FILE);
            } catch (err) {
                console.error('Error deleting session file:', err.message);
            }
        }
    }

    getMessages() {
        const messages = [];
        this.history.forEach(turn => {
            // Add user message
            messages.push({
                role: 'user',
                text: turn.userQuery,
                timestamp: turn.timestamp
            });
            // Add agent response
            messages.push({
                role: 'agent',
                timestamp: turn.timestamp,
                finalAnswer: turn.finalAnswer,
                queryResult: turn.results,
                sqlQuery: turn.sqlQuery,
                analyzedQuery: turn.analyzedQuery,
                generatedTasks: turn.generatedTasks,
                kpiAnalysis: turn.kpiAnalysis,
                rootCauseAnalysis: turn.rootCauseAnalysis,
                chartConfig: turn.chartConfig || null
            });
        });
        return messages;
    }
}

export const conversationContext = new ConversationContext();
