@echo off
echo Running Rides IVR server with local MongoDB
echo.

REM Check if MongoDB running locally
echo Checking for local MongoDB...
powershell -Command "try { $null = (New-Object System.Net.Sockets.TcpClient).Connect('localhost', 27017); Write-Output 'MongoDB found on localhost:27017' } catch { Write-Output 'No MongoDB on localhost:27017' }"

REM Set environment variables
echo Setting environment variables
set PORT=3001
set MONGODB_URI=mongodb://localhost:27017
set MONGODB_DB=rides
set ALLOW_ALL_CALLERS=true
set PUBLIC_BASE_URL=http://localhost:3001

REM Start the server
echo Starting server...
echo Press Ctrl+C to stop
node src/app.js