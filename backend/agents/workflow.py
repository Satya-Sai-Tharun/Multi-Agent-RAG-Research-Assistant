from typing import TypedDict, List, Dict, Any, Optional
from langgraph.graph import StateGraph, END

from agents.planner import query_planner_agent
from agents.retriever import retriever_agent
from agents.synthesizer import synthesizer_agent

class AgentState(TypedDict):
    query: str
    filter_doc_ids: Optional[List[str]]
    conversation_history: List[Dict[str, str]]
    
    # populated by planner
    plan: Optional[Dict[str, Any]]
    
    # populated by retriever
    retrieval_result: Optional[Dict[str, Any]]
    
    # populated by synthesizer (if not streaming)
    answer: Optional[str]
    citations: Optional[List[Dict[str, Any]]]


async def plan_node(state: AgentState):
    plan = await query_planner_agent.run(state["query"])
    return {"plan": plan}

async def retrieve_node(state: AgentState):
    retrieval_result = await retriever_agent.run(
        plan=state["plan"], filter_doc_ids=state.get("filter_doc_ids")
    )
    return {"retrieval_result": retrieval_result}

async def synthesize_node(state: AgentState):
    result = await synthesizer_agent.run(
        query=state["query"],
        plan=state["plan"],
        retrieval_result=state["retrieval_result"],
        conversation_history=state.get("conversation_history", [])
    )
    return {"answer": result["answer"], "citations": result["citations"]}


def build_workflow(include_synthesis: bool = True):
    """
    Build the LangGraph workflow.
    If include_synthesis is False, the graph ends after retrieval (useful for manual streaming).
    """
    workflow = StateGraph(AgentState)
    
    workflow.add_node("planner", plan_node)
    workflow.add_node("retriever", retrieve_node)
    
    if include_synthesis:
        workflow.add_node("synthesizer", synthesize_node)
        
    workflow.set_entry_point("planner")
    workflow.add_edge("planner", "retriever")
    
    if include_synthesis:
        workflow.add_edge("retriever", "synthesizer")
        workflow.add_edge("synthesizer", END)
    else:
        workflow.add_edge("retriever", END)
        
    return workflow.compile()

# Pre-compiled workflows
query_workflow = build_workflow(include_synthesis=True)
retrieval_workflow = build_workflow(include_synthesis=False)
