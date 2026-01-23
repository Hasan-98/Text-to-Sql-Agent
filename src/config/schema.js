export const DB_SCHEMA = `
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
- year (integer): Year
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
3. Latest data: Use the maximum year and month available or infer from current date
4. Time filters: Always calculate year and month based on the query relative to the current date
5. Always use GROUP BY when using aggregate functions (SUM, AVG, COUNT)
6. Column names are EXACT - use underscore format

=== EXAMPLE QUERIES ===

Example 1: "Top 10 stores by revenue"
SELECT store_name, SUM(net_revenue_tl_month) as total_revenue
FROM store_metrics
WHERE year = [CURRENT_YEAR]
GROUP BY store_name
ORDER BY total_revenue DESC
LIMIT 10;

Example 2: "Bottom 20 stores by orders last 3 months"
SELECT store_name, SUM(order_month) as total_orders
FROM store_metrics
WHERE (year = [CURRENT_YEAR] AND month >= [3_MONTHS_AGO_MONTH]) OR (year = [PREVIOUS_YEAR] AND month >= [WRAP_AROUND_MONTH])
GROUP BY store_name
ORDER BY total_orders ASC
LIMIT 20;

Example 3: "Average profit margin by store type"
SELECT store_type, AVG(store_profit_ratio_percent) as avg_profit_margin
FROM store_metrics
WHERE year = [CURRENT_YEAR]
GROUP BY store_type
ORDER BY avg_profit_margin DESC;

Example 4: "Stores with audit score below 70"
SELECT store_name, AVG(store_audit_score) as avg_audit_score
FROM store_metrics
WHERE year = [CURRENT_YEAR]
GROUP BY store_name
HAVING AVG(store_audit_score) < 70
ORDER BY avg_audit_score ASC;
`;

export const KPI_DEFINITIONS = {
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
