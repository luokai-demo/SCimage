from __future__ import annotations


RETRYABLE_CURL_MARKERS = (
    "operation timed out",
    "timed out",
    "empty reply from server",
    "failed to connect",
    "connection reset by peer",
    "recv failure",
    "connection was reset",
    "proxy connect aborted",
    "ssl connection timeout",
    "ssl_error_syscall",
)

RETRYABLE_GATEWAY_MARKERS = (
    "504 gateway time-out",
    "504 gateway timeout",
    "gateway request timed out",
    "temporarily unavailable",
    "service unavailable",
    "bad gateway",
    "upstream request failed",
    "upstream_error",
    "too many requests",
    "server internal error",
    '"code":"429"',
    '"code":"500"',
    '"code":"502"',
    '"code":"503"',
    '"code": "429"',
    '"code": "500"',
    '"code": "502"',
    '"code": "503"',
    "<html",
)


class GatewayRetryableError(RuntimeError):
    pass


class GatewayFatalError(RuntimeError):
    pass


class GatewayCanceledError(RuntimeError):
    pass


def normalize_message(message: str) -> str:
    return " ".join(message.replace("\r", " ").replace("\n", " ").split()).strip()


def is_retryable_message(message: str) -> bool:
    normalized = message.lower()
    return any(marker in normalized for marker in RETRYABLE_CURL_MARKERS + RETRYABLE_GATEWAY_MARKERS)
