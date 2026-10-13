@echo off
chcp 65001 >nul
cd /d "%~dp0"
python -m pip install -r requirements.txt
echo.
echo Готово! Теперь:
echo   1) скопируй .env.example в .env
echo   2) впиши токен бота (у @BotFather)
echo   3) запусти run.bat
pause