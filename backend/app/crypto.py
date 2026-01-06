"""
Credential Encryption Module

Provides encryption/decryption for credential data using Fernet (AES-128-CBC + HMAC-SHA256).
Key is auto-generated on first run and stored in a separate file.
"""

import os
import json
import base64
import logging
from pathlib import Path
from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)

# Key file location - configurable via environment variable
KEY_FILE_PATH = os.environ.get("GRABARR_KEY_PATH", "/config/.grabarr_key")

# Fallback for development (relative to backend dir)
if not os.path.exists(os.path.dirname(KEY_FILE_PATH)) and KEY_FILE_PATH == "/config/.grabarr_key":
    KEY_FILE_PATH = os.path.join(os.path.dirname(__file__), "..", ".grabarr_key")

_fernet_instance = None


def _get_key_path() -> str:
    """Get the resolved key file path."""
    return os.path.abspath(KEY_FILE_PATH)


def get_or_create_key() -> bytes:
    """
    Load encryption key from file, or generate a new one if it doesn't exist.
    Returns the 32-byte key.
    """
    key_path = _get_key_path()
    
    if os.path.exists(key_path):
        logger.info(f"Loading encryption key from {key_path}")
        with open(key_path, "rb") as f:
            key = f.read()
        # Validate key format (Fernet expects url-safe base64 encoded 32 bytes)
        if len(key) != 44:  # base64 encoded 32 bytes = 44 chars
            raise ValueError(f"Invalid key file format at {key_path}")
        return key
    
    # Generate new key
    logger.info(f"Generating new encryption key at {key_path}")
    key = Fernet.generate_key()
    
    # Ensure directory exists
    key_dir = os.path.dirname(key_path)
    if key_dir:
        os.makedirs(key_dir, exist_ok=True)
    
    # Write key with restrictive permissions
    with open(key_path, "wb") as f:
        f.write(key)
    
    # Set file permissions to owner-only (chmod 600)
    try:
        os.chmod(key_path, 0o600)
    except OSError as e:
        logger.warning(f"Could not set restrictive permissions on key file: {e}")
    
    return key


def get_fernet() -> Fernet:
    """Get or create the Fernet instance for encryption/decryption."""
    global _fernet_instance
    if _fernet_instance is None:
        key = get_or_create_key()
        _fernet_instance = Fernet(key)
    return _fernet_instance


def encrypt_credential_data(data: dict) -> str:
    """
    Encrypt credential data dictionary to a base64 string.
    
    Args:
        data: Dictionary containing credential fields
        
    Returns:
        Encrypted data as a base64 string prefixed with 'enc:'
    """
    if not data:
        return "enc:"
    
    fernet = get_fernet()
    json_bytes = json.dumps(data).encode("utf-8")
    encrypted = fernet.encrypt(json_bytes)
    return f"enc:{encrypted.decode('utf-8')}"


def decrypt_credential_data(encrypted_data) -> dict:
    """
    Decrypt credential data from encrypted string back to dictionary.
    
    Args:
        encrypted_data: Either an encrypted string (prefixed with 'enc:') or a plain dict
        
    Returns:
        Decrypted dictionary
    """
    # Handle None or empty
    if not encrypted_data:
        return {}
    
    # If it's already a dict (legacy plain-text data), return as-is
    if isinstance(encrypted_data, dict):
        return encrypted_data
    
    # If it's a string, check for encryption prefix
    if isinstance(encrypted_data, str):
        if encrypted_data.startswith("enc:"):
            token = encrypted_data[4:]  # Remove 'enc:' prefix
            if not token:
                return {}
            
            fernet = get_fernet()
            try:
                decrypted = fernet.decrypt(token.encode("utf-8"))
                return json.loads(decrypted.decode("utf-8"))
            except InvalidToken:
                logger.error("Failed to decrypt credential data - invalid token")
                raise ValueError("Failed to decrypt credential data")
            except json.JSONDecodeError:
                logger.error("Failed to parse decrypted credential data as JSON")
                raise ValueError("Invalid credential data format")
        else:
            # Plain string that's not encrypted - try to parse as JSON
            try:
                return json.loads(encrypted_data)
            except json.JSONDecodeError:
                logger.warning("Credential data is not valid JSON, returning empty")
                return {}
    
    # Unknown type
    logger.warning(f"Unknown credential data type: {type(encrypted_data)}")
    return {}


def is_encrypted(data) -> bool:
    """Check if credential data is already encrypted."""
    if isinstance(data, str) and data.startswith("enc:"):
        return True
    return False


def get_key_file_path() -> str:
    """Get the path to the encryption key file (for backup purposes)."""
    return _get_key_path()
