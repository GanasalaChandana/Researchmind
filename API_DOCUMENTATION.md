# ResearchMind Public API Documentation

## Overview

The ResearchMind Public API allows developers to integrate AI-powered research capabilities into their applications. All API endpoints require authentication via API keys.

**Base URL:** `https://researchmind-production-b6ca.up.railway.app/api/v1`

## Authentication

All API requests must include an `Authorization` header with a bearer token:

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  https://researchmind-production-b6ca.up.railway.app/api/v1/research/start
```

## Rate Limiting

- **Limit:** 100 requests per hour per API key
- **Headers:** Response includes `X-RateLimit-*` headers
- **Status Code:** 429 when limit exceeded

## Endpoints

### 1. Start Research Session

Initiate a new research session.

**Endpoint:** `POST /research/start`

**Request Body:**
```json
{
  "topic": "The future of quantum computing",
  "depth": 3,
  "custom_prompts": [
    "What are the current limitations of quantum computers?",
    "Which companies are leading quantum development?",
    "What are realistic timelines for practical quantum computing?"
  ]
}
```

**Parameters:**
- `topic` (required): Research topic as a string
- `depth` (optional): Number of sub-questions to explore (1-5, default: 3)
- `custom_prompts` (optional): Array of custom research questions

**Response:**
```json
{
  "success": true,
  "session_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "queued",
  "topic": "The future of quantum computing",
  "created_at": "2024-06-04T12:34:56.789Z"
}
```

### 2. Get Research Status

Check the status of an ongoing research session.

**Endpoint:** `GET /research/{session_id}/status`

**Response:**
```json
{
  "success": true,
  "session_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "running",
  "topic": "The future of quantum computing",
  "created_at": "2024-06-04T12:34:56.789Z"
}
```

**Status Values:**
- `queued`: Research is queued
- `running`: Research is in progress
- `completed`: Research finished successfully
- `failed`: Research failed

### 3. Get Research Report

Retrieve the completed research report with full content.

**Endpoint:** `GET /research/{session_id}/report`

**Response:**
```json
{
  "success": true,
  "session_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "topic": "The future of quantum computing",
  "summary": "Quantum computing represents one of the most transformative technologies...",
  "sections": [
    {
      "heading": "Current State of Quantum Computing",
      "content": "Today's quantum computers are still in their infancy...",
      "citations": [1, 2, 3]
    }
  ],
  "sources": [
    {
      "url": "https://example.com/article",
      "title": "Article Title",
      "summary": "Brief summary of the source",
      "relevance_score": 0.95
    }
  ],
  "knowledge_graph": {
    "entities": [],
    "relationships": []
  },
  "status": "completed",
  "created_at": "2024-06-04T12:34:56.789Z"
}
```

### 4. Export Research

Export research in different formats.

**Endpoint:** `GET /research/{session_id}/export/{format_type}`

**Formats:** `markdown`, `html`, `json`

**Response:**
```json
{
  "success": true,
  "data": {
    "format": "json",
    "session_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "filename": "a1b2c3d4-e5f6-7890-abcd-ef1234567890.json"
  }
}
```

### 5. Get API Info

Get information about your API key and available endpoints.

**Endpoint:** `GET /info`

**Response:**
```json
{
  "success": true,
  "data": {
    "version": "1.0.0",
    "endpoints": [
      "POST /api/v1/research/start",
      "GET /api/v1/research/{session_id}/status",
      "GET /api/v1/research/{session_id}/report",
      "GET /api/v1/research/{session_id}/export/{format_type}",
      "GET /api/v1/info"
    ],
    "api_key_info": {
      "created_at": "2024-06-01T10:20:30.000Z",
      "last_used": "2024-06-04T12:34:56.789Z",
      "requests_count": 42,
      "is_active": true
    },
    "rate_limit": "100 requests per hour"
  }
}
```

## Error Handling

All errors follow this format:

```json
{
  "success": false,
  "error": "Error message describing what went wrong"
}
```

**Common HTTP Status Codes:**
- `200`: Success
- `400`: Bad request (invalid parameters)
- `401`: Unauthorized (missing or invalid API key)
- `404`: Not found (session doesn't exist)
- `429`: Too many requests (rate limit exceeded)
- `500`: Server error

## SDK Examples

### Python

```python
import requests
import time

API_KEY = "rm_your_api_key_here"
BASE_URL = "https://researchmind-production-b6ca.up.railway.app/api/v1"

headers = {"Authorization": f"Bearer {API_KEY}"}

def start_research(topic, depth=3):
    response = requests.post(
        f"{BASE_URL}/research/start",
        headers=headers,
        json={"topic": topic, "depth": depth}
    )
    return response.json()["session_id"]

def get_status(session_id):
    response = requests.get(
        f"{BASE_URL}/research/{session_id}/status",
        headers=headers
    )
    return response.json()["status"]

def get_report(session_id):
    response = requests.get(
        f"{BASE_URL}/research/{session_id}/report",
        headers=headers
    )
    return response.json()

# Usage
session_id = start_research("Future of AI")
while get_status(session_id) == "running":
    time.sleep(2)

report = get_report(session_id)
```

### JavaScript

```javascript
const axios = require('axios');

const client = axios.create({
  baseURL: 'https://researchmind-production-b6ca.up.railway.app/api/v1',
  headers: { Authorization: 'Bearer rm_your_api_key_here' }
});

async function startResearch(topic) {
  const { data } = await client.post('/research/start', { topic });
  return data.session_id;
}

async function getStatus(sessionId) {
  const { data } = await client.get(`/research/${sessionId}/status`);
  return data.status;
}

// Usage
const sessionId = await startResearch('Future of AI');
```

## Best Practices

1. **Store API Keys Securely:** Use environment variables, never commit to version control
2. **Handle Rate Limits:** Implement exponential backoff for 429 responses
3. **Poll Intelligently:** Use 5-10 second intervals initially
4. **Cache Results:** Store completed reports to avoid re-requesting
5. **Use Custom Prompts:** Define consistent research methodology

## Support

- **Website:** https://researchmind-app.vercel.app
- **GitHub:** https://github.com/ganasalachandana/researchmind
- **Email:** support@researchmind.ai
