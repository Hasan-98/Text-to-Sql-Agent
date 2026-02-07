import { conversationContext } from "../context/ConversationContext.js";

// Column groups for schema trimming
export const COLUMN_GROUPS = {
    identifiers: ["store_name", "store_type", "store_city", "store_district"],
    time: ["month", "year"],
    orders: ["order_month"],
    revenue: ["net_revenue_tl_month", "avg_net_order_value_tl", "net_revenue_per_m2"],
    profit: [
        "store_profit_tl_month", "store_profit_ratio_percent",
        "cogs_tl_month", "personal_cost_tl_month",
        "avg_discount_per_order_tl", "avg_discount_percent_per_order",
        "avg_cogs_percent_net_revenue", "personal_cost_percent_net_revenue",
        "profit_per_m2"
    ],
    efficiency: [
        "store_size_m2", "monthly_order_per_m2",
        "revenue_per_active_headcount", "orders_per_active_headcount"
    ],
    staff: ["norm_headcount", "active_headcount"],
    quality: [
        "store_audit_score", "online_rating_score",
        "competition_online_rating_score", "price_index_vs_competition",
        "district_manager_hours_spent", "store_uptime_ratio_percent",
        "product_availability_ratio_percent"
    ]
};

// All valid column names
export const ALL_COLUMNS = new Set(Object.values(COLUMN_GROUPS).flat());

// Valid GROUP BY columns (identifiers only)
const VALID_GROUP_COLS = new Set([
    "store_name", "store_type", "store_city", "store_district"
]);

/**
 * Build SQL deterministically from Agent 1's structured output.
 * Returns { sql, error }.
 */
export function buildSQL(analyzedQuery) {
    const {
        metric, aggregation, filters, sorting, limit,
        useStoresFromLastQuery, groupByField
    } = analyzedQuery;

    // Validate metric
    if (!metric || !ALL_COLUMNS.has(metric)) {
        return { sql: null, error: `Unknown metric column: ${metric}` };
    }

    // Determine grouping column
    let groupCol = "store_name";
    if (groupByField && VALID_GROUP_COLS.has(groupByField)) {
        groupCol = groupByField;
    }

    const agg = (aggregation || "NONE").toUpperCase();
    const needsAgg = agg !== "NONE" && ["SUM", "AVG", "COUNT"].includes(agg);

    // --- SELECT ---
    let selectParts = [];
    const alias = "result_value";

    if (needsAgg) {
        selectParts.push(groupCol);
        selectParts.push(`${agg}(${metric}) AS ${alias}`);
    } else {
        selectParts.push("store_name");
        if (metric !== "store_name") selectParts.push(metric);
    }

    // --- WHERE ---
    let conditions = [];

    if (filters?.year) {
        conditions.push(`year = ${parseInt(filters.year)}`);
    }
    if (filters?.month_condition) {
        const mc = String(filters.month_condition).trim();
        // Support various formats: ">= 10", "BETWEEN 1 AND 6", "= 3"
        if (/^(>=|<=|>|<|=|BETWEEN)\s/i.test(mc)) {
            conditions.push(`month ${mc}`);
        } else if (/^\d+$/.test(mc)) {
            conditions.push(`month = ${mc}`);
        }
    }
    if (filters?.store_type) {
        conditions.push(`store_type = '${escapeSql(filters.store_type)}'`);
    }
    if (filters?.store_city) {
        conditions.push(`store_city = '${escapeSql(filters.store_city)}'`);
    }
    if (filters?.store_district) {
        conditions.push(`store_district = '${escapeSql(filters.store_district)}'`);
    }
    if (filters?.store_names && Array.isArray(filters.store_names) && filters.store_names.length > 0) {
        const names = filters.store_names.map(s => `'${escapeSql(s)}'`).join(", ");
        conditions.push(`store_name IN (${names})`);
    }
    if (filters?.custom_condition) {
        const cc = String(filters.custom_condition).trim();
        if (!containsDangerousSQL(cc) && cc.length > 0) {
            conditions.push(cc);
        }
    }

    // Follow-up: filter to stores from last query
    if (useStoresFromLastQuery) {
        const storeNames = conversationContext.getRecentStoreNames().slice(0, 20);
        if (storeNames.length > 0) {
            const names = storeNames.map(s => `'${escapeSql(s)}'`).join(", ");
            conditions.push(`store_name IN (${names})`);
        }
    }

    // --- BUILD QUERY ---
    let sql = `SELECT ${selectParts.join(", ")}`;
    sql += ` FROM store_metrics`;

    if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(" AND ")}`;
    }

    if (needsAgg) {
        sql += ` GROUP BY ${groupCol}`;
    }

    // --- ORDER BY ---
    const sortDir = sorting === "ASC" ? "ASC" : "DESC";
    const orderCol = needsAgg ? alias : metric;
    sql += ` ORDER BY ${orderCol} ${sortDir}`;

    // --- LIMIT ---
    const limitNum = Math.min(Math.max(parseInt(limit) || 100, 1), 500);
    sql += ` LIMIT ${limitNum}`;

    return { sql, error: null };
}

/**
 * Returns only the relevant columns for a given metric (for LLM fallback prompt).
 */
export function getRelevantColumns(metric) {
    let cols = [...COLUMN_GROUPS.identifiers, ...COLUMN_GROUPS.time];

    for (const [, columns] of Object.entries(COLUMN_GROUPS)) {
        if (columns.includes(metric)) {
            cols = [...cols, ...columns];
            break;
        }
    }

    // Deduplicate
    return [...new Set(cols)].join(", ");
}

function escapeSql(str) {
    return String(str).replace(/'/g, "''");
}

function containsDangerousSQL(str) {
    return /(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|;)/i.test(str);
}
