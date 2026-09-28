import os
import smtplib
from dotenv import load_dotenv

def test_smtp():
    # Load environment variables
    # Check both root and backend folders to be safe
    if os.path.exists('.env'):
        load_dotenv('.env')
    else:
        load_dotenv('backend/.env')
    
    email = os.getenv("MAIL_USER", "")
    # Aggressively sanitize the password
    password = os.getenv("MAIL_PASSOWRD", "").strip().replace(" ", "")
    port = int(os.getenv("MAIL_PORT", 587))
    server = os.getenv("MAIL_SEVER", "smtp.gmail.com")
    
    print(f"--- SMTP Diagnostic Test ---")
    print(f"Target Server : {server}:{port}")
    print(f"Target Email  : {email}")
    print(f"Password Len  : {len(password)} characters")
    
    if len(password) != 16:
        print("WARNING: Google App Passwords are usually exactly 16 characters long!")
        
    if not email or email == "noreply@example.com":
        print("ERROR: Invalid EMAIL_USER configured. Please check your .env")
        return

    print("\nAttempting connection...")
    try:
        # Determine connection protocol based on port
        if port == 465:
            smtp = smtplib.SMTP_SSL(server, port, timeout=10)
        else:
            smtp = smtplib.SMTP(server, port, timeout=10)
            smtp.ehlo()
            smtp.starttls()
            smtp.ehlo()
            
        print("Connection established. Attempting login...")
        smtp.login(email, password)
        print("SUCCESS! Credentials are valid and SMTP is fully authenticated.")
        smtp.quit()
        
    except smtplib.SMTPAuthenticationError as e:
        print(f"\nFAILED (Auth Error): The server rejected your credentials. Ensure you are using an App Password and that EMAIL_USER matches.")
        print(f"Raw Error: {e}")
    except Exception as e:
        print(f"\nFAILED: {str(e)}")

if __name__ == "__main__":
    test_smtp()
