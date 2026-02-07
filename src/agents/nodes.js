import chalk from "chalk";
import { llm } from "../config/settings.js";
import { DB_SCHEMA, KPI_DEFINITIONS } from "../config/schema.js";
import { conversationContext } from "../context/ConversationContext.js";
import { executeSQLTool } from "./tools.js";
import { buildSQL, getRelevantColumns } from "./sqlBuilder.js";

// ================================
// AGENT 1: QUERY UNDERSTANDING (Optimized for cheap models)
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
        ? `Previous query: "${conversationContext.context.lastQuery || ''}"
Previous stores: ${conversationContext.getRecentStoreNames().slice(0, 5).join(", ") || "none"}
Follow-up = user says "they/those/these/their stores" or "also show X" for same stores.
NOT follow-up = user names new filters, stores, or a completely different topic.`
        : "New conversation, no previous context.";

    const prompt = `Analyze this retail database query and return structured JSON.

Table: store_metrics (one row = one store for one month)
Columns: store_name, store_type (Mall/Street), store_city, store_district, month (1-12), year, order_month (order COUNT, use SUM to total), net_revenue_tl_month, avg_net_order_value_tl, net_revenue_per_m2, store_profit_tl_month, store_profit_ratio_percent, profit_per_m2, cogs_tl_month, personal_cost_tl_month, avg_discount_per_order_tl, avg_discount_percent_per_order, avg_cogs_percent_net_revenue, personal_cost_percent_net_revenue, store_size_m2, monthly_order_per_m2, revenue_per_active_headcount, orders_per_active_headcount, norm_headcount, active_headcount, store_audit_score (0-100), online_rating_score (0-5), competition_online_rating_score, price_index_vs_competition, district_manager_hours_spent, store_uptime_ratio_percent, product_availability_ratio_percent

Today: ${currentDate} | Year: ${currentYear} | Month: ${currentMonth}
${contextSection}

Examples:
Q: "Top 10 stores by revenue this year"
A: {"metric":"net_revenue_tl_month","aggregation":"SUM","groupByField":"store_name","filters":{"year":${currentYear}},"sorting":"DESC","limit":10,"isFollowUp":false,"useStoresFromLastQuery":false,"requiresKPIAnalysis":false,"kpiCategory":null,"intent":"top 10 stores by total revenue"}

Q: "What are their audit scores?"
A: {"metric":"store_audit_score","aggregation":"AVG","groupByField":"store_name","filters":{"year":${currentYear}},"sorting":"DESC","limit":100,"isFollowUp":true,"useStoresFromLastQuery":true,"requiresKPIAnalysis":false,"kpiCategory":null,"intent":"audit scores for previously discussed stores"}

Q: "Average profit margin by store type last 3 months"
A: {"metric":"store_profit_ratio_percent","aggregation":"AVG","groupByField":"store_type","filters":{"year":${currentYear},"month_condition":">= ${threeMonthsAgo}"},"sorting":"DESC","limit":100,"isFollowUp":false,"useStoresFromLastQuery":false,"requiresKPIAnalysis":false,"kpiCategory":null,"intent":"average profit margin grouped by store type"}

Q: "Bottom 20 stores by orders in Istanbul"
A: {"metric":"order_month","aggregation":"SUM","groupByField":"store_name","filters":{"year":${currentYear},"store_city":"Istanbul"},"sorting":"ASC","limit":20,"isFollowUp":false,"useStoresFromLastQuery":false,"requiresKPIAnalysis":false,"kpiCategory":null,"intent":"bottom 20 stores by order count in Istanbul"}

Q: "Analyze why bottom stores have low efficiency"
A: {"metric":"orders_per_active_headcount","aggregation":"AVG","groupByField":"store_name","filters":{"year":${currentYear}},"sorting":"ASC","limit":20,"isFollowUp":false,"useStoresFromLastQuery":false,"requiresKPIAnalysis":true,"kpiCategory":"efficiency","intent":"analyze low efficiency stores"}

Q: "Show me mall stores with rating below 3"
A: {"metric":"online_rating_score","aggregation":"AVG","groupByField":"store_name","filters":{"year":${currentYear},"store_type":"Mall","custom_condition":"online_rating_score < 3"},"sorting":"ASC","limit":100,"isFollowUp":false,"useStoresFromLastQuery":false,"requiresKPIAnalysis":false,"kpiCategory":null,"intent":"mall stores with low online rating"}

User question: "${userQuery}"
Respond with ONLY the JSON object, no markdown.`;

    try {
        console.log(chalk.gray('\n🧠 Analyzing your question...'));

        const response = await llm.invoke(prompt);
        let analysis = response.content.trim()
            .replace(/```json\n?/g, "")
            .replace(/```\n?/g, "")
            .trim();

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
// AGENT 2: SQL GENERATION (Deterministic + LLM Fallback)
// ================================
export async function sqlGenerationAgent(state) {
    const { userQuery, analyzedQuery, correctionAttempts, validationResult, error } = state;

    if (!analyzedQuery) {
        return { error: "Query analysis failed - cannot generate SQL" };
    }

    const isRetry = correctionAttempts > 0;

    // --- PRIMARY PATH: Deterministic SQL (no LLM call) ---
    if (!isRetry) {
        const { sql, error: buildError } = buildSQL(analyzedQuery);

        if (sql && !buildError) {
            console.log(chalk.blue(`\n📝 SQL (deterministic):`));
            console.log(chalk.gray(sql));

            const toolResult = await executeSQLTool.invoke({ sqlQuery: sql });
            const result = JSON.parse(toolResult);

            if (result.success) {
                console.log(chalk.green(`✅ Query OK: ${result.rowCount} rows`));
                return {
                    sqlQuery: sql,
                    queryResult: result.data,
                    sqlBuildMethod: "deterministic"
                };
            } else {
                console.log(chalk.yellow(`⚠️ Deterministic SQL failed: ${result.error}`));
                console.log(chalk.yellow(`   Falling back to LLM...`));
            }
        } else {
            console.log(chalk.yellow(`⚠️ SQL builder error: ${buildError}`));
            console.log(chalk.yellow(`   Falling back to LLM...`));
        }
    }

    // --- FALLBACK PATH: LLM generates SQL (for retries or complex queries) ---
    const relevantCols = getRelevantColumns(analyzedQuery.metric);

    let retryContext = "";
    if (isRetry && state.sqlQuery) {
        const issues = validationResult?.issues || [error || "Query execution failed"];
        retryContext = `Previous failing SQL: ${state.sqlQuery}\nIssues: ${issues.join("; ")}\nGenerate a DIFFERENT query that fixes these problems.\n`;
    }

    const fallbackPrompt = `Write a PostgreSQL SELECT query for the store_metrics table.
Relevant columns: ${relevantCols}
One row = one store per month. Use GROUP BY with aggregate functions (SUM/AVG).

${retryContext}Question: "${userQuery}"
Analysis: ${JSON.stringify(analyzedQuery)}

Return ONLY the SQL query, no explanation.`;

    try {
        console.log(chalk.blue(`\n📝 SQL via LLM (Attempt ${correctionAttempts + 1}):`));

        const response = await llm.invoke(fallbackPrompt);
        let sql = response.content.trim()
            .replace(/```sql\n?/g, "")
            .replace(/```\n?/g, "")
            .trim();

        // Extract SQL if model added explanation
        const sqlMatch = sql.match(/SELECT[\s\S]*?(?:LIMIT\s+\d+|;|$)/i);
        if (sqlMatch) {
            sql = sqlMatch[0].replace(/;$/, "").trim();
        }

        console.log(chalk.gray(sql));

        const toolResult = await executeSQLTool.invoke({ sqlQuery: sql });
        const result = JSON.parse(toolResult);

        if (result.success) {
            console.log(chalk.green(`✅ Query OK: ${result.rowCount} rows`));
            return {
                sqlQuery: sql,
                queryResult: result.data,
                sqlBuildMethod: "llm_fallback"
            };
        } else {
            console.log(chalk.red(`❌ SQL Error: ${result.error}`));
            return {
                sqlQuery: sql,
                error: `SQL Error: ${result.error}`,
                queryResult: null,
                sqlBuildMethod: "llm_fallback"
            };
        }
    } catch (err) {
        console.log(chalk.red(`❌ Generation Error: ${err.message}`));
        return { error: `SQL Generation Error: ${err.message}` };
    }
}

// ================================
// AGENT 3: VALIDATION (Code-based, no LLM call)
// ================================
export async function validationAgent(state) {
    const { analyzedQuery, sqlQuery, queryResult, correctionAttempts } = state;

    console.log(chalk.yellow(`\n🔍 Validating results...`));

    // Check 1: No results (query execution failed)
    if (!queryResult) {
        console.log(chalk.red('   ❌ No results returned'));
        return makeFailResult("Query execution failed - no results returned", correctionAttempts, state);
    }

    // Check 2: Empty results
    if (queryResult.length === 0) {
        console.log(chalk.red('   ❌ Query returned 0 rows'));
        return makeFailResult("Query returned zero results - filters may be too restrictive", correctionAttempts, state);
    }

    // Check 3: Metric column present in results
    const resultColumns = Object.keys(queryResult[0]);
    const metricName = analyzedQuery?.metric || "";
    const hasMetricColumn = resultColumns.some(col =>
        col === metricName ||
        col === "result_value" ||
        col.includes(metricName.split("_")[0])
    );
    if (!hasMetricColumn && metricName) {
        console.log(chalk.red(`   ❌ Metric "${metricName}" not in columns: ${resultColumns.join(", ")}`));
        return makeFailResult(
            `Expected metric "${metricName}" not found in result columns: ${resultColumns.join(", ")}`,
            correctionAttempts, state
        );
    }

    // Check 4: Sorting correctness
    const numericCol = resultColumns.find(c => c === "result_value" || c === metricName);
    if (numericCol && queryResult.length >= 2) {
        const firstVal = Number(queryResult[0][numericCol]);
        const lastVal = Number(queryResult[queryResult.length - 1][numericCol]);

        if (!isNaN(firstVal) && !isNaN(lastVal) && Math.abs(firstVal - lastVal) > 0.01) {
            const wantsAsc = analyzedQuery?.sorting === "ASC";
            const isAsc = firstVal <= lastVal;

            if (wantsAsc !== isAsc) {
                console.log(chalk.red(`   ❌ Sorting wrong: wanted ${analyzedQuery.sorting}, first=${firstVal}, last=${lastVal}`));
                return makeFailResult(
                    `Sorting incorrect: wanted ${analyzedQuery.sorting} but first=${firstVal}, last=${lastVal}`,
                    correctionAttempts, state
                );
            }
        }
    }

    // All checks passed
    console.log(chalk.green(`   ✅ Validation passed (${queryResult.length} rows, metric & sorting OK)`));

    return {
        validationResult: {
            isCorrect: true,
            confidence: 90,
            issues: [],
            suggestions: [],
            reasoning: `Passed: ${queryResult.length} rows, metric present, sorting correct`
        },
        needsCorrection: false,
        correctionAttempts: correctionAttempts + 1,
        previousSQLAttempts: [
            ...(state.previousSQLAttempts || []),
            sqlQuery.trim().toLowerCase().replace(/\s+/g, " ")
        ]
    };
}

function makeFailResult(issue, correctionAttempts, state) {
    return {
        validationResult: {
            isCorrect: false,
            confidence: 0,
            issues: [issue],
            suggestions: ["Retry with corrected SQL"]
        },
        needsCorrection: correctionAttempts < 2,
        correctionAttempts: correctionAttempts + 1,
        error: null,
        previousSQLAttempts: [
            ...(state.previousSQLAttempts || []),
            ...(state.sqlQuery ? [state.sqlQuery.trim().toLowerCase().replace(/\s+/g, " ")] : [])
        ]
    };
}

// ================================
// AGENT 4: KPI ANALYSIS (Trimmed prompt)
// ================================
export async function kpiAnalysisAgent(state) {
    const { analyzedQuery, queryResult } = state;

    if (!analyzedQuery?.requiresKPIAnalysis || !queryResult || queryResult.length === 0) {
        return { kpiAnalysis: null };
    }

    const kpiCategory = analyzedQuery.kpiCategory || 'revenue';
    const kpiDef = KPI_DEFINITIONS[kpiCategory];

    console.log(chalk.yellow(`\n📊 Analyzing ${kpiDef.name}...`));

    const prompt = `Analyze ${queryResult.length} stores for ${kpiDef.name} (${kpiDef.description}).
Metrics: ${kpiDef.metrics.join(", ")}
Thresholds: Critical < ${kpiDef.thresholds.critical}%, Warning < ${kpiDef.thresholds.warning}%, Good > ${kpiDef.thresholds.good}%
Root cause factors: ${kpiDef.rootCauseFactors.join(", ")}

Data (first 3 stores):
${JSON.stringify(queryResult.slice(0, 3), null, 2)}

Return ONLY JSON:
{"healthStatus":"Critical|Warning|Good|Excellent","overallScore":0-100,"distribution":{"critical":N,"warning":N,"good":N},"keyFindings":["finding1","finding2","finding3"],"needsRootCause":true/false,"urgency":"immediate|soon|monitor"}`;

    try {
        const response = await llm.invoke(prompt);
        let analysis = response.content.trim()
            .replace(/```json\n?/g, "")
            .replace(/```\n?/g, "")
            .trim();

        const kpiAnalysis = JSON.parse(analysis);

        const statusEmoji = { 'Critical': '🔴', 'Warning': '🟡', 'Good': '🟢', 'Excellent': '🌟' };
        console.log(chalk.gray(`   Status: ${statusEmoji[kpiAnalysis.healthStatus] || '⚪'} ${kpiAnalysis.healthStatus}`));
        console.log(chalk.gray(`   Score: ${kpiAnalysis.overallScore}/100`));

        return { kpiAnalysis };
    } catch (err) {
        console.log(chalk.yellow(`   ⚠️ KPI analysis skipped: ${err.message}`));
        return { kpiAnalysis: null };
    }
}

// ================================
// AGENT 5: ROOT CAUSE (Trimmed prompt)
// ================================
export async function rootCauseAgent(state) {
    const { kpiAnalysis, queryResult, analyzedQuery } = state;

    if (!kpiAnalysis?.needsRootCause) {
        return { rootCauseAnalysis: null };
    }

    const kpiCategory = analyzedQuery.kpiCategory || 'revenue';
    const kpiDef = KPI_DEFINITIONS[kpiCategory];

    console.log(chalk.yellow(`\n🔍 Investigating root causes...`));

    const prompt = `Identify why stores underperform in ${kpiDef.name}. Status: ${kpiAnalysis.healthStatus}, Score: ${kpiAnalysis.overallScore}/100.
Findings: ${kpiAnalysis.keyFindings.join("; ")}
Factors to check: ${kpiDef.rootCauseFactors.join(", ")}

Data (3 stores):
${JSON.stringify(queryResult.slice(0, 3), null, 2)}

Return ONLY JSON:
{"primaryCauses":[{"factor":"name","impact":"high|medium|low","affectedStores":"count","description":"explanation","evidence":"data proof"}],"secondaryCauses":[{"factor":"name","impact":"medium|low","description":"explanation"}],"recommendations":[{"action":"specific action","priority":"high|medium|low","expectedImpact":"improvement","timeline":"timeframe"}]}`;

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
// AGENT 6: TASK GENERATION (Trimmed prompt)
// ================================
export async function taskGenerationAgent(state) {
    const { kpiAnalysis, rootCauseAnalysis, queryResult } = state;

    if (!rootCauseAnalysis?.recommendations) {
        return { generatedTasks: null };
    }

    console.log(chalk.yellow(`\n📋 Generating action tasks...`));

    const causes = rootCauseAnalysis.primaryCauses?.map(c => `${c.factor}: ${c.description}`).join("; ") || "None";
    const recs = rootCauseAnalysis.recommendations?.map(r => `${r.action} (${r.priority})`).join("; ") || "None";

    const prompt = `Create actionable retail tasks from this analysis.
Status: ${kpiAnalysis?.healthStatus || 'Unknown'}, Urgency: ${kpiAnalysis?.urgency || 'monitor'}, Affected stores: ${queryResult?.length || 0}
Causes: ${causes}
Recommendations: ${recs}

Rules: Assign to Store Manager/District Manager/Regional Manager/HR/Operations. High priority=1-2 days, Medium=1 week, Low=2 weeks.

Return ONLY JSON:
{"tasks":[{"id":1,"title":"task title","description":"details","priority":"high|medium|low","assignedTo":"role","deadline":"timeframe","expectedOutcome":"success metric","storesAffected":"count"}],"summary":{"totalTasks":N,"highPriority":N,"mediumPriority":N,"lowPriority":N,"estimatedCompletionTime":"timeline"}}`;

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
// AGENT 7: PRESENTATION (Trimmed prompt)
// ================================
export async function resultPresentationAgent(state) {
    const {
        userQuery,
        sqlQuery,
        queryResult,
        kpiAnalysis,
        rootCauseAnalysis,
        generatedTasks
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

    // Build concise analysis section
    let analysisPart = "";
    if (kpiAnalysis) {
        analysisPart += `\nKPI: ${kpiAnalysis.healthStatus} (${kpiAnalysis.overallScore}/100). Findings: ${kpiAnalysis.keyFindings?.join("; ") || "None"}`;
    }
    if (rootCauseAnalysis?.primaryCauses?.length) {
        analysisPart += `\nCauses: ${rootCauseAnalysis.primaryCauses.map(c => `${c.factor} (${c.impact})`).join(", ")}`;
    }
    if (generatedTasks?.summary) {
        analysisPart += `\nTasks: ${generatedTasks.summary.totalTasks} total, ${generatedTasks.summary.highPriority} high priority`;
    }

    const prompt = `Answer this retail analytics question conversationally. Use store names and numbers.
Question: "${userQuery}"
Results (${queryResult.length} stores, first 3):
${JSON.stringify(queryResult.slice(0, 3), null, 2)}
${queryResult.length > 3 ? `... and ${queryResult.length - 3} more` : ""}
${analysisPart}

Rules: Start with direct answer. 2-3 bullet points max. No SQL. No markdown headers. Under 200 words.`;

    try {
        const response = await llm.invoke(prompt);
        const finalAnswer = response.content.trim();

        conversationContext.addInteraction(
            userQuery,
            state.analyzedQuery,
            sqlQuery,
            queryResult,
            finalAnswer
        );

        return { finalAnswer };
    } catch (err) {
        const fallbackAnswer = `Here's what I found:\n\n${queryResult.slice(0, 5).map((row, i) => {
            const values = Object.entries(row)
                .filter(([k]) => k !== 'store_id')
                .map(([k, v]) => `${k}: ${v}`)
                .join(', ');
            return `${i + 1}. ${values}`;
        }).join('\n')}${queryResult.length > 5 ? `\n\n... and ${queryResult.length - 5} more results.` : ''}`;

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
