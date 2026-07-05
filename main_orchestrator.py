#!/usr/bin/env python3
"""
Autonomous AI Outreach Engine - Main Orchestrator

This script coordinates the data flow of the AI Outreach Engine:
1. Scrapes recent news about a target company using the Brave Search API.
   - Includes a fallback 'Mock Mode' if the Brave Search API key is not configured.
2. Saves news details into a local Qdrant Vector Database collection ('lead_intelligence')
   using dummy 768-dimensional vectors.
3. Queries Qdrant for the company's news, formats the retrieved news text, and sends
   a request to a serverless GPU-hosted Ollama model on Modal to generate a
   hyper-personalized 3-sentence cold email.

Usage:
    python main_orchestrator.py --company "Microsoft"
"""

import os
import sys
import uuid
import random
import argparse
import datetime
import json
import requests
from dotenv import load_dotenv

# Import Qdrant client classes
try:
    from qdrant_client import QdrantClient
    from qdrant_client.http import models
    from qdrant_client.http.exceptions import UnexpectedResponse
except ImportError:
    print("Error: 'qdrant-client' package is not installed.")
    print("Please install the dependencies using: pip install -r requirements.txt")
    sys.exit(1)

# Load environment variables from .env file
load_dotenv()

# ANSI Color Codes for beautiful logging
class Colors:
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    GREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'

def log_info(msg):
    print(f"{Colors.BLUE}[INFO]{Colors.ENDC} {msg}")

def log_success(msg):
    print(f"{Colors.GREEN}[SUCCESS]{Colors.ENDC} {msg}")

def log_warning(msg):
    print(f"{Colors.WARNING}[WARNING]{Colors.ENDC} {msg}")

def log_error(msg):
    print(f"{Colors.FAIL}[ERROR]{Colors.ENDC} {msg}")


def fetch_company_news(company_name, api_key):
    """
    Fetch live news about the target company using Tavily Search API.
    If no API key is provided, switches to Mock Mode to generate realistic mock news.
    """
    if not api_key or api_key.strip() == "" or api_key.startswith("your_"):
        log_warning("Tavily API key not configured or invalid.")
        log_info("Running in Mock Mode. Generating realistic dummy news articles...")
        
        # Realistic dummy news templates
        mock_templates = [
            {
                "title": f"{company_name} Launches Revolutionary Next-Gen AI Assistant",
                "description": f"Industry giant {company_name} announced the rollout of their new neural network assistant, aiming to streamline enterprise operations and boost developer productivity by 40%.",
                "url": f"https://techcrunch.mock/{company_name.lower()}-next-gen-ai",
                "age": "2 hours ago"
            },
            {
                "title": f"{company_name} Announces $5 Billion Investment in Green Infrastructure",
                "description": f"{company_name} has committed to building net-zero emission data centers powered entirely by solar and wind energy over the next three years.",
                "url": f"https://bloomberg.mock/{company_name.lower()}-green-energy",
                "age": "1 day ago"
            },
            {
                "title": f"New Partnership: {company_name} Teams Up with HealthTech Innovators",
                "description": f"{company_name} has formed an alliance with leading medical research groups to deploy machine learning algorithms for earlier oncology diagnostics.",
                "url": f"https://reuters.mock/{company_name.lower()}-healthtech-partnership",
                "age": "3 days ago"
            }
        ]
        return mock_templates

    # API configuration
    endpoint = "https://api.tavily.com/search"
    headers = {
        "Content-Type": "application/json"
    }
    payload = {
        "api_key": api_key,
        "query": f"{company_name} recent news and announcements",
        "search_depth": "basic",
        "max_results": 5
    }

    log_info(f"Calling Tavily Search API for news on '{company_name}'...")
    try:
        response = requests.post(endpoint, headers=headers, json=payload, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            results = data.get("results", [])
            log_success(f"Retrieved {len(results)} search results from Tavily.")
            
            # Map Tavily results to standard news format
            mapped_results = []
            for r in results:
                mapped_results.append({
                    "title": r.get("title", ""),
                    "description": r.get("content", ""),
                    "url": r.get("url", ""),
                    "age": "recent"
                })
            return mapped_results
        else:
            log_error(f"Tavily API returned status code {response.status_code}: {response.text}")
            log_info("Falling back to Mock Mode news generation...")
            return fetch_company_news(company_name, None)
            
    except Exception as e:
        log_error(f"Failed to query Tavily API: {str(e)}")
        log_info("Falling back to Mock Mode news generation...")
        return fetch_company_news(company_name, None)


def save_news_to_qdrant(news_items, company_name, qdrant_url):
    """
    Connects to local Qdrant and upserts news articles with 768-dimension dummy vectors.
    """
    log_info(f"Connecting to Qdrant at {qdrant_url}...")
    try:
        client = QdrantClient(url=qdrant_url)
        
        # Test connection
        client.get_collections()
        log_success("Successfully connected to Qdrant server.")
    except Exception as e:
        log_warning(f"Could not connect to Qdrant server at {qdrant_url}.")
        log_info("Falling back to local disk-based Qdrant client (./qdrant_db) for local execution...")
        try:
            client = QdrantClient(path="./qdrant_db")
        except Exception as fallback_err:
            log_error(f"Failed to initialize local Qdrant client: {str(fallback_err)}")
            log_error("Please make sure Qdrant is running locally (e.g., using docker).")
            log_error("Command: docker run -p 6333:6333 -p 6334:6334 qdrant/qdrant")
            sys.exit(1)

    collection_name = "lead_intelligence"
    vector_size = 768

    try:
        # Check and create collection if it doesn't exist
        if not client.collection_exists(collection_name):
            log_info(f"Collection '{collection_name}' not found. Creating collection...")
            client.create_collection(
                collection_name=collection_name,
                vectors_config=models.VectorParams(
                    size=vector_size,
                    distance=models.Distance.COSINE
                )
            )
            log_success(f"Collection '{collection_name}' created successfully.")
        else:
            log_info(f"Collection '{collection_name}' already exists.")

        # Prepare points for upserting
        points = []
        for idx, item in enumerate(news_items):
            # Generate dummy vector
            dummy_vector = [random.uniform(-1.0, 1.0) for _ in range(vector_size)]
            
            point_id = str(uuid.uuid4())
            payload = {
                "company": company_name,
                "title": item.get("title", ""),
                "description": item.get("description", ""),
                "url": item.get("url", ""),
                "age": item.get("age", "") or item.get("page_age", ""),
                "saved_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
            }
            
            points.append(
                models.PointStruct(
                    id=point_id,
                    vector=dummy_vector,
                    payload=payload
                )
            )

        log_info(f"Upserting {len(points)} news records into Qdrant...")
        client.upsert(
            collection_name=collection_name,
            points=points
        )
        log_success("Data successfully upserted into Qdrant.")
        return client, collection_name
        
    except Exception as e:
        log_error(f"Error during Qdrant operations: {str(e)}")
        sys.exit(1)


def query_and_generate_email(client, collection_name, company_name, modal_url, modal_key, default_model):
    """
    Queries Qdrant for company news, extracts the payload, and calls Modal API to generate a personalized email.
    """
    log_info(f"Querying Qdrant for news about '{company_name}'...")
    
    # Query using a dummy vector
    dummy_query_vector = [0.0] * 768
    
    # Filter results by company name to ensure correct target news
    query_filter = models.Filter(
        must=[
            models.FieldCondition(
                key="company",
                match=models.MatchValue(value=company_name)
            )
        ]
    )

    try:
        response = client.query_points(
            collection_name=collection_name,
            query=dummy_query_vector,
            query_filter=query_filter,
            limit=3
        )
        
        points = response.points
        if not points:
            log_warning(f"No news articles found in Qdrant for '{company_name}'.")
            return

        # Extract news text
        log_info(f"Retrieved {len(points)} points from Qdrant. Extracting metadata...")
        news_snippets = []
        for p in points:
            title = p.payload.get("title", "No Title")
            desc = p.payload.get("description", "No Description")
            news_snippets.append(f"- Headline: {title}\n  Summary: {desc}")
        
        news_context = "\n\n".join(news_snippets)
        print(f"\n{Colors.BOLD}--- News Context Retrieved from Vector Store ---{Colors.ENDC}")
        print(news_context)
        print(f"{Colors.BOLD}-------------------------------------------------{Colors.ENDC}\n")

        # Discover model from Modal Ollama server
        model_name = discover_modal_model(modal_url, modal_key, default_model)

        # Formulate prompt and system prompt for strict formatting
        system_instruction = "You are a professional B2B sales copywriter."
        prompt = (
            f"Write a personalized cold email to a contact at {company_name} based on this news:\n\n"
            f"{news_context}\n\n"
            f"Structure the email in exactly 3 sentences:\n"
            f"1. Sentence 1: Reference their news to hook them.\n"
            f"2. Sentence 2: Connect the news to how Nova Dynamics can add value.\n"
            f"3. Sentence 3: Ask for a brief, low-friction chat.\n\n"
            f"Do not include subject lines, salutations, or signatures."
        )

        headers = {
            "Authorization": f"Bearer {modal_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": model_name,
            "system": system_instruction,
            "prompt": prompt,
            "stream": False
        }

        log_info(f"Sending generation request to Modal using model '{model_name}'...")
        res = requests.post(modal_url, headers=headers, json=payload, timeout=180)
        
        if res.status_code == 200:
            res_json = res.json()
            raw_email = res_json.get("response", "").strip()
            
            # Post-process to remove greetings, subject lines, sign-offs, and placeholders
            lines = raw_email.split('\n')
            cleaned_lines = []
            for line in lines:
                l_strip = line.strip()
                if not l_strip:
                    continue
                l_lower = l_strip.lower()
                
                # Check for subject lines, greetings, sign-offs, and placeholders
                is_boilerplate = (
                    l_lower.startswith("subject:") or 
                    l_lower.startswith("## subject:") or 
                    l_lower.startswith("dear") or 
                    l_lower.startswith("hi ") or 
                    l_lower.startswith("hello") or 
                    l_lower.startswith("sincerely") or 
                    l_lower.startswith("best regards") or 
                    l_lower.startswith("thanks") or 
                    l_lower.startswith("regards") or 
                    l_lower.startswith("best,") or
                    l_lower.startswith("[your name]") or 
                    l_lower.startswith("[partner name]") or 
                    l_lower.startswith("[lead name]") or
                    l_lower.startswith("warm regards") or
                    l_lower.startswith("## sentence") or
                    l_lower.startswith("sentence ")
                )
                if is_boilerplate:
                    continue
                cleaned_lines.append(l_strip)
                
            email_text = "\n\n".join(cleaned_lines)
            
            log_success("Successfully generated cold email!")
            print(f"\n{Colors.BOLD}{Colors.HEADER}=== Generated Personalized 3-Sentence Cold Email ==={Colors.ENDC}")
            print(email_text)
            print(f"{Colors.BOLD}{Colors.HEADER}====================================================={Colors.ENDC}\n")
        else:
            log_error(f"Modal API call failed with status {res.status_code}: {res.text}")
            
    except Exception as e:
        log_error(f"Error querying Qdrant or generating email: {str(e)}")


def discover_modal_model(modal_url, modal_key, default_model):
    """
    Tries to list available models on the Modal Ollama server to auto-select the model.
    Falls back to the default_model if listing fails.
    """
    # Ollama tags URL is normally /api/tags (relative to /api/generate)
    # E.g., replace /api/generate with /api/tags
    tags_url = modal_url.replace("/api/generate", "/api/tags")
    headers = {
        "Authorization": f"Bearer {modal_key}"
    }
    
    log_info("Attempting to auto-discover models from the server...")
    try:
        res = requests.get(tags_url, headers=headers, timeout=5)
        if res.status_code == 200:
            models_list = res.json().get("models", [])
            if models_list:
                discovered_model = models_list[0].get("name")
                log_success(f"Discovered available model: '{discovered_model}'")
                return discovered_model
    except Exception:
        # Silently fail and fall back
        pass
        
    log_warning(f"Could not auto-discover models. Falling back to default: '{default_model}'")
    return default_model


def main():
    parser = argparse.ArgumentParser(description="Autonomous AI Outreach Engine Orchestrator")
    parser.add_argument("--company", type=str, default="Microsoft", help="Target company name (default: Microsoft)")
    parser.add_argument("--qdrant-url", type=str, default="http://localhost:6333", help="Qdrant API endpoint")
    args = parser.parse_args()

    print(f"\n{Colors.BOLD}{Colors.HEADER}=== Autonomous AI Outreach Engine Orchestrator ==={Colors.ENDC}\n")
    
    # Retrieve credentials
    tavily_key = os.getenv("TAVILY_API_KEY")
    modal_url = os.getenv("MODAL_API_URL")
    modal_key = os.getenv("MODAL_API_KEY")
    default_model = os.getenv("MODAL_MODEL_NAME", "gemma:2b")

    if not modal_url or not modal_key:
        log_error("Modal API Configuration missing. Please check your .env file.")
        sys.exit(1)

    # Step 1: Scrape News
    news = fetch_company_news(args.company, tavily_key)
    if not news:
        log_error(f"No news could be retrieved/generated for '{args.company}'. Exiting.")
        sys.exit(1)

    # Step 2: Save to Qdrant
    qdrant_client, collection = save_news_to_qdrant(news, args.company, args.qdrant_url)

    # Step 3: Query Qdrant and Generate Email
    query_and_generate_email(qdrant_client, collection, args.company, modal_url, modal_key, default_model)

    log_success("Orchestration workflow completed successfully!")

if __name__ == "__main__":
    main()
