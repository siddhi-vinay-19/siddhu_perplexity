from google import genai
import os

DEFAULT_API_KEY = "AIzaSyAE8kUxY-UP4j-wYbg7bhcP-wZKG3TJ6II"
client = genai.Client(api_key=DEFAULT_API_KEY)

try:
    models = client.models.list()
    for m in models:
        print(m.name)
except Exception as e:
    print(f"Error: {e}")
