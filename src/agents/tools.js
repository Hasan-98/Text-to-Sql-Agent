import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { supabase } from "../config/settings.js";

export const executeSQLTool = tool(
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
