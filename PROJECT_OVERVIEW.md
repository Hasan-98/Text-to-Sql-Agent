# Text-to-Sql Agent Project Overview

## Purpose and Reason
The goal of this project is to create an advanced AI-driven system that converts natural language queries into valid SQL, executes those queries against a Supabase database, and provides insightful analysis. Beyond simple query generation, the system aims to provide error recovery, KPI analysis, root cause identification for data trends, and actionable task generation based on insights.

## Core Libraries & Technologies
- **@langchain/langgraph**: Orchestrates the multi-agent workflow using a state machine approach.
- **@langchain/openai**: Provides the interface for Large Language Models (LLM), specifically GPT-4o mini, for intelligence.
- **@supabase/supabase-js**: Used for connecting to and interacting with the Postgres database hosted on Supabase.
- **dotenv**: Manages environment variables for secure configuration.

## Agentic Architecture (LangGraph Workflow)
The project utilizes a state-aware multi-agent architecture where specialized agents handle specific parts of the request lifecycle:

1.  **Context-Aware Query Agent**: Analyzes the user's input to understand intent and retrieve relevant schema context.
2.  **SQL Generation Agent**: Translates the refined natural language query into executable SQL.
3.  **Validation Agent**: Checks the generated SQL for syntax errors and ensures it matches the user's intent. If errors are found, it triggers a retry loop.
4.  **KPI Analysis Agent**: Extracts and calculates Key Performance Indicators from the query results.
5.  **Root Cause Agent**: Analyzes data trends and anomalies to identify underlying causes.
6.  **Task Generation Agent**: Suggests specific, actionable tasks based on the insights derived from the data.
7.  **Result Presentation Agent**: Formats the final answer, including data, insights, and recommendations, for the user.

## Directory Structure
- `src/`
    - `agents/`: Contains the logic for the LangGraph workflow (`workflow.js`), specialized agent nodes (`nodes.js`), and state management (`state.js`).
    - `config/`: Configuration settings and client initializations (`settings.js`).
    - `context/`: Handles domain-specific knowledge and retrieval logic.
    - `ui/`: Contains the terminal-based user interface components.
    - `utils/`: Utility functions for shared logic across the application.
- `index.js`: The entry point that initializes the chat interface.
- `.env`: Environment configuration file.
- `package.json`: Project metadata and dependency definitions.
