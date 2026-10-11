import os

from dotenv import load_dotenv
from fastapi_mail import ConnectionConfig, FastMail, MessageSchema, MessageType
from backend.config.settings import settings

env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env')
load_dotenv(dotenv_path=env_path)

def get_connection_config():
    port = int(os.getenv("MAIL_PORT", "587"))
    
    mail_starttls = os.getenv("MAIL_STARTTLS", "True").lower() in ("true", "1", "t", "yes")
    mail_ssl_tls = os.getenv("MAIL_SSL_TLS", "False").lower() in ("true", "1", "t", "yes")

    return ConnectionConfig(
        MAIL_USERNAME=os.getenv("MAIL_USERNAME", "noreply@example.com"),
        MAIL_PASSWORD=os.getenv("MAIL_PASSWORD", "").strip().replace(" ", ""),
        MAIL_FROM=os.getenv("MAIL_FROM", "noreply@example.com"),
        MAIL_PORT=port,
        MAIL_SERVER=os.getenv("MAIL_SERVER", "smtp.gmail.com"),
        MAIL_STARTTLS=mail_starttls,
        MAIL_SSL_TLS=mail_ssl_tls,
        USE_CREDENTIALS=True,
        VALIDATE_CERTS=True
    )

async def send_otp_email(email: str, otp: str):
    if not settings.ENABLE_OTP:
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
    
    message = MessageSchema(
        subject="Your Verification Code",
        recipients=[email],
        body=html,
        subtype=MessageType.html
    )
    
    fm = FastMail(get_connection_config())
    await fm.send_message(message)
