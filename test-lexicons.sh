#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🧪 Testing Orbits PDS Custom Lexicons${NC}"
echo "======================================"
echo ""

BASE_URL="http://localhost:3000"
XRPC_URL="$BASE_URL/xrpc"

# Function to make HTTP requests and pretty print results
test_endpoint() {
    local method=$1
    local endpoint=$2
    local data=$3
    local description=$4
    
    echo -e "${YELLOW}Testing: $description${NC}"
    echo "Endpoint: $method $XRPC_URL/$endpoint"
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "HTTPSTATUS:%{http_code}" "$XRPC_URL/$endpoint")
    else
        response=$(curl -s -w "HTTPSTATUS:%{http_code}" -X "$method" \
            -H "Content-Type: application/json" \
            -d "$data" \
            "$XRPC_URL/$endpoint")
    fi
    
    http_code=$(echo $response | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
    body=$(echo $response | sed -e 's/HTTPSTATUS:.*//g')
    
    if [ $http_code -eq 200 ] || [ $http_code -eq 201 ]; then
        echo -e "${GREEN}✅ Success (HTTP $http_code)${NC}"
        echo "Response: $body"
    else
        echo -e "${RED}❌ Failed (HTTP $http_code)${NC}"
        echo "Response: $body"
    fi
    echo ""
}

# 1. Health check
echo -e "${BLUE}1. Health Check${NC}"
curl_response=$(curl -s -o /dev/null -w "%{http_code}" "$XRPC_URL")
if [ $curl_response -eq 200 ] || [ $curl_response -eq 404 ]; then
    echo -e "${GREEN}✅ Server is running!${NC}"
else
    echo -e "${RED}❌ Server is not responding. Make sure PDS is running with 'npm run dev'${NC}"
    exit 1
fi
echo ""

# 2. Test creating an orbit
test_endpoint "POST" "org.chaoticharmonylabs.orbit.create" \
    '{"name":"Test Orbit","description":"A test orbit for photography","feeds":{"photo":"at://did:web:localhost/app.bsky.feed.generator/photos"}}' \
    "Create a new orbit"

# 3. Test getting an orbit
test_endpoint "GET" "org.chaoticharmonylabs.orbit.get?uri=at://did:web:localhost/org.chaoticharmonylabs.orbit.record/1" \
    "" \
    "Get an existing orbit"

# 4. Test listing orbits
test_endpoint "GET" "org.chaoticharmonylabs.orbit.list?limit=10" \
    "" \
    "List orbits"

# 5. Test updating an orbit
test_endpoint "POST" "org.chaoticharmonylabs.orbit.update" \
    '{"uri":"at://did:web:localhost/org.chaoticharmonylabs.orbit.record/1","name":"Updated Test Orbit","description":"Updated description"}' \
    "Update an existing orbit"

echo -e "${BLUE}🎉 Testing complete!${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. If tests failed, check the server logs for errors"
echo "2. Verify your lexicon files are properly formatted"
echo "3. Make sure all required environment variables are set"
echo "4. Try running individual curl commands to debug specific issues"
echo ""
echo -e "${YELLOW}Example manual test:${NC}"
echo "curl -X POST http://localhost:3000/xrpc/org.chaoticharmonylabs.orbit.create \\"
echo "  -H \"Content-Type: application/json\" \\"
echo "  -d '{\"name\":\"Manual Test\",\"description\":\"Testing manually\"}'"
