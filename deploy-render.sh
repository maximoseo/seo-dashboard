#!/bin/bash
# Deploy to Render as Web Service

source /Users/tomermac/.verdent/verdent-projects/test/seo-dashboard/.env 2>/dev/null
source /Users/tomermac/.verdent/workspace/base/secrets/master-credentials.env 2>/dev/null

RENDER_API_KEY="rnd_58McNxjdgA7XYdMGPDlGx4709wNF"

curl -s -X POST "https://api.render.com/v1/services" \
  -H "Authorization: Bearer ${RENDER_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{
    \"type\": \"web_service\",
    \"name\": \"seo-dashboard\",
    \"ownerId\": \"tea-d61e9u9r0fns73ftiub0\",
    \"serviceDetails\": {
      \"plan\": \"starter\",
      \"region\": \"oregon\",
      \"buildCommand\": \"npm install && npm run build\",
      \"envSpecificDetails\": {
        \"buildCommand\": \"npm install && npm run build\",
        \"startCommand\": \"node dist-server/index.js\"
      },
      \"envVars\": [
        {\"key\": \"NODE_ENV\", \"value\": \"production\"},
        {\"key\": \"AHREFS_API_KEY\", \"value\": \"${AHREFS_API_KEY}\"},
        {\"key\": \"SEMRUSH_API\", \"value\": \"${SEMRUSH_API}\"},
        {\"key\": \"DATAFORSEO_LOGIN\", \"value\": \"${DATAFORSEO_LOGIN}\"},
        {\"key\": \"DATAFORSEO_PASSWORD\", \"value\": \"${DATAFORSEO_PASSWORD}\"},
        {\"key\": \"PAGESPEED_API_KEY\", \"value\": \"${GOOGLE_GEMINI_API}\"},
        {\"key\": \"GTMETRIX_API\", \"value\": \"${GTMETRIX_API}\"},
        {\"key\": \"GTMETRIX_EMAIL\", \"value\": \"tomerake@gmail.com\"}
      ],
      \"runtime\": \"node\"
    },
    \"repo\": \"https://github.com/maximoseo/seo-dashboard\",
    \"branch\": \"main\",
    \"autoDeploy\": \"yes\"
  }"
