import os
import io
import re
import json
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx
from bs4 import BeautifulSoup

load_dotenv()

SARVAM_API_KEY = os.getenv("SARVAM_API_KEY")
SARVAM_MODEL = os.getenv("SARVAM_MODEL", "sarvam-105b")
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")
TTS_MODEL = os.getenv("SARVAM_TTS_MODEL", "bulbul:v3")
TTS_SPEAKER = os.getenv("SARVAM_TTS_SPEAKER", "shubh")

try:
    from sarvamai import SarvamAI
except Exception:
    SarvamAI = None

try:
    from tavily import TavilyClient
except Exception:
    TavilyClient = None

sarvam = (
    SarvamAI(api_subscription_key=SARVAM_API_KEY)
    if SARVAM_API_KEY and SarvamAI
    else None
)

tavily = (
    TavilyClient(api_key=TAVILY_API_KEY)
    if TAVILY_API_KEY and TavilyClient
    else None
)

app = FastAPI(
    title="Mailon 2030 Evidence Trust API",
    version="2.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"]
)


class AnalyzeRequest(BaseModel):
    text: str = ""
    url: str = ""
    category: str = "general"
    language: str = "en-IN"


class SearchRequest(BaseModel):
    query: str
    language: str = "en-IN"


class TranslateRequest(BaseModel):
    text: str
    target_language: str = "ta-IN"
    source_language: str = "auto"


def clean(x, limit=30000):
    return re.sub(r"\s+", " ", x or "").strip()[:limit]


def need_sarvam():
    if not sarvam:
        raise HTTPException(
            status_code=503,
            detail="SARVAM_API_KEY is not configured in backend/.env"
        )


def need_tavily():
    if not tavily:
        raise HTTPException(
            status_code=503,
            detail="TAVILY_API_KEY is not configured in backend/.env"
        )


async def fetch_url(url):
    if not url:
        return ""

    if not re.match(r"^https?://", url, re.I):
        url = "https://" + url

    try:
        async with httpx.AsyncClient(
            timeout=20,
            follow_redirects=True,
            headers={"User-Agent": "Mailon/2.0"}
        ) as client:
            response = await client.get(url)
            response.raise_for_status()

        soup = BeautifulSoup(response.text, "html.parser")

        for tag in soup(["script", "style", "noscript", "svg"]):
            tag.decompose()

        # Keep enough webpage text for the LLM, but never send all of it
        # directly to Tavily.
        return clean(soup.get_text(" ", strip=True), 30000)

    except Exception as e:
        return f"URL extraction failed: {e}"


def evidence(q):
    need_tavily()

    # Tavily maximum query length is 1500 characters.
    # 1400 leaves a safety margin.
    query = clean(q, 1400)

    if not query:
        return []

    try:
        return tavily.search(
            query=query,
            search_depth="advanced",
            max_results=6
        ).get("results", [])

    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Evidence search failed: {str(e)}"
        )


def chat(prompt, language):
    need_sarvam()

    try:
        response = sarvam.chat.completions(
            model=SARVAM_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": """You are Mailon, an evidence-driven digital content verification assistant.
Do not invent evidence. Distinguish retrieved evidence from inference. If evidence is insufficient say Uncertain.
Return JSON only with keys verdict, trust_score, confidence, claim, summary, explanation, advice, key_facts, warnings.
verdict must be Supported, Mostly supported, Uncertain, Suspicious, or High risk.
trust_score and confidence are integers 0-100."""
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0.2,
            top_p=0.9,
            max_tokens=6000
        )

        return response.choices[0].message.content or ""

    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"AI analysis failed: {str(e)}"
        )


def parsed(raw):
    cleaned = re.sub(
        r"<think>.*?</think>",
        "",
        raw or "",
        flags=re.S | re.I
    )

    match = re.search(r"\{.*\}", cleaned, re.S)

    if not match:
        return None

    try:
        return json.loads(match.group(0))
    except Exception:
        return None


def verify(content, sources, category, language):
    src = "\n\n".join(
        f"[SOURCE {i+1}] {x.get('title', '')}\n"
        f"URL: {x.get('url', '')}\n"
        f"{x.get('content', '')[:3000]}"
        for i, x in enumerate(sources)
    )

    raw = chat(
        f"""Analyze this {category} content using only the retrieved external evidence.

CONTENT:
{content[:18000]}

RETRIEVED EVIDENCE:
{src or "No external evidence was retrieved."}

Rules: do not claim a source proves something unless supported; missing search results are not proof of falsity; separate observations from risk signals; give practical safety advice; respond in {language}.""",
        language
    )

    d = parsed(raw) or {
        "verdict": "Uncertain",
        "trust_score": 50,
        "confidence": 30,
        "claim": content[:300],
        "summary": "Structured result unavailable.",
        "explanation": raw[:4000],
        "advice": "Verify important claims against primary sources.",
        "key_facts": [],
        "warnings": ["Result parsing failed."]
    }

    d["evidence"] = [
        {
            "title": x.get("title", ""),
            "url": x.get("url", ""),
            "snippet": x.get("content", "")[:700]
        }
        for x in sources
    ]

    d["evidence_count"] = len(sources)
    d["provider"] = "Sarvam-105B + Tavily"
    d["language"] = language

    return d


def file_text(name, data):
    ext = Path(name or "").suffix.lower()

    if ext in {".txt", ".md", ".csv", ".json"}:
        return data.decode("utf-8", "ignore")

    if ext == ".pdf":
        from pypdf import PdfReader
        return "\n".join(
            p.extract_text() or ""
            for p in PdfReader(io.BytesIO(data)).pages
        )

    if ext == ".docx":
        from docx import Document
        return "\n".join(
            p.text
            for p in Document(io.BytesIO(data)).paragraphs
        )

    if ext in {".png", ".jpg", ".jpeg", ".webp", ".bmp"}:
        try:
            from PIL import Image
            import pytesseract
            return pytesseract.image_to_string(
                Image.open(io.BytesIO(data))
            )
        except Exception as e:
            return f"Local OCR unavailable: {e}"

    return ""


@app.get("/health")
def health():
    return {
        "status": "ok",
        "provider": "Sarvam",
        "model": SARVAM_MODEL,
        "sarvam_configured": bool(sarvam),
        "tavily_configured": bool(tavily),
        "features": {
            "rag_evidence": bool(tavily),
            "chat_reasoning": bool(sarvam),
            "voice_stt": bool(sarvam),
            "voice_tts": bool(sarvam),
            "translation": bool(sarvam),
            "document_extraction": True
        }
    }


@app.post("/api/analyze")
async def analyze(req: AnalyzeRequest):
    text = clean(req.text, 30000)

    if req.url:
        page_text = await fetch_url(req.url)
        text = clean(text + "\n" + page_text, 30000)

    if not text:
        raise HTTPException(
            status_code=400,
            detail="Provide text or URL."
        )

    # Search Tavily with a safe-sized query.
    sources = evidence(clean(text, 1400))

    return verify(
        text,
        sources,
        req.category,
        req.language
    )


@app.post("/api/analyze-file")
async def analyze_file(
    file: UploadFile = File(...),
    category: str = Form("document"),
    language: str = Form("en-IN")
):
    text = clean(
        file_text(
            file.filename or "upload",
            await file.read()
        ),
        30000
    )

    if not text:
        raise HTTPException(
            status_code=400,
            detail="Could not extract readable text."
        )

    d = verify(
        text,
        evidence(clean(text, 1400)),
        category,
        language
    )

    d["filename"] = file.filename
    return d


@app.post("/api/verified-search")
def verified_search(req: SearchRequest):
    query = clean(req.query, 1400)

    if not query:
        raise HTTPException(
            status_code=400,
            detail="Enter a search query."
        )

    s = evidence(query)

    a = chat(
        f"""User asks: {req.query}
Using only these search results, provide a concise evidence briefing in {req.language}. Do not invent facts. State uncertainty.

{json.dumps(s, ensure_ascii=False)[:18000]}""",
        req.language
    )

    return {
        "query": req.query,
        "answer": a,
        "results": [
            {
                "title": x.get("title", ""),
                "url": x.get("url", ""),
                "snippet": x.get("content", "")[:800]
            }
            for x in s
        ]
    }


@app.post("/api/translate")
def translate(req: TranslateRequest):
    need_sarvam()

    # Mayura v1 accepts a maximum of 1000 characters.
    # Keep a 50-character safety margin.
    text = clean(req.text, 950)

    if not text:
        raise HTTPException(
            status_code=400,
            detail="Nothing to translate."
        )

    try:
        r = sarvam.text.translate(
            input=text,
            source_language_code=req.source_language,
            target_language_code=req.target_language,
            model="mayura:v1",
            mode="modern-colloquial"
        )

        return {
            "translated_text": r.translated_text,
            "source_characters": len(text),
            "truncated": len(req.text) > 950
        }

    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Translation failed: {str(e)}"
        )


@app.post("/api/tts")
def tts(
    text: str = Form(...),
    language: str = Form("en-IN"),
    speaker: str = Form(TTS_SPEAKER)
):
    need_sarvam()

    speech_text = clean(text, 2500)

    if not speech_text:
        raise HTTPException(
            status_code=400,
            detail="Nothing to speak."
        )

    try:
        r = sarvam.text_to_speech.convert(
            text=speech_text,
            language_code=language,
            model=TTS_MODEL,
            speaker=speaker,
            pace=1.05,
            output_audio_codec="wav"
        )

        b = (
            r.audios[0]
            if hasattr(r, "audios")
            else r["audios"][0]
        )

        return {
            "audio_base64": b,
            "mime_type": "audio/wav"
        }

    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Voice generation failed: {str(e)}"
        )


@app.post("/api/stt")
async def stt(
    file: UploadFile = File(...),
    mode: str = Form("transcribe")
):
    need_sarvam()

    p = Path("mailon_stt_upload")
    p.write_bytes(await file.read())

    try:
        with p.open("rb") as f:
            r = sarvam.speech_to_text.transcribe(
                file=f,
                model="saaras:v3",
                mode=mode
            )

        return {
            "transcript": getattr(r, "transcript", ""),
            "language_code": getattr(
                r,
                "language_code",
                None
            )
        }

    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Speech recognition failed: {str(e)}"
        )

    finally:
        try:
            p.unlink()
        except Exception:
            pass


@app.post("/api/ask")
def ask(
    text: str = Form(...),
    language: str = Form("en-IN")
):
    return {
        "answer": chat(
            text[:12000],
            language
        )
    }


@app.get("/api/config")
def config():
    return {
        "provider": "Sarvam",
        "model": SARVAM_MODEL,
        "languages": [
            "en-IN",
            "ta-IN",
            "hi-IN",
            "te-IN",
            "kn-IN",
            "ml-IN",
            "bn-IN",
            "mr-IN",
            "gu-IN",
            "pa-IN",
            "od-IN"
        ]
    }

