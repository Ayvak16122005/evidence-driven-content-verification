# 🐱 Mailon

Chrome MV3 side-panel + FastAPI + Tavily RAG + Sarvam-105B reasoning + Saaras voice input + Bulbul voice output + Mayura translation.

## The AI that checks before you trust.

**Mailon** is an AI-powered browser assistant that helps people understand whether
something they see online is trustworthy.

Instead of simply asking an AI:

> "Is this true?"

Mailon **investigates it**.

It searches for relevant evidence, compares that evidence with the original
content, and gives the user a simple result with sources, explanation,
warnings, and practical advice.

---

# ⚡ The Problem

Every day, we see things like:

> 💼 "₹50 LPA job — no interview required!"

> 🎁 "Congratulations! You won a free iPhone."

> 🔐 "Your account will be blocked. Verify immediately."

> 📢 "This product is 100% guaranteed to solve your problem."

> 📰 "Scientists have discovered..."

The problem is not that information is unavailable.

The problem is:

### **How do I know what to trust?**

Today, users often have to:

```text
See something suspicious
        ↓
Open Google
        ↓
Search different websites
        ↓
Compare information
        ↓
Check sources
        ↓
Try to understand what is real
        ↓
Decide what to do

## CMD
``cd /d C:\path\to\Mailon-Sarvam-2030\backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
notepad .env``

``Set:
SARVAM_API_KEY=your_key
SARVAM_MODEL=sarvam-105b
TAVILY_API_KEY=your_key``

``Run:
python -m uvicorn app:app --reload --host 127.0.0.1 --port 8000``

Then open http://127.0.0.1:8000/health and load the extension folder in chrome://extensions.

Keep all API keys in backend/.env only.
