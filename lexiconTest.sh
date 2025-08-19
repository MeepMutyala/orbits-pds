#!/bin/bash

BASE_URL="http://localhost:3100/xrpc"
HANDLE="test.localhost"
PASSWORD="password123"

echo "Testing PDS server at $BASE_URL..."

# 1. Check server
echo -e "\n1. Testing server info:"
curl -s "$BASE_URL/com.atproto.server.describeServer" | jq .

# 2. Create account
echo -e "\n2. Creating test account:"
ACCOUNT=$(curl -s -X POST "$BASE_URL/com.atproto.server.createAccount" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"test@example.com\", \"handle\": \"$HANDLE\", \"password\": \"$PASSWORD\"}")
echo "$ACCOUNT" | jq .
DID=$(echo "$ACCOUNT" | jq -r .did)

# 3. Login
echo -e "\n3. Logging in to get access token:"
SESSION=$(curl -s -X POST "$BASE_URL/com.atproto.server.createSession" \
  -H "Content-Type: application/json" \
  -d "{\"identifier\": \"$HANDLE\", \"password\": \"$PASSWORD\"}")
echo "$SESSION" | jq .
TOKEN=$(echo "$SESSION" | jq -r .accessJwt)

# 4. Create orbit record
echo -e "\n4. Creating orbit record:"
NOW=$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)
ORBIT=$(curl -s -X POST "$BASE_URL/com.atproto.repo.createRecord" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"repo\": \"$DID\",
    \"collection\": \"org.chaoticharmonylabs.orbit.record\",
    \"record\": {
      \"\$type\": \"org.chaoticharmonylabs.orbit.record\",
      \"name\": \"Test Orbit\",
      \"description\": \"Testing orbits functionality\",
      \"createdAt\": \"$NOW\",
      \"feeds\": {}
    }
  }")
echo "$ORBIT" | jq .

# 5. List orbits
echo -e "\n5. Listing orbit records:"
curl -s "$BASE_URL/com.atproto.repo.listRecords?repo=$DID&collection=org.chaoticharmonylabs.orbit.record" \
  -H "Authorization: Bearer $TOKEN" | jq .

echo -e "\n✅ Test sequence complete!"