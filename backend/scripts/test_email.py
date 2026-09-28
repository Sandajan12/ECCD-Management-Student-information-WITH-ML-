import os
import sys
import asyncio

# Ensure backend module can be imported
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from dotenv import load_dotenv
from backend.utils.email import get_connection_config
from fastapi_mail import FastMail, MessageSchema, MessageType

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../.env'))

async def main():
    print("Testing Email Configuration...")
    config = get_connection_config()
    
    # Zero-Assumption Rule: Never print raw password
    password_len = len(config.MAIL_PASSWORD) if config.MAIL_PASSWORD else 0
    
    print(f"MAIL_USERNAME: {config.MAIL_USERNAME}")
    print(f"MAIL_PASSWORD Length: {password_len}")
    print(f"MAIL_SERVER: {config.MAIL_SERVER}")
    print(f"MAIL_PORT: {config.MAIL_PORT}")
    print(f"MAIL_STARTTLS: {config.MAIL_STARTTLS}")
    print(f"MAIL_SSL_TLS: {config.MAIL_SSL_TLS}")

    message = MessageSchema(
        subject="Test Connection - AMES System",
        recipients=[config.MAIL_USERNAME], # Send to self
        body="This is a test email verifying that fastapi-mail credentials are correct.",
        subtype=MessageType.plain
    )
    
    fm = FastMail(config)
    
    print("\nAttempting to send test email...")
    try:
        await fm.send_message(message)
        print("Success! Test email sent.")
    except Exception as e:
        print(f"Failed to send email. Error: {str(e)}")

if __name__ == "__main__":
    asyncio.run(main())
