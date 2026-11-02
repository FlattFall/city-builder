@echo off
rem Aggiorna il gioco da GitHub e lo avvia come programma (serve Git e Node.js).
cd /d "%~dp0"
echo Aggiorno il gioco da GitHub...
git pull
if not exist node_modules (
  echo Prima installazione: attendi qualche minuto...
  call npm install
)
call npm start
