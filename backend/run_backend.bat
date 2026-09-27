@echo off
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" python -m venv .venv
call .venv\Scripts\activate.bat
pip install -r requirements.txt
python -m uvicorn app:app --reload --host 127.0.0.1 --port 8000
pause
