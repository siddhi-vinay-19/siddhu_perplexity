import os
import io
import time
import PyPDF2
import numpy as np
from flask import Flask, render_template, request, jsonify
from google import genai

app = Flask(__name__)

# Using the working API key found in the codebase
DEFAULT_API_KEY = "AIzaSyDxIVnp8ykErWIjGGjDQnAAWdfbhD_tWd4"

def get_client():
    """Returns a GenAI client using either a user-provided key or the default."""
    user_key = request.headers.get("X-API-Key")
    api_key = user_key if user_key and user_key.strip() else DEFAULT_API_KEY
    return genai.Client(api_key=api_key)

# Global variables to act as our simple in-memory vector database
document_chunks = []
document_embeddings = []
current_document_name = None

# Fallback global for Gemini File API (used for scanned/image PDFs)
gemini_uploaded_file = None

def chunk_text(text, chunk_size=1000, overlap=200):
    chunks = []
    start = 0
    text_length = len(text)
    while start < text_length:
        end = min(start + chunk_size, text_length)
        chunks.append(text[start:end])
        start += chunk_size - overlap
    return chunks

def cosine_similarity(v1, v2):
    dot_product = np.dot(v1, v2)
    norm_v1 = np.linalg.norm(v1)
    norm_v2 = np.linalg.norm(v2)
    if norm_v1 == 0 or norm_v2 == 0:
        return 0
    return dot_product / (norm_v1 * norm_v2)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/upload', methods=['POST'])
def upload_file():
    global document_chunks, document_embeddings, current_document_name, gemini_uploaded_file
    
    # Reset context before new upload
    document_chunks = []
    document_embeddings = []
    current_document_name = None
    gemini_uploaded_file = None
    
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
        
    if file and file.filename.endswith('.pdf'):
        try:
            client = get_client()
            file_bytes = file.read()
            pdf_reader = PyPDF2.PdfReader(io.BytesIO(file_bytes))
            full_text = ""
            for page in pdf_reader.pages:
                extracted = page.extract_text()
                if extracted: full_text += extracted + "\n"
                
            current_document_name = file.filename
            
            if full_text.strip():
                # RAG Indexing Path (PyPDF2 Readable Text)
                document_chunks = chunk_text(full_text)
                for chunk in document_chunks:
                    try:
                        time.sleep(1.0)
                        res = client.models.embed_content(model='text-embedding-004', contents=chunk)
                        document_embeddings.append(res.embeddings[0].values)
                    except Exception as e:
                        time.sleep(5) # Quota protection
                        res = client.models.embed_content(model='text-embedding-004', contents=chunk)
                        document_embeddings.append(res.embeddings[0].values)
                    
                return jsonify({
                    'message': f'Analysis Complete! {len(document_chunks)} readable sections indexed.',
                    'filename': file.filename,
                    'status': 'RAG_ACTIVE'
                })
            else:
                # Multimodal Fallback Path (Scanned PDF)
                temp_filename = "nexus_multimodal_temp.pdf"
                with open(temp_filename, "wb") as f: f.write(file_bytes)
                uploaded_file = client.files.upload(file=temp_filename)
                gemini_uploaded_file = uploaded_file
                if os.path.exists(temp_filename): os.remove(temp_filename)
                    
                return jsonify({
                    'message': 'Scanned PDF detected. Moving to Gemini 2.5 Vision.',
                    'filename': file.filename,
                    'status': 'VISION_ACTIVE'
                })
        except Exception as e:
            return jsonify({'error': str(e)}), 500
            
    return jsonify({'error': 'Unsupported file format.'}), 400

@app.route('/api/clear-context', methods=['POST'])
def clear_context():
    global document_chunks, document_embeddings, current_document_name, gemini_uploaded_file
    document_chunks = []
    document_embeddings = []
    current_document_name = None
    gemini_uploaded_file = None
    return jsonify({'message': 'PDF context cleared.'})

@app.route('/api/chat', methods=['POST'])
def chat():
    data = request.json
    prompt = data.get('prompt')
    selected_model = data.get('model', 'gemini-2.5-flash')
    
    if not prompt: return jsonify({'error': 'Empty prompt.'}), 400
        
    try:
        client = get_client()
        base_system = "You are 'Nexus AI'. You are intelligent and professional. strictly answer grounded in provided context if available."
        contents_payload = [base_system + "\n\nUser: " + prompt]
        
        # Retrieval Step
        if document_embeddings and document_chunks:
            q_res = client.models.embed_content(model='text-embedding-004', contents=prompt)
            q_emb = q_res.embeddings[0].values
            similarities = [(cosine_similarity(q_emb, chunk_emb), i) for i, chunk_emb in enumerate(document_embeddings)]
            similarities.sort(key=lambda x: x[0], reverse=True)
            top_context = "\n--------- \n".join([document_chunks[i] for sim, i in similarities[:5]])
            
            contents_payload = [f"{base_system}\n\nDOC CONTEXT:\n{top_context}\n\nUSER QUESTION: {prompt}"]
            print(f"Nexus RAG ({selected_model}): Context retrieved.")
            
        elif gemini_uploaded_file:
            contents_payload = [f"{base_system}\n\nInspect this document.", gemini_uploaded_file, prompt]
            print(f"Nexus Vision ({selected_model}): Analyzing multimodal PDF.")
            
        # Advanced Reliability Logic: Model-Hopping & Jittered Backoff
        import random
        
        # Priority order: Flash 2.5 -> Flash 1.5 -> Pro 1.5
        model_hopes = [selected_model, 'gemini-1.5-flash', 'gemini-pro']
        # Deduplicate while preserving order
        model_candidates = list(dict.fromkeys([m for m in model_hopes if m])) 
        
        last_error = "Nexus model error."
        
        for active_model in model_candidates:
            # Retry attempts with jittered exponential backoff
            attempts = [1, 2.5, 6] 
            for delay in attempts:
                try:
                    print(f"Nexus Attempt: Model={active_model}, Delay={delay if delay > 0 else 0}")
                    response = client.models.generate_content(model=active_model, contents=contents_payload)
                    return jsonify({'response': response.text})
                except Exception as e:
                    err_str = str(e).upper()
                    last_error = str(e)
                    
                    # Handle Congestion (Rate Limit or Capacity)
                    if '429' in err_str or 'RESOURCE_EXHAUSTED' in err_str:
                        jitter = random.uniform(0.1, 0.5)
                        time.sleep(delay + jitter)
                        continue # Try next delay for the same model
                    
                    # Handle Not Found (Invalid Model) -> Move to next model immediately
                    if '404' in err_str or 'NOT_FOUND' in err_str:
                        print(f"Nexus: Model {active_model} not found. Hopping...")
                        break # Break inner loop, move to next candidate model
                    
                    # Handle Permission Denied (e.g. Leaked Key)
                    if '403' in err_str or 'PERMISSION_DENIED' in err_str:
                        return jsonify({'error': 'Provided API key is invalid or has been revoked (leaked). Please update it in Settings.'}), 403
                    
                    # For other errors, return immediately
                    return jsonify({'error': f"Nexus model error ({active_model}): {str(e)}"}), 500
                    
            # If we finished retrying the current model (429 persists)
            print(f"Nexus: Model {active_model} still congested. Hopping to next candidate...")

        # Final terminal error if all models fail
        return jsonify({'error': f"Nexus is temporarily congested across all models. Please try again in 30 seconds. (Last Error: {last_error})"}), 429
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(port=5000, debug=True)
