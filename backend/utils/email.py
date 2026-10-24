import asyncio
import logging

import httpx
from fastapi_mail import ConnectionConfig, FastMail, MessageSchema, MessageType
from backend.config.settings import settings

def get_connection_config():
    return ConnectionConfig(
        MAIL_USERNAME=settings.MAIL_USERNAME,
        MAIL_PASSWORD=settings.MAIL_PASSWORD.get_secret_value().strip().replace(" ", ""),
        MAIL_FROM=settings.MAIL_FROM,
        MAIL_PORT=settings.MAIL_PORT,
        MAIL_SERVER=settings.MAIL_SERVER,
        MAIL_STARTTLS=settings.MAIL_STARTTLS,
        MAIL_SSL_TLS=settings.MAIL_SSL_TLS,
        USE_CREDENTIALS=True,
        VALIDATE_CERTS=True,
        MAIL_DEBUG=0,
        SUPPRESS_SEND=0,
        TIMEOUT=15,
    )

async def send_otp_email(email: str, otp: str):
    if not settings.otp_enabled:
        logging.getLogger("uvicorn.error").info("[DEV] Bypassed OTP for %s", email)
        return

    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; text-align: center;">
        <h2 style="color: #111827;">Verification Code</h2>
        <p style="color: #4B5563; font-size: 16px;">Please use the 6-digit code below to securely verify your identity:</p>
        <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <h1 style="color: #2563EB; letter-spacing: 8px; margin: 0; font-size: 32px;">{otp}</h1>
        </div>
        <p style="color: #9CA3AF; font-size: 14px;">This code will expire in 10 minutes.</p>
    </div>
    """
    
    if settings.EMAIL_TRANSPORT == "brevo_api":
        key = settings.BREVO_API_KEY.get_secret_value().strip() if settings.BREVO_API_KEY else ""
        if not key:
            raise RuntimeError("Email API is not configured")
        # Fixed HTTPS endpoint, certificate validation on, redirects off: credentials
        # and OTPs must never be forwarded to a provider-selected redirect.
        async with httpx.AsyncClient(timeout=15, follow_redirects=False) as client:
            result = await asyncio.wait_for(client.post(
                "https://api.brevo.com/v3/smtp/email",
                headers={"api-key": key, "accept": "application/json"},
                json={"sender": {"email": str(settings.MAIL_FROM)}, "to": [{"email": email}],
                      "subject": "Your Verification Code", "htmlContent": html},
            ), timeout=30)
            if result.status_code != 201:
                # Never surface provider bodies, headers, credentials or OTPs.
                raise RuntimeError("Verification email delivery failed")
    else:
        message = MessageSchema(subject="Your Verification Code", recipients=[email], body=html, subtype=MessageType.html)
        fm = FastMail(get_connection_config())
        await asyncio.wait_for(fm.send_message(message), timeout=30)
    logging.getLogger("uvicorn.error").info("[AUTH] OTP sent via email to %s", email)
