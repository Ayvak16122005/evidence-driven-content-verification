# Mailon — Sarvam 2030 Full Build

Chrome MV3 side-panel + FastAPI + Tavily RAG + Sarvam-105B reasoning + Saaras voice input + Bulbul voice output + Mayura translation.

## CMD
cd /d C:\path\to\Mailon-Sarvam-2030\backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
notepad .env

Set:
SARVAM_API_KEY=your_key
SARVAM_MODEL=sarvam-105b
TAVILY_API_KEY=your_key

Run:
python -m uvicorn app:app --reload --host 127.0.0.1 --port 8000

Then open http://127.0.0.1:8000/health and load the extension folder in chrome://extensions.

Keep all API keys in backend/.env only.
