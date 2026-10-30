@echo off
chcp 65001 >nul
title Orbit IDE - Development
cd /d "%~dp0"
set ELECTRON_RUN_AS_NODE=
if not exist node_modules (
  echo [Orbit] 首次运行，正在安装依赖...
  call npm install
  if errorlevel 1 (
    echo [Orbit] 依赖安装失败，请检查网络后重试。
    pause
    exit /b 1
  )
)
echo [Orbit] 正在启动开发环境...
call npm run dev
if errorlevel 1 pause
