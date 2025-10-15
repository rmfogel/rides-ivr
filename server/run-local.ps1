#!/usr/bin/env pwsh

# Helper script to run with local MongoDB
# Includes:
# 1. Auto-starting Docker MongoDB if not running
# 2. Running the seed script if needed
# 3. Starting the server with proper environment variables

Write-Host "Preparing Rides IVR server environment..." -ForegroundColor Cyan

# Check if MongoDB is already accessible
$mongoRunning = $false
try {
    $tcpClient = New-Object System.Net.Sockets.TcpClient
    $tcpClient.ConnectAsync("localhost", 27017).Wait(1000)
    if ($tcpClient.Connected) {
        $mongoRunning = $true
        Write-Host "��� MongoDB is accessible on localhost:27017" -ForegroundColor Green
    }
    $tcpClient.Dispose()
} catch {
    # Connection failed
}

# Try to start MongoDB via Docker if not running
if (-not $mongoRunning) {
    Write-Host "MongoDB not detected on localhost:27017" -ForegroundColor Yellow
    
    # Check if Docker is running
    $dockerRunning = $false
    try {
        $null = docker version
        $dockerRunning = $true
    } catch {
        Write-Host "�� Docker not running or not installed" -ForegroundColor Red
    }
    
    if ($dockerRunning) {
        # Check if our container exists
        $containerExists = $false
        try {
            $containerId = docker ps -a --filter "name=rides-mongo" --format "{{.ID}}"
            if ($containerId) {
                $containerExists = $true
            }
        } catch {
            # Docker command failed
        }
        
        if ($containerExists) {
            Write-Host "Starting existing MongoDB container..." -ForegroundColor Yellow
            docker start rides-mongo
        } else {
            Write-Host "Creating and starting MongoDB container..." -ForegroundColor Yellow
            docker run -d --name rides-mongo -p 27017:27017 mongo:7
        }
        
        # Wait for MongoDB to be ready
        Write-Host "Waiting for MongoDB to be ready..." -ForegroundColor Yellow
        $ready = $false
        $retries = 0
        while (-not $ready -and $retries -lt 10) {
            try {
                $tcpClient = New-Object System.Net.Sockets.TcpClient
                $tcpClient.ConnectAsync("localhost", 27017).Wait(1000)
                if ($tcpClient.Connected) {
                    $ready = $true
                    Write-Host "��� MongoDB is ready" -ForegroundColor Green
                }
                $tcpClient.Dispose()
            } catch {
                # Still not ready
            }
            
            if (-not $ready) {
                $retries++
                Start-Sleep -Seconds 1
            }
        }
        
        if (-not $ready) {
            Write-Host "�� MongoDB failed to start" -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "Consider installing Docker to run MongoDB locally" -ForegroundColor Yellow
        Write-Host "Alternatively, set up a MongoDB Atlas connection in .env" -ForegroundColor Yellow
    }
}

# Set environment variables
$env:PORT = 3001
$env:MONGODB_URI = "mongodb://localhost:27017"
$env:MONGODB_DB = "rides"
$env:ALLOW_ALL_CALLERS = "true"
$env:PUBLIC_BASE_URL = "http://localhost:3001"

# Check if we should seed data
$seedRequired = $args -contains "--seed"
if ($seedRequired) {
    Write-Host "Seeding database with sample data..." -ForegroundColor Yellow
    node scripts/seed.js
}

# Start the server
Write-Host "Starting server on http://localhost:$env:PORT" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop" -ForegroundColor DarkGray
node src/app.js