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
            lastStoreFilter: null
        };
        this.lastQuery = null;
        this.lastResults = null;
        this.lastSQL = null;

        // Load existing session if it exists
        this.load();
    }

    addInteraction(userQuery, analyzedQuery, sqlQuery, results, finalAnswer) {
        this.history.push({
            timestamp: new Date().toISOString(),
            userQuery,
            analyzedQuery,
            sqlQuery,
            results: results?.slice(0, 5), // Store only first 5 for context
            finalAnswer
        });

        this.updateEntities(analyzedQuery, results);
        this.lastQuery = userQuery;
        this.lastResults = results;
        this.lastSQL = sqlQuery;

        // Keep last 5 interactions
        if (this.history.length > 5) {
            this.history.shift();
        }

        // Save after each interaction
        this.save();
    }

    updateEntities(analyzedQuery, results) {
        // Track stores mentioned
        if (results && results.length > 0 && results[0].store_name) {
            this.entities.recentStores = results.slice(0, 20).map(r => ({
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

    getContextForPrompt() {
        if (this.history.length === 0) {
            return "No previous conversation. This is a new query.";
        }

        let context = `
=== CONVERSATION HISTORY ===
Number of previous queries: ${this.history.length}

STORES CURRENTLY BEING DISCUSSED:
${this.entities.recentStores.length > 0
                ? this.entities.recentStores.slice(0, 10).map(s => `- ${s.name}`).join('\n')
                : 'None specified'}

METRICS DISCUSSED SO FAR:
${this.entities.discussedMetrics.length > 0
                ? this.entities.discussedMetrics.join(', ')
                : 'None'}

LAST QUERY: "${this.lastQuery}"

LAST SQL USED:
${this.lastSQL || 'None'}

LAST RESULTS (first 3 rows):
${this.lastResults ? JSON.stringify(this.lastResults.slice(0, 3), null, 2) : 'None'}
`;
        return context;
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
                    lastStoreFilter: null
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
            lastStoreFilter: null
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
}

export const conversationContext = new ConversationContext();

