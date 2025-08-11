# PowerShell script to test Orbits PDS Custom Lexicons

Write-Host "🧪 Testing Orbits PDS Custom Lexicons" -ForegroundColor Blue
Write-Host "======================================" -ForegroundColor Blue
Write-Host ""

$baseUrl = "http://localhost:3000"
$xrpcUrl = "$baseUrl/xrpc"

function Test-Endpoint {
    param(
        [string]$Method,
        [string]$Endpoint,
        [string]$Data = $null,
        [string]$Description
    )
    
    Write-Host "Testing: $Description" -ForegroundColor Yellow
    Write-Host "Endpoint: $Method $xrpcUrl/$Endpoint"
    
    try {
        $headers = @{
            'Content-Type' = 'application/json'
            'User-Agent' = 'OrbitsPDS-Test-PowerShell/1.0'
        }
        
        if ($Method -eq "GET") {
            $response = Invoke-WebRequest -Uri "$xrpcUrl/$Endpoint" -Method $Method -Headers $headers
        } else {
            $response = Invoke-WebRequest -Uri "$xrpcUrl/$Endpoint" -Method $Method -Headers $headers -Body $Data
        }
        
        Write-Host "✅ Success (HTTP $($response.StatusCode))" -ForegroundColor Green
        Write-Host "Response: $($response.Content)"
    }
    catch {
        Write-Host "❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
        if ($_.Exception.Response) {
            Write-Host "HTTP Status: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
        }
    }
    Write-Host ""
}

# 1. Health check
Write-Host "1. Health Check" -ForegroundColor Blue
try {
    $healthResponse = Invoke-WebRequest -Uri $xrpcUrl -Method GET -ErrorAction Stop
    Write-Host "✅ Server is running!" -ForegroundColor Green
}
catch {
    Write-Host "❌ Server is not responding. Make sure PDS is running with 'npm run dev'" -ForegroundColor Red
    exit 1
}
Write-Host ""

# 2. Test creating an orbit
Test-Endpoint -Method "POST" -Endpoint "org.chaoticharmonylabs.orbit.create" `
    -Data '{"name":"Test Orbit","description":"A test orbit for photography","feeds":{"photo":"at://did:web:localhost/app.bsky.feed.generator/photos"}}' `
    -Description "Create a new orbit"

# 3. Test getting an orbit
Test-Endpoint -Method "GET" -Endpoint "org.chaoticharmonylabs.orbit.get?uri=at://did:web:localhost/org.chaoticharmonylabs.orbit.record/1" `
    -Description "Get an existing orbit"

# 4. Test listing orbits
Test-Endpoint -Method "GET" -Endpoint "org.chaoticharmonylabs.orbit.list?limit=10" `
    -Description "List orbits"

# 5. Test updating an orbit
Test-Endpoint -Method "POST" -Endpoint "org.chaoticharmonylabs.orbit.update" `
    -Data '{"uri":"at://did:web:localhost/org.chaoticharmonylabs.orbit.record/1","name":"Updated Test Orbit","description":"Updated description"}' `
    -Description "Update an existing orbit"

Write-Host "🎉 Testing complete!" -ForegroundColor Blue
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. If tests failed, check the server logs for errors"
Write-Host "2. Verify your lexicon files are properly formatted"
Write-Host "3. Make sure all required environment variables are set"
Write-Host "4. Try running individual curl commands to debug specific issues"
Write-Host ""
Write-Host "Example manual test:" -ForegroundColor Yellow
Write-Host 'Invoke-WebRequest -Uri "http://localhost:3000/xrpc/org.chaoticharmonylabs.orbit.create" -Method POST -Headers @{"Content-Type"="application/json"} -Body ''{"name":"Manual Test","description":"Testing manually"}'''
