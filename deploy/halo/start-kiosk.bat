@echo off
REM Halo kiosk 開機自啟：啟動 server，等它就緒，再開全螢幕瀏覽器指向本機 kiosk
cd /d C:\Users\user\halo-ip-platform
start "" /min cmd /c "npm start"
timeout /t 8 /nobreak >nul
start "" msedge --kiosk "http://localhost:8080" --edge-kiosk-type=fullscreen --no-first-run --disable-features=TranslateUI --overscroll-history-navigation=0
