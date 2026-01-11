import { StateGraph, START, END } from "@langchain/langgraph";
import { GraphState } from "./state.js";
import {
    contextAwareQueryAgent,
    sqlGenerationAgent,
    validationAgent,
    kpiAnalysisAgent,
    rootCauseAgent,
    taskGenerationAgent,
    resultPresentationAgent,
    correctionDecision
} from "./nodes.js";

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

export const app = workflow.compile();
