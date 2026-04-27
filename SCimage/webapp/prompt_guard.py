from __future__ import annotations

import re


UNSUPPORTED_PROMPT_MESSAGE = "该提示词包含不支持的裸体或性化内容，页面已在本地拦截。请改为安全、非裸露的版本后再试。"
AGE_SENSITIVE_PROMPT_MESSAGE = "该提示词涉及年龄不明确角色的裸露或性化描述，页面已在本地拦截。请改为成年、非裸露、非性化版本后再试。"

NUDITY_PATTERNS = (
    r"裸体",
    r"裸露",
    r"全裸",
    r"赤裸",
    r"不穿衣服",
    r"没穿衣服",
    r"裸照",
    r"\bnude\b",
    r"\bnaked\b",
    r"\btopless\b",
    r"\bbottomless\b",
    r"\bunclothed\b",
    r"\bwithout clothes\b",
)

EXPLICIT_SEXUAL_PATTERNS = (
    r"色情",
    r"情色",
    r"性行为",
    r"性交",
    r"做爱",
    r"露点",
    r"\bnsfw\b",
    r"\bporn\b",
    r"\berotic\b",
    r"\bsexual\b",
    r"\bsex\b",
)

SUGGESTIVE_PATTERNS = (
    r"性感",
    r"挑逗",
    r"诱惑",
    r"\bsexy\b",
    r"\bseductive\b",
)

YOUTHFUL_PATTERNS = (
    r"花木兰",
    r"\bmulan\b",
    r"少女",
    r"女孩",
    r"未成年",
    r"萝莉",
    r"儿童",
    r"\bgirl\b",
    r"\bteen\b",
    r"\bteenage\b",
    r"\bschoolgirl\b",
    r"\bminor\b",
    r"\byoung girl\b",
)


def _matches_any(text: str, patterns: tuple[str, ...]) -> bool:
    return any(re.search(pattern, text) for pattern in patterns)


def validate_prompt(prompt: str) -> str | None:
    normalized = re.sub(r"\s+", " ", prompt).strip().lower()
    if not normalized:
        return None

    has_nudity = _matches_any(normalized, NUDITY_PATTERNS)
    has_explicit_sexual = _matches_any(normalized, EXPLICIT_SEXUAL_PATTERNS)
    has_suggestive = _matches_any(normalized, SUGGESTIVE_PATTERNS)
    has_youthful = _matches_any(normalized, YOUTHFUL_PATTERNS)

    if has_youthful and (has_nudity or has_explicit_sexual or has_suggestive):
        return AGE_SENSITIVE_PROMPT_MESSAGE
    if has_nudity or has_explicit_sexual:
        return UNSUPPORTED_PROMPT_MESSAGE

    return None
