import { Annotation } from "@langchain/langgraph";

export const GraphState = Annotation.Root({
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
    sqlBuildMethod: Annotation(), // "deterministic" or "llm_fallback"
});
