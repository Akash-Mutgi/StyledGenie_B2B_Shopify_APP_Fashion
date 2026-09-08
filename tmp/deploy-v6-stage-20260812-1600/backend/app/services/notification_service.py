import base64
import logging
import smtplib
import ssl
from email.message import EmailMessage
from typing import Optional
from urllib import error, parse, request

from app.config import settings
from app.models.schemas import SupportContact, SupportNotificationResult, SupportRequestRecord


logger = logging.getLogger(__name__)


class NotificationService:
    def notify_support_request(
        self,
        *,
        support_request: SupportRequestRecord,
        assigned_contacts: list[SupportContact],
        shopper_summary: str,
        transcript_excerpt: str,
        shopper_email: Optional[str],
        shopper_phone: Optional[str],
        order_reference: Optional[str],
        support_email_fallback: Optional[str] = None,
    ) -> SupportNotificationResult:
        result = SupportNotificationResult()
        targets = assigned_contacts or self._fallback_contacts(support_email_fallback)

        for contact in targets:
            if contact.email.strip():
                if self._send_email(
                    recipient=contact.email.strip(),
                    subject=self._build_subject(shopper_summary, support_request.id),
                    body=self._build_email_body(
                        contact=contact,
                        support_request=support_request,
                        shopper_summary=shopper_summary,
                        transcript_excerpt=transcript_excerpt,
                        shopper_email=shopper_email,
                        shopper_phone=shopper_phone,
                        order_reference=order_reference,
                    ),
                    reply_to=shopper_email or settings.smtp_reply_to,
                ):
                    result.email_targets.append(contact.email.strip())
                    result.email_sent = True

            if contact.phone.strip():
                if self._send_whatsapp(
                    recipient=contact.phone.strip(),
                    body=self._build_whatsapp_body(
                        support_request=support_request,
                        shopper_summary=shopper_summary,
                        shopper_email=shopper_email,
                        shopper_phone=shopper_phone,
                        order_reference=order_reference,
                    ),
                ):
                    result.whatsapp_targets.append(contact.phone.strip())
                    result.whatsapp_sent = True

        if not result.email_sent and not result.whatsapp_sent:
            result.errors.append("No support notification channel is configured for the assigned teammate.")

        return result

    def _fallback_contacts(self, support_email_fallback: Optional[str]) -> list[SupportContact]:
        if not support_email_fallback:
            return []
        return [
            SupportContact(
                name="Support team",
                role="Customer Care",
                email=support_email_fallback,
            )
        ]

    def _build_subject(self, shopper_summary: str, request_id: str) -> str:
        summary = shopper_summary.strip() or "New support handoff"
        return f"[StyledGenie Support] {summary[:80]} ({request_id[:8]})"

    def _build_email_body(
        self,
        *,
        contact: SupportContact,
        support_request: SupportRequestRecord,
        shopper_summary: str,
        transcript_excerpt: str,
        shopper_email: Optional[str],
        shopper_phone: Optional[str],
        order_reference: Optional[str],
    ) -> str:
        shopper_contact_lines = [
            f"Support request ID: {support_request.id}",
            f"Assigned teammate: {contact.name or 'Support team'} ({contact.role or 'Customer Care'})",
            f"Customer email: {shopper_email or 'Not provided yet'}",
            f"Customer phone / WhatsApp: {shopper_phone or 'Not provided yet'}",
            f"Order reference: {order_reference or 'Not provided yet'}",
            "",
            "Issue summary:",
            shopper_summary.strip() or "The shopper asked to speak to someone.",
            "",
            "Recent conversation:",
            transcript_excerpt.strip() or "No transcript excerpt available.",
        ]
        return "\n".join(shopper_contact_lines)

    def _build_whatsapp_body(
        self,
        *,
        support_request: SupportRequestRecord,
        shopper_summary: str,
        shopper_email: Optional[str],
        shopper_phone: Optional[str],
        order_reference: Optional[str],
    ) -> str:
        return (
            f"StyledGenie support request {support_request.id[:8]}\n"
            f"Summary: {shopper_summary.strip() or 'The shopper asked to speak to someone.'}\n"
            f"Customer email: {shopper_email or 'Not provided'}\n"
            f"Customer phone: {shopper_phone or 'Not provided'}\n"
            f"Order reference: {order_reference or 'Not provided'}"
        )

    def _send_email(self, *, recipient: str, subject: str, body: str, reply_to: Optional[str] = None) -> bool:
        if not settings.smtp_host or not settings.smtp_from_email:
            return False

        message = EmailMessage()
        message["Subject"] = subject
        message["From"] = settings.smtp_from_email
        message["To"] = recipient
        if reply_to:
            message["Reply-To"] = reply_to
        message.set_content(body)

        try:
            if settings.smtp_use_ssl:
                context = ssl.create_default_context()
                with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, context=context) as server:
                    if settings.smtp_username and settings.smtp_password:
                        server.login(settings.smtp_username, settings.smtp_password)
                    server.send_message(message)
            else:
                with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
                    if settings.smtp_use_tls:
                        server.starttls(context=ssl.create_default_context())
                    if settings.smtp_username and settings.smtp_password:
                        server.login(settings.smtp_username, settings.smtp_password)
                    server.send_message(message)
            return True
        except Exception as error:
            logger.warning("Support email notification failed. %s", error)
            return False

    def _send_whatsapp(self, *, recipient: str, body: str) -> bool:
        if not settings.twilio_account_sid or not settings.twilio_auth_token or not settings.twilio_whatsapp_from:
            return False

        url = (
            f"https://api.twilio.com/2010-04-01/Accounts/"
            f"{settings.twilio_account_sid}/Messages.json"
        )
        normalized_to = self._normalize_whatsapp_target(recipient)
        payload = parse.urlencode(
            {
                "To": normalized_to,
                "From": self._normalize_whatsapp_target(settings.twilio_whatsapp_from),
                "Body": body,
            }
        ).encode("utf-8")
        auth_token = base64.b64encode(
            f"{settings.twilio_account_sid}:{settings.twilio_auth_token}".encode("utf-8")
        ).decode("ascii")
        req = request.Request(url, data=payload, method="POST")
        req.add_header("Authorization", f"Basic {auth_token}")
        req.add_header("Content-Type", "application/x-www-form-urlencoded")

        try:
            with request.urlopen(req, timeout=12) as response:
                status_code = getattr(response, "status", 200)
                if 200 <= status_code < 300:
                    return True
                logger.warning("Twilio WhatsApp notification returned status %s", status_code)
                return False
        except error.HTTPError as http_error:
            try:
                error_payload = http_error.read().decode("utf-8")
                logger.warning("Twilio WhatsApp notification failed. %s", error_payload)
            except Exception:
                logger.warning("Twilio WhatsApp notification failed. %s", http_error)
            return False
        except Exception as general_error:
            logger.warning("Twilio WhatsApp notification failed. %s", general_error)
            return False

    def _normalize_whatsapp_target(self, value: str) -> str:
        cleaned = value.strip()
        if cleaned.lower().startswith("whatsapp:"):
            return cleaned
        return f"whatsapp:{cleaned}"
