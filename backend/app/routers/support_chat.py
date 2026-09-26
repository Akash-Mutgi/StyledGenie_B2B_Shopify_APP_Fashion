"""Customer-service-only chat endpoint used by the storefront support widget."""

from typing import Literal, Optional

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from app.services.store_knowledge_service import StoreKnowledgeService
from app.services.support_agent import SupportAgent
from app.services.support_guard import (
    client_ip_from_request,
    current_client_ip,
    current_visitor_id,
    enforce_chat_rate_limit,
    normalize_visitor_id,
)

router = APIRouter(tags=["support-chat"])

knowledge = StoreKnowledgeService()
knowledge.refresh_in_background()  # warm the policy cache at start-up
agent = SupportAgent(knowledge=knowledge)


class SupportChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)


class SupportPageContext(BaseModel):
    payment_methods: list[str] = Field(default_factory=list, max_length=30)
    locale: Optional[str] = Field(default=None, max_length=10)


class SupportChatRequest(BaseModel):
    visitor_id: Optional[str] = None
    messages: list[SupportChatMessage] = Field(min_length=1, max_length=40)
    page_context: Optional[SupportPageContext] = None


class SupportLink(BaseModel):
    label: str
    url: str


class SupportTicket(BaseModel):
    reference: str
    reply_to: str
    response_time: str


class SupportChatResponse(BaseModel):
    reply: str
    links: list[SupportLink] = Field(default_factory=list)
    ticket: Optional[SupportTicket] = None
    visitor_id: str


@router.post("/api/support/chat", response_model=SupportChatResponse)
def support_chat(request: Request, payload: SupportChatRequest) -> SupportChatResponse:
    visitor_id = normalize_visitor_id(payload.visitor_id)
    client_ip = client_ip_from_request(request)
    current_client_ip.set(client_ip)
    current_visitor_id.set(visitor_id)
    enforce_chat_rate_limit(visitor_id, client_ip)
    result = agent.reply(
        messages=[message.model_dump() for message in payload.messages],
        visitor_id=visitor_id,
        client_ip=client_ip,
        page_context=payload.page_context.model_dump() if payload.page_context else None,
    )
    ticket = result.get("ticket")
    return SupportChatResponse(
        reply=result["reply"],
        links=[SupportLink(**link) for link in result.get("links") or []],
        ticket=SupportTicket(**{k: ticket[k] for k in ("reference", "reply_to", "response_time")}) if ticket else None,
        visitor_id=visitor_id,
    )
