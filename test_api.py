import sys
import logging
from google import genai

logging.basicConfig(level=logging.DEBUG)
client = genai.Client(api_key='AIzaSyDxIVnp8ykErWIjGGjDQnAAWdfbhD_tWd4')
try:
    res = client.models.generate_content(model='gemini-2.5-flash', contents='hi')
    print(res)
except Exception as e:
    print("ERROR:", repr(e))
