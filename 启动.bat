@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"
title 分子构建器 · 快捷启动

set "PORT=5173"
set "URL=http://localhost:%PORT%/"

echo ============================================================
echo   分子构建器 · 快捷启动
echo ============================================================
echo.

rem ---- 1. 检查 Node.js ----
where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 Node.js。
  echo        请先安装 Node.js 18 或更高版本：https://nodejs.org/
  echo.
  pause
  exit /b 1
)

rem ---- 2. 安装依赖 ----
if exist "node_modules\" (
  echo [1/3] 依赖已就绪
) else (
  echo [1/3] 首次运行，正在安装依赖（可能需要几分钟）...
  call npm install
  if errorlevel 1 (
    echo [错误] 依赖安装失败，请检查网络后重试。
    pause
    exit /b 1
  )
)

rem ---- 3. 准备 RDKit 运行库 ----
if exist "public\rdkit\RDKit_minimal.wasm" (
  echo [2/3] RDKit 运行库已就绪
) else (
  echo [2/3] 正在复制 RDKit 运行库...
  call node scripts\copy-rdkit.mjs
)

rem ---- 4. 端口已占用说明服务在运行，直接打开浏览器 ----
call :portInUse
if not errorlevel 1 (
  echo [3/3] 服务已在运行，直接打开浏览器。
  start "" "%URL%"
  exit /b 0
)

rem ---- 5. 启动开发服务器（Vite 就绪后自动打开浏览器）----
echo [3/3] 正在启动开发服务器...
echo        服务窗口请勿关闭；关闭该窗口即停止服务。
start "分子构建器 Dev Server" cmd /k "npm run dev -- --open"

rem 留出服务窗口的启动时间，随后关闭本启动器
ping -n 3 127.0.0.1 >nul
exit /b 0

rem ---- 子过程：判断端口是否处于监听状态（0 = 已在监听）----
:portInUse
netstat -ano | findstr /c:":%PORT% " | findstr /c:"LISTENING" >nul 2>nul
exit /b %errorlevel%