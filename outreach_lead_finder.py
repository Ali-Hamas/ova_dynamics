#!/usr/bin/env python3
"""
Britsync - Autonomous Lead & Affiliate Finder
Searches the web for business clients or TikTok/YouTube affiliates based on product description.
Saves leads to a CSV file ready for Dograh calling campaigns.
"""

import os
import csv
import json
import re
import requests
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "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")
MODAL_API_URL = os.getenv("MODAL_API_URL", "https://britsyncuk--ollama-gpu-bench-run.modal.run/api/generate")
MODAL_API_KEY = os.getenv("MODAL_API_KEY", "sk-nova-998877")
MODAL_MODEL_NAME = os.getenv("MODAL_MODEL_NAME", "gemma:2b")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")

def call_llm(prompt: str) -> str:
    """Helper to query either Groq (if configured) or Modal GPU."""
    if GROQ_API_KEY:
        try:
            url = "https://api.groq.com/openai/v1/chat/completions"
            headers = {
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json"
            }
            payload = {
                "model": "llama-3.1-8b-instant",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.2
            }
            res = requests.post(url, json=payload, timeout=30)
            return res.json()["choices"][0]["message"]["content"]
        except Exception:
            pass  # Fallback to Modal if Groq fails
            
    # Fallback to Modal GPU
    try:
        headers = {
            "Authorization": f"Bearer {MODAL_API_KEY}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": MODAL_MODEL_NAME,
            "prompt": prompt,
            "stream": False
        }
        res = requests.post(MODAL_API_URL, json=payload, headers=headers, timeout=60)
        return res.json().get("response", "").strip()
    except Exception as e:
        return f"Error connecting to LLM: {str(e)}"

def search_tavily(query: str) -> list:
    """Queries Tavily API for search results."""
    url = "https://api.tavily.com/search"
    headers = {"Content-Type": "application/json"}
    payload = {
        "api_key": TAVILY_API_KEY,
        "query": query,
        "search_depth": "advanced",
        "max_results": 5
    }
    try:
        response = requests.post(url, json=payload, timeout=15)
        if response.status_code == 200:
            return response.json().get("results", [])
        else:
            print(f"[WARNING] Tavily API returned status code {response.status_code}")
            return []
    except Exception as e:
        print(f"[ERROR] Search failed: {str(e)}")
        return []

def find_clients_for_product(product_desc: str):
    """Brainstorms lead profiles for a product, searches the web, and compiles leads."""
    print(f"\n[INFO] Analyzing product: '{product_desc}'...")
    
    # Step 1: Let AI brainstorm search queries
    prompt = f"""
    Given this product description: "{product_desc}"
    Brainstorm 3 search queries to find business websites (leads) in the UK that might need this product.
    Format your response as a simple JSON list of strings, like this:
    ["query 1", "query 2", "query 3"]
    Do not write anything else. Just the JSON list.
    """
    
    queries_raw = call_llm(prompt)
    try:
        # Extract JSON list using regex
        match = re.search(r'\[.*\]', queries_raw, re.DOTALL)
        queries = json.loads(match.group(0)) if match else []
    except Exception:
        # Fallback queries
        queries = [f"UK companies needing {product_desc}", "Top UK businesses in technology", "UK outsourcing agencies"]
        
    print(f"[INFO] Generated search queries: {queries}")
    
    leads = []
    seen_urls = set()
    
    # Step 2: Search for each query and compile leads
    for query in queries:
        print(f"[INFO] Searching for: '{query}'...")
        results = search_tavily(query)
        for r in results:
            url = r.get("url", "")
            title = r.get("title", "Unknown Company")
            snippet = r.get("content", "")
            
            # Simple domain extraction
            domain_match = re.search(r'https?://([^/]+)', url)
            domain = domain_match.group(1) if domain_match else url
            
            if domain not in seen_urls and "wikipedia" not in domain:
                seen_urls.add(domain)
                leads.append({
                    "Name": title,
                    "Company": domain,
                    "Website": url,
                    "Type": "Business Client",
                    "Description": snippet[:200] + "..."
                })
                
    save_leads_to_csv(leads, "clients_leads.csv")

def find_affiliates_and_influencers(niche: str):
    """Searches TikTok & YouTube for creators in a specific niche targeting 10k-100k follower range."""
    print(f"\n[INFO] Searching for TikTok & YouTube creators in the '{niche}' niche (10k - 100k followers)...")
    
    # Craft queries specifically designed to locate creators and filter by follower counts
    queries = [
        f"site:tiktok.com \"{niche}\" \"followers\" \"10k\"..\"100k\"",
        f"site:youtube.com \"{niche}\" \"subscribers\" \"10k\"..\"100k\"",
        f"best {niche} micro-influencers tiktok youtube"
    ]
    
    leads = []
    seen_urls = set()
    
    for query in queries:
        print(f"[INFO] Searching for: '{query}'...")
        results = search_tavily(query)
        for r in results:
            url = r.get("url", "")
            title = r.get("title", "")
            snippet = r.get("content", "")
            
            if url not in seen_urls and ("tiktok.com" in url or "youtube.com" in url or "instagram.com" in url):
                seen_urls.add(url)
                
                # Try to extract handle or username
                handle = "Creator Profile"
                handle_match = re.search(r'(@[a-zA-Z0-9._]+)', title + " " + snippet)
                if handle_match:
                    handle = handle_match.group(1)
                
                leads.append({
                    "Name": handle,
                    "Company": "TikTok/YouTube Creator",
                    "Website": url,
                    "Type": "Affiliate/Influencer",
                    "Description": snippet[:200] + "..."
                })
                
    save_leads_to_csv(leads, "affiliate_leads.csv")

def save_leads_to_csv(leads: list, filename: str):
    """Saves compiled leads into a CSV file formatted for Dograh."""
    if not leads:
        print("[WARNING] No leads found to save.")
        return
        
    keys = ["Name", "Company", "Website", "Type", "Description"]
    filepath = os.path.join(os.getcwd(), filename)
    
    with open(filepath, 'w', newline='', encoding='utf-8') as f:
        dict_writer = csv.DictWriter(f, fieldnames=keys)
        dict_writer.writeheader()
        dict_writer.writerows(leads)
        
    print(f"[SUCCESS] Saved {len(leads)} leads to: {filepath}")

if __name__ == "__main__":
    import sys
    print("=== Britsync Autonomous Lead Finder ===")
    
    print("\nSelect Mode:")
    print("1) Find Clients for a Product")
    print("2) Find Affiliates/Influencers (10k-100k followers)")
    
    choice = input("Enter choice (1 or 2): ").strip()
    
    if choice == "1":
        product = input("\nEnter your product description: ").strip()
        if not product:
            product = "Bespoke AI voice callers and software automation integrations for dental clinics in London"
        find_clients_for_product(product)
    elif choice == "2":
        niche = input("\nEnter niche (e.g. tech, fashion, health): ").strip()
        if not niche:
            niche = "tech automation"
        find_affiliates_and_influencers(niche)
    else:
        print("[ERROR] Invalid choice. Exiting.")
