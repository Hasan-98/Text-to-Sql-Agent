import chalk from "chalk";
import { llm } from "../config/settings.js";
import { DB_SCHEMA, KPI_DEFINITIONS } from "../config/schema.js";
import { conversationContext } from "../context/ConversationContext.js";
import { executeSQLTool } from "./tools.js";

// ================================
// AGENT 1: ENHANCED QUERY UNDERSTANDING
// ================================
export async function contextAwareQueryAgent(state) {
    const { userQuery } = state;
    const contextInfo = conversationContext.getContextForPrompt();
    const hasContext = conversationContext.hasContext();

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const currentDate = now.toISOString().split('T')[0];

    // Compute helper values for few-shot examples
    const threeMonthsAgo = currentMonth - 2 > 0 ? currentMonth - 2 : 1;

    const contextSection = hasContext
        ? `Previous query: "${conversationContext.lastQuery || ''}"
Previous stores: ${conversationContext.getRecentStoreNames().slice(0, 5).join(", ") || "none"}
Follow-up = user says "they/those/these/their stores" or "also show X" for same stores.
NOT follow-up = user names new filters, stores, or a completely different topic.`
        : "New conversation, no previous context.";

    const prompt = `Analyze this retail database query and return structured JSON.

Table: store_metrics (one row = one store for one month)
Columns: store_name, store_type (Mall/Street), store_city, store_district, month (1-12), year, order_month (order COUNT, use SUM to total), net_revenue_tl_month, avg_net_order_value_tl, net_revenue_per_m2, store_profit_tl_month, store_profit_ratio_percent, profit_per_m2, cogs_tl_month, personal_cost_tl_month, avg_discount_per_order_tl, avg_discount_percent_per_order, avg_cogs_percent_net_revenue, personal_cost_percent_net_revenue, store_size_m2, monthly_order_per_m2, revenue_per_active_headcount, orders_per_active_headcount, norm_headcount, active_headcount, store_audit_score (0-100), online_rating_score (0-5), competition_online_rating_score, price_index_vs_competition, district_manager_hours_spent, store_uptime_ratio_percent, product_availability_ratio_percent

Today: ${currentDate} | Year: ${currentYear} | Month: ${currentMonth}
${contextSection}

EXAMPLES:

Example 1 - No time filter (user didn't mention time):
Q: "Top 10 stores by revenue"
A: {"metric":"net_revenue_tl_month","aggregation":"SUM","filters":{},"sorting":"DESC","limit":10,"isFollowUp":false,"useStoresFromLastQuery":false,"requiresKPIAnalysis":false,"kpiCategory":null,"intent":"top 10 stores by total revenue"}

Example 2 - With explicit "this year":
Q: "Top 10 stores by revenue this year"
A: {"metric":"net_revenue_tl_month","aggregation":"SUM","filters":{"year":${currentYear}},"sorting":"DESC","limit":10,"isFollowUp":false,"useStoresFromLastQuery":false,"requiresKPIAnalysis":false,"kpiCategory":null,"intent":"top 10 stores by total revenue this year"}

Example 3 - Follow-up with pronoun (CRITICAL: uses "their" = same stores, NO year filter):
Previous query: "Top 10 stores by revenue"
Previous stores: Store A, Store B, Store C
Q: "What are their audit scores?"
A: {"metric":"store_audit_score","aggregation":"AVG","filters":{},"sorting":"DESC","limit":100,"isFollowUp":true,"useStoresFromLastQuery":true,"requiresKPIAnalysis":false,"kpiCategory":null,"intent":"audit scores for previously discussed stores"}

Example 4 - Follow-up with "also show" (CRITICAL: same stores, NO year filter):
Previous query: "Bottom 20 stores by orders"
Previous stores: Store X, Store Y, Store Z
Q: "also show their profit margins"
A: {"metric":"store_profit_ratio_percent","aggregation":"AVG","filters":{},"sorting":"ASC","limit":100,"isFollowUp":true,"useStoresFromLastQuery":true,"requiresKPIAnalysis":false,"kpiCategory":null,"intent":"profit margins for previously discussed stores"}

Example 5 - Follow-up with "these stores" (CRITICAL: explicit reference, NO year filter):
Previous query: "Mall stores with low ratings"
Previous stores: Mall A, Mall B
Q: "what about manager time for these stores?"
A: {"metric":"district_manager_hours_spent","aggregation":"AVG","filters":{},"sorting":"DESC","limit":100,"isFollowUp":true,"useStoresFromLastQuery":true,"requiresKPIAnalysis":false,"kpiCategory":null,"intent":"manager time for previously discussed stores"}

Example 6 - With city filter (NO year filter):
Q: "Bottom 20 stores by orders in Istanbul"
A: {"metric":"order_month","aggregation":"SUM","filters":{"store_city":"Istanbul"},"sorting":"ASC","limit":20,"isFollowUp":false,"useStoresFromLastQuery":false,"requiresKPIAnalysis":false,"kpiCategory":null,"intent":"bottom 20 stores by order count in Istanbul"}

Example 7 - With explicit "last 3 months" (ONLY then use time filter):
Q: "Average profit margin by store type last 3 months"
A: {"metric":"store_profit_ratio_percent","aggregation":"AVG","filters":{"year":${currentYear},"month_condition":">= ${threeMonthsAgo}"},"sorting":"DESC","limit":100,"isFollowUp":false,"useStoresFromLastQuery":false,"requiresKPIAnalysis":false,"kpiCategory":null,"intent":"average profit margin by store type last 3 months"}

CRITICAL RULES:
- DO NOT add year filter unless user explicitly mentions: "this year", "last year", "2024", "last 3 months", etc.
- If no time period mentioned, use empty filters: "filters":{}
- For follow-ups: isFollowUp=true AND useStoresFromLastQuery=true IF user says "they/their/them/these/those stores" OR "also show X" OR "what about Y"
- For follow-ups: keep filters empty {} unless user adds NEW filters
- When isFollowUp=true, set limit=100 to ensure all previous stores are included

User question: "${userQuery}"
Respond with ONLY the JSON object, no markdown.`;

    try {
        console.log(chalk.gray('\n🧠 Analyzing your question...'));

        const response = await llm.invoke(prompt);
        let analysis = response.content.trim();

        // Remove markdown code blocks
        analysis = analysis.replace(/```json\n?/g, "");
        analysis = analysis.replace(/```\n?/g, "");
        analysis = analysis.trim();

        // Try to extract JSON if there's extra text
        const jsonMatch = analysis.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            analysis = jsonMatch[0];
        }

        const analyzedQuery = JSON.parse(analysis);

        // If it's explicitly NOT a follow-up, clear internal context or flags
        if (!analyzedQuery.isFollowUp) {
            analyzedQuery.useStoresFromLastQuery = false;
        }

        // Default groupByField if missing
        if (!analyzedQuery.groupByField) {
            analyzedQuery.groupByField = "store_name";
        }

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
export async function sqlGenerationAgent(state) {
    const { userQuery, analyzedQuery, correctionAttempts, validationResult, error } = state;

    if (!analyzedQuery) {
        return { error: "Query analysis failed - cannot generate SQL" };
    }

    // Get current year for SQL templates
    const currentYear = new Date().getFullYear();

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
    if (analyzedQuery?.useStoresFromLastQuery && conversationContext.entities.recentStores.length > 0) {
        const storeNames = conversationContext.getRecentStoreNames().slice(0, 20);
        storeFilter = `
=== IMPORTANT: FILTER TO THESE SPECIFIC STORES ===
The user is asking about stores from the previous query.
You MUST add this to your WHERE clause:
store_name IN (${storeNames.map(s => `'${s.replace(/'/g, "''")}'`).join(', ')})
`;
    }

    const prompt = `Write a PostgreSQL query for the store_metrics table.

${correctionSection}

Schema: ${DB_SCHEMA}

Question: "${userQuery}"
Analysis: ${JSON.stringify(analyzedQuery)}

${storeFilter}

⚠️ CRITICAL: analyzedQuery.filters = ${JSON.stringify(analyzedQuery.filters || {})}
${!analyzedQuery.filters?.year ? '❌ NO YEAR FILTER - Do NOT add "WHERE year = X" to your SQL!' : `✅ Year filter: ${analyzedQuery.filters.year}`}

SQL TEMPLATES:

1. Basic query (no year filter unless specified):
SELECT store_name, ${analyzedQuery.aggregation}(${analyzedQuery.metric}) as result_value
FROM store_metrics
${analyzedQuery.filters?.year ? `WHERE year = ${analyzedQuery.filters.year}` : ''}
GROUP BY store_name
ORDER BY result_value ${analyzedQuery.sorting}
LIMIT ${analyzedQuery.limit};

2. With city/type filter (year only if specified):
SELECT store_name, ${analyzedQuery.aggregation}(${analyzedQuery.metric}) as result_value
FROM store_metrics
WHERE ${analyzedQuery.filters?.year ? `year = ${analyzedQuery.filters.year} AND ` : ''}store_city = '${analyzedQuery.filters?.store_city || 'CITY'}'
GROUP BY store_name
ORDER BY result_value ${analyzedQuery.sorting}
LIMIT ${analyzedQuery.limit};

3. With month filter (requires year):
SELECT store_name, ${analyzedQuery.aggregation}(${analyzedQuery.metric}) as result_value
FROM store_metrics
WHERE ${analyzedQuery.filters?.year ? `year = ${analyzedQuery.filters.year} AND ` : ''}month ${analyzedQuery.filters?.month_condition || '>= 1'}
GROUP BY store_name
ORDER BY result_value ${analyzedQuery.sorting}
LIMIT ${analyzedQuery.limit};

CRITICAL RULES:
- ⚠️ ONLY add WHERE year = X if analyzedQuery.filters.year exists
- ⚠️ If analyzedQuery.filters is empty {}, do NOT add ANY year filter
- If no year filter, either omit WHERE clause or only include other filters
- ALWAYS use GROUP BY store_name when using SUM/AVG/COUNT
- order_month is a COUNT per month, use SUM(order_month) for totals
- Sort: DESC for "top/best/highest", ASC for "bottom/worst/lowest"
- Use EXACTLY LIMIT ${analyzedQuery.limit}
${storeFilter ? '- MUST include the store_name IN (...) filter shown above' : ''}

Now use the execute_sql tool to run your query.`;

    try {
        const response = await llm.bindTools([executeSQLTool]).invoke(prompt);

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
            let sql = response.content.trim();

            // Remove markdown code blocks
            sql = sql.replace(/```sql\n?/g, "");
            sql = sql.replace(/```\n?/g, "");
            sql = sql.trim();

            // Find the SQL query in the response (look for SELECT statement)
            const sqlMatch = sql.match(/SELECT[\s\S]*?(?:LIMIT\s+\d+|;|$)/i);
            if (sqlMatch) {
                sql = sqlMatch[0].replace(/;$/, "").trim();
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
export async function validationAgent(state) {
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
            needsCorrection: correctionAttempts < 2,
            correctionAttempts: correctionAttempts + 1,
            error: null // Reset error so sqlGenerationAgent can try again
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
            needsCorrection: correctionAttempts < 2,
            correctionAttempts: correctionAttempts + 1,
            error: null // Reset error so sqlGenerationAgent can try again
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
// AGENT 4: ENHANCED KPI ANALYSIS
// ================================
export async function kpiAnalysisAgent(state) {
    const { analyzedQuery, queryResult } = state;

    if (!analyzedQuery?.requiresKPIAnalysis || !queryResult || queryResult.length === 0) {
        return { kpiAnalysis: null };
    }

    const kpiCategory = analyzedQuery.kpiCategory || 'revenue';
    const kpiDef = KPI_DEFINITIONS[kpiCategory];

    if (!kpiDef) {
        console.log(chalk.yellow(`\n⚠️ Warning: KPI category "${kpiCategory}" not found. Skipping analysis.`));
        return { kpiAnalysis: null };
    }

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
export async function rootCauseAgent(state) {
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
export async function taskGenerationAgent(state) {
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
export async function resultPresentationAgent(state) {
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
// DECISION: NEEDS CORRECTION? Helper
// ================================
export function correctionDecision(state) {
    if (state.validationResult && !state.validationResult.isCorrect && state.sqlQuery) {
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
