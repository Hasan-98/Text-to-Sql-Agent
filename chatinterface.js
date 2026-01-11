// ================================
// SELF-CORRECTING CHAT INTERFACE
// Enhanced Prompts for Lower-Powered LLMs
// ================================
import { createClient } from "@supabase/supabase-js";
import { ChatOpenAI } from "@langchain/openai";
import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import dotenv from "dotenv";
import readline from "readline";
import chalk from "chalk";

dotenv.config();

// ================================
// SETUP
// ================================
const SUPABASE_URL = "https://cstfhebbtphnhpxmhknk.supabase.co";
const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzdGZoZWJidHBobmhweG1oa25rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyNjc5OTYsImV4cCI6MjA3OTg0Mzk5Nn0.mcjV_PorkyBbgvIvVvhJ35hr4PIu6qxHCoxzcN1IOgc";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Using a smaller model to demonstrate compatibility
const llm = new ChatOpenAI({
    model: process.env.LLM_MODEL || "gpt-4o-mini",
    temperature: 0,
    openAIApiKey: process.env.OPENAI_API_KEY,
});

// ================================
// ENHANCED SCHEMA WITH EXAMPLES
// ================================
const DB_SCHEMA = `
=== DATABASE SCHEMA ===
Database: PostgreSQL
Table Name: store_metrics

=== COLUMNS (grouped by category) ===

IDENTIFIERS:
- store_id (integer): Unique store identifier
- store_name (text): Name of the store/branch
- store_type (text): Type of store (e.g., "Mall", "Street")
- store_city (text): City where store is located
- store_district (text): District/region

TIME COLUMNS:
- month (integer): Month number (1-12)
- year (integer): Year (e.g., 2024)
- order_month (integer): IMPORTANT - This is the COUNT of orders for that month, NOT a date!

FINANCIAL METRICS:
- net_revenue_tl_month (numeric): Total revenue in TL for the month
- avg_net_order_value_tl (numeric): Average order value in TL
- store_profit_tl_month (numeric): Profit in TL for the month
- store_profit_ratio_percent (numeric): Profit as percentage of revenue
- cogs_tl_month (numeric): Cost of goods sold
- personal_cost_tl_month (numeric): Staff costs
- avg_discount_per_order_tl (numeric): Average discount amount
- avg_discount_percent_per_order (numeric): Average discount percentage
- avg_cogs_percent_net_revenue (numeric): COGS as % of revenue
- personal_cost_percent_net_revenue (numeric): Staff cost as % of revenue

EFFICIENCY METRICS:
- store_size_m2 (numeric): Store size in square meters
- net_revenue_per_m2 (numeric): Revenue per square meter
- monthly_order_per_m2 (numeric): Orders per square meter
- profit_per_m2 (numeric): Profit per square meter
- revenue_per_active_headcount (numeric): Revenue per staff member
- orders_per_active_headcount (numeric): Orders per staff member

STAFF COLUMNS:
- norm_headcount (integer): Standard/expected staff count
- active_headcount (integer): Actual working staff count

QUALITY METRICS:
- store_audit_score (numeric): Internal audit score (0-100)
- online_rating_score (numeric): Customer rating (0-5 scale)
- competition_online_rating_score (numeric): Competitor ratings
- price_index_vs_competition (numeric): Price comparison index
- district_manager_hours_spent (numeric): Manager visit hours
- store_uptime_ratio_percent (numeric): Operational uptime %
- product_availability_ratio_percent (numeric): Stock availability %

=== CRITICAL RULES ===
1. order_month = NUMBER of orders (use SUM to aggregate)
2. Each row = ONE store for ONE month
3. Latest data: year = 2024, month = 12
4. Last 3 months: WHERE year = 2024 AND month >= 10
5. Always use GROUP BY when using aggregate functions (SUM, AVG, COUNT)
6. Column names are EXACT - use underscore format

=== EXAMPLE QUERIES ===

Example 1: "Top 10 stores by revenue"
SELECT store_name, SUM(net_revenue_tl_month) as total_revenue
FROM store_metrics
WHERE year = 2024
GROUP BY store_name
ORDER BY total_revenue DESC
LIMIT 10;

Example 2: "Bottom 20 stores by orders last 3 months"
SELECT store_name, SUM(order_month) as total_orders
FROM store_metrics
WHERE year = 2024 AND month >= 10
GROUP BY store_name
ORDER BY total_orders ASC
LIMIT 20;

Example 3: "Average profit margin by store type"
SELECT store_type, AVG(store_profit_ratio_percent) as avg_profit_margin
FROM store_metrics
WHERE year = 2024
GROUP BY store_type
ORDER BY avg_profit_margin DESC;

Example 4: "Stores with audit score below 70"
SELECT store_name, AVG(store_audit_score) as avg_audit_score
FROM store_metrics
WHERE year = 2024
GROUP BY store_name
HAVING AVG(store_audit_score) < 70
ORDER BY avg_audit_score ASC;
`;

// ================================
// KPI DEFINITIONS (unchanged but better structured)
// ================================
const KPI_DEFINITIONS = {
    revenue: {
        name: "Revenue Performance",
        description: "Measures how much money stores are generating",
        metrics: ["net_revenue_tl_month", "net_revenue_per_m2", "avg_net_order_value_tl"],
        thresholds: { critical: -20, warning: -10, good: 5 },
        rootCauseFactors: ["order_month", "avg_discount_percent_per_order", "product_availability_ratio_percent"],
        keywords: ["revenue", "sales", "income", "money", "earnings"]
    },
    profit: {
        name: "Profitability",
        description: "Measures how much profit stores are making after costs",
        metrics: ["store_profit_tl_month", "store_profit_ratio_percent", "profit_per_m2"],
        thresholds: { critical: -15, warning: -5, good: 10 },
        rootCauseFactors: ["avg_cogs_percent_net_revenue", "personal_cost_percent_net_revenue", "net_revenue_tl_month"],
        keywords: ["profit", "margin", "profitability", "earnings", "bottom line"]
    },
    efficiency: {
        name: "Operational Efficiency",
        description: "Measures how well stores use their resources",
        metrics: ["monthly_order_per_m2", "orders_per_active_headcount", "revenue_per_active_headcount"],
        thresholds: { critical: -25, warning: -15, good: 10 },
        rootCauseFactors: ["active_headcount", "store_size_m2", "store_uptime_ratio_percent"],
        keywords: ["efficiency", "productivity", "performance", "per square meter", "per employee"]
    },
    quality: {
        name: "Service Quality",
        description: "Measures customer satisfaction and store standards",
        metrics: ["store_audit_score", "online_rating_score", "product_availability_ratio_percent"],
        thresholds: { critical: 60, warning: 75, good: 85 },
        rootCauseFactors: ["active_headcount", "district_manager_hours_spent", "store_uptime_ratio_percent"],
        keywords: ["quality", "rating", "score", "audit", "customer satisfaction", "availability"]
    }
};

// ================================
// CONVERSATION CONTEXT (enhanced)
// ================================
class ConversationContext {
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
    }
}

const conversationContext = new ConversationContext();

// ================================
// TOOLS (unchanged)
// ================================
const executeSQLTool = tool(
    async ({ sqlQuery }) => {
        try {
            const cleanSQL = sqlQuery.trim().toLowerCase();
            const forbidden = /(insert|update|delete|drop|alter|truncate|create|grant|revoke)/i;

            if (forbidden.test(cleanSQL)) {
                throw new Error("Unsafe SQL detected - only SELECT queries allowed");
            }

            if (!cleanSQL.startsWith("select") && !cleanSQL.startsWith("with")) {
                throw new Error("Query must start with SELECT or WITH");
            }

            const finalSQL = sqlQuery.replace(/;+\s*$/g, "").trim();

            const { data, error } = await supabase.rpc("execute_sql", {
                query: finalSQL,
            });

            if (error) throw error;

            return JSON.stringify({
                success: true,
                data: data,
                rowCount: data?.length || 0
            });
        } catch (err) {
            return JSON.stringify({
                success: false,
                error: err.message
            });
        }
    },
    {
        name: "execute_sql",
        description: "Executes a SELECT SQL query against the store_metrics database and returns the results",
        schema: z.object({
            sqlQuery: z.string().describe("The SQL SELECT query to execute")
        })
    }
);

// ================================
// GRAPH STATE
// ================================
const GraphState = Annotation.Root({
    userQuery: Annotation(),
    conversationContext: Annotation(),
    analyzedQuery: Annotation(),
    sqlQuery: Annotation(),
    queryResult: Annotation(),
    validationResult: Annotation(),
    needsCorrection: Annotation(),
    correctionAttempts: Annotation(),
    previousSQLAttempts: Annotation(), // Track SQL attempts to detect duplicates
    kpiAnalysis: Annotation(),
    rootCauseAnalysis: Annotation(),
    generatedTasks: Annotation(),
    finalAnswer: Annotation(),
    error: Annotation(),
});

// ================================
// AGENT 1: ENHANCED QUERY UNDERSTANDING
// ================================
async function contextAwareQueryAgent(state) {
    const { userQuery } = state;
    const contextInfo = conversationContext.getContextForPrompt();
    const hasContext = conversationContext.hasContext();

    const prompt = `You are a Query Analysis Assistant. Your job is to understand what the user wants from a retail store database.

=== YOUR TASK ===
Analyze the user's question and extract the key information needed to build a SQL query.

=== THINKING PROCESS ===
Follow these steps IN ORDER:

STEP 1: READ THE QUESTION
User's Question: "${userQuery}"

STEP 2: CHECK FOR CONTEXT
${hasContext ? `This is a FOLLOW-UP question. Previous conversation:
${contextInfo}

Ask yourself:
- Does "they", "these", "those" refer to stores from the last query?
- Does "it" refer to a metric we just discussed?
- Is this asking for MORE info about the SAME stores?
` : `This is a NEW conversation. No previous context.`}

STEP 3: IDENTIFY THE METRIC
What number/measurement does the user want?
Common mappings:
- "orders" or "sales count" → order_month (remember: this is a COUNT, use SUM)
- "revenue" or "sales" or "income" → net_revenue_tl_month
- "profit" → store_profit_tl_month or store_profit_ratio_percent
- "efficiency" → orders_per_active_headcount or revenue_per_active_headcount
- "rating" or "score" → online_rating_score or store_audit_score
- "availability" → product_availability_ratio_percent
- "manager time" → district_manager_hours_spent

STEP 4: IDENTIFY FILTERS
What conditions limit the data?
- Time: "last 3 months" → year = 2024 AND month >= 10
- Store type: "mall stores" → store_type = 'Mall'
- Location: "in Istanbul" → store_city = 'Istanbul'
- Performance: "below average", "worst", "best"

STEP 5: IDENTIFY SORTING
- "top", "best", "highest" → ORDER BY ... DESC
- "bottom", "worst", "lowest" → ORDER BY ... ASC
- "poorest", "weakest" → ORDER BY ... ASC

STEP 6: IDENTIFY LIMIT
- "top 10" → LIMIT 10
- "bottom 20" → LIMIT 20
- "top 5" → LIMIT 5
- If user specifies a number, use that number
- "all" or not specified → LIMIT 100 (safety limit)
- IMPORTANT: Use EXACTLY what the user asks for, don't reduce it
- FOR FOLLOW-UP QUERIES: If asking about "these stores" or "those branches" from last query,
  the limit should match the number of stores being discussed (usually 20), NOT 100

STEP 7: IS THIS A KPI QUESTION?
Does the user want analysis/recommendations, not just data?
- "why are they performing badly" → needs KPI analysis
- "what should we do" → needs KPI analysis
- "show me the numbers" → just data, no KPI analysis

=== OUTPUT FORMAT ===
Respond with ONLY a JSON object (no markdown, no explanation):

{
    "thinking": "Brief explanation of your reasoning",
    "metric": "the main metric column name",
    "aggregation": "SUM or AVG or COUNT or NONE",
    "filters": {
        "year": 2024,
        "month_condition": ">= 10 or specific month or null",
        "store_names": ["list of specific stores if mentioned"] or null,
        "store_type": "type if mentioned" or null,
        "store_city": "city if mentioned" or null,
        "custom_condition": "any other WHERE condition" or null
    },
    "sorting": "DESC or ASC",
    "limit": number,
    "isFollowUp": true or false,
    "useStoresFromLastQuery": true or false,
    "requiresKPIAnalysis": true or false,
    "kpiCategory": "revenue" or "profit" or "efficiency" or "quality" or null,
    "intent": "one sentence describing what user wants"
}`;

    try {
        console.log(chalk.gray('\n🧠 Analyzing your question...'));

        const response = await llm.invoke(prompt);
        let analysis = response.content.trim()
            .replace(/```json\n?/g, "")
            .replace(/```\n?/g, "")
            .trim();

        const analyzedQuery = JSON.parse(analysis);

        console.log(chalk.gray(`   Intent: ${analyzedQuery.intent}`));
        console.log(chalk.gray(`   Metric: ${analyzedQuery.metric}`));
        console.log(chalk.gray(`   Follow-up: ${analyzedQuery.isFollowUp ? 'Yes' : 'No'}`));

        return {
            analyzedQuery,
            conversationContext: contextInfo,
            correctionAttempts: state.correctionAttempts || 0
        };
    } catch (err) {
        console.log(chalk.red(`   Error parsing analysis: ${err.message}`));
        return { error: `Query Understanding Error: ${err.message}` };
    }
}

// ================================
// AGENT 2: ENHANCED SQL GENERATION
// ================================
async function sqlGenerationAgent(state) {
    const { userQuery, analyzedQuery, correctionAttempts, validationResult } = state;

    const llmWithTools = llm.bindTools([executeSQLTool]);

    // Build correction guidance if this is a retry
    let correctionSection = "";
    if (validationResult && !validationResult.isCorrect) {
        correctionSection = `
=== ⚠️ PREVIOUS ATTEMPT FAILED - YOU MUST FIX THESE ISSUES ===

Your previous SQL query:
${state.sqlQuery}

Problems found:
${validationResult.issues.map((issue, i) => `${i + 1}. ${issue}`).join('\n')}

How to fix:
${validationResult.suggestions.map((sug, i) => `${i + 1}. ${sug}`).join('\n')}

IMPORTANT: Generate a DIFFERENT query that fixes these problems!
=============================================================
`;
    }

    // Build store filter if using previous results
    let storeFilter = "";
    if (analyzedQuery.useStoresFromLastQuery && conversationContext.entities.recentStores.length > 0) {
        const storeNames = conversationContext.getRecentStoreNames().slice(0, 20);
        storeFilter = `
=== IMPORTANT: FILTER TO THESE SPECIFIC STORES ===
The user is asking about stores from the previous query.
You MUST add this to your WHERE clause:
store_name IN (${storeNames.map(s => `'${s.replace(/'/g, "''")}'`).join(', ')})
`;
    }

    const prompt = `You are a SQL Query Generator. Your job is to write a correct SQL query.

${correctionSection}

=== DATABASE SCHEMA ===
${DB_SCHEMA}

=== USER'S QUESTION ===
"${userQuery}"

=== ANALYSIS OF THE QUESTION ===
${JSON.stringify(analyzedQuery, null, 2)}

${storeFilter}

=== STEP-BY-STEP SQL BUILDING ===

Follow these steps to build your query:

STEP 1: SELECT CLAUSE
- What columns do I need?
- Analysis says metric is: "${analyzedQuery.metric}"
- Do I need to aggregate? Analysis says: "${analyzedQuery.aggregation}"
- Always include store_name for identification
- If aggregating, use: SELECT store_name, ${analyzedQuery.aggregation}(${analyzedQuery.metric}) as result_value

STEP 2: FROM CLAUSE
- Always: FROM store_metrics

STEP 3: WHERE CLAUSE
Build conditions based on:
- Year filter: ${analyzedQuery.filters?.year ? `year = ${analyzedQuery.filters.year}` : 'not specified'}
- Month filter: ${analyzedQuery.filters?.month_condition ? `month ${analyzedQuery.filters.month_condition}` : 'not specified'}
- Store filter: ${analyzedQuery.filters?.store_names ? `store_name IN (...)` : 'not specified'}
- City filter: ${analyzedQuery.filters?.store_city ? `store_city = '${analyzedQuery.filters.store_city}'` : 'not specified'}
- Type filter: ${analyzedQuery.filters?.store_type ? `store_type = '${analyzedQuery.filters.store_type}'` : 'not specified'}
${storeFilter ? '- MUST include store filter from previous query (see above)' : ''}

STEP 4: GROUP BY CLAUSE
- If using SUM, AVG, or COUNT: MUST include GROUP BY store_name
- If not aggregating: no GROUP BY needed

STEP 5: ORDER BY CLAUSE
- Sorting direction: ${analyzedQuery.sorting}
- Order by the calculated/aggregated column
- For "worst/bottom/lowest": use ASC
- For "best/top/highest": use DESC

STEP 6: LIMIT CLAUSE
- User requested limit: ${analyzedQuery.limit}
- Use EXACTLY this number: LIMIT ${analyzedQuery.limit}
- Do NOT change or reduce this number

=== COMMON MISTAKES TO AVOID ===
1. ❌ Forgetting GROUP BY when using SUM/AVG
2. ❌ Using "orders" instead of "order_month"
3. ❌ Forgetting to aggregate order_month (it's per-month, use SUM for totals)
4. ❌ Wrong sort order (ASC for worst, DESC for best)
5. ❌ Missing year/month filters

=== FINAL CHECK ===
Before executing, verify your SQL has:
- [ ] SELECT has the right columns
- [ ] Aggregation matches what user wants
- [ ] WHERE filters are correct
- [ ] GROUP BY is present if aggregating
- [ ] ORDER BY direction is correct (${analyzedQuery.sorting})
- [ ] LIMIT is EXACTLY ${analyzedQuery.limit} (not less!)

=== ACTION ===
Now use the execute_sql tool to run your query.`;

    try {
        const response = await llmWithTools.invoke(prompt);

        if (response.tool_calls && response.tool_calls.length > 0) {
            const toolCall = response.tool_calls[0];
            const sqlQuery = toolCall.args.sqlQuery;

            console.log(chalk.blue(`\n📝 Generated SQL (Attempt ${correctionAttempts + 1}):`));
            console.log(chalk.gray(sqlQuery));

            const toolResult = await executeSQLTool.invoke(toolCall.args);
            const result = JSON.parse(toolResult);

            if (result.success) {
                console.log(chalk.green(`✅ Query executed: ${result.rowCount} rows returned`));
                return {
                    sqlQuery,
                    queryResult: result.data
                };
            } else {
                console.log(chalk.red(`❌ SQL Error: ${result.error}`));
                return {
                    sqlQuery,
                    error: `SQL Error: ${result.error}`,
                    queryResult: null
                };
            }
        } else {
            // Fallback: try to extract SQL from response
            let sql = response.content.trim()
                .replace(/```sql\n?/g, "")
                .replace(/```\n?/g, "")
                .trim();

            // Find the SQL query in the response
            const sqlMatch = sql.match(/SELECT[\s\S]*?(?:LIMIT\s+\d+|$)/i);
            if (sqlMatch) {
                sql = sqlMatch[0];
            }

            console.log(chalk.blue(`\n📝 Generated SQL (Attempt ${correctionAttempts + 1}):`));
            console.log(chalk.gray(sql));

            const toolResult = await executeSQLTool.invoke({ sqlQuery: sql });
            const result = JSON.parse(toolResult);

            if (result.success) {
                console.log(chalk.green(`✅ Query executed: ${result.rowCount} rows returned`));
                return {
                    sqlQuery: sql,
                    queryResult: result.data
                };
            } else {
                console.log(chalk.red(`❌ SQL Error: ${result.error}`));
                return {
                    sqlQuery: sql,
                    error: `SQL Error: ${result.error}`,
                    queryResult: null
                };
            }
        }
    } catch (err) {
        console.log(chalk.red(`❌ Generation Error: ${err.message}`));
        return { error: `SQL Generation Error: ${err.message}` };
    }
}

// ================================
// AGENT 3: ENHANCED VALIDATION
// ================================
async function validationAgent(state) {
    const { userQuery, analyzedQuery, sqlQuery, queryResult, correctionAttempts } = state;

    console.log(chalk.yellow(`\n🔍 Validating results...`));

    // Quick fail checks
    if (!queryResult) {
        console.log(chalk.red('   ❌ No results returned (query may have failed)'));
        return {
            validationResult: {
                isCorrect: false,
                confidence: 0,
                issues: ["Query execution failed - no results returned"],
                suggestions: ["Check SQL syntax", "Verify column names exist", "Check WHERE conditions aren't too restrictive"]
            },
            needsCorrection: correctionAttempts < 2
        };
    }

    if (queryResult.length === 0) {
        console.log(chalk.red('   ❌ Query returned 0 rows'));
        return {
            validationResult: {
                isCorrect: false,
                confidence: 0,
                issues: ["Query returned zero results"],
                suggestions: ["Loosen the WHERE filters", "Check if data exists for the specified time period", "Verify store names are spelled correctly"]
            },
            needsCorrection: correctionAttempts < 2
        };
    }

    // Check if row count is significantly less than requested
    const expectedLimit = analyzedQuery.limit || 100;
    if (queryResult.length < expectedLimit * 0.5 && queryResult.length < 10) {
        console.log(chalk.yellow(`   ⚠️ Only ${queryResult.length} rows returned, expected ~${expectedLimit}`));
    }

    // Extract numeric values from first and last rows to help validation
    const firstRowValues = queryResult[0] ? Object.values(queryResult[0]).filter(v => typeof v === 'number') : [];
    const lastRowValues = queryResult[queryResult.length - 1] ? Object.values(queryResult[queryResult.length - 1]).filter(v => typeof v === 'number') : [];

    const prompt = `You are a SQL Query Validator. Check if the results match what the user asked for.

=== YOUR TASK ===
Determine if the SQL query results correctly answer the user's question.
Be CAREFUL not to reject correct queries!

=== CRITICAL SORTING RULES ===
READ THIS CAREFULLY - Many validation errors come from misunderstanding sorting:

- ORDER BY column ASC = Values go from SMALL to LARGE (1, 2, 3, 10, 100)
- ORDER BY column DESC = Values go from LARGE to SMALL (100, 10, 3, 2, 1)

SO:
- "bottom", "lowest", "worst", "least" → Need ASC → First row has SMALLEST number
- "top", "highest", "best", "most" → Need DESC → First row has LARGEST number

=== WHAT USER WANTED ===
Question: "${userQuery}"
Intent: "${analyzedQuery.intent}"
Metric: "${analyzedQuery.metric}"
Sorting: "${analyzedQuery.sorting}" 
  - ${analyzedQuery.sorting === 'ASC' ? 'ASC means LOWEST/SMALLEST values first (correct for "bottom", "worst", "lowest")' : 'DESC means HIGHEST/LARGEST values first (correct for "top", "best", "highest")'}
Requested Limit: ${analyzedQuery.limit}

=== SQL QUERY GENERATED ===
${sqlQuery}

=== ACTUAL RESULTS ===
Rows returned: ${queryResult.length}
Columns: ${Object.keys(queryResult[0] || {}).join(', ')}

First row (should have ${analyzedQuery.sorting === 'ASC' ? 'LOWEST' : 'HIGHEST'} value):
${JSON.stringify(queryResult[0], null, 2)}
Numeric values in first row: ${firstRowValues.join(', ')}

Last row (should have ${analyzedQuery.sorting === 'ASC' ? 'HIGHEST' : 'LOWEST'} value):
${JSON.stringify(queryResult[queryResult.length - 1], null, 2)}
Numeric values in last row: ${lastRowValues.join(', ')}

=== VALIDATION CHECKLIST ===

CHECK 1: CORRECT METRIC?
- Wanted: ${analyzedQuery.metric}
- Column "${analyzedQuery.metric}" or similar alias present in results?
- For order counts: should use SUM(order_month)
- For averages: should use AVG(column)

CHECK 2: CORRECT SORTING? ⚠️ BE VERY CAREFUL HERE
- User asked for: ${analyzedQuery.sorting === 'ASC' ? 'LOWEST/BOTTOM/WORST first' : 'HIGHEST/TOP/BEST first'}
- SQL has: ORDER BY ... ${analyzedQuery.sorting}
- ${analyzedQuery.sorting === 'ASC' ?
            'For ASC: First row number should be SMALLER than last row number. Example: First=9864, Last=25541 ✓' :
            'For DESC: First row number should be LARGER than last row number. Example: First=100000, Last=25541 ✓'}
- Compare: First row values (${firstRowValues.slice(0, 2).join(', ')}) vs Last row values (${lastRowValues.slice(0, 2).join(', ')})
- Is first value ${analyzedQuery.sorting === 'ASC' ? '<' : '>'} last value? That's CORRECT!

CHECK 3: CORRECT ROW COUNT?
- Requested: ${analyzedQuery.limit}
- Got: ${queryResult.length}
- IMPORTANT: If query filters to specific stores (WHERE store_name IN ...), 
  the result count is LIMITED by how many stores match, NOT by LIMIT clause!
- ${queryResult.length} rows is acceptable if:
  a) It matches the requested limit, OR
  b) The WHERE clause filters to fewer rows than the limit, OR
  c) There simply aren't more matching rows in the database
- Only flag as problem if we got WAY fewer rows than expected AND no filtering was applied

CHECK 4: DATA REASONABLE?
- Are numbers in realistic range for retail?
- No NULL values where there shouldn't be?
- Store names look valid?

CHECK 5: ANSWERS THE QUESTION?
- Does this data actually answer what was asked?

=== DECISION GUIDE ===
Mark as CORRECT (isCorrect: true) if:
- The metric is right (or close enough alias)
- The sorting direction matches what user wanted
- We got a reasonable number of rows
- Data looks sensible

Mark as INCORRECT (isCorrect: false) ONLY if:
- Completely wrong metric/column
- Sorting is backwards (wanted lowest, got highest first)
- Query clearly doesn't answer the question
- Data is obviously broken (all NULLs, wrong data type)

When in doubt, mark as CORRECT! Don't reject working queries.

=== OUTPUT ===
JSON only, no markdown:

{
    "thinking": "Step by step: 1) Metric check... 2) Sorting check... 3) Count check...",
    "isCorrect": true or false,
    "confidence": 0-100,
    "checkResults": {
        "correctMetric": true or false,
        "correctSorting": true or false,
        "correctLimit": true or false,
        "dataMakesSense": true or false,
        "answersQuestion": true or false
    },
    "issues": [],
    "suggestions": [],
    "reasoning": "One sentence summary"
}`;

    try {
        const response = await llm.invoke(prompt);
        let validation = response.content.trim()
            .replace(/```json\n?/g, "")
            .replace(/```\n?/g, "")
            .trim();

        const validationResult = JSON.parse(validation);

        if (validationResult.isCorrect) {
            console.log(chalk.green(`   ✅ Validation PASSED (${validationResult.confidence}% confidence)`));
            console.log(chalk.gray(`   ${validationResult.reasoning}`));
        } else {
            console.log(chalk.red(`   ❌ Validation FAILED (${validationResult.confidence}% confidence)`));
            validationResult.issues.forEach(issue => {
                console.log(chalk.yellow(`   • ${issue}`));
            });
        }

        return {
            validationResult,
            needsCorrection: !validationResult.isCorrect && correctionAttempts < 2,
            correctionAttempts: correctionAttempts + 1,
            // Track SQL attempts to detect duplicates
            previousSQLAttempts: [
                ...(state.previousSQLAttempts || []),
                sqlQuery.trim().toLowerCase().replace(/\s+/g, ' ')
            ]
        };
    } catch (err) {
        console.log(chalk.yellow(`   ⚠️ Validation parse error, assuming results are OK`));
        return {
            validationResult: {
                isCorrect: true,
                confidence: 50,
                reasoning: "Validation check encountered an error, proceeding with results"
            },
            needsCorrection: false
        };
    }
}

// ================================
// DECISION: NEEDS CORRECTION?
// ================================
function correctionDecision(state) {
    // Check if we'd be regenerating the exact same SQL (pointless)
    if (state.validationResult && !state.validationResult.isCorrect && state.sqlQuery) {
        // Store previous SQL attempts in state to detect duplicates
        const previousSQL = state.previousSQLAttempts || [];
        const currentSQL = state.sqlQuery.trim().toLowerCase().replace(/\s+/g, ' ');

        if (previousSQL.includes(currentSQL)) {
            console.log(chalk.yellow('\n⚠️ Would regenerate same SQL - accepting current results instead\n'));
            return "continue";
        }
    }

    if (state.error && state.correctionAttempts < 2) {
        console.log(chalk.yellow(`\n🔄 Retrying due to error (Attempt ${state.correctionAttempts + 1}/3)...\n`));
        return "retry_sql";
    }

    if (state.needsCorrection && state.correctionAttempts < 3) {
        console.log(chalk.yellow(`\n🔄 Regenerating query to fix issues (Attempt ${state.correctionAttempts + 1}/3)...\n`));
        return "retry_sql";
    }

    if (state.correctionAttempts >= 3) {
        console.log(chalk.yellow('\n⚠️ Max attempts reached, proceeding with current results\n'));
    }

    return "continue";
}

// ================================
// AGENT 4: ENHANCED KPI ANALYSIS
// ================================
async function kpiAnalysisAgent(state) {
    const { analyzedQuery, queryResult } = state;

    if (!analyzedQuery?.requiresKPIAnalysis || !queryResult || queryResult.length === 0) {
        return { kpiAnalysis: null };
    }

    const kpiCategory = analyzedQuery.kpiCategory || 'revenue';
    const kpiDef = KPI_DEFINITIONS[kpiCategory];

    console.log(chalk.yellow(`\n📊 Analyzing ${kpiDef.name}...`));

    const prompt = `You are a Retail KPI Analyst. Analyze the store performance data.

=== KPI CATEGORY ===
Category: ${kpiDef.name}
Description: ${kpiDef.description}
Key Metrics: ${kpiDef.metrics.join(', ')}

=== THRESHOLDS ===
- Critical (Red): Below ${kpiDef.thresholds.critical}%
- Warning (Yellow): Below ${kpiDef.thresholds.warning}%
- Good (Green): Above ${kpiDef.thresholds.good}%

=== DATA TO ANALYZE ===
Number of stores: ${queryResult.length}
Sample data (first 5 rows):
${JSON.stringify(queryResult.slice(0, 5), null, 2)}

=== ANALYSIS STEPS ===

STEP 1: OVERALL HEALTH
- Are most stores performing well or poorly?
- What percentage are in critical/warning/good status?

STEP 2: KEY FINDINGS
- What patterns do you see?
- Are there outliers?
- Any geographic or type-based patterns?

STEP 3: ROOT CAUSE NEEDED?
- If many stores are underperforming, we need to investigate why
- Factors to investigate: ${kpiDef.rootCauseFactors.join(', ')}

=== OUTPUT FORMAT ===
Respond with ONLY a JSON object:

{
    "thinking": "Your analysis process",
    "healthStatus": "Critical" or "Warning" or "Good" or "Excellent",
    "overallScore": number from 0-100,
    "distribution": {
        "critical": number of stores,
        "warning": number of stores,
        "good": number of stores
    },
    "keyFindings": [
        "Finding 1: specific insight with numbers",
        "Finding 2: specific insight with numbers",
        "Finding 3: specific insight with numbers"
    ],
    "needsRootCause": true or false,
    "urgency": "immediate" or "soon" or "monitor"
}`;

    try {
        const response = await llm.invoke(prompt);
        let analysis = response.content.trim()
            .replace(/```json\n?/g, "")
            .replace(/```\n?/g, "")
            .trim();

        const kpiAnalysis = JSON.parse(analysis);

        const statusEmoji = {
            'Critical': '🔴',
            'Warning': '🟡',
            'Good': '🟢',
            'Excellent': '🌟'
        };

        console.log(chalk.gray(`   Status: ${statusEmoji[kpiAnalysis.healthStatus] || '⚪'} ${kpiAnalysis.healthStatus}`));
        console.log(chalk.gray(`   Score: ${kpiAnalysis.overallScore}/100`));

        return { kpiAnalysis };
    } catch (err) {
        console.log(chalk.yellow(`   ⚠️ KPI analysis skipped: ${err.message}`));
        return { kpiAnalysis: null };
    }
}

// ================================
// AGENT 5: ENHANCED ROOT CAUSE
// ================================
async function rootCauseAgent(state) {
    const { kpiAnalysis, queryResult, analyzedQuery } = state;

    if (!kpiAnalysis?.needsRootCause) {
        return { rootCauseAnalysis: null };
    }

    const kpiCategory = analyzedQuery.kpiCategory || 'revenue';
    const kpiDef = KPI_DEFINITIONS[kpiCategory];

    console.log(chalk.yellow(`\n🔍 Investigating root causes...`));

    const prompt = `You are a Retail Operations Analyst. Identify why stores are underperforming.

=== CONTEXT ===
KPI Category: ${kpiDef.name}
Current Status: ${kpiAnalysis.healthStatus}
Score: ${kpiAnalysis.overallScore}/100

Key Findings:
${kpiAnalysis.keyFindings.map((f, i) => `${i + 1}. ${f}`).join('\n')}

=== FACTORS TO INVESTIGATE ===
${kpiDef.rootCauseFactors.map(f => `- ${f}`).join('\n')}

=== STORE DATA ===
${JSON.stringify(queryResult.slice(0, 3), null, 2)}

=== ROOT CAUSE ANALYSIS STEPS ===

STEP 1: IDENTIFY PATTERNS
Look at the data for patterns:
- Are certain store types worse?
- Are certain cities worse?
- Is there a staffing correlation?

STEP 2: RANK CAUSES BY IMPACT
For each potential cause, assess:
- How many stores does it affect?
- How severe is the impact?
- Is it fixable?

STEP 3: GENERATE RECOMMENDATIONS
For each cause, what action would help?

=== OUTPUT FORMAT ===
Respond with ONLY a JSON object:

{
    "thinking": "Your analysis process",
    "primaryCauses": [
        {
            "factor": "factor name",
            "impact": "high" or "medium" or "low",
            "affectedStores": "number or percentage",
            "description": "Clear explanation of the problem",
            "evidence": "What in the data shows this"
        }
    ],
    "secondaryCauses": [
        {
            "factor": "factor name",
            "impact": "medium" or "low",
            "description": "explanation"
        }
    ],
    "recommendations": [
        {
            "action": "Specific action to take",
            "priority": "high" or "medium" or "low",
            "expectedImpact": "What improvement to expect",
            "timeline": "How long to implement"
        }
    ]
}`;

    try {
        const response = await llm.invoke(prompt);
        let analysis = response.content.trim()
            .replace(/```json\n?/g, "")
            .replace(/```\n?/g, "")
            .trim();

        const rootCauseAnalysis = JSON.parse(analysis);

        console.log(chalk.gray(`   Found ${rootCauseAnalysis.primaryCauses?.length || 0} primary causes`));
        console.log(chalk.gray(`   Generated ${rootCauseAnalysis.recommendations?.length || 0} recommendations`));

        return { rootCauseAnalysis };
    } catch (err) {
        console.log(chalk.yellow(`   ⚠️ Root cause analysis skipped: ${err.message}`));
        return { rootCauseAnalysis: null };
    }
}

// ================================
// AGENT 6: ENHANCED TASK GENERATION
// ================================
async function taskGenerationAgent(state) {
    const { kpiAnalysis, rootCauseAnalysis, queryResult } = state;

    if (!rootCauseAnalysis?.recommendations) {
        return { generatedTasks: null };
    }

    console.log(chalk.yellow(`\n📋 Generating action tasks...`));

    const prompt = `You are a Retail Operations Manager. Create actionable tasks from the analysis.

=== ANALYSIS SUMMARY ===
KPI Status: ${kpiAnalysis?.healthStatus || 'Unknown'}
Urgency: ${kpiAnalysis?.urgency || 'monitor'}

Primary Causes:
${rootCauseAnalysis.primaryCauses?.map(c => `- ${c.factor}: ${c.description}`).join('\n') || 'None identified'}

Recommendations:
${rootCauseAnalysis.recommendations?.map(r => `- ${r.action} (${r.priority} priority)`).join('\n') || 'None'}

Affected Stores: ${queryResult?.length || 0}

=== TASK GENERATION RULES ===
1. Each task must be specific and actionable
2. Assign to appropriate role (Store Manager, District Manager, Regional Manager, HR, Operations)
3. Set realistic deadlines
4. High priority = 1-2 days, Medium = 1 week, Low = 2 weeks

=== OUTPUT FORMAT ===
Respond with ONLY a JSON object:

{
    "tasks": [
        {
            "id": 1,
            "title": "Clear, actionable task title",
            "description": "Detailed description of what needs to be done",
            "priority": "high" or "medium" or "low",
            "assignedTo": "Role title",
            "deadline": "specific timeframe",
            "expectedOutcome": "What success looks like",
            "storesAffected": number or "all"
        }
    ],
    "summary": {
        "totalTasks": number,
        "highPriority": number,
        "mediumPriority": number,
        "lowPriority": number,
        "estimatedCompletionTime": "overall timeline"
    }
}`;

    try {
        const response = await llm.invoke(prompt);
        let tasks = response.content.trim()
            .replace(/```json\n?/g, "")
            .replace(/```\n?/g, "")
            .trim();

        const generatedTasks = JSON.parse(tasks);

        console.log(chalk.gray(`   Created ${generatedTasks.summary?.totalTasks || 0} tasks`));
        console.log(chalk.gray(`   High priority: ${generatedTasks.summary?.highPriority || 0}`));

        return { generatedTasks };
    } catch (err) {
        console.log(chalk.yellow(`   ⚠️ Task generation skipped: ${err.message}`));
        return { generatedTasks: null };
    }
}

// ================================
// AGENT 7: ENHANCED PRESENTATION
// ================================
async function resultPresentationAgent(state) {
    const {
        userQuery,
        sqlQuery,
        queryResult,
        kpiAnalysis,
        rootCauseAnalysis,
        generatedTasks,
        validationResult,
        correctionAttempts
    } = state;

    console.log(chalk.yellow(`\n✨ Preparing response...`));

    // Handle no results case
    if (!queryResult || queryResult.length === 0) {
        const errorResponse = `I couldn't find any data matching your query. This could mean:
• The filters are too restrictive
• The data doesn't exist for the specified time period
• There might be a spelling mismatch in store names

Would you like me to try a broader search?`;

        return { finalAnswer: errorResponse };
    }

    const prompt = `You are a helpful Retail Analytics Assistant. Create a clear, conversational response.

=== CONTEXT ===
User Question: "${userQuery}"

Query Validation: ${validationResult?.isCorrect ? 'Passed' : 'Had issues but showing best results'}
${correctionAttempts > 1 ? `Note: Query was refined ${correctionAttempts - 1} time(s) to get better results.` : ''}

=== DATA RETRIEVED ===
SQL Query Used:
${sqlQuery}

Total Results: ${queryResult.length} stores

Top 5 Results:
${JSON.stringify(queryResult.slice(0, 5), null, 2)}

${queryResult.length > 5 ? `... and ${queryResult.length - 5} more stores` : ''}

=== ANALYSIS (if available) ===
${kpiAnalysis ? `
KPI Analysis:
- Status: ${kpiAnalysis.healthStatus}
- Score: ${kpiAnalysis.overallScore}/100
- Key Findings:
${kpiAnalysis.keyFindings?.map(f => `  • ${f}`).join('\n') || '  None'}
` : 'No KPI analysis performed.'}

${rootCauseAnalysis ? `
Root Causes Identified:
${rootCauseAnalysis.primaryCauses?.map(c => `  • ${c.factor} (${c.impact} impact): ${c.description}`).join('\n') || '  None'}
` : ''}

${generatedTasks ? `
Tasks Generated: ${generatedTasks.summary?.totalTasks || 0}
High Priority: ${generatedTasks.summary?.highPriority || 0}
` : ''}

=== RESPONSE GUIDELINES ===
1. Start with a direct answer to the question
2. Highlight the most important findings (2-3 bullet points max)
3. If there are concerning results, mention them
4. If tasks were generated, summarize the key actions
5. Keep it conversational, not robotic
6. Use numbers and store names when relevant
7. End with a helpful follow-up suggestion if appropriate

=== FORMAT ===
Write a natural, helpful response. Use bullet points sparingly.
Do NOT include the SQL query in your response.
Do NOT use markdown headers (##).
Keep it under 300 words unless the user asked for detailed analysis.`;

    try {
        const response = await llm.invoke(prompt);
        const finalAnswer = response.content.trim();

        // Save to conversation context
        conversationContext.addInteraction(
            userQuery,
            state.analyzedQuery,
            sqlQuery,
            queryResult,
            finalAnswer
        );

        return { finalAnswer };
    } catch (err) {
        // Fallback response
        const fallbackAnswer = `Here's what I found:

${queryResult.slice(0, 5).map((row, i) => {
            const values = Object.entries(row)
                .filter(([k]) => k !== 'store_id')
                .map(([k, v]) => `${k}: ${v}`)
                .join(', ');
            return `${i + 1}. ${values}`;
        }).join('\n')}

${queryResult.length > 5 ? `\n... and ${queryResult.length - 5} more results.` : ''}`;

        conversationContext.addInteraction(
            userQuery,
            state.analyzedQuery,
            sqlQuery,
            queryResult,
            fallbackAnswer
        );

        return { finalAnswer: fallbackAnswer };
    }
}

// ================================
// GRAPH DEFINITION
// ================================
const workflow = new StateGraph(GraphState)
    .addNode("agent_1_context", contextAwareQueryAgent)
    .addNode("agent_2_sql", sqlGenerationAgent)
    .addNode("agent_3_validation", validationAgent)
    .addNode("agent_4_kpi", kpiAnalysisAgent)
    .addNode("agent_5_rootcause", rootCauseAgent)
    .addNode("agent_6_tasks", taskGenerationAgent)
    .addNode("agent_7_presentation", resultPresentationAgent)
    .addEdge(START, "agent_1_context")
    .addEdge("agent_1_context", "agent_2_sql")
    .addEdge("agent_2_sql", "agent_3_validation")
    .addConditionalEdges(
        "agent_3_validation",
        correctionDecision,
        {
            retry_sql: "agent_2_sql",
            continue: "agent_4_kpi"
        }
    )
    .addEdge("agent_4_kpi", "agent_5_rootcause")
    .addEdge("agent_5_rootcause", "agent_6_tasks")
    .addEdge("agent_6_tasks", "agent_7_presentation")
    .addEdge("agent_7_presentation", END);

const app = workflow.compile();

// ================================
// TERMINAL CHAT INTERFACE
// ================================
class ChatInterface {
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: chalk.cyan('\n💬 You: ')
        });
        this.isProcessing = false;
    }

    printWelcome() {
        console.clear();
        console.log(chalk.bold.green('\n╔════════════════════════════════════════════════════════════════════╗'));
        console.log(chalk.bold.green('║   🤖 AI Retail Analytics Chat (Enhanced Self-Correcting Mode)     ║'));
        console.log(chalk.bold.green('╚════════════════════════════════════════════════════════════════════╝'));
        console.log(chalk.yellow('\n📊 Ask questions about store performance - I\'ll validate and correct myself!'));
        console.log(chalk.gray('\nCommands:'));
        console.log(chalk.gray('  /help     - Show example queries'));
        console.log(chalk.gray('  /clear    - Clear conversation history'));
        console.log(chalk.gray('  /stats    - Show conversation statistics'));
        console.log(chalk.gray('  /schema   - Show database schema'));
        console.log(chalk.gray('  /exit     - Exit the chat'));
        console.log(chalk.gray('\n' + '─'.repeat(70)));
    }

    printHelp() {
        console.log(chalk.yellow('\n📚 Example Queries:\n'));

        console.log(chalk.cyan('Basic Queries:'));
        console.log('  • "Show top 10 stores by revenue"');
        console.log('  • "Which stores have the lowest order count?"');
        console.log('  • "Bottom 20 branches by orders in last 3 months"');

        console.log(chalk.cyan('\nFiltered Queries:'));
        console.log('  • "Show mall stores with profit below 5%"');
        console.log('  • "Which Istanbul stores have worst ratings?"');

        console.log(chalk.cyan('\nFollow-up Queries (uses context):'));
        console.log('  • "What are their audit scores?"');
        console.log('  • "How much time did managers spend there?"');
        console.log('  • "Compare these to average"');

        console.log(chalk.cyan('\nAnalysis Queries:'));
        console.log('  • "Why are these stores underperforming?"');
        console.log('  • "What should we do about the worst stores?"');
        console.log('  • "Analyze the efficiency of bottom performers"');
    }

    printSchema() {
        console.log(chalk.yellow('\n📋 Database Schema Summary:\n'));
        console.log(chalk.cyan('Table: store_metrics'));
        console.log(chalk.gray('\nKey Columns:'));
        console.log('  • store_name, store_type, store_city');
        console.log('  • month, year, order_month (COUNT of orders)');
        console.log('  • net_revenue_tl_month, store_profit_tl_month');
        console.log('  • store_audit_score, online_rating_score');
        console.log('  • active_headcount, store_size_m2');
        console.log(chalk.gray('\nTime Range: 2024, months 1-12'));
    }

    printStats() {
        console.log(chalk.yellow('\n📊 Conversation Statistics:'));
        console.log(`   Queries asked: ${conversationContext.history.length}`);
        console.log(`   Stores discussed: ${conversationContext.entities.recentStores?.length || 0}`);
        console.log(`   Metrics tracked: ${conversationContext.entities.discussedMetrics?.length || 0}`);

        if (conversationContext.entities.discussedMetrics?.length > 0) {
            console.log(`   Topics: ${conversationContext.entities.discussedMetrics.join(', ')}`);
        }

        if (conversationContext.entities.recentStores?.length > 0) {
            console.log(`   Recent stores: ${conversationContext.entities.recentStores.slice(0, 5).map(s => s.name).join(', ')}...`);
        }
    }

    async processQuery(query) {
        if (this.isProcessing) {
            console.log(chalk.red('\n⏳ Please wait for the current query to complete...'));
            return;
        }

        if (query.startsWith('/')) {
            this.handleCommand(query);
            return;
        }

        if (!query.trim()) {
            this.rl.prompt();
            return;
        }

        this.isProcessing = true;

        try {
            const startTime = Date.now();
            const result = await app.invoke({
                userQuery: query,
                correctionAttempts: 0
            });
            const duration = ((Date.now() - startTime) / 1000).toFixed(1);

            if (result.error && !result.queryResult) {
                console.log(chalk.red(`\n❌ Error: ${result.error}`));
            } else {
                // Show main answer
                console.log(chalk.green('\n🤖 Assistant:\n'));
                console.log(this.formatAnswer(result.finalAnswer));

                // Show KPI status if available
                if (result.kpiAnalysis) {
                    const statusEmoji = {
                        'Critical': '🔴',
                        'Warning': '🟡',
                        'Good': '🟢',
                        'Excellent': '🌟'
                    };
                    console.log(chalk.yellow(`\n${statusEmoji[result.kpiAnalysis.healthStatus] || '⚪'} KPI Status: ${result.kpiAnalysis.healthStatus} (${result.kpiAnalysis.overallScore}/100)`));
                }

                // Show tasks summary if available
                if (result.generatedTasks?.tasks?.length > 0) {
                    console.log(chalk.yellow(`\n📋 ${result.generatedTasks.summary.totalTasks} Action Tasks Generated`));
                    console.log(chalk.gray(`   High priority: ${result.generatedTasks.summary.highPriority}`));
                }

                // Show data table
                if (result.queryResult && result.queryResult.length > 0) {
                    console.log(chalk.gray(`\n📊 Data Preview (${result.queryResult.length} total rows):`));

                    // Show up to 20 rows, or all if less than 20
                    const displayLimit = Math.min(result.queryResult.length, 20);
                    console.table(result.queryResult.slice(0, displayLimit));

                    if (result.queryResult.length > displayLimit) {
                        console.log(chalk.gray(`   ... ${result.queryResult.length - displayLimit} more rows (data is complete, showing preview)`));
                    }
                }

                // Show correction info
                if (result.correctionAttempts > 1) {
                    console.log(chalk.cyan(`\n🔄 Query was self-corrected ${result.correctionAttempts - 1} time(s)`));
                }
            }

            console.log(chalk.gray(`\n⏱️  Completed in ${duration}s`));

        } catch (error) {
            console.log(chalk.red(`\n❌ System Error: ${error.message}`));
            console.log(chalk.gray(error.stack));
        } finally {
            this.isProcessing = false;
            this.rl.prompt();
        }
    }

    formatAnswer(answer) {
        return answer
            .replace(/\*\*(.*?)\*\*/g, chalk.bold('$1'))
            .replace(/• /g, chalk.cyan('• '))
            .replace(/\n- /g, '\n' + chalk.cyan('• '));
    }

    handleCommand(command) {
        const cmd = command.toLowerCase().trim();

        switch (cmd) {
            case '/help':
                this.printHelp();
                break;

            case '/clear':
                conversationContext.clear();
                console.log(chalk.green('\n✅ Conversation history cleared!'));
                break;

            case '/stats':
                this.printStats();
                break;

            case '/schema':
                this.printSchema();
                break;

            case '/exit':
            case '/quit':
                console.log(chalk.yellow('\n👋 Thanks for using AI Retail Analytics! Goodbye!\n'));
                this.rl.close();
                process.exit(0);
                break;

            default:
                console.log(chalk.red(`\n❌ Unknown command: ${command}`));
                console.log(chalk.gray('Type /help for available commands'));
        }

        this.rl.prompt();
    }

    start() {
        this.printWelcome();

        this.rl.on('line', async (input) => {
            await this.processQuery(input.trim());
        });

        this.rl.on('close', () => {
            console.log(chalk.yellow('\n👋 Goodbye!\n'));
            process.exit(0);
        });

        this.rl.prompt();
    }
}

// ================================
// START
// ================================
const chat = new ChatInterface();
chat.start();